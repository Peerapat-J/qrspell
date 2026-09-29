import { analyticsSchema } from "../assets/analytics-schema.mjs";
import { snapshotProperties } from "../assets/analytics-contract.mjs";

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

export function generationProperties(configuration, outcome, warningCount) {
    try {
        const rules = analyticsSchema.events.qr_generation_completed.properties;
        if (!rules.outcome.enum.includes(outcome) || !rules.warning_count.enum.includes(warningCount)) return null;
        const properties = settingsProperties(configuration, "qr_generation_completed");
        return properties ? Object.freeze({ ...properties, outcome, warning_count: warningCount }) : null;
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
