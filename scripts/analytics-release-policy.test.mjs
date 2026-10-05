import assert from "node:assert/strict";
import { test } from "node:test";
import { analyticsConfig } from "../assets/analytics-config.mjs";
import { productionCaptureApproved, validateProductionAnalyticsConfig } from "./analytics-release-policy.mjs";

const publicToken = "phc_rfjQJC6pUhrw3gCg7AGpcXNUtnhKdvoJKPRHL5TypC57";
const active = { enabled: true, environment: "production", token: publicToken };
const disabled = { enabled: false, environment: "production", token: "" };

test("deployed config matches the recorded release policy", () => {
    assert.equal(validateProductionAnalyticsConfig(analyticsConfig), null);
    if (!productionCaptureApproved) assert.deepEqual(analyticsConfig, disabled);
});

test("activation requires explicit approval and the exact reviewed project", () => {
    assert.match(validateProductionAnalyticsConfig(active, { captureApproved: false }), /remain disabled/u);
    assert.match(validateProductionAnalyticsConfig(active, { captureApproved: "true" }), /remain disabled/u);
    assert.equal(validateProductionAnalyticsConfig(active, { captureApproved: true }), null);
    for (const token of ["", "phx_personalKey", "phc_", "phc_contains-hyphen", "phc_DifferentProject123", publicToken + "x"]) {
        assert.match(validateProductionAnalyticsConfig({ ...active, token }, { captureApproved: true }), /reviewed QRSpell EU/u);
    }
});

test("disabled rollback is tokenless before and after approval", () => {
    for (const captureApproved of [false, true]) {
        assert.equal(validateProductionAnalyticsConfig(disabled, { captureApproved }), null);
        assert.match(validateProductionAnalyticsConfig({ ...disabled, token: publicToken }, { captureApproved }), /empty token/u);
    }
});

test("missing fields, extra fields, wrong environment and unsafe types fail validation", () => {
    for (const candidate of [null, undefined, [], {},
        { environment: "production", token: publicToken },
        { enabled: true, token: publicToken },
        { enabled: true, environment: "production" },
        { ...active, enabled: "true" }, { ...active, token: 123 },
        { ...active, environment: "sandbox" }, { ...active, environment: "staging" },
        { ...active, extra: true }, Object.create(active),
    ]) {
        assert.match(validateProductionAnalyticsConfig(candidate, { captureApproved: true }), /approved types/u);
    }
});
