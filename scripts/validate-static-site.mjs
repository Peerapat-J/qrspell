import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { analyticsConfig } from "../assets/analytics-config.mjs";
import { analyticsSchema } from "../assets/analytics-schema.mjs";

const root = normalize(join(dirname(fileURLToPath(import.meta.url)), ".."));
const siteOrigin = process.env.SITE_ORIGIN ?? "https://qrspell.app";
const siteBasePath = normalizeSiteBasePath(process.env.SITE_BASE_PATH ?? "/");
const cloudflareBeaconToken = "e43189ed6f5c43d29472b9b18c73b226";

const requiredFiles = [
    ".nojekyll",
    "index.html",
    "robots.txt",
    "sitemap.xml",
    "styles.css",
    "site.js",
    ...["analytics", "analytics-config", "analytics-schema", "analytics-contract", "analytics-posthog", "analytics-bootstrap", "site-analytics"].map(name => `assets/${name}.mjs`),
    "assets/vendor/posthog/posthog.mjs",
    "assets/vendor/posthog/LICENSE",
    "assets/vendor/posthog/README.md",
    "assets/vendor/posthog/manifest.json",
    "qr-code-generator/index.html",
    "qr-code-generator/generator.css",
    "qr-code-generator/generator.mjs",
    "qr-code-generator/generator-core.mjs",
    "qr-code-generator/generator-analytics.mjs",
    "qr-code-generator/generator-event-properties.mjs",
    "assets/vendor/qr-code-styling/qr-code-styling.js",
    "assets/vendor/qr-code-styling/LICENSE",
    "assets/vendor/qr-code-styling/README.md",
    "assets/vendor/jsqr/jsQR.js",
    "assets/vendor/jsqr/LICENSE",
    "privacy/index.html",
    "legal/index.html",
    "Acknowledgements/index.html",
    "changelog/index.html",
    "helpcenter/index.html",
];

const routes = [
    `${siteBasePath}/`,
    `${siteBasePath}/qr-code-generator/`,
    `${siteBasePath}/privacy/`,
    `${siteBasePath}/Acknowledgements/`,
    `${siteBasePath}/changelog/`,
    `${siteBasePath}/helpcenter/`,
];

const errors = [];

for (const file of requiredFiles) {
    assertFileExists(file, "required file");
}

for (const route of routes) {
    const resolvedRoute = resolveLocalReference(route, "index.html");
    if (!resolvedRoute) {
        errors.push(`Route ${route} did not resolve to a local HTML file.`);
        continue;
    }

    assertFileExists(resolvedRoute.file, `route ${route}`);
}

const htmlFiles = requiredFiles.filter((file) => file.endsWith(".html"));

for (const htmlFile of htmlFiles) {
    const html = readText(htmlFile);
    validateSiteMetadata(htmlFile, html);
    validateHtmlReferences(htmlFile, html);
    validateHtmlAnchors(htmlFile, html);
    validateCloudflareBeacon(htmlFile, html);
    validateAnalyticsCsp(htmlFile, html);
    validateAnalyticsBootstrap(htmlFile, html);
    validateAnalyticsRoute(htmlFile, html);
    validateAppStoreSources(htmlFile, html);
}

validateAnalyticsBundle();

validateCssReferences("styles.css", readText("styles.css"));
validateRobots(readText("robots.txt"));
validateSitemap(readText("sitemap.xml"));

if (errors.length > 0) {
    console.error("Static site validation failed:");
    for (const error of errors) {
        console.error(`- ${error}`);
    }
    process.exit(1);
}

console.log("Static site validation passed.");

function validateSiteMetadata(htmlFile, html) {
    const canonicalFile = htmlFile === "legal/index.html" ? "Acknowledgements/index.html" : htmlFile;
    const expectedCanonical = `${siteOrigin}${siteBasePath}/${canonicalFile.replace(/index\.html$/u, "")}`;
    const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/iu)?.[1] ?? "";
    const canonicalUrls = [];

    for (const [, linkAttributes] of head.matchAll(/<link\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>/giu)) {
        const attributes = new Map(
            [...linkAttributes.matchAll(/([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gu)]
                .map(([, name, doubleQuoted, singleQuoted, unquoted]) => [
                    name.toLowerCase(), doubleQuoted ?? singleQuoted ?? unquoted,
                ]),
        );

        if (attributes.get("rel")?.toLowerCase().split(/\s+/u).includes("canonical")) {
            canonicalUrls.push(attributes.get("href"));
        }
    }

    if (canonicalUrls.length !== 1 || canonicalUrls[0] !== expectedCanonical) {
        errors.push(`${htmlFile} must have one canonical URL matching ${expectedCanonical}.`);
    }

    if (head.includes("https://peerapat-j.github.io/qrspell")) {
        errors.push(`${htmlFile} metadata still references the legacy GitHub Pages URL.`);
    }
}

function validateHtmlReferences(htmlFile, html) {
    for (const match of html.matchAll(/\b(?:href|src|poster)\s*=\s*(["'])(.*?)\1/gi)) {
        validateReference(htmlFile, match[2]);
    }

    for (const match of html.matchAll(/\bsrcset\s*=\s*(["'])(.*?)\1/gi)) {
        const entries = match[2].split(",").map((entry) => entry.trim()).filter(Boolean);

        for (const entry of entries) {
            const [url] = entry.split(/\s+/);
            validateReference(htmlFile, url);
        }
    }
}

function validateHtmlAnchors(htmlFile, html) {
    const ids = new Set();

    for (const match of html.matchAll(/\bid\s*=\s*(["'])(.*?)\1/gi)) {
        ids.add(match[2]);
    }

    for (const match of html.matchAll(/\bhref\s*=\s*(["'])(#[^"']+)\1/gi)) {
        const fragment = decodeURIComponent(match[2].slice(1));

        if (!ids.has(fragment)) {
            errors.push(`${htmlFile} links to missing anchor #${fragment}.`);
        }
    }
}

function validateCloudflareBeacon(htmlFile, html) {
    const beaconScripts = [
        ...html.matchAll(/<script\b[^>]*static\.cloudflareinsights\.com\/beacon\.min\.js[^>]*><\/script>/giu),
    ];

    if (beaconScripts.length !== 1) {
        errors.push(`${htmlFile} must include exactly one Cloudflare Web Analytics beacon script.`);
        return;
    }

    const beaconConfig = beaconScripts[0][0].match(/\bdata-cf-beacon\s*=\s*(["'])(.*?)\1/isu);

    if (!beaconConfig) {
        errors.push(`${htmlFile} Cloudflare Web Analytics beacon is missing data-cf-beacon.`);
        return;
    }

    let parsedBeaconConfig;

    try {
        parsedBeaconConfig = JSON.parse(beaconConfig[2]);
    } catch {
        errors.push(`${htmlFile} Cloudflare Web Analytics data-cf-beacon is not valid JSON.`);
        return;
    }

    if (parsedBeaconConfig.token !== cloudflareBeaconToken) {
        errors.push(`${htmlFile} Cloudflare Web Analytics token does not match the expected token.`);
    }

    if (htmlFile === "qr-code-generator/index.html") {
        if (Object.keys(parsedBeaconConfig).sort().join(",") !== "spa,token" || parsedBeaconConfig.spa !== false) {
            errors.push(`${htmlFile} beacon configuration must contain only the site token and spa: false.`);
        }
    }
}

function validateAnalyticsCsp(htmlFile, html) {
    const generator = htmlFile === "qr-code-generator/index.html";
    const policies = [...html.matchAll(/<meta\b[^>]*http-equiv="Content-Security-Policy"[^>]*content="([^"]*)"[^>]*>/giu)];
    const expected = new Map([
        ["default-src", ["'none'"]],
        ["script-src", ["'self'", "https://static.cloudflareinsights.com/beacon.min.js"]],
        ["style-src", generator ? ["'self'", "'unsafe-inline'"] : ["'self'"]],
        ["img-src", generator ? ["'self'", "data:", "blob:"] : ["'self'"]],
        ["connect-src", ["https://cloudflareinsights.com/cdn-cgi/rum", "https://eu.i.posthog.com"]],
        ...["object-src", "base-uri", "form-action", "frame-src", "media-src"].map((name) => [name, ["'none'"]]),
    ]);
    const actual = policies[0]?.[1].split(";").map((part) => part.trim().split(/\s+/u)).filter(([name]) => name);
    if (policies.length !== 1 || actual.length !== expected.size || actual.some(([name, ...sources]) => {
        const allowed = expected.get(name);
        if (!allowed || sources.length !== allowed.length || new Set(sources).size !== sources.length || sources.some((source) => !allowed.includes(source))) return true;
        expected.delete(name);
        return false;
    }) || expected.size !== 0) {
        errors.push(`${htmlFile} CSP must allow only local assets and the exact Cloudflare beacon and approved ingestion URLs.`);
    }
    const referrers = [...html.matchAll(/<meta\b[^>]*name="referrer"[^>]*content="([^"]*)"[^>]*>/giu)];
    if (referrers.length !== 1 || referrers[0][1] !== "no-referrer") {
        errors.push(`${htmlFile} must have exactly one no-referrer policy.`);
    }
}

function validateCssReferences(cssFile, css) {
    for (const match of css.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) {
        validateReference(cssFile, match[2]);
    }
}

function validateRobots(robots) {
    const expectedSitemap = `Sitemap: ${siteOrigin}${siteBasePath}/sitemap.xml`;

    if (!robots.includes("User-agent: *")) {
        errors.push("robots.txt must define a default User-agent rule.");
    }

    if (!robots.includes("Allow: /")) {
        errors.push("robots.txt must allow crawlers to access the site.");
    }

    if (!robots.includes(expectedSitemap)) {
        errors.push(`robots.txt must reference ${expectedSitemap}.`);
    }
}

function validateSitemap(sitemap) {
    const expectedUrls = new Set(routes.map((route) => `${siteOrigin}${route}`));
    const seenUrls = new Set();
    const urlBlocks = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)];

    if (urlBlocks.length !== expectedUrls.size) {
        errors.push(`sitemap.xml must contain ${expectedUrls.size} URL entries.`);
    }

    for (const [, block] of urlBlocks) {
        const loc = block.match(/<loc>(.*?)<\/loc>/)?.[1]?.trim();
        const lastmod = block.match(/<lastmod>(.*?)<\/lastmod>/)?.[1]?.trim();

        if (!loc) {
            errors.push("sitemap.xml has a URL entry without a loc value.");
            continue;
        }

        seenUrls.add(loc);

        if (!expectedUrls.has(loc)) {
            errors.push(`sitemap.xml contains unexpected URL: ${loc}.`);
        }

        if (!lastmod || !/^\d{4}-\d{2}-\d{2}$/.test(lastmod)) {
            errors.push(`sitemap.xml entry ${loc} must include an ISO date lastmod value.`);
        }
    }

    for (const expectedUrl of expectedUrls) {
        if (!seenUrls.has(expectedUrl)) {
            errors.push(`sitemap.xml is missing ${expectedUrl}.`);
        }
    }
}

function validateReference(fromFile, rawReference) {
    const reference = rawReference.trim();

    if (shouldSkipReference(reference)) {
        return;
    }

    const resolved = resolveLocalReference(reference, fromFile);

    if (!resolved) {
        errors.push(`${fromFile} references ${reference}, which is outside ${siteBasePath}.`);
        return;
    }

    const referenceExists = assertFileExists(resolved.file, `${fromFile} reference ${reference}`);

    if (!referenceExists) {
        return;
    }

    if (resolved.fragment) {
        const targetText = readText(resolved.file);
        const targetIds = new Set(
            [...targetText.matchAll(/\bid\s*=\s*(["'])(.*?)\1/gi)].map((match) => match[2]),
        );

        if (!targetIds.has(resolved.fragment)) {
            errors.push(`${fromFile} links to missing anchor #${resolved.fragment} in ${resolved.file}.`);
        }
    }
}

function resolveLocalReference(rawReference, fromFile) {
    const reference = rawReference.trim();
    const parsed = splitReference(reference);
    const pathname = decodeURIComponent(parsed.pathname);
    let localPath;

    if (pathname === "") {
        localPath = fromFile;
    } else if (pathname.startsWith("/")) {
        localPath = pathFromRootReference(pathname);
        if (localPath === null) {
            return null;
        }
    } else {
        localPath = normalize(join(dirname(fromFile), pathname));
    }

    if (localPath === "." || localPath === "") {
        localPath = "index.html";
    }

    if (!localPath.endsWith(".html") && (localPath.endsWith(sep) || rawReference.endsWith("/"))) {
        localPath = join(localPath, "index.html");
    }

    if (!localPath.endsWith(".html") && existsDirectory(localPath)) {
        localPath = join(localPath, "index.html");
    }

    if (isOutsideRoot(localPath)) {
        return null;
    }

    return {
        file: normalize(localPath),
        fragment: parsed.fragment ? decodeURIComponent(parsed.fragment) : "",
    };
}

function pathFromRootReference(pathname) {
    if (pathname === "/" || pathname === siteBasePath || pathname === `${siteBasePath}/`) {
        return "index.html";
    }

    const prefix = `${siteBasePath}/`;

    if (!pathname.startsWith(prefix)) {
        return null;
    }

    return pathname.slice(prefix.length);
}

function splitReference(reference) {
    const hashIndex = reference.indexOf("#");
    const beforeHash = hashIndex === -1 ? reference : reference.slice(0, hashIndex);
    const fragment = hashIndex === -1 ? "" : reference.slice(hashIndex + 1);
    const queryIndex = beforeHash.indexOf("?");
    const pathname = queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex);

    return { pathname, fragment };
}

function shouldSkipReference(reference) {
    return (
        reference === "" ||
        reference.startsWith("#") ||
        /^[a-z][a-z0-9+.-]*:/i.test(reference) ||
        reference.startsWith("//")
    );
}

function assertFileExists(file, label) {
    const fullPath = join(root, file);

    if (!existsSync(fullPath) || !statSync(fullPath).isFile()) {
        errors.push(`Missing ${label}: ${file}`);
        return false;
    }

    return true;
}

function readText(file) {
    return readFileSync(join(root, file), "utf8");
}

function existsDirectory(file) {
    const fullPath = join(root, file);
    return existsSync(fullPath) && statSync(fullPath).isDirectory();
}

function isOutsideRoot(file) {
    return relative(root, join(root, file)).startsWith("..");
}

function normalizeSiteBasePath(basePath) {
    if (!basePath.startsWith("/")) {
        basePath = `/${basePath}`;
    }

    return basePath.replace(/\/+$/u, "");
}

function validateAnalyticsBootstrap(htmlFile, html) {
    const scripts = [...html.matchAll(/<script\b[^>]*analytics-bootstrap\.mjs[^>]*><\/script>/giu)];
    const prefix = htmlFile === "index.html" ? "" : "../";
    const expected = `<script type="module" src="${prefix}assets/analytics-bootstrap.mjs?v=20260929a"></script>`;
    if (scripts.length !== 1 || scripts[0][0] !== expected) {
        errors.push(`${htmlFile} must load exactly one local analytics bootstrap module.`);
    }
    if (/<script\b[^>]*src=["'][^"']*(?:posthog|analytics-posthog|analytics\.mjs)/iu.test(html)) {
        errors.push(`${htmlFile} must load analytics only through its optional bootstrap.`);
    }
}

function validateAnalyticsBundle() {
    const manifest = JSON.parse(readText("assets/vendor/posthog/manifest.json"));
    const checksum = createHash("sha256").update(readFileSync(join(root, "assets/vendor/posthog/posthog.mjs"))).digest("hex");
    if (manifest.sha256 !== checksum || manifest.version !== "1.434.17" || manifest.entrypoint !== "dist/module.slim.no-external.js") {
        errors.push("PostHog SDK must match the approved pinned manifest.");
    }
    if (analyticsConfig.enabled !== false || analyticsConfig.environment !== "production" || analyticsConfig.token !== "") {
        errors.push("Production analytics must remain disabled until the production gates pass.");
    }
}

function validateAnalyticsRoute(htmlFile, html) {
    const routeByFile = {
        "index.html": "home", "qr-code-generator/index.html": "generator",
        "privacy/index.html": "privacy", "legal/index.html": "legal",
        "Acknowledgements/index.html": "acknowledgements",
        "changelog/index.html": "changelog", "helpcenter/index.html": "helpcenter",
    };
    const body = html.match(/<body\b[^>]*>/iu)?.[0] ?? "";
    const routes = [...body.matchAll(/\sdata-analytics-route\s*=\s*["']([^"']*)["']/giu)];
    if (routes.length !== 1 || routes[0][1] !== routeByFile[htmlFile]) {
        errors.push(`${htmlFile} must declare exactly one matching analytics route.`);
    }
}

function validateAppStoreSources(htmlFile, html) {
    const storeUrl = "https://apps.apple.com/app/id6771453521";
    const header = html.match(/<header\b[\s\S]*?<\/header>/iu);
    const footer = html.match(/<footer\b[\s\S]*?<\/footer>/iu);
    const within = (match, region) => region && match.index >= region.index && match.index < region.index + region[0].length;
    for (const match of html.matchAll(/<([a-z][a-z0-9-]*)\b((?:[^"'<>]|"[^"]*"|'[^']*')*)>/giu)) {
        const attributes = [...match[2].matchAll(/([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gu)]
            .map(([, key, double, single, unquoted]) => [key.toLowerCase(), double ?? single ?? unquoted]);
        const hrefs = attributes.filter(([key]) => key === "href");
        const sources = attributes.filter(([key]) => key === "data-analytics-source");
        const isStoreLink = match[1].toLowerCase() === "a" && hrefs.some(([, value]) => value === storeUrl);
        if (!isStoreLink) {
            if (sources.length) errors.push(`${htmlFile} analytics source must belong to a QRSpell App Store link.`);
            continue;
        }
        const expected = within(match, header) ? "header" : within(match, footer) ? "footer"
            : htmlFile === "index.html" ? "homepage_hero" : htmlFile === "qr-code-generator/index.html" ? "generator_cta" : null;
        if (hrefs.length !== 1 || sources.length !== 1 || sources[0][1] !== expected
            || !analyticsSchema.events.app_store_clicked.properties.source.enum.includes(sources[0]?.[1])) {
            errors.push(`${htmlFile} App Store CTA must have exactly one matching analytics source.`);
        }
    }
}
