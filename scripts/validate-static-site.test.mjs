import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
    copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = mkdtempSync(join(tmpdir(), "qrspell-canonical-test-"));
after(() => rmSync(fixture, { recursive: true, force: true }));

// Copy every HTML page so mutation tests cannot write through to the checkout.
const htmlDirectories = ["qr-code-generator", "privacy", "Acknowledgements", "changelog", "helpcenter", "legal"];
for (const entry of readdirSync(root, { withFileTypes: true })) {
    if ([".git", "scripts", "index.html", ...htmlDirectories].includes(entry.name)) {
        continue;
    }
    symlinkSync(join(root, entry.name), join(fixture, entry.name), entry.isDirectory() ? "dir" : "file");
}
for (const directory of htmlDirectories) {
    mkdirSync(join(fixture, directory));
    for (const entry of readdirSync(join(root, directory))) {
        if (entry === "index.html") copyFileSync(join(root, directory, entry), join(fixture, directory, entry));
        else symlinkSync(join(root, directory, entry), join(fixture, directory, entry));
    }
}
const generator = readFileSync(join(root, "qr-code-generator/index.html"), "utf8");
writeFileSync(join(fixture, "qr-code-generator/index.html"), generator);
mkdirSync(join(fixture, "scripts"));
const validator = join(fixture, "scripts", "validate-static-site.mjs");
copyFileSync(join(root, "scripts", "validate-static-site.mjs"), validator);
copyFileSync(join(root, "scripts", "analytics-release-policy.mjs"), join(fixture, "scripts", "analytics-release-policy.mjs"));

const homepage = readFileSync(join(root, "index.html"), "utf8");
const originalCanonical = homepage.match(/<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>/iu)?.[0];
assert.ok(originalCanonical, "The homepage canonical fixture must exist.");
const canonical = '<link rel="canonical" href="https://qrspell.app/">';

const cases = [
    ["accepts rel before href", canonical, 0],
    ["accepts href before rel", '<link href="https://qrspell.app/" rel="canonical">', 0],
    ["accepts spacing, case and single quotes", "<LINK HREF = 'https://qrspell.app/'\n REL = 'canonical'>", 0],
    ["ignores unrelated attributes", '<link data-rel="canonical" href="styles.css">' + canonical, 0],
    ["ignores canonical text inside another attribute", '<link data-note="rel=\'canonical\'" href="styles.css">' + canonical, 0],
    ["rejects a missing canonical", "", 1],
    ["rejects an incorrect canonical URL", '<link href="https://qrspell.app/helpcenter/" rel="canonical">', 1],
    ["rejects duplicate canonicals with different attribute orders", canonical + '<link href="https://qrspell.app/" rel="canonical">', 1],
    ["rejects a canonical without href", '<link rel="canonical">', 1],
    ["does not treat data-href as href", '<link rel="canonical" data-href="https://qrspell.app/">', 1],
];

for (const [name, link, expectedStatus] of cases) {
    test(name, () => {
        writeFileSync(join(fixture, "index.html"), homepage.replace(originalCanonical, link));
        const result = spawnSync(process.execPath, [validator], {
            encoding: "utf8",
            env: { ...process.env, SITE_ORIGIN: "https://qrspell.app", SITE_BASE_PATH: "/" },
        });
        assert.ifError(result.error);
        assert.equal(result.status, expectedStatus, result.stdout + result.stderr);
        if (expectedStatus !== 0) {
            assert.match(result.stderr, /index\.html must have one canonical URL matching https:\/\/qrspell\.app\//u);
        }
    });
}

test("Generator analytics coverage and CSP reject unsafe regressions", async (context) => {
    writeFileSync(join(fixture, "index.html"), homepage);
    const beacon = generator.match(/<script\b[^>]*data-cf-beacon='[^']+'[^>]*><\/script>/u)[0];
    const mutations = [
        ["missing analytics bootstrap", generator.replace(/<script type="module" src="\.\.\/assets\/analytics-bootstrap\.mjs[^>]*><\/script>/u, ""), /exactly one local analytics bootstrap/u],
        ["duplicate analytics bootstrap", generator.replace('</head>', '<script type="module" src="../assets/analytics-bootstrap.mjs?v=20260928a"></script></head>'), /exactly one local analytics bootstrap/u],
        ["direct provider script", generator.replace('</head>', '<script src="https://eu.i.posthog.com/static/array.js"></script></head>'), /only through its optional bootstrap/u],
        ["missing EU ingestion", generator.replace(" https://eu.i.posthog.com;", ";"), /CSP must allow only/u],
        ["US ingestion", generator.replace("https://eu.i.posthog.com", "https://us.i.posthog.com"), /CSP must allow only/u],
        ["PostHog script origin", generator.replace("script-src 'self'", "script-src 'self' https://eu.i.posthog.com"), /CSP must allow only/u],
        ["missing beacon", generator.replace(beacon, ""), /exactly one Cloudflare/u],
        ["unguarded beacon", generator.replace('</head>', '<script src="https://static.cloudflareinsights.com/beacon.min.js"></script></head>'), /guarded local module/u],
        ["duplicate beacon", generator.replace(beacon, beacon + beacon), /exactly one Cloudflare/u],
        ["wrong token", generator.replace("e43189ed6f5c43d29472b9b18c73b226", "wrong"), /token does not match/u],
        ["automatic SPA measurement", generator.replace('"spa":false', '"spa":true'), /configuration must contain only/u],
        ["unexpected forwarding", generator.replace('"spa":false', '"spa":false,"forward":{"url":"https://example.com/"}'), /configuration must contain only/u],
        ["wildcard script source", generator.replace("https://static.cloudflareinsights.com/beacon.min.js", "https://*.cloudflareinsights.com"), /exactly one Cloudflare|CSP must allow only/u],
        ["whole script origin", generator.replace("script-src 'self' https://static.cloudflareinsights.com/beacon.min.js", "script-src 'self' https://static.cloudflareinsights.com"), /CSP must allow only/u],
        ["broad connections", generator.replace("connect-src https://cloudflareinsights.com/cdn-cgi/rum", "connect-src https:"), /CSP must allow only/u],
        ["whole ingestion origin", generator.replace("connect-src https://cloudflareinsights.com/cdn-cgi/rum", "connect-src https://cloudflareinsights.com"), /CSP must allow only/u],
        ["local connections", generator.replace("connect-src https://cloudflareinsights.com/cdn-cgi/rum", "connect-src 'self' https://cloudflareinsights.com/cdn-cgi/rum"), /CSP must allow only/u],
        ["duplicate source", generator.replace("script-src 'self' https://static.cloudflareinsights.com/beacon.min.js", "script-src 'self' 'self'"), /CSP must allow only/u],
        ["missing CSP", generator.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/u, ""), /CSP must allow only/u],
        ["duplicate directive", generator.replace("default-src 'none'", "default-src 'none'; default-src 'none'"), /CSP must allow only/u],
    ];
    try {
        for (const [name, html, error] of mutations) {
            await context.test(name, () => {
                writeFileSync(join(fixture, "qr-code-generator/index.html"), html);
                const result = spawnSync(process.execPath, [validator], {
                    encoding: "utf8",
                    env: { ...process.env, SITE_ORIGIN: "https://qrspell.app", SITE_BASE_PATH: "/" },
                });
                assert.ifError(result.error);
                assert.equal(result.status, 1, result.stdout + result.stderr);
                assert.match(result.stderr, error);
            });
        }
    } finally {
        writeFileSync(join(fixture, "qr-code-generator/index.html"), generator);
    }
});

test("every website page rejects broadened CSP and referrer permissions", async context => {
    writeFileSync(join(fixture, "index.html"), homepage);
    for (const file of ["index.html", ...htmlDirectories.map(directory => `${directory}/index.html`)]) {
        const original = readFileSync(join(root, file), "utf8");
        const policy = original.match(/<meta http-equiv="Content-Security-Policy"[^>]*>/u)[0];
        const mutations = [
            ["missing policy", original.replace(policy, ""), /CSP must allow only/u],
            ["duplicate policy", original.replace(policy, policy + policy), /CSP must allow only/u],
            ["unrelated origin", original.replace("connect-src ", "connect-src https://example.com "), /CSP must allow only/u],
            ["broad HTTPS", original.replace("connect-src ", "connect-src https: "), /CSP must allow only/u],
            ["unsafe eval", original.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'"), /CSP must allow only/u],
            ["inline script", original.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"), /CSP must allow only/u],
            ["missing referrer policy", original.replace('<meta name="referrer" content="no-referrer">', ""), /no-referrer policy/u],
            ["leaking referrer", original.replace('content="no-referrer"', 'content="unsafe-url"'), /no-referrer policy/u],
        ];
        try {
            for (const [name, html, message] of mutations) {
                await context.test(`${file}: ${name}`, () => {
                    writeFileSync(join(fixture, file), html);
                    const result = spawnSync(process.execPath, [validator], { encoding: "utf8" });
                    assert.ifError(result.error);
                    assert.equal(result.status, 1, result.stdout + result.stderr);
                    assert.match(result.stderr, message);
                });
            }
        } finally {
            writeFileSync(join(fixture, file), original);
        }
    }
});

test("website routes must be present, unique, and match their page", () => {
    for (const replacement of ["", 'data-analytics-route="generator"', 'data-analytics-route="home" data-analytics-route="home"']) {
        writeFileSync(join(fixture, "index.html"), homepage.replace('data-analytics-route="home"', replacement));
        const result = spawnSync(process.execPath, [validator], { encoding: "utf8" });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /exactly one matching analytics route/u);
    }
    writeFileSync(join(fixture, "index.html"), homepage);
});

test("CTA sources must be present, unique, and match their position", () => {
    writeFileSync(join(fixture, "index.html"), homepage);
    for (const replacement of ["", 'data-analytics-source="footer"', 'data-analytics-source="header" data-analytics-source="header"']) {
        writeFileSync(join(fixture, "qr-code-generator/index.html"), generator.replace('data-analytics-source="header"', replacement));
        const result = spawnSync(process.execPath, [validator], { encoding: "utf8" });
        assert.equal(result.status, 1);
        assert.match(result.stderr, /exactly one matching analytics source/u);
    }
    writeFileSync(join(fixture, "qr-code-generator/index.html"), generator);
    writeFileSync(join(fixture, "index.html"), homepage.replace('href="qr-code-generator/"', 'data-analytics-source="header" href="qr-code-generator/"'));
    const result = spawnSync(process.execPath, [validator], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /source must belong to a QRSpell App Store link/u);
    writeFileSync(join(fixture, "index.html"), homepage);
});
