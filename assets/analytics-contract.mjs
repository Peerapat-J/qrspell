import { analyticsSchema } from "./analytics-schema.mjs";

// Read data descriptors rather than executing user-controlled getters.
export function snapshotProperties(input) {
    try {
        if (!input || typeof input !== "object") return null;
        const prototype = Object.getPrototypeOf(input);
        if (prototype !== Object.prototype && prototype !== null) return null;
        const result = Object.create(null);
        for (const key of Reflect.ownKeys(input)) {
            if (typeof key !== "string") return null;
            const descriptor = Object.getOwnPropertyDescriptor(input, key);
            if (!descriptor || !Object.hasOwn(descriptor, "value")) return null;
            result[key] = descriptor.value;
        }
        return result;
    } catch {
        return null;
    }
}

export function validateEvent(name, input) {
    try {
        if (typeof name !== "string" || !Object.hasOwn(analyticsSchema.events, name)) return null;
        const properties = snapshotProperties(input);
        if (!properties) return null;
        const definition = analyticsSchema.events[name];
        if (definition.required.some(key => !Object.hasOwn(properties, key))) return null;
        for (const [key, value] of Object.entries(properties)) {
            if (!Object.hasOwn(definition.properties, key) || analyticsSchema.forbidden_property_names.includes(key)) return null;
            const rule = definition.properties[key];
            if (Object.hasOwn(rule, "const") ? value !== rule.const : !rule.enum.includes(value)) return null;
        }
        return properties;
    } catch {
        return null;
    }
}

export function sanitizePostHogEvent(input, { token, environment, sdkVersion }) {
    try {
        const event = snapshotProperties(input);
        if (!event || typeof event.event !== "string" || !Object.hasOwn(analyticsSchema.events, event.event)) return null;
        const original = snapshotProperties(event.properties);
        if (!original || original.token !== token || original.distinct_id !== "$posthog_cookieless"
            || original.$process_person_profile !== false || original.$lib !== "web" || original.$lib_version !== sdkVersion) return null;
        const selected = Object.create(null);
        for (const key of Object.keys(analyticsSchema.events[event.event].properties)) {
            if (Object.hasOwn(original, key)) selected[key] = original[key];
        }
        const properties = validateEvent(event.event, selected);
        if (!properties || properties.environment !== environment) return null;
        // Rebuild the transport too; never forward caller-provided identity or enrichment.
        Object.assign(properties, {
            token,
            distinct_id: "$posthog_cookieless",
            $lib: "web",
            $lib_version: sdkVersion,
            $process_person_profile: false,
            $geoip_disable: true,
        });
        const output = { event: event.event, properties };
        if (typeof event.uuid === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(event.uuid)) output.uuid = event.uuid;
        if (event.timestamp instanceof Date) output.timestamp = Date.prototype.toISOString.call(event.timestamp);
        else if (typeof event.timestamp === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(event.timestamp)) output.timestamp = event.timestamp;
        return output;
    } catch {
        return null;
    }
}
