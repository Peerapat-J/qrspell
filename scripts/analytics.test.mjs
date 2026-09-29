import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createAnalytics, initAnalytics, captureEvent } from "../assets/analytics.mjs";
import { analyticsConfig } from "../assets/analytics-config.mjs";
import { analyticsSchema } from "../assets/analytics-schema.mjs";
import { sanitizePostHogEvent, validateEvent } from "../assets/analytics-contract.mjs";
import { sdkVersion } from "../assets/analytics-posthog.mjs";
import { browserSchemaSource } from "./generate-analytics-schema.mjs";

const token = "phc_QRSpellUnitTestOnly";
const config = { enabled: true, environment: "production", token };
function context(overrides = {}) {
    return {
        navigator: { onLine: true },
        location: { origin: "https://qrspell.app", hostname: "qrspell.app", protocol: "https:" },
        ...overrides,
    };
}
function instance(options = {}) {
    const captured = [];
    let loads = 0;
    const analytics = createAnalytics({ config, context: context(), loadProvider: async () => {
        loads++;
        return { capture: (name, properties) => captured.push({ name, properties }) };
    }, ...options });
    return { analytics, captured, loads: () => loads };
}
function envelope(overrides = {}) {
    return {
        event: "generator_viewed",
        properties: {
            analytics_schema_version: 1, environment: "production", token,
            distinct_id: "$posthog_cookieless", $process_person_profile: false,
            $lib: "web", $lib_version: sdkVersion,
        },
        uuid: "01234567-89ab-7def-8123-0123456789ab",
        timestamp: new Date("2026-09-28T00:00:00.000Z"),
        ...overrides,
    };
}
const transport = { token, environment: "production", sdkVersion };

test("deployed singleton stays disabled before the production gates pass", async () => {
    assert.deepEqual(analyticsConfig, { enabled: false, environment: "production", token: "" });
    assert.equal(await initAnalytics(), false);
    assert.equal(captureEvent("generator_viewed"), false);
});

test("browser schema is generated from the approved source and deeply immutable", () => {
    assert.equal(readFileSync(new URL("../assets/analytics-schema.mjs", import.meta.url), "utf8"), browserSchemaSource());
    assert.throws(() => { analyticsSchema.events.generator_viewed.properties.environment.enum.push("local"); }, TypeError);
});

test("vendored SDK matches its package manifest and adapter pin", () => {
    const manifest = JSON.parse(readFileSync(new URL("../assets/vendor/posthog/manifest.json", import.meta.url)));
    const sdk = readFileSync(new URL("../assets/vendor/posthog/posthog.mjs", import.meta.url));
    assert.equal(createHash("sha256").update(sdk).digest("hex"), manifest.sha256);
    assert.equal(manifest.version, sdkVersion);
    assert.equal(manifest.entrypoint, "dist/module.slim.no-external.js");
});

test("initializes once, drops pre-init events, and snapshots approved properties", async () => {
    const { analytics, captured, loads } = instance();
    assert.equal(analytics.captureEvent("generator_started"), false);
    assert.deepEqual(await Promise.all([analytics.initAnalytics(), analytics.initAnalytics()]), [true, true]);
    assert.equal(loads(), 1);
    const input = { route: "generator" };
    assert.equal(analytics.captureEvent("site_page_viewed", input), true);
    input.route = "privacy";
    assert.deepEqual({ ...captured[0].properties }, { route: "generator", environment: "production", analytics_schema_version: 1 });
});

test("rejects unknown events, unsafe values, and metadata overrides before calling the provider", async () => {
    const { analytics, captured } = instance();
    await analytics.initAnalytics();
    for (const [name, properties] of [
        ["__proto__", {}], ["toString", {}], ["constructor", {}], ["$pageview", {}],
        ["site_page_viewed", {}], ["site_page_viewed", { route: "https://secret.example/" }],
        ["site_page_viewed", { route: "generator", content: "secret" }],
        ["site_page_viewed", { route: new Blob(["secret"]) }],
        ["site_page_viewed", { route: ["generator"] }],
        ["site_page_viewed", { route: { value: "generator" } }],
        ["site_page_viewed", { route: "data:image/png;base64,secret" }],
        ["generator_viewed", { environment: "sandbox" }],
        ["generator_viewed", { analytics_schema_version: 1 }],
        ["generator_viewed", { distinct_id: "secret" }],
        ["generator_viewed", new Error("secret")],
    ]) assert.equal(analytics.captureEvent(name, properties), false);
    assert.equal(captured.length, 0);
});

test("does not execute getters or accept hidden/symbol/inherited properties", async () => {
    const { analytics, captured } = instance();
    await analytics.initAnalytics();
    let calls = 0;
    const getter = { get route() { calls++; return "generator"; } };
    const hidden = { route: "generator" };
    Object.defineProperty(hidden, "content", { value: "secret" });
    for (const input of [getter, hidden, { route: "generator", [Symbol("secret")]: "secret" }, Object.create({ route: "generator" })]) {
        assert.equal(analytics.captureEvent("site_page_viewed", input), false);
    }
    const proxy = Proxy.revocable({}, {});
    proxy.revoke();
    assert.equal(analytics.captureEvent("site_page_viewed", proxy.proxy), false);
    assert.equal(calls, 0);
    assert.equal(captured.length, 0);
});

test("production rejects local, preview, non-HTTPS, and automated contexts without loading the SDK", async () => {
    for (const origin of ["http://localhost", "http://127.0.0.1:8000", "http://[::1]", "file://", "https://peerapat-j.github.io", "https://qrspell.app.evil.example", "http://qrspell.app", "https://qrspell.app:8000"]) {
        const { analytics, loads } = instance({ context: context({ location: { origin } }) });
        assert.equal(await analytics.initAnalytics(), false, origin);
        assert.equal(loads(), 0);
    }
    const { analytics, loads } = instance({ context: context({ navigator: { webdriver: true } }) });
    assert.equal(await analytics.initAnalytics(), false);
    assert.equal(loads(), 0);
});

test("DNT/GPC, offline, disabled config, and invalid token prevent SDK initialization", async () => {
    for (const options of [
        { context: context({ navigator: { globalPrivacyControl: true } }) },
        { context: context({ navigator: { doNotTrack: "1" } }) },
        { context: context({ navigator: { doNotTrack: "YES" } }) },
        { context: context({ doNotTrack: "1" }) },
        { context: context({ navigator: { msDoNotTrack: "yes" } }) },
        { context: context({ navigator: { onLine: false } }) },
        { context: context({ navigator: null }) },
        { config: { ...config, enabled: false } },
        { config: { ...config, token: "phx_personalkey" } },
        { config: { ...config, environment: "test" } },
    ]) {
        const { analytics, loads } = instance(options);
        assert.equal(await analytics.initAnalytics(), false);
        assert.equal(loads(), 0);
    }
});

test("sandbox is explicit and confined to loopback, never the public site", async () => {
    const sandboxConfig = { ...config, environment: "sandbox" };
    const local = instance({ config: sandboxConfig, context: context({ location: { hostname: "127.0.0.1", protocol: "http:" }, navigator: { webdriver: true } }) });
    assert.equal(await local.analytics.initAnalytics(), true);
    assert.equal(local.analytics.captureEvent("generator_viewed"), true);
    assert.equal(local.captured[0].properties.environment, "sandbox");
    const publicSite = instance({ config: sandboxConfig });
    assert.equal(await publicSite.analytics.initAnalytics(), false);
    assert.equal(publicSite.loads(), 0);
});

test("privacy signals and runtime disable are rechecked after initialization", async () => {
    const browser = context();
    const { analytics, captured } = instance({ context: browser });
    await analytics.initAnalytics();
    browser.navigator.globalPrivacyControl = true;
    assert.equal(analytics.captureEvent("generator_viewed"), false);
    browser.navigator.globalPrivacyControl = false;
    analytics.disableAnalytics();
    assert.equal(analytics.captureEvent("generator_viewed"), false);
    assert.equal(await analytics.initAnalytics(), false);
    assert.equal(captured.length, 0);
});

test("loader failure and provider exceptions never escape to product code", async () => {
    for (const loadProvider of [() => { throw new Error("secret"); }, async () => { throw new Error("secret"); }, async () => null]) {
        const { analytics } = instance({ loadProvider });
        assert.equal(await analytics.initAnalytics(), false);
        assert.equal(analytics.captureEvent("generator_viewed"), false);
    }
    for (const capture of [() => { throw new Error("secret"); }, () => Promise.reject(new Error("secret"))]) {
        const { analytics } = instance({ loadProvider: async () => ({ capture }) });
        assert.equal(await analytics.initAnalytics(), true);
        assert.doesNotThrow(() => analytics.captureEvent("generator_viewed"));
        await new Promise(resolve => setImmediate(resolve));
    }
});

test("stalled initialization times out and cannot initialize the provider late", async context => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    let finish;
    const { analytics } = instance({ loadProvider: () => new Promise(resolve => { finish = resolve; }) });
    const initialized = analytics.initAnalytics();
    await Promise.resolve();
    context.mock.timers.tick(3000);
    assert.equal(await initialized, false);
    finish({ capture: () => { throw new Error("must remain disabled"); } });
    await Promise.resolve();
    assert.equal(analytics.captureEvent("generator_viewed"), false);
});

test("sanitizer strips automatic enrichment and unknown top-level content", () => {
    const input = envelope();
    Object.assign(input.properties, { $current_url: "secret", $referrer: "secret", $browser: "secret", $session_id: "secret", $geoip_city_name: "secret", $geoip_disable: false });
    Object.assign(input, { $set: { content: "secret" }, arbitrary: "secret" });
    const output = sanitizePostHogEvent(input, transport);
    assert.deepEqual(Object.keys(output).sort(), ["event", "properties", "timestamp", "uuid"]);
    assert.deepEqual(Object.keys(output.properties).sort(), ["analytics_schema_version", "environment", ...analyticsSchema.provider_transport_property_allowlist].sort());
    assert.equal(output.properties.$geoip_disable, true);
    assert.doesNotMatch(JSON.stringify(output), /secret/u);
});

test("sanitizer refuses persistent identities, person processing, token/version mismatches, and automatic events", () => {
    for (const change of [
        { distinct_id: "stable-id" }, { $process_person_profile: true }, { token: "phc_other" },
        { $lib: "unknown" }, { $lib_version: "other" }, { environment: "sandbox" }, { analytics_schema_version: 2 },
    ]) {
        const input = envelope();
        Object.assign(input.properties, change);
        assert.equal(sanitizePostHogEvent(input, transport), null);
    }
    assert.equal(sanitizePostHogEvent(envelope({ event: "$pageview" }), transport), null);
    assert.equal(sanitizePostHogEvent(envelope({ event: "toString" }), transport), null);
    assert.equal(sanitizePostHogEvent(envelope({ properties: {} }), transport), null);
});

test("the entire approved schema accepts bounded values and rejects invalid values", () => {
    for (const [name, definition] of Object.entries(analyticsSchema.events)) {
        const valid = Object.fromEntries(Object.entries(definition.properties).map(([key, rule]) => [key, Object.hasOwn(rule, "const") ? rule.const : rule.enum[0]]));
        assert.ok(validateEvent(name, valid), name);
        for (const key of Object.keys(valid)) {
            assert.equal(validateEvent(name, { ...valid, [key]: "CANARY_SECRET" }), null, `${name}.${key}`);
        }
    }
});
