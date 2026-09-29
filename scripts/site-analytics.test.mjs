import assert from "node:assert/strict";
import test from "node:test";
import { startSiteAnalytics } from "../assets/site-analytics.mjs";

test("site initialization is shared even while the provider is loading", async () => {
    const document = new EventTarget();
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
        assert.equal(await startSiteAnalytics({ document: new EventTarget(), analytics: { initAnalytics } }), false);
    }
});
