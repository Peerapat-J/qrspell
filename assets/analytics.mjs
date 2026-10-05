import { analyticsConfig } from "./analytics-config.mjs?v=20261005a";
import { analyticsSchema } from "./analytics-schema.mjs?v=20261005a";
import { snapshotProperties, validateEvent } from "./analytics-contract.mjs?v=20261005a";

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function createAnalytics({ config = analyticsConfig, context = globalThis, loadProvider = async options => {
    const { createPostHogProvider } = await import("./analytics-posthog.mjs?v=20261005a");
    return createPostHogProvider(options);
} } = {}) {
    // A private copy prevents later mutation of config from enabling capture.
    const settings = Object.freeze({ enabled: config.enabled, environment: config.environment, token: config.token });
    let provider = null;
    let initialization = null;
    let disabled = false;

    function canSend() {
        try {
            if (disabled || settings.enabled !== true || !/^phc_[A-Za-z0-9]+$/u.test(settings.token)) return false;
            const navigator = context.navigator;
            const location = context.location;
            if (!navigator || !location || navigator.onLine === false || navigator.globalPrivacyControl === true) return false;
            const signals = [navigator.doNotTrack, context.doNotTrack, navigator.msDoNotTrack];
            if (signals.some(signal => ["1", "yes"].includes(String(signal).toLowerCase()))) return false;
            if (settings.environment === "production") {
                return location.origin === "https://qrspell.app" && navigator.webdriver !== true;
            }
            return settings.environment === "sandbox" && loopbackHosts.has(location.hostname)
                && ["http:", "https:"].includes(location.protocol);
        } catch {
            return false;
        }
    }

    function initAnalytics() {
        if (!canSend()) return Promise.resolve(false);
        if (initialization) return initialization;
        initialization = (async () => {
            let timeout;
            try {
                const candidate = await Promise.race([
                    Promise.resolve().then(() => loadProvider({ ...settings, canSend })),
                    new Promise(resolve => { timeout = setTimeout(() => resolve(null), 3000); }),
                ]);
                if (!candidate || typeof candidate.capture !== "function" || !canSend()) {
                    disabled = true;
                    return false;
                }
                provider = candidate;
                return true;
            } catch {
                disabled = true;
                return false;
            } finally {
                clearTimeout(timeout);
            }
        })();
        return initialization;
    }

    function captureEvent(name, input = {}) {
        try {
            if (!provider || !canSend()) return false;
            const properties = snapshotProperties(input);
            if (!properties || Object.hasOwn(properties, "environment") || Object.hasOwn(properties, "analytics_schema_version")) return false;
            properties.environment = settings.environment;
            properties.analytics_schema_version = analyticsSchema.schema_version;
            const accepted = validateEvent(name, properties);
            if (!accepted) return false;
            // Queued provider promises must not become unhandled product errors.
            const result = provider.capture(name, accepted);
            if (result && typeof result.then === "function") Promise.resolve(result).catch(() => {});
            return true; // Locally accepted; does not confirm network delivery.
        } catch {
            return false;
        }
    }

    function disableAnalytics() {
        disabled = true;
        provider = null;
    }

    return Object.freeze({ initAnalytics, captureEvent, disableAnalytics });
}

const analytics = createAnalytics();
export const initAnalytics = analytics.initAnalytics;
export const captureEvent = analytics.captureEvent;
export const disableAnalytics = analytics.disableAnalytics;
