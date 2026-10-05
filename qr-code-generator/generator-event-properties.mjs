import { analyticsSchema } from "../assets/analytics-schema.mjs?v=20261005a";
import { snapshotProperties } from "../assets/analytics-contract.mjs?v=20261005a";

const settingNames = {
    module_shape: "moduleShape",
    finder_shape: "finderShape",
    export_size: "exportSize",
    reliability: "reliability",
    center_type: "centerType",
};

// Select scalars explicitly. Never spread a render configuration into an event.
function settingsProperties(configuration, eventName) {
    const input = snapshotProperties(configuration);
    if (!input) return null;
    const properties = {};
    const rules = analyticsSchema.events[eventName].properties;
    for (const [name, localName] of Object.entries(settingNames)) {
        let value = input[localName];
        if (name === "export_size" && ["256", "512", "1024"].includes(value)) value = Number(value);
        if (!rules[name].enum.includes(value)) return null;
        properties[name] = value;
    }
    return properties;
}

const warningNames = [
    "warning_inverted_modules", "warning_low_contrast",
    "warning_dense_content", "warning_weak_center_reliability",
];

export function generationProperties(configuration, outcome, warningSummary) {
    try {
        const rules = analyticsSchema.events.qr_generation_completed.properties;
        const summary = snapshotProperties(warningSummary);
        if (!summary || !rules.outcome.enum.includes(outcome)
            || !rules.warning_count.enum.includes(summary.warning_count)
            || Object.keys(summary).length !== warningNames.length + 1
            || warningNames.some(name => typeof summary[name] !== "boolean")
            || warningNames.reduce((count, name) => count + Number(summary[name]), 0) !== summary.warning_count) return null;
        const properties = settingsProperties(configuration, "qr_generation_completed");
        return properties ? Object.freeze({ ...properties, outcome, ...summary }) : null;
    } catch {
        return null;
    }
}

export function exportProperties(configuration, method) {
    try {
        if (!analyticsSchema.events.qr_exported.properties.method.enum.includes(method)) return null;
        const properties = settingsProperties(configuration, "qr_exported");
        return properties ? Object.freeze({ ...properties, method }) : null;
    } catch {
        return null;
    }
}
