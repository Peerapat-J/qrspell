import assert from "node:assert/strict";
import { test } from "node:test";

import {
    buildQrOptions,
    contrastRatio,
    createTextBadgeDataUrl,
    hasExpectedImageSignature,
    hexToHsv,
    hsvToHex,
    normalizeHexColor,
    quietZoneMargin,
    readabilityWarnings,
    splitGraphemes,
    truncateGraphemes,
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

test("converts colors between hex and HSV", () => {
    assert.deepEqual(hexToHsv("#FF0000"), { hue: 0, saturation: 100, brightness: 100 });
    assert.equal(hsvToHex(0, 100, 100), "#FF0000");
    assert.equal(hsvToHex(210, 79.06976744186046, 33.72549019607843), "#123456");
});

test("accepts only image bytes that match their declared raster format", () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const jpeg = Uint8Array.from([0xFF, 0xD8, 0xFF, 0xE0]);
    const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    assert.equal(hasExpectedImageSignature("image/png", png), true);
    assert.equal(hasExpectedImageSignature("image/jpeg", jpeg), true);
    assert.equal(hasExpectedImageSignature("image/webp", webp), true);
    assert.equal(hasExpectedImageSignature("image/png", jpeg), false);
    assert.equal(hasExpectedImageSignature("image/svg+xml", new Uint8Array()), false);
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
    assert.equal(configured.imageOptions.saveAsBlob, false);

    const defaults = buildQrOptions({ content: "test" });
    assert.equal(defaults.width, 512);
    assert.equal(defaults.qrOptions.errorCorrectionLevel, "M");
    assert.equal(defaults.dotsOptions.type, "square");
});

test("creates an encoded local SVG for center text", () => {
    const dataUrl = createTextBadgeDataUrl("<&", "#000000", "#FFFFFF");
    assert.ok(dataUrl.startsWith("data:image/svg+xml;charset=utf-8,"));
    const decoded = decodeURIComponent(dataUrl.split(",", 2)[1]);
    assert.match(decoded, /&lt;&amp;/u);
    assert.match(decoded, /font-size="176"/u);
    assert.doesNotMatch(decoded, /<text[^>]*><&<\/text>/u);
});

test("keeps a single emoji large and makes longer text badges compact", () => {
    const emoji = decodeURIComponent(createTextBadgeDataUrl("🐻", "#000000", "#FFFFFF").split(",", 2)[1]);
    assert.match(emoji, /viewBox="0 0 256 256"/u);
    assert.match(emoji, /font-size="224"/u);

    const text = decodeURIComponent(createTextBadgeDataUrl("QRSpell", "#000000", "#FFFFFF").split(",", 2)[1]);
    assert.match(text, /height="168"/u);
    assert.match(text, /font-size="76"/u);
});

test("keeps complete grapheme clusters in center text", () => {
    const family = "👨‍👩‍👧‍👦";
    assert.deepEqual(splitGraphemes(family), [family]);
    assert.equal(truncateGraphemes(`${family}123456`, 6), `${family}12345`);

    const badge = decodeURIComponent(createTextBadgeDataUrl(family, "#000000", "#FFFFFF").split(",", 2)[1]);
    assert.match(badge, new RegExp(family, "u"));
    assert.match(badge, /font-size="224"/u);
    assert.doesNotMatch(badge, /\u200D<\/text>/u);
});

test("calculates a four-module quiet zone for each export size", () => {
    assert.equal(quietZoneMargin(512, 21), (512 * 4) / 29);
    assert.equal(quietZoneMargin(1024, 177), (1024 * 4) / 185);
    assert.equal(quietZoneMargin("unsupported", 21), (512 * 4) / 29);
});
