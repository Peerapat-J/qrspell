import assert from "node:assert/strict";
import { test } from "node:test";

import {
    buildQrOptions,
    contrastRatio,
    createTextBadgeDataUrl,
    normalizeHexColor,
    quietZoneMargin,
    readabilityWarnings,
} from "../qr-code-generator/generator-core.mjs";

test("normalizes valid colors and falls back for invalid values", () => {
    assert.equal(normalizeHexColor("#12abEF"), "#12ABEF");
    assert.equal(normalizeHexColor("red"), "#000000");
    assert.equal(normalizeHexColor(undefined, "#FFFFFF"), "#FFFFFF");
});

test("calculates readable black and white contrast", () => {
    assert.equal(contrastRatio("#000000", "#FFFFFF"), 21);
    assert.ok(contrastRatio("#777777", "#FFFFFF") < 4.5);
});

test("reports contrast, inversion, density, and center-content risks", () => {
    const warnings = readabilityWarnings({
        foreground: "#777777",
        background: "#555555",
        content: "x".repeat(400),
        exportSize: 256,
        reliability: "M",
        hasCenterContent: true,
    });
    assert.equal(warnings.length, 4);
    assert.ok(warnings.some((warning) => warning.includes("dark background")));
    assert.ok(warnings.some((warning) => warning.includes("contrast")));
    assert.ok(warnings.some((warning) => warning.includes("dense")));
    assert.ok(warnings.some((warning) => warning.includes("Maximum reliability")));
});

test("builds supported QR options and safe defaults", () => {
    const configured = buildQrOptions({
        content: "สวัสดี 👋",
        exportSize: "1024",
        reliability: "H",
        moduleShape: "dots",
        finderShape: "circle",
        foreground: "#123456",
        background: "#FEDCBA",
        centerImage: "data:image/png;base64,AA==",
        centerSize: "0.3",
    });
    assert.equal(configured.width, 1024);
    assert.equal(configured.height, 1024);
    assert.equal(configured.data, "สวัสดี 👋");
    assert.equal(configured.qrOptions.errorCorrectionLevel, "H");
    assert.equal(configured.dotsOptions.type, "dots");
    assert.equal(configured.cornersSquareOptions.type, "dot");
    assert.equal(configured.imageOptions.imageSize, 0.3);

    const defaults = buildQrOptions({ content: "test" });
    assert.equal(defaults.width, 512);
    assert.equal(defaults.qrOptions.errorCorrectionLevel, "Q");
    assert.equal(defaults.dotsOptions.type, "square");
});

test("creates an encoded local SVG for center text", () => {
    const dataUrl = createTextBadgeDataUrl("<&", "#000000", "#FFFFFF");
    assert.ok(dataUrl.startsWith("data:image/svg+xml;charset=utf-8,"));
    const decoded = decodeURIComponent(dataUrl.split(",", 2)[1]);
    assert.match(decoded, /&lt;&amp;/u);
    assert.doesNotMatch(decoded, /<text[^>]*><&<\/text>/u);
});

test("calculates a four-module quiet zone for each export size", () => {
    assert.equal(quietZoneMargin(512, 21), (512 * 4) / 29);
    assert.equal(quietZoneMargin(1024, 177), (1024 * 4) / 185);
    assert.equal(quietZoneMargin("unsupported", 21), (512 * 4) / 29);
});
