import assert from "node:assert/strict";
import test from "node:test";
import { generationProperties, exportProperties } from "../qr-code-generator/generator-event-properties.mjs";
import { readabilityWarningDetails, readabilityWarnings } from "../qr-code-generator/generator-core.mjs";
import { validateEvent } from "../assets/analytics-contract.mjs";

const noWarnings = {
    warning_count: 0, warning_inverted_modules: false, warning_low_contrast: false,
    warning_dense_content: false, warning_weak_center_reliability: false,
};

const configuration = {
    moduleShape: "square", finderShape: "rounded", exportSize: "512", reliability: "M", centerType: "text",
    content: "PAYLOAD_SECRET", centerText: "TEXT_SECRET", centerImage: "data:image/png;base64,IMAGE_SECRET",
    foreground: "#777777", background: "#666666", centerSize: "0.24", filename: "FILENAME_SECRET",
};

test("Generator properties select only approved scalars and cannot carry local content", () => {
    const exported = exportProperties(configuration, "copy");
    assert.deepEqual(exported, { module_shape: "square", finder_shape: "rounded", export_size: 512, reliability: "M", center_type: "text", method: "copy" });
    const completed = generationProperties(configuration, "verified", { ...noWarnings, warning_count: 2, warning_inverted_modules: true, warning_low_contrast: true });
    assert.ok(validateEvent("qr_generation_completed", { ...completed, environment: "sandbox", analytics_schema_version: 2 }));
    assert.ok(!JSON.stringify([exported, completed]).includes("SECRET"));
    assert.ok(Object.isFrozen(exported));
});

test("all four simultaneous production warnings fit the approved contract", () => {
    const settings = { ...configuration, content: "x".repeat(351), exportSize: "256", hasCenterContent: true };
    const warnings = readabilityWarningDetails(settings);
    assert.deepEqual(warnings.map(warning => warning.code), ["inverted_modules", "low_contrast", "dense_content", "weak_center_reliability"]);
    const properties = generationProperties(settings, "decode_failed", {
        warning_count: warnings.length, warning_inverted_modules: true, warning_low_contrast: true,
        warning_dense_content: true, warning_weak_center_reliability: true,
    });
    assert.ok(validateEvent("qr_generation_completed", { ...properties, environment: "sandbox", analytics_schema_version: 2 }));
});

test("unknown settings, outcomes, counts and methods never become product events", () => {
    for (const [key, value] of [["moduleShape", "SECRET"], ["finderShape", "star"], ["exportSize", "512px"], ["reliability", "L"], ["centerType", "SECRET"]]) {
        assert.equal(exportProperties({ ...configuration, [key]: value }, "copy"), null);
        assert.equal(generationProperties({ ...configuration, [key]: value }, "verified", noWarnings), null);
    }
    for (const count of [-1, 5, "1", NaN]) assert.equal(generationProperties(configuration, "verified", { ...noWarnings, warning_count: count }), null);
    assert.equal(generationProperties(configuration, "verified", { ...noWarnings, warning_count: 1 }), null);
    assert.equal(generationProperties(configuration, "verified", { ...noWarnings, warning_low_contrast: "SECRET" }), null);
    assert.equal(generationProperties(configuration, new Error("SECRET"), noWarnings), null);
    assert.equal(exportProperties(configuration, "disk_saved"), null);
});

test("hostile configurations fail closed without running getters", () => {
    let reads = 0;
    const input = { ...configuration, get centerText() { reads++; throw new Error("SECRET"); } };
    for (const value of [input, null, [], Object.create(configuration)]) {
        assert.equal(exportProperties(value, "copy"), null);
        assert.equal(generationProperties(value, "verified", noWarnings), null);
    }
    assert.equal(reads, 0);
});
