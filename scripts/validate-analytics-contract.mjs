import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = join(root, "docs/analytics/event-schema-v1.json");

export function loadAnalyticsContract() {
    return JSON.parse(readFileSync(schemaPath, "utf8"));
}

export function validateAnalyticsContract(contract) {
    const errors = [];
    const transportProperties = contract.provider_transport_property_allowlist;
    const forbiddenProperties = contract.forbidden_property_names;
    const forbiddenNames = new Set(Array.isArray(forbiddenProperties) ? forbiddenProperties : []);

    if (contract.schema_version !== 1) errors.push("schema_version must be 1.");
    if (!Array.isArray(transportProperties) || transportProperties.length === 0) {
        errors.push("provider_transport_property_allowlist must be a non-empty array.");
    } else if (new Set(transportProperties).size !== transportProperties.length) {
        errors.push("provider_transport_property_allowlist contains duplicates.");
    }
    if (!Array.isArray(forbiddenProperties) || forbiddenProperties.length === 0) {
        errors.push("forbidden_property_names must be a non-empty array.");
    } else if (new Set(forbiddenProperties).size !== forbiddenProperties.length) {
        errors.push("forbidden_property_names contains duplicates.");
    }

    if (!isPlainObject(contract.events) || Object.keys(contract.events).length === 0) {
        errors.push("events must be a non-empty object.");
    } else {
        for (const [eventName, definition] of Object.entries(contract.events)) {
            if (!isPlainObject(definition.properties)) {
                errors.push(`${eventName} properties must be an object.`);
                continue;
            }
            for (const [propertyName, rule] of Object.entries(definition.properties)) {
                if (forbiddenNames.has(propertyName)) {
                    errors.push(`${eventName} defines forbidden property ${propertyName}.`);
                }
                if (!isBoundedRule(rule)) {
                    errors.push(`${eventName}.${propertyName} must define exactly one scalar const or non-empty scalar enum.`);
                }
            }
            for (const requiredName of definition.required ?? []) {
                if (!Object.hasOwn(definition.properties, requiredName)) {
                    errors.push(`${eventName} requires undefined property ${requiredName}.`);
                }
            }
        }
    }

    return { ok: errors.length === 0, errors };
}

export function validateAnalyticsEvent(eventName, properties) {
    const contract = loadAnalyticsContract();
    const definition = contract.events[eventName];

    if (!definition) {
        return { ok: false, errors: [`Unknown event: ${eventName}`] };
    }

    if (!isPlainObject(properties)) {
        return { ok: false, errors: ["Event properties must be a plain object."] };
    }

    const errors = [];
    const allowedNames = new Set(Object.keys(definition.properties));
    const forbiddenNames = new Set(contract.forbidden_property_names);

    for (const requiredName of definition.required) {
        if (!Object.hasOwn(properties, requiredName)) {
            errors.push(`Missing required property: ${requiredName}`);
        }
    }

    for (const [name, value] of Object.entries(properties)) {
        if (!allowedNames.has(name) || forbiddenNames.has(name)) {
            errors.push(`Unknown or forbidden property: ${name}`);
            continue;
        }

        if (!isScalar(value)) {
            errors.push(`Property ${name} must be a scalar value.`);
            continue;
        }

        const rule = definition.properties[name];
        if (Object.hasOwn(rule, "const") && value !== rule.const) {
            errors.push(`Property ${name} must equal ${JSON.stringify(rule.const)}.`);
        }
        if (rule.enum && !rule.enum.includes(value)) {
            errors.push(`Property ${name} has an unapproved value.`);
        }
    }

    return { ok: errors.length === 0, errors };
}

function isPlainObject(value) {
    if (value === null || typeof value !== "object") return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function isScalar(value) {
    return typeof value === "string"
        || typeof value === "number"
        || typeof value === "boolean";
}

function isBoundedRule(rule) {
    if (!isPlainObject(rule)) return false;
    const hasConst = Object.hasOwn(rule, "const");
    const hasEnum = Object.hasOwn(rule, "enum");
    if (hasConst === hasEnum) return false;
    if (hasConst) return isScalar(rule.const);
    return Array.isArray(rule.enum)
        && rule.enum.length > 0
        && rule.enum.every(isScalar)
        && new Set(rule.enum).size === rule.enum.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const contract = loadAnalyticsContract();
    const names = Object.keys(contract.events);
    const result = validateAnalyticsContract(contract);

    if (!result.ok) {
        console.error(`Analytics contract is invalid:\n${result.errors.join("\n")}`);
        process.exit(1);
    }

    console.log(`Analytics contract v${contract.schema_version} is valid (${names.length} events).`);
}
