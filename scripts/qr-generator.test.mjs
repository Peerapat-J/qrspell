import assert from "node:assert/strict";
import { test } from "node:test";

import {
    buildQrOptions,
    contrastRatio,
    createTextBadgeDataUrl,
    detectSupportedImageType,
    hasExpectedImageSignature,
    hexToHsv,
    hsvToHex,
    normalizeHexColor,
    quietZoneMargin,
    readImageDimensions,
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
    assert.equal(detectSupportedImageType(png), "image/png");
    assert.equal(detectSupportedImageType(jpeg), "image/jpeg");
    assert.equal(detectSupportedImageType(webp), "image/webp");
    assert.equal(detectSupportedImageType(new Uint8Array([1, 2, 3, 4])), "");
});

test("reads dimensions from supported raster image headers", () => {
    const png = Uint8Array.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
        0, 0, 0x10, 0, 0, 0, 0x08, 0,
    ]);
    const jpeg = Uint8Array.from([
        0xFF, 0xD8, 0xFF, 0xE0, 0, 2,
        0xFF, 0xC0, 0, 7, 8, 0x08, 0, 0x10, 0,
    ]);
    const webp = Uint8Array.from([
        0x52, 0x49, 0x46, 0x46, 18, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
        0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0,
        0, 0, 0, 0, 0xFF, 0x0F, 0, 0xFF, 0x07, 0,
    ]);
    assert.deepEqual(readImageDimensions(png), { width: 4096, height: 2048 });
    assert.deepEqual(readImageDimensions(jpeg), { width: 4096, height: 2048 });
    assert.deepEqual(readImageDimensions(webp), { width: 4096, height: 2048 });
    assert.equal(readImageDimensions(Uint8Array.from([1, 2, 3])), undefined);
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

test("sizes center badges for full-width glyphs without excessive padding", () => {
    const emoji = decodeURIComponent(createTextBadgeDataUrl("🐻🐼", "#000000", "#FFFFFF").split(",", 2)[1]);
    assert.match(emoji, /viewBox="0 0 384 256"/u);

    const cjk = decodeURIComponent(createTextBadgeDataUrl("漢字漢字漢字", "#000000", "#FFFFFF").split(",", 2)[1]);
    assert.match(cjk, /viewBox="0 0 488 168"/u);

    const latin = decodeURIComponent(createTextBadgeDataUrl("QRSpell", "#000000", "#FFFFFF").split(",", 2)[1]);
    assert.match(latin, /viewBox="0 0 294 168"/u);
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
