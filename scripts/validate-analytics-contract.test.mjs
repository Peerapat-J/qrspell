import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
    loadAnalyticsContract,
    validateAnalyticsContract,
    validateAnalyticsEvent,
} from "./validate-analytics-contract.mjs";

test("schema v1 has the approved event set", () => {
    const contract = loadAnalyticsContract();
    assert.equal(contract.schema_version, 1);
    assert.deepEqual(validateAnalyticsContract(contract), { ok: true, errors: [] });
    assert.deepEqual(Object.keys(contract.events).sort(), [
        "app_store_clicked",
        "generator_reset",
        "generator_started",
        "generator_viewed",
        "qr_exported",
        "qr_generation_completed",
        "site_page_viewed",
    ]);
});

test("schema declares the only provider transport properties the sanitizer may retain", () => {
    const contract = loadAnalyticsContract();
    assert.deepEqual(contract.provider_transport_property_allowlist, [
        "token",
        "distinct_id",
        "$lib",
        "$lib_version",
        "$process_person_profile",
        "$geoip_disable",
    ]);
});

test("rejects event definitions that overlap the forbidden property list", () => {
    const contract = structuredClone(loadAnalyticsContract());
    contract.events.generator_viewed.properties.url = {};

    const result = validateAnalyticsContract(contract);

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /generator_viewed defines forbidden property url\./u);
});

test("requires a non-empty forbidden property list", () => {
    const contract = structuredClone(loadAnalyticsContract());
    contract.forbidden_property_names = [];

    const result = validateAnalyticsContract(contract);

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /forbidden_property_names must be a non-empty array\./u);
});

test("requires every analytics property to use a bounded scalar rule", () => {
    const contract = structuredClone(loadAnalyticsContract());
    contract.events.generator_viewed.properties.note = {};

    const result = validateAnalyticsContract(contract);

    assert.equal(result.ok, false);
    assert.match(
        result.errors.join("\n"),
        /generator_viewed\.note must define exactly one scalar const or non-empty scalar enum\./u,
    );
});

test("accepts a safe export event", () => {
    const result = validateAnalyticsEvent("qr_exported", {
        analytics_schema_version: 1,
        environment: "sandbox",
        method: "copy",
        module_shape: "square",
        finder_shape: "rounded",
        export_size: 512,
        reliability: "Q",
        center_type: "none",
    });

    assert.deepEqual(result, { ok: true, errors: [] });
});

test("rejects unknown events and properties", () => {
    assert.equal(validateAnalyticsEvent("unknown", {}).ok, false);
    const result = validateAnalyticsEvent("generator_viewed", {
        analytics_schema_version: 1,
        environment: "sandbox",
        qr_content: "do not send",
    });
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /qr_content/u);
});

test("rejects unapproved values and structured data", () => {
    const wrongMethod = validateAnalyticsEvent("qr_exported", {
        analytics_schema_version: 1,
        environment: "sandbox",
        method: "share",
        module_shape: "square",
        finder_shape: "square",
        export_size: 512,
        reliability: "M",
        center_type: "none",
    });
    assert.equal(wrongMethod.ok, false);

    const objectValue = validateAnalyticsEvent("site_page_viewed", {
        analytics_schema_version: 1,
        environment: "sandbox",
        route: { raw: "/?secret=yes" },
    });
    assert.equal(objectValue.ok, false);
});

test("requires the schema version and environment", () => {
    const result = validateAnalyticsEvent("generator_started", {});
    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /analytics_schema_version/u);
    assert.match(result.errors.join("\n"), /environment/u);
});

test("sandbox keeps every privacy-critical PostHog control enabled", () => {
    const source = readFileSync(new URL("./analytics-sandbox.mjs", import.meta.url), "utf8");
    for (const expected of [
        "cookieless_mode: 'always'",
        "person_profiles: 'never'",
        "autocapture: false",
        "capture_pageview: false",
        "capture_pageleave: false",
        "capture_exceptions: false",
        "disable_session_recording: true",
        "disable_surveys: true",
        "disable_external_dependency_loading: true",
        "advanced_disable_flags: true",
        "save_campaign_params: false",
        "save_referrer: false",
        "respect_dnt: true",
        "disable_compression: true",
        "before_send: sanitizePostHogEvent",
        "forbiddenPropertyNames: contract.forbidden_property_names",
        "const forbiddenPropertyNames = new Set(contract.forbiddenPropertyNames)",
        "if (forbiddenPropertyNames.size === 0) return false",
        "forbiddenPropertyNames.has(property)",
        "function isBoundedRule(rule)",
        "Object.values(definition.properties).some((rule) => !isBoundedRule(rule))",
        "properties.$geoip_disable = true",
        "navigator.globalPrivacyControl === true",
    ]) {
        assert.match(source, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
    }
});
