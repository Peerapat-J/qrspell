import assert from "node:assert/strict";
import test from "node:test";
import { startSiteAnalytics, readCampaignAttribution } from "../assets/site-analytics.mjs";

test("site initialization is shared even while the provider is loading", async () => {
    const document = siteDocument();
    let finish;
    let loads = 0;
    const analytics = { initAnalytics: () => { loads++; return new Promise(resolve => { finish = resolve; }); } };
    const first = startSiteAnalytics({ document, analytics });
    const second = startSiteAnalytics({ document, analytics });
    assert.equal(first, second);
    await Promise.resolve();
    assert.equal(loads, 1);
    finish(true);
    assert.equal(await first, true);
    assert.equal(await startSiteAnalytics({ document, analytics }), true);
    assert.equal(loads, 1);
});

test("unavailable providers and documents fail safely", async () => {
    assert.equal(await startSiteAnalytics({ document: null }), false);
    for (const initAnalytics of [() => false, () => { throw new Error("unavailable"); }, () => Promise.reject(new Error("blocked"))]) {
        assert.equal(await startSiteAnalytics({ document: siteDocument(), analytics: { initAnalytics } }), false);
    }
});

function siteDocument(route = "home") {
    const document = new EventTarget();
    document.body = { getAttribute: () => route };
    return document;
}

test("page views wait for readiness and fire once for every approved route", async () => {
    for (const route of ["home", "generator", "changelog", "privacy", "helpcenter", "legal", "acknowledgements"]) {
        const document = siteDocument(route);
        const events = [];
        let finish;
        const analytics = { initAnalytics: () => new Promise(resolve => { finish = resolve; }), captureEvent: (...args) => events.push(args) };
        const started = startSiteAnalytics({ document, analytics });
        await Promise.resolve();
        assert.deepEqual(events, []);
        finish(true);
        assert.equal(await started, true);
        await startSiteAnalytics({ document, analytics });
        assert.deepEqual(events, [["site_page_viewed", { route }]]);
    }
});

test("unknown routes never initialize and failed init never emits a page view", async () => {
    for (const route of [null, "", "/?private=yes", "https://secret.example", "constructor"]) {
        assert.equal(await startSiteAnalytics({ document: siteDocument(route), analytics: { initAnalytics: () => assert.fail("unknown route") } }), false);
    }
    const events = [];
    assert.equal(await startSiteAnalytics({ document: siteDocument(), analytics: { initAnalytics: () => false, captureEvent: (...args) => events.push(args) } }), false);
    assert.deepEqual(events, []);
});

test("capture failures stay optional", async () => {
    for (const captureEvent of [() => { throw new Error("capture failure"); }, () => Promise.reject(new Error("capture failure"))]) {
        assert.equal(await startSiteAnalytics({ document: siteDocument(), analytics: { initAnalytics: () => true, captureEvent } }), true);
    }
});

const storeUrl = "https://apps.apple.com/app/id6771453521";
function activate(document, { source = "header", href = storeUrl, type = "click", button = 0, canceled = false } = {}) {
    const link = { getAttribute: key => key === "href" ? href : source };
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, { target: { value: { closest: () => link } }, button: { value: button } });
    if (canceled) event.preventDefault();
    document.dispatchEvent(event);
    return event;
}

test("all CTA sources capture once and preserve default activation", async () => {
    const document = siteDocument();
    const events = [];
    const analytics = { initAnalytics: () => true, captureEvent: (...args) => events.push(args) };
    await startSiteAnalytics({ document, analytics });
    await startSiteAnalytics({ document, analytics });
    for (const source of ["header", "homepage_hero", "generator_cta", "footer"]) {
        assert.equal(activate(document, { source }).defaultPrevented, false);
    }
    assert.deepEqual(events.slice(1), ["header", "homepage_hero", "generator_cta", "footer"].map(source => ["app_store_clicked", { source }]));
});

test("early, canceled, unknown, and unrelated activations are dropped", async () => {
    const document = siteDocument();
    const events = [];
    let finish;
    const analytics = { initAnalytics: () => new Promise(resolve => { finish = resolve; }), captureEvent: (...args) => events.push(args) };
    const started = startSiteAnalytics({ document, analytics });
    assert.equal(activate(document).defaultPrevented, false);
    assert.deepEqual(events, []);
    await Promise.resolve();
    finish(true);
    await started;
    for (const options of [{ canceled: true }, { source: "secret" }, { href: "https://other.example" }, { button: 2 }, { type: "auxclick", button: 2 }]) activate(document, options);
    assert.equal(events.length, 1);
    activate(document, { type: "auxclick", button: 1 });
    assert.deepEqual(events[1], ["app_store_clicked", { source: "header" }]);
});

test("capture failure never cancels link navigation", async () => {
    const document = siteDocument();
    await startSiteAnalytics({ document, analytics: { initAnalytics: () => true, captureEvent: () => { throw new Error("blocked"); } } });
    assert.equal(activate(document).defaultPrevented, false);
});

// Explicit fixture campaign names are never added to the deployed contract.
const campaignFixture = { properties: {
    utm_source: { enum: ["github"] }, utm_medium: { enum: ["referral"] }, utm_campaign: { enum: ["test-campaign"] },
} };

test("campaign parser normalizes only registered values and ignores arbitrary keys", () => {
    assert.deepEqual(readCampaignAttribution("?utm_source=%20GitHub%20&utm_medium=REFERRAL&utm_campaign=test-campaign&email=SECRET&utm_term=SECRET", campaignFixture), {
        utm_source: "github", utm_medium: "referral", utm_campaign: "test-campaign",
    });
});

test("campaign parser drops duplicate, private, malformed, and oversized values", () => {
    for (const search of [
        "?utm_source=github&utm_source=github", "?utm_source=github&utm_source=SECRET",
        "?utm_source=person%40example.com", "?utm_source=https%3A%2F%2Fsecret.example",
        "?utm_source=github%00", "?utm_source=github%", "?utm_source=%E0%A4%A",
        "?utm_source=constructor", "?utm_source=github%2540example.com",
        "?utm_source=" + " ".repeat(65) + "github", "?utm_source=github&secret=" + "x".repeat(2048),
        null, { toString: () => "?utm_source=github" },
    ]) assert.deepEqual(readCampaignAttribution(search, campaignFixture), {}, String(search));
    assert.deepEqual(readCampaignAttribution("?utm_source=SECRET&utm_medium=referral", campaignFixture), { utm_medium: "referral" });
});

test("deployed contract collects no UTM or referrer until real campaigns are registered", async () => {
    assert.deepEqual(readCampaignAttribution("?utm_source=github&utm_campaign=test-campaign"), {});
    const document = siteDocument();
    document.location = { search: "?utm_source=PRIVATE43&utm_campaign=PRIVATE43" };
    Object.defineProperty(document, "referrer", { get: () => assert.fail("raw referrer must never be read") });
    const events = [];
    await startSiteAnalytics({ document, analytics: { initAnalytics: () => true, captureEvent: (...args) => events.push(args) } });
    activate(document);
    assert.deepEqual(events, [["site_page_viewed", { route: "home" }], ["app_store_clicked", { source: "header" }]]);
});

test("unreadable campaign inputs cannot suppress the page view or CTA", async () => {
    const document = siteDocument();
    Object.defineProperty(document, "location", { get: () => { throw new Error("unavailable"); } });
    const events = [];
    await startSiteAnalytics({ document, analytics: { initAnalytics: () => true, captureEvent: (...args) => events.push(args) } });
    activate(document);
    assert.equal(events.length, 2);
});
