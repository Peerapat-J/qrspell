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
    const reliability = reliabilityLevels.has(settings.reliability) ? settings.reliability : "Q";
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
            saveAsBlob: true,
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
    const content = String(text ?? "").trim().slice(0, 6);
    if (!content) {
        return "";
    }

    const escapedText = escapeXml(content);
    const fill = normalizeHexColor(foreground);
    const surface = normalizeHexColor(background, "#FFFFFF");
    const fontSize = content.length <= 2 ? 118 : content.length <= 4 ? 82 : 62;
    const svg = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">',
        `<rect x="8" y="8" width="240" height="240" rx="58" fill="${surface}"/>`,
        `<text x="128" y="137" text-anchor="middle" dominant-baseline="middle" `,
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

function clamp(value, minimum, maximum) {
    return Math.min(Math.max(value, minimum), maximum);
}
