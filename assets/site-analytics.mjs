import { initAnalytics, captureEvent } from "./analytics.mjs";

// One lifecycle per document, including repeated callers while init is pending.
const starts = new WeakMap();

export function startSiteAnalytics({ document = globalThis.document, analytics = { initAnalytics, captureEvent } } = {}) {
    try {
        if (!document || typeof document.addEventListener !== "function") return Promise.resolve(false);
        if (starts.has(document)) return starts.get(document);
        const started = Promise.resolve().then(() => analytics.initAnalytics())
            .then(ready => ready === true).catch(() => false);
        starts.set(document, started);
        return started;
    } catch {
        return Promise.resolve(false);
    }
}
