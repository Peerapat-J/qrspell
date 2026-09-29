import { sanitizePostHogEvent } from "./analytics-contract.mjs";

export const sdkVersion = "1.434.17";
export const ingestionOrigin = "https://eu.i.posthog.com";

export async function createPostHogProvider({ token, environment, canSend }) {
    const { PostHog } = await import("./vendor/posthog/posthog.mjs");
    if (!canSend()) return null;
    const sdk = new PostHog();
    sdk.init(token, {
        api_host: ingestionOrigin,
        ui_host: "https://eu.posthog.com",
        defaults: "2026-05-30",
        cookieless_mode: "always",
        person_profiles: "never",
        persistence: "memory",
        disable_persistence: true,
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_exceptions: false,
        capture_dead_clicks: false,
        capture_heatmaps: false,
        capture_performance: false,
        disable_session_recording: true,
        enable_recording_console_log: false,
        disable_surveys: true,
        disable_conversations: true,
        disable_product_tours: true,
        disable_web_experiments: true,
        disable_external_dependency_loading: true,
        advanced_disable_flags: true,
        save_campaign_params: false,
        save_referrer: false,
        respect_dnt: true,
        debug: false,
        // Keep the final request envelope readable and avoid a persistent/batched queue.
        request_batching: false,
        disable_compression: true,
        request_timeout_ms: 3000,
        on_request_error: () => {},
        before_send: event => canSend() ? sanitizePostHogEvent(event, { token, environment, sdkVersion }) : null,
    });
    return Object.freeze({
        capture(name, properties) {
            sdk.capture(name, properties, { send_instantly: true });
        },
    });
}
