import assert from "node:assert/strict";
import test from "node:test";
import { createGeneratorAnalytics, analyticsSettleMs, maximumQualityConfigurations } from "../qr-code-generator/generator-analytics.mjs";

const config = (content = "secret") => ({ content, moduleShape: "square", finderShape: "square", exportSize: "512", reliability: "M", centerType: "none" });
const drain = () => new Promise(resolve => setImmediate(resolve));
const noWarnings = Object.freeze({
    warning_count: 0, warning_inverted_modules: false, warning_low_contrast: false,
    warning_dense_content: false, warning_weak_center_reliability: false,
});
const warningSummary = count => count === 0 ? noWarnings : { ...noWarnings, warning_count: count, warning_low_contrast: true };
function fixture(options = {}) {
    let now = 0;
    let next = 0;
    const timers = new Map();
    const events = [];
    const controller = createGeneratorAnalytics({
        analytics: { initAnalytics: async () => true, captureEvent: (name, properties) => { events.push({ name, properties }); return true; } },
        setTimer: (callback, delay) => { const id = ++next; timers.set(id, { at: now + delay, callback }); return id; },
        clearTimer: id => timers.delete(id),
        fingerprint: async configuration => JSON.stringify(configuration),
        ...options,
    });
    async function tick(delay = analyticsSettleMs) {
        now += delay;
        for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); }
        await drain();
    }
    return { controller, events, tick, quality: () => events.filter(event => event.name === "qr_generation_completed") };
}

test("view and first non-empty transition occur once, including input during initialization", async () => {
    let initialize;
    const events = [];
    const f = fixture({ analytics: { initAnalytics: () => new Promise(resolve => { initialize = resolve; }), captureEvent: (name, properties) => { events.push({ name, properties }); return true; } } });
    await drain();
    f.controller.changed(1, config());
    f.controller.changed(2, config(""));
    initialize(true);
    await f.controller.initialized;
    f.controller.changed(3, config("again"));
    f.controller.started();
    f.controller.reset(true);
    f.controller.changed(4, config("after reset"));
    assert.deepEqual(events.map(event => event.name), ["generator_viewed", "generator_started", "generator_reset"]);
    f.controller.dispose();
});

test("rapid editing cancels old results and waits 600 ms independently of render timing", async () => {
    const f = fixture();
    await f.controller.initialized;
    f.controller.changed(1, config("first"));
    f.controller.completed(1, "verified", warningSummary(0));
    await f.tick(180);
    assert.equal(f.quality().length, 0);
    f.controller.changed(2, config("last"));
    f.controller.completed(1, "render_failed", warningSummary(0));
    await f.tick(599);
    assert.equal(f.quality().length, 0);
    f.controller.completed(2, "verified", warningSummary(0));
    await f.tick(1);
    assert.equal(f.quality().length, 1);
    assert.equal(f.quality()[0].properties.outcome, "verified");
    assert.ok(!JSON.stringify(f.events).includes("last"));
});

test("verification finishing after the settle interval reports only its latest outcome", async () => {
    const f = fixture();
    await f.controller.initialized;
    f.controller.changed(1, config());
    await f.tick();
    assert.equal(f.quality().length, 0);
    f.controller.completed(1, "decoded_mismatch", warningSummary(1));
    await drain();
    assert.equal(f.quality().length, 1);
});

test("configuration deduplication survives Reset and returning to an earlier configuration", async () => {
    const f = fixture();
    await f.controller.initialized;
    for (const [revision, content] of [[1, "A"], [2, "B"], [3, "A"]]) {
        f.controller.changed(revision, config(content));
        f.controller.completed(revision, "verified", warningSummary(0));
        await f.tick();
        f.controller.reset(true);
    }
    assert.equal(f.quality().length, 2);
});

test("a stale async fingerprint cannot emit after editing or clearing the page", async () => {
    let finish;
    const f = fixture({ fingerprint: () => new Promise(resolve => { finish = resolve; }) });
    await f.controller.initialized;
    f.controller.changed(1, config());
    f.controller.completed(1, "verified", warningSummary(0));
    await f.tick();
    f.controller.changed(2, config(""));
    finish("key");
    await drain();
    assert.equal(f.quality().length, 0);
});

test("quality memory and event volume have a page cap without evicting old keys", async () => {
    assert.equal(maximumQualityConfigurations, 256);
    const f = fixture({ maxConfigurations: 2 });
    await f.controller.initialized;
    for (const [revision, content] of [[1, "A"], [2, "B"], [3, "C"], [4, "A"]]) {
        f.controller.changed(revision, config(content));
        f.controller.completed(revision, "verified", warningSummary(0));
        await f.tick();
    }
    assert.equal(f.quality().length, 2);
    f.controller.exported(config(), "download");
    assert.equal(f.events.at(-1).name, "qr_exported", "The quality cap does not suppress deliberate exports");
});

test("exports snapshot only safe settings; unchanged Reset emits nothing", async () => {
    const f = fixture();
    f.controller.exported(config(), "copy");
    await f.controller.initialized;
    const configuration = config();
    f.controller.exported(configuration, "copy");
    configuration.moduleShape = "dots";
    f.controller.exported(configuration, "download");
    f.controller.reset(false);
    assert.deepEqual(f.events.map(event => event.name), ["generator_viewed", "qr_exported", "qr_exported"]);
    assert.equal(f.events[1].properties.module_shape, "square");
    assert.equal(f.events[2].properties.module_shape, "dots");
    assert.ok(!JSON.stringify(f.events).includes("secret"));
});

test("unsafe outcomes and unavailable hashing never emit quality data or block exports", async () => {
    const f = fixture({ fingerprint: async () => { throw new Error("HASH_SECRET"); } });
    await f.controller.initialized;
    f.controller.changed(1, config());
    f.controller.completed(1, "ERROR_SECRET", warningSummary(0));
    await f.tick();
    f.controller.completed(1, "verified", warningSummary(0));
    await drain();
    assert.equal(f.quality().length, 0);
    f.controller.exported(config(), "copy");
    assert.equal(f.events.at(-1).name, "qr_exported");
});

test("failed initialization, capture exceptions, rejected captures and disposal remain harmless", async () => {
    for (const analytics of [
        { initAnalytics: async () => false, captureEvent: () => { throw new Error("must not run"); } },
        { initAnalytics: async () => { throw new Error("INIT_SECRET"); } },
        { initAnalytics: async () => true, captureEvent: () => { throw new Error("CAPTURE_SECRET"); } },
        { initAnalytics: async () => true, captureEvent: () => Promise.reject(new Error("ASYNC_SECRET")) },
    ]) {
        const f = fixture({ analytics });
        await f.controller.initialized;
        assert.doesNotThrow(() => {
            f.controller.started();
            f.controller.changed(1, config());
            f.controller.completed(1, "verified", warningSummary(0));
            f.controller.exported(config(), "copy");
            f.controller.reset(true);
        });
        await f.tick();
        f.controller.dispose();
        f.controller.changed(2, config("later"));
        await f.tick();
    }
});

test("the real SHA-256 key includes private content and active styling without transmitting either", async () => {
    const f = fixture({ fingerprint: undefined });
    await f.controller.initialized;
    const a = { ...config("SECRET_A"), foreground: "#000000", background: "#FFFFFF", centerText: "inactive" };
    for (const [revision, configuration] of [[1, a], [2, { ...a, centerText: "unused change" }], [3, { ...a, content: "SECRET_B" }], [4, { ...a, foreground: "#222222" }]]) {
        f.controller.changed(revision, configuration);
        f.controller.completed(revision, "verified", warningSummary(0));
        await f.tick();
        // WebCrypto completes on a worker, independently of the fake settle clock.
        const expected = revision <= 2 ? 1 : revision - 1;
        const deadline = Date.now() + 1000;
        while (f.quality().length < expected && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1));
        assert.equal(f.quality().length, expected);
        if (revision === 2) await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(f.quality().length, 3);
    assert.ok(!JSON.stringify(f.events).includes("SECRET"));
});
