import { initAnalytics, captureEvent } from "./analytics.mjs";
import { analyticsSchema } from "./analytics-schema.mjs";

// One lifecycle per document, including repeated callers while init is pending.
const starts = new WeakMap();

export function startSiteAnalytics({ document = globalThis.document, analytics = { initAnalytics, captureEvent } } = {}) {
    try {
        if (!document || typeof document.addEventListener !== "function") return Promise.resolve(false);
        if (starts.has(document)) return starts.get(document);
        const route = document.body?.getAttribute("data-analytics-route");
        if (!analyticsSchema.events.site_page_viewed.properties.route.enum.includes(route)) return Promise.resolve(false);
        let readyToCapture = false;
        const onActivation = event => {
            try {
                if (!readyToCapture || event.defaultPrevented) return;
                if (event.type === "click" && event.button !== undefined && event.button !== 0) return;
                if (event.type === "auxclick" && event.button !== 1) return;
                const target = event.target?.nodeType === 3 ? event.target.parentElement : event.target;
                const link = target?.closest?.("a[data-analytics-source]");
                if (!link || link.getAttribute("href") !== "https://apps.apple.com/app/id6771453521") return;
                const source = link.getAttribute("data-analytics-source");
                if (!analyticsSchema.events.app_store_clicked.properties.source.enum.includes(source)) return;
                safeCapture(analytics, "app_store_clicked", { source });
            } catch {
                // Keep native link activation independent of DOM/analytics failures.
            }
        };
        document.addEventListener("click", onActivation);
        document.addEventListener("auxclick", onActivation);
        const started = Promise.resolve().then(() => analytics.initAnalytics()).then(ready => {
            if (ready !== true) return false;
            safeCapture(analytics, "site_page_viewed", { route });
            readyToCapture = true;
            return true;
        }).catch(() => false);
        starts.set(document, started);
        return started;
    } catch {
        return Promise.resolve(false);
    }
}

function safeCapture(analytics, name, properties) {
    try {
        const result = analytics.captureEvent(name, properties);
        if (result && typeof result.then === "function") Promise.resolve(result).catch(() => {});
    } catch {
        // Optional telemetry cannot interrupt page behavior.
    }
}
