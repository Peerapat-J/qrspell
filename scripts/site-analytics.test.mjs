import assert from "node:assert/strict";
import test from "node:test";
import { startSiteAnalytics } from "../assets/site-analytics.mjs";

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
