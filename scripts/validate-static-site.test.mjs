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

// Only the fixture's homepage is changed; other site files are read through symlinks.
for (const entry of readdirSync(root, { withFileTypes: true })) {
    if ([".git", "scripts", "index.html"].includes(entry.name)) {
        continue;
    }
    symlinkSync(join(root, entry.name), join(fixture, entry.name), entry.isDirectory() ? "dir" : "file");
}
mkdirSync(join(fixture, "scripts"));
const validator = join(fixture, "scripts", "validate-static-site.mjs");
copyFileSync(join(root, "scripts", "validate-static-site.mjs"), validator);

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
