import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export const cloudflareBeaconUrl = "https://static.cloudflareinsights.com/beacon.min.js";
export const cloudflareIngestUrl = "https://cloudflareinsights.com/cdn-cgi/rum";

export function cloudflareTestSource() {
    if (process.env.CLOUDFLARE_BEACON_FIXTURE) return readFileSync(process.env.CLOUDFLARE_BEACON_FIXTURE, "utf8");
    // Models the hosted beacon's URL cleaning; a provider snapshot remains a separate audit.
    return `(() => {
        const clean = value => { if (!value) return ''; const url = new URL(value); url.search = ''; url.hash = ''; url.username = ''; url.password = ''; return url.href; };
        const body = JSON.stringify({ location: clean(location.href), referrer: clean(document.referrer), siteToken: JSON.parse(document.currentScript.dataset.cfBeacon).token });
        const send = () => navigator.sendBeacon('${cloudflareIngestUrl}', new Blob([body], { type: 'application/json' }));
        if (document.readyState === 'complete') send(); else addEventListener('load', send, { once: true });
        document.addEventListener('visibilitychange', send);
    })();`;
}

export async function readAnalyticsBody(client, request) {
    if (request.method !== "POST" || request.postData) return;
    const entries = request.postDataEntries;
    if (entries?.length && entries.every(entry => typeof entry.bytes === "string")) {
        request.postData = Buffer.concat(entries.map(entry => Buffer.from(entry.bytes, "base64"))).toString("utf8");
        return;
    }
    assert.ok(request.requestId, "Missing request id prevents auditing the complete analytics body");
    request.postData = (await client.send("Network.getRequestPostData", { requestId: request.requestId })).postData;
}

export async function auditAnalyticsRequests(client, requests, canaries) {
    for (const request of requests) {
        await readAnalyticsBody(client, request);
        if (request.method === "POST") assert.ok(request.postData, "Audit every final analytics POST body");
        let body = request.postData;
        try { body = JSON.parse(body); } catch { /* Inspect non-JSON bodies as text. */ }
        let serialized = JSON.stringify({ url: request.url, headers: request.headers, body });
        // Inspect common encoding forms too, including base64 with an arbitrary byte offset.
        for (let pass = 0; pass < 2; pass++) {
            serialized = serialized.replace(/(?:%[0-9a-f]{2})+/giu, value => {
                try { return decodeURIComponent(value); } catch { return value; }
            });
        }
        const decoded = [...serialized.matchAll(/[A-Za-z0-9+/]{12,}={0,2}/gu)]
            .map(([value]) => Buffer.from(value, "base64").toString("utf8")).join("\n");
        for (const canary of canaries) {
            assert.ok(!serialized.includes(canary) && !decoded.includes(canary), `Outbound analytics leaked a private canary`);
        }
    }
}
