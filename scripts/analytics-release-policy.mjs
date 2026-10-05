import { createHash } from "node:crypto";

// Owner approved Free-plan retention and processing boundaries on 2026-10-05.
// See docs/analytics/provider-review-2026-10-05.md; this is not a signed DPA.
export const productionCaptureApproved = true;

// Pins the existing QRSpell EU public project token reviewed in the sandbox.
const reviewedTokenSha256 = "4848847b83bb85c1ad2aea760bed167c4832120447a349ea14269a55668d8c48";

export function validateProductionAnalyticsConfig(config, { captureApproved = productionCaptureApproved } = {}) {
    if (!config || typeof config !== "object" || Array.isArray(config)
        || Object.keys(config).length !== 3
        || !["enabled", "environment", "token"].every(key => Object.hasOwn(config, key))
        || config.environment !== "production" || typeof config.enabled !== "boolean"
        || typeof config.token !== "string") {
        return "Production analytics must contain only enabled, environment and token with approved types.";
    }
    // Disabled/tokenless is always a valid rollback, including after approval.
    if (config.enabled === false) {
        return config.token === "" ? null : "Disabled production analytics must have an empty token.";
    }
    if (captureApproved !== true) return "Production analytics must remain disabled until the production gates pass.";
    if (!/^phc_[A-Za-z0-9]+$/u.test(config.token)
        || createHash("sha256").update(config.token).digest("hex") !== reviewedTokenSha256) {
        return "Production analytics must use the reviewed QRSpell EU public project token.";
    }
    return null;
}
