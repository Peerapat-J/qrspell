import { initAnalytics, captureEvent } from "../assets/analytics.mjs";
import { generationProperties, exportProperties } from "./generator-event-properties.mjs";

export const analyticsSettleMs = 600;
export const maximumQualityConfigurations = 256;

// The digest is a page-memory deduplication key, never an event property.
async function configurationFingerprint(configuration) {
    const values = [
        configuration.content, configuration.moduleShape, configuration.finderShape,
        configuration.foreground, configuration.background, configuration.exportSize,
        configuration.reliability, configuration.centerType,
        configuration.centerType === "none" ? "" : configuration.centerSize,
        configuration.centerType === "text" ? configuration.centerText : "",
        configuration.centerType === "image" ? configuration.centerImage : "",
    ];
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(values)));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function createGeneratorAnalytics({
    analytics = { initAnalytics, captureEvent },
    setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
    clearTimer = timer => globalThis.clearTimeout(timer),
    fingerprint = configurationFingerprint,
    settleMs = analyticsSettleMs,
    maxConfigurations = maximumQualityConfigurations,
} = {}) {
    let ready = false;
    let disabled = false;
    let hasStarted = false;
    let startReported = false;
    let current = null;
    let timer;
    const seen = new Set();

    function capture(name, properties = {}) {
        try {
            if (!ready || disabled) return false;
            const result = analytics.captureEvent(name, properties);
            if (result && typeof result.then === "function") Promise.resolve(result).catch(() => {});
            return result === true;
        } catch {
            return false;
        }
    }

    function reportStarted() {
        if (hasStarted && !startReported && ready && !disabled) {
            startReported = true;
            capture("generator_started");
        }
    }

    function flush() {
        const state = current;
        if (!ready || disabled || !state?.settled || !state.result || state.flushing || seen.size >= maxConfigurations) return;
        state.flushing = true;
        const result = state.result;
        Promise.resolve().then(() => fingerprint(state.configuration)).then(key => {
            if (disabled || current !== state || state.result !== result || typeof key !== "string" || seen.has(key) || seen.size >= maxConfigurations) return;
            if (capture("qr_generation_completed", result)) seen.add(key);
        }).catch(() => {}).finally(() => {
            state.flushing = false;
            if (current === state && state.result !== result) flush();
        });
    }

    function changed(revision, configuration) {
        clearTimer(timer);
        current = null;
        if (disabled) return;
        if (configuration.content) {
            hasStarted = true;
            reportStarted();
            const state = { revision, configuration, settled: false, result: null, flushing: false };
            current = state;
            timer = setTimer(() => {
                if (current !== state || disabled) return;
                state.settled = true;
                flush();
            }, settleMs);
        }
    }

    function completed(revision, outcome, warningCount) {
        if (!current || current.revision !== revision || disabled) return;
        current.result = generationProperties(current.configuration, outcome, warningCount);
        flush();
    }

    function exported(configuration, method) {
        const properties = exportProperties(configuration, method);
        if (properties) capture("qr_exported", properties);
    }

    function started() {
        hasStarted = true;
        reportStarted();
    }

    function reset(didChange) {
        if (didChange === true) capture("generator_reset");
    }

    function dispose() {
        disabled = true;
        ready = false;
        clearTimer(timer);
        current = null;
        seen.clear();
    }

    // Only lifecycle flags and the current result survive initialization. Exports
    // and resets before readiness are dropped, matching the shared wrapper.
    const initialized = Promise.resolve().then(() => analytics.initAnalytics()).then(value => {
        if (disabled) return false;
        if (value !== true) {
            dispose();
            return false;
        }
        ready = true;
        capture("generator_viewed");
        reportStarted();
        flush();
        return true;
    }).catch(() => { dispose(); return false; });

    const guard = operation => (...args) => {
        try { operation(...args); } catch { /* Optional telemetry never interrupts the Generator. */ }
    };
    return Object.freeze({ initialized, changed: guard(changed), completed: guard(completed),
        exported: guard(exported), started: guard(started), reset: guard(reset), dispose: guard(dispose) });
}
