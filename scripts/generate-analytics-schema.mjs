import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadAnalyticsContract, validateAnalyticsContract } from "./validate-analytics-contract.mjs";

export function browserSchemaSource() {
    const schema = loadAnalyticsContract();
    const validation = validateAnalyticsContract(schema);
    if (!validation.ok) throw new Error("Cannot generate an invalid analytics contract.");
    return `// Generated from docs/analytics/event-schema-v1.json. Do not edit by hand.\nconst schema = ${JSON.stringify(schema, null, 2)};\n\nfunction freeze(value) {\n    if (value && typeof value === "object") {\n        for (const item of Object.values(value)) freeze(item);\n        Object.freeze(value);\n    }\n    return value;\n}\n\nexport const analyticsSchema = freeze(schema);\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const target = new URL("../assets/analytics-schema.mjs", import.meta.url);
    const expected = browserSchemaSource();
    if (process.argv.includes("--check")) {
        if (readFileSync(target, "utf8") !== expected) throw new Error("Browser analytics schema is stale. Run node scripts/generate-analytics-schema.mjs.");
        console.log("Browser analytics schema matches contract v1.");
    } else {
        writeFileSync(target, expected);
    }
}
