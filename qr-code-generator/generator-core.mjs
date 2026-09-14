const reliabilityLevels = new Set(["M", "Q", "H"]);
const exportSizes = new Set([256, 512, 1024]);
const moduleShapes = new Set(["square", "rounded", "dots"]);
const finderShapes = new Set(["square", "rounded", "circle"]);

export function normalizeHexColor(value, fallback = "#000000") {
    const normalized = String(value ?? "").trim().toUpperCase();
    return /^#[0-9A-F]{6}$/u.test(normalized) ? normalized : fallback;
}

export function contrastRatio(foreground, background) {
    const first = relativeLuminance(normalizeHexColor(foreground));
    const second = relativeLuminance(normalizeHexColor(background, "#FFFFFF"));
    const lighter = Math.max(first, second);
    const darker = Math.min(first, second);
    return (lighter + 0.05) / (darker + 0.05);
}

export function hexToHsv(value) {
    const hex = normalizeHexColor(value);
    const red = Number.parseInt(hex.slice(1, 3), 16) / 255;
    const green = Number.parseInt(hex.slice(3, 5), 16) / 255;
    const blue = Number.parseInt(hex.slice(5, 7), 16) / 255;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const delta = maximum - minimum;
    let hue = 0;

    if (delta > 0) {
        if (maximum === red) {
            hue = 60 * (((green - blue) / delta) % 6);
        } else if (maximum === green) {
            hue = 60 * (((blue - red) / delta) + 2);
        } else {
            hue = 60 * (((red - green) / delta) + 4);
        }
    }

    return {
        hue: (hue + 360) % 360,
        saturation: maximum === 0 ? 0 : (delta / maximum) * 100,
        brightness: maximum * 100,
    };
}

export function hsvToHex(hue, saturation, brightness) {
    const normalizedHue = ((Number(hue) || 0) % 360 + 360) % 360;
    const normalizedSaturation = clamp(Number(saturation) || 0, 0, 100) / 100;
    const normalizedBrightness = clamp(Number(brightness) || 0, 0, 100) / 100;
    const chroma = normalizedBrightness * normalizedSaturation;
    const secondary = chroma * (1 - Math.abs(((normalizedHue / 60) % 2) - 1));
    const offset = normalizedBrightness - chroma;
    let channels;

    if (normalizedHue < 60) channels = [chroma, secondary, 0];
    else if (normalizedHue < 120) channels = [secondary, chroma, 0];
    else if (normalizedHue < 180) channels = [0, chroma, secondary];
    else if (normalizedHue < 240) channels = [0, secondary, chroma];
    else if (normalizedHue < 300) channels = [secondary, 0, chroma];
    else channels = [chroma, 0, secondary];

    return `#${channels.map((channel) => (
        Math.round((channel + offset) * 255).toString(16).padStart(2, "0")
    )).join("").toUpperCase()}`;
}

export function detectSupportedImageType(bytes) {
    const header = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
    if (header.length >= 8
        && [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
            .every((value, index) => header[index] === value)) {
        return "image/png";
    }
    if (header.length >= 3
        && header[0] === 0xFF
        && header[1] === 0xD8
        && header[2] === 0xFF) {
        return "image/jpeg";
    }
    if (header.length >= 12
        && String.fromCharCode(...header.slice(0, 4)) === "RIFF"
        && String.fromCharCode(...header.slice(8, 12)) === "WEBP") {
        return "image/webp";
    }
    return "";
}

export function hasExpectedImageSignature(mimeType, bytes) {
    return detectSupportedImageType(bytes) === mimeType;
}

export function readImageDimensions(bytes, mimeType = detectSupportedImageType(bytes)) {
    const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
    if (mimeType === "image/png") {
        if (data.length < 24 || ascii(data, 12, 16) !== "IHDR") {
            return undefined;
        }
        return {
            width: readUint32BigEndian(data, 16),
            height: readUint32BigEndian(data, 20),
        };
    }
    if (mimeType === "image/jpeg") {
        return readJpegDimensions(data);
    }
    if (mimeType === "image/webp") {
        return readWebpDimensions(data);
    }
    return undefined;
}

export function splitGraphemes(value) {
    const content = String(value ?? "");
    if (typeof Intl.Segmenter === "function") {
        const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
        return [...segmenter.segment(content)].map(({ segment }) => segment);
    }
    return [...content];
}

export function truncateGraphemes(value, maximum = 6) {
    const limit = Math.max(0, Math.floor(Number(maximum) || 0));
    return splitGraphemes(value).slice(0, limit).join("");
}

export function readabilityWarnings({
    foreground,
    background,
    content,
    exportSize,
    reliability,
    hasCenterContent,
}) {
    const warnings = [];
    const foregroundLuminance = relativeLuminance(normalizeHexColor(foreground));
    const backgroundLuminance = relativeLuminance(normalizeHexColor(background, "#FFFFFF"));
    const ratio = contrastRatio(foreground, background);

    if (foregroundLuminance > backgroundLuminance) {
        warnings.push("Light QR modules on a dark background may be harder for some scanners to read.");
    }

    if (ratio < 4.5) {
        warnings.push(`Increase the color contrast for more reliable scanning (${ratio.toFixed(1)}:1).`);
    }

    const contentBytes = new TextEncoder().encode(content).length;
    if (contentBytes > 350 && Number(exportSize) === 256) {
        warnings.push("This QR is dense. Use a larger export size or shorter content.");
    }

    if (hasCenterContent && reliability === "M") {
        warnings.push("Use High or Maximum reliability when adding center content.");
    }

    return warnings;
}

export function buildQrOptions(settings) {
    const exportSize = exportSizes.has(Number(settings.exportSize)) ? Number(settings.exportSize) : 512;
    const reliability = reliabilityLevels.has(settings.reliability) ? settings.reliability : "M";
    const moduleShape = moduleShapes.has(settings.moduleShape) ? settings.moduleShape : "square";
    const finderShape = finderShapes.has(settings.finderShape) ? settings.finderShape : "square";
    const foreground = normalizeHexColor(settings.foreground);
    const background = normalizeHexColor(settings.background, "#FFFFFF");

    return {
        width: exportSize,
        height: exportSize,
        type: "svg",
        data: settings.content,
        // Conservative fallback; renderQr replaces this with an exact four-module quiet zone.
        margin: quietZoneMargin(exportSize, 21),
        qrOptions: {
            errorCorrectionLevel: reliability,
        },
        dotsOptions: {
            color: foreground,
            type: moduleShape,
            roundSize: true,
        },
        cornersSquareOptions: {
            color: foreground,
            type: finderSquareType(finderShape),
        },
        cornersDotOptions: {
            color: foreground,
            type: finderDotType(finderShape),
        },
        backgroundOptions: {
            color: background,
        },
        image: settings.centerImage || undefined,
        imageOptions: {
            hideBackgroundDots: true,
            imageSize: clamp(Number(settings.centerSize) || 0.24, 0.16, 0.36),
            margin: Math.max(2, Math.round(exportSize * 0.008)),
            // Center images are already local data URLs, so the vendor does not need XHR conversion.
            saveAsBlob: false,
        },
    };
}

export function quietZoneMargin(exportSize, moduleCount) {
    const size = exportSizes.has(Number(exportSize)) ? Number(exportSize) : 512;
    const count = Number(moduleCount);
    const safeModuleCount = Number.isFinite(count) && count >= 21 ? count : 21;
    return (size * 4) / (safeModuleCount + 8);
}

export function createTextBadgeDataUrl(text, foreground, background) {
    const content = truncateGraphemes(String(text ?? "").trim(), 6);
    if (!content) {
        return "";
    }

    const symbolCount = splitGraphemes(content).length;
    const escapedText = escapeXml(content);
    const fill = normalizeHexColor(foreground);
    const surface = normalizeHexColor(background, "#FFFFFF");
    const fontSize = symbolCount === 1 ? 224 : symbolCount === 2 ? 176 : symbolCount <= 4 ? 96 : 76;
    const height = symbolCount <= 2 ? 256 : 168;
    const textWidth = splitGraphemes(content)
        .reduce((total, grapheme) => total + graphemeWidthUnits(grapheme), 0) * fontSize;
    const width = Math.round(clamp(textWidth + 32, symbolCount === 1 ? 256 : 224, 520));
    const cornerRadius = symbolCount <= 2 ? 48 : 34;
    const textY = Math.round((height / 2) + (fontSize * 0.035));
    const svg = [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
        `<rect x="8" y="8" width="${width - 16}" height="${height - 16}" rx="${cornerRadius}" fill="${surface}"/>`,
        `<text x="${width / 2}" y="${textY}" text-anchor="middle" dominant-baseline="middle" `,
        `font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="${fontSize}" `,
        `font-weight="700" fill="${fill}">${escapedText}</text>`,
        "</svg>",
    ].join("");

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function finderSquareType(shape) {
    if (shape === "circle") {
        return "dot";
    }
    if (shape === "rounded") {
        return "extra-rounded";
    }
    return "square";
}

function finderDotType(shape) {
    return shape === "square" ? "square" : "dot";
}

function relativeLuminance(hex) {
    const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
    const [red, green, blue] = channels.map((channel) => (
        channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    ));
    return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
}

function escapeXml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&apos;");
}

function graphemeWidthUnits(grapheme) {
    if (/\p{Emoji_Presentation}|\p{Extended_Pictographic}/u.test(grapheme)
        || /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE6F\uFF01-\uFF60\uFFE0-\uFFE6]/u
            .test(grapheme)) {
        return 1;
    }
    if (/^[\s]$/u.test(grapheme)) return 0.35;
    if (/^[ilI1.,'|!]$/u.test(grapheme)) return 0.35;
    if (/^[MW@#%&]$/u.test(grapheme)) return 0.9;
    if (/^[\x00-\x7F]$/u.test(grapheme)) return 0.62;
    return 0.9;
}

function readJpegDimensions(data) {
    let offset = 2;
    const startOfFrameMarkers = new Set([
        0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
        0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF,
    ]);

    while (offset + 3 < data.length) {
        while (data[offset] === 0xFF) offset += 1;
        const marker = data[offset];
        offset += 1;
        if (marker === 0xD9 || marker === 0xDA) return undefined;
        if (marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) continue;
        if (offset + 1 >= data.length) return undefined;
        const segmentLength = (data[offset] << 8) | data[offset + 1];
        if (segmentLength < 2 || offset + segmentLength > data.length) return undefined;
        if (startOfFrameMarkers.has(marker)) {
            if (segmentLength < 7) return undefined;
            return {
                width: (data[offset + 5] << 8) | data[offset + 6],
                height: (data[offset + 3] << 8) | data[offset + 4],
            };
        }
        offset += segmentLength;
    }
    return undefined;
}

function readWebpDimensions(data) {
    let offset = 12;
    while (offset + 8 <= data.length) {
        const chunkType = ascii(data, offset, offset + 4);
        const chunkLength = readUint32LittleEndian(data, offset + 4);
        const chunkStart = offset + 8;
        if (chunkStart + chunkLength > data.length) return undefined;

        if (chunkType === "VP8X" && chunkLength >= 10) {
            return {
                width: 1 + readUint24LittleEndian(data, chunkStart + 4),
                height: 1 + readUint24LittleEndian(data, chunkStart + 7),
            };
        }
        if (chunkType === "VP8L" && chunkLength >= 5 && data[chunkStart] === 0x2F) {
            return {
                width: 1 + data[chunkStart + 1] + ((data[chunkStart + 2] & 0x3F) << 8),
                height: 1 + (data[chunkStart + 2] >> 6)
                    + (data[chunkStart + 3] << 2)
                    + ((data[chunkStart + 4] & 0x0F) << 10),
            };
        }
        if (chunkType === "VP8 " && chunkLength >= 10
            && data[chunkStart + 3] === 0x9D
            && data[chunkStart + 4] === 0x01
            && data[chunkStart + 5] === 0x2A) {
            return {
                width: ((data[chunkStart + 7] << 8) | data[chunkStart + 6]) & 0x3FFF,
                height: ((data[chunkStart + 9] << 8) | data[chunkStart + 8]) & 0x3FFF,
            };
        }
        offset = chunkStart + chunkLength + (chunkLength % 2);
    }
    return undefined;
}

function ascii(data, start, end) {
    return String.fromCharCode(...data.slice(start, end));
}

function readUint24LittleEndian(data, offset) {
    return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16);
}

function readUint32BigEndian(data, offset) {
    return ((data[offset] * 0x1000000)
        + (data[offset + 1] << 16)
        + (data[offset + 2] << 8)
        + data[offset + 3]) >>> 0;
}

function readUint32LittleEndian(data, offset) {
    return (data[offset]
        + (data[offset + 1] << 8)
        + (data[offset + 2] << 16)
        + (data[offset + 3] * 0x1000000)) >>> 0;
}

function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
}
