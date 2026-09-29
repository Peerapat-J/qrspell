import assert from "node:assert/strict";
import { test } from "node:test";
import { auditAnalyticsRequests } from "./analytics-network-audit.mjs";

const canary = "PRIVATE_NETWORK_CANARY";
const request = patch => ({ url: "https://eu.i.posthog.com/i/v0/e/", method: "POST", headers: {}, postData: '{"batch":[]}', ...patch });

test("network audit catches URL, headers, body, percent and offset base64 leaks", async () => {
    for (const patch of [
        { url: `https://example.com/${canary}` },
        { headers: { Referer: `https://example.com/${canary}` } },
        { postData: JSON.stringify({ secret: canary }) },
        { postData: '{"secret":"' + [...canary].map(c => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`).join("") + '"}' },
        { postData: JSON.stringify({ secret: [...canary].map(c => `%${c.charCodeAt(0).toString(16)}`).join("") }) },
        ...["", "x", "xy"].map(prefix => ({ postData: JSON.stringify({ secret: Buffer.from(prefix + canary).toString("base64") }) })),
    ]) await assert.rejects(auditAnalyticsRequests(null, [request(patch)], [canary]), /private canary/u);
});

test("network audit retrieves omitted bodies and refuses missing evidence", async () => {
    const calls = [];
    await auditAnalyticsRequests({ send: async (...args) => { calls.push(args); return { postData: '{"batch":[]}' }; } },
        [request({ requestId: "test-id", postData: undefined })], [canary]);
    assert.deepEqual(calls, [["Network.getRequestPostData", { requestId: "test-id" }]]);
    await assert.rejects(auditAnalyticsRequests(null, [request({ postData: undefined })], [canary]), /Missing request id/u);
    await assert.rejects(auditAnalyticsRequests({ send: async () => ({ postData: "" }) },
        [request({ requestId: "test-id", postData: undefined })], [canary]), /every final analytics POST/u);
});

test("network audit inspects sendBeacon byte entries when no resource body is cached", async () => {
    const entries = ['{"secret":"', canary, '"}'].map(value => ({ bytes: Buffer.from(value).toString("base64") }));
    await assert.rejects(auditAnalyticsRequests(null, [request({ postData: undefined, postDataEntries: entries })], [canary]), /private canary/u);
    await auditAnalyticsRequests(null, [request({ postData: undefined, postDataEntries: [{ bytes: Buffer.from('{"batch":[]}').toString("base64") }] })], [canary]);
});
