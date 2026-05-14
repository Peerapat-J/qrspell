import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = normalize(join(dirname(fileURLToPath(import.meta.url)), ".."));
const siteBasePath = normalizeSiteBasePath(process.env.SITE_BASE_PATH ?? "/qrspell");

const requiredFiles = [
    ".nojekyll",
    "index.html",
    "styles.css",
    "site.js",
    "privacy/index.html",
    "legal/index.html",
    "changelog/index.html",
    "helpcenter/index.html",
];

const routes = [
    `${siteBasePath}/`,
    `${siteBasePath}/privacy/`,
    `${siteBasePath}/legal/`,
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
    validateHtmlReferences(htmlFile, html);
    validateHtmlAnchors(htmlFile, html);
}

validateCssReferences("styles.css", readText("styles.css"));

if (errors.length > 0) {
    console.error("Static site validation failed:");
    for (const error of errors) {
        console.error(`- ${error}`);
    }
    process.exit(1);
}

console.log("Static site validation passed.");

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

function validateCssReferences(cssFile, css) {
    for (const match of css.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) {
        validateReference(cssFile, match[2]);
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
