import assert from "node:assert/strict";
import { test } from "node:test";
import { safeCloudflareReferrer, startCloudflareBeacon } from "../assets/cloudflare-bootstrap.mjs";

const origin = "https://qrspell.app";
test("Cloudflare accepts only empty, origin-only or registered public referrers", () => {
    for (const value of ["", "https://example.com/", `${origin}/privacy/`]) assert.equal(safeCloudflareReferrer(value, origin), true);
    for (const value of ["invalid", "file:///private/file", "https://person:secret@example.com/", "https://example.com/?secret=value", "https://example.com/#secret", "https://example.com/private", `${origin}/private`, `${origin}/privacy/?secret=value`]) {
        assert.equal(safeCloudflareReferrer(value, origin), false, value);
    }
});

test("Cloudflare loader gates origins/config/referrers and safely handles failures", () => {
    let active = false;
    let appended;
    let redirecting = false;
    const config = { token: "e43189ed6f5c43d29472b9b18c73b226", spa: false };
    const document = {
        referrer: "",
        querySelector: selector => selector.includes("refresh") ? redirecting : selector.includes("runtime") ? active : { dataset: { cfBeacon: JSON.stringify(config) } },
        createElement: () => ({ dataset: {} }),
        head: { append: script => { appended = script; active = true; } },
    };
    for (const blocked of ["null", "http://localhost:8000", "https://preview.example.com", "http://qrspell.app", "https://qrspell.app.evil.example"]) {
        assert.equal(startCloudflareBeacon({ document, origin: blocked }), false);
        assert.equal(appended, undefined);
    }
    document.referrer = `${origin}/private`;
    assert.equal(startCloudflareBeacon({ document, origin }), false);
    document.referrer = "";
    redirecting = true;
    assert.equal(startCloudflareBeacon({ document, origin }), false);
    redirecting = false;
    assert.equal(startCloudflareBeacon({ document, origin, navigator: { webdriver: true } }), false);
    config.spa = true;
    assert.equal(startCloudflareBeacon({ document, origin }), false);
    config.spa = false;
    assert.equal(startCloudflareBeacon({ document, origin }), true);
    assert.equal(appended.src, "https://static.cloudflareinsights.com/beacon.min.js");
    assert.deepEqual(JSON.parse(appended.dataset.cfBeacon), config);
    assert.equal(startCloudflareBeacon({ document, origin }), false);
    assert.equal(startCloudflareBeacon({ document: { get referrer() { throw new Error("blocked"); } }, origin }), false);
});
