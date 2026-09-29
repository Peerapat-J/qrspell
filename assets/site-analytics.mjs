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
        const pageAttribution = documentAttribution(document, "site_page_viewed");
        const clickAttribution = documentAttribution(document, "app_store_clicked");
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
                safeCapture(analytics, "app_store_clicked", { source, ...clickAttribution });
            } catch {
                // Keep native link activation independent of DOM/analytics failures.
            }
        };
        document.addEventListener("click", onActivation);
        document.addEventListener("auxclick", onActivation);
        const started = Promise.resolve().then(() => analytics.initAnalytics()).then(ready => {
            if (ready !== true) return false;
            safeCapture(analytics, "site_page_viewed", { route, ...pageAttribution });
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

// The schema is the only campaign registry. Missing property enums accept nothing.
export function readCampaignAttribution(search, definition = analyticsSchema.events.site_page_viewed) {
    const result = {};
    try {
        const policy = analyticsSchema.campaign_attribution;
        if (typeof search !== "string" || search.length > policy.max_query_length) return result;
        const parameters = new URLSearchParams(search);
        for (const key of policy.utm_keys) {
            if (!Object.hasOwn(definition.properties, key)) continue;
            const rule = definition.properties[key];
            if (!Array.isArray(rule.enum)) continue;
            const values = parameters.getAll(key);
            if (values.length !== 1 || values[0].length > policy.max_value_length) continue;
            const value = values[0].trim().toLowerCase();
            if (/^[a-z0-9][a-z0-9_-]{0,63}$/u.test(value) && rule.enum.includes(value)) result[key] = value;
        }
    } catch {
        return {};
    }
    return result;
}

function documentAttribution(document, name) {
    try {
        return readCampaignAttribution(document.location?.search, analyticsSchema.events[name]);
    } catch {
        return {};
    }
}
