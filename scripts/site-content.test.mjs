import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(join(root, file), "utf8");
const homepage = read("index.html");
const changelog = read("changelog/index.html");
const graph = JSON.parse(homepage.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/u)[1])["@graph"];
const software = graph.find((item) => item["@type"] === "SoftwareApplication");

// These checks cover our static markup, not arbitrary HTML or the full schema.org vocabulary.
function attributes(tag) {
    return Object.fromEntries([...tag.matchAll(/\s([\w:-]+)\s*=\s*(["'])(.*?)\2/gu)]
        .map((match) => [match[1], match[3]]));
}

const previews = [...homepage.matchAll(/<button\b[^>]*class="app-preview-trigger"[^>]*>([\s\S]*?)<\/button>/gu)]
    .map((match) => ({
        button: attributes(match[0].match(/<button[^>]*>/u)[0]),
        image: attributes(match[1].match(/<img[^>]*>/u)[0]),
    }));

test("page descriptions and social metadata agree", () => {
    for (const file of ["index.html", "changelog/index.html", "helpcenter/index.html"]) {
        const html = read(file);
        const tags = [...html.matchAll(/<meta\b[^>]*>/gu)].map((match) => attributes(match[0]));
        const description = tags.find((tag) => tag.name === "description").content;
        const title = html.match(/<title>(.*?)<\/title>/u)[1];
        assert.equal(tags.find((tag) => tag.property === "og:description").content, description, file);
        assert.equal(tags.find((tag) => tag.name === "twitter:description").content, description, file);
        assert.equal(tags.find((tag) => tag.property === "og:title").content, title, file);
        assert.equal(tags.find((tag) => tag.name === "twitter:title").content, title, file);
        if (file === "index.html") {
            for (const item of graph) assert.equal(item.description, description);
        }
    }
});

test("software metadata matches the latest changelog and gallery", () => {
    const version = changelog.match(/<h2>v([\d.]+)\s/u)[1];
    assert.equal(software.softwareVersion, version);
    assert.equal(software.releaseNotes, `https://qrspell.app/changelog/#v${version.replaceAll(".", "-")}`);
    assert.ok(changelog.includes(`id="v${version.replaceAll(".", "-")}"`));
    assert.equal(software.isAccessibleForFree, true);
    assert.equal(software.offers.price, 0);
    assert.equal(software.operatingSystem, "macOS 15 or later");
    assert.equal(software.processorRequirements, "Apple silicon (arm64)");
    assert.deepEqual(software.screenshot, previews.map(({ image }) => `https://qrspell.app/${image["data-full-src"]}`));
});

test("gallery follows numbered source files and has accurate counters", () => {
    assert.ok(previews.length > 0);
    const folder = dirname(previews[0].image["data-full-src"]);
    const sourceFiles = readdirSync(join(root, folder)).filter((file) => file.endsWith(".png"))
        .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
    assert.deepEqual(previews.map(({ image }) => basename(image["data-full-src"])), sourceFiles);
    for (const [index, { button, image }] of previews.entries()) {
        assert.equal(dirname(image["data-full-src"]), folder);
        assert.equal(button["aria-label"], `Open screenshot ${index + 1} of ${previews.length}`);
        assert.ok(image.alt.length > 15);
        const png = readFileSync(join(root, image["data-full-src"]));
        assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
        assert.equal(png.readUInt32BE(16), Number(image.width));
        assert.equal(png.readUInt32BE(20), Number(image.height));
        assert.equal(Number(image.width) / Number(image.height), 16 / 10);
        const candidates = image.srcset.split(",").map((entry) => entry.trim().split(/\s+/u));
        assert.deepEqual(candidates.map(([, width]) => width), ["640w", "1280w", "2560w"]);
        for (const [file, width] of candidates) {
            const stem = basename(image["data-full-src"], ".png");
            assert.equal(file, `${folder}/web/${stem}-${width.slice(0, -1)}.webp`);
            const webp = readFileSync(join(root, file));
            assert.equal(webp.toString("ascii", 0, 4), "RIFF");
            assert.equal(webp.toString("ascii", 8, 12), "WEBP");
        }
        assert.equal(image.src, candidates[1][0]);
        if (index > 0) assert.equal(image.loading, "lazy");
    }
});

test("archived 2.1 PNGs match the recorded source checksums", () => {
    const folder = "assets/app-preview/2.1";
    const checksums = [...read(`${folder}/README.md`).matchAll(/^([a-f0-9]{64})  (.+\.png)$/gmu)];
    assert.equal(checksums.length, 8);
    for (const [, expected, file] of checksums) {
        const actual = createHash("sha256").update(readFileSync(join(root, folder, file))).digest("hex");
        assert.equal(actual, expected, file);
    }
});

test("2.1 release notes preserve the approved App Store wording and order", () => {
    const release = changelog.match(/<article\b[^>]*id="v2-1"[^>]*>([\s\S]*?)<\/article>/u)[1];
    assert.deepEqual([...release.matchAll(/<li>(.*?)<\/li>/gu)].map((match) => match[1]), [
        "URL previews on hover over the Open URL button (optional).",
        "Save QR previews in History (optional).",
        "View and manage History storage.",
        "Keep scan result windows on top of other windows (optional).",
        "Improved scan result window placement.",
        "Automatic verification for generated QR codes.",
        "Bug fixes and UI improvements.",
    ]);
});
