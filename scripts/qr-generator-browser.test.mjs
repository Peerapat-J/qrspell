import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, resolve, sep } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mimeTypes = new Map([
    [".css", "text/css; charset=utf-8"],
    [".html", "text/html; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"],
    [".mjs", "text/javascript; charset=utf-8"],
    [".png", "image/png"],
    [".svg", "image/svg+xml"],
    [".webp", "image/webp"],
]);

test("QR generator controls work together in a real browser", { timeout: 30_000 }, async (context) => {
    let site;
    let browser;
    let client;

    try {
        site = await startStaticServer();
        browser = await startBrowser();
        const target = await createTarget(browser.debugOrigin, "about:blank");
        client = await CdpClient.connect(target.webSocketDebuggerUrl);
        await client.send("Page.enable");
        await client.send("Runtime.enable");
        await client.send("Browser.setDownloadBehavior", { behavior: "deny" });
        await client.send("Network.enable");
        await client.send("Network.setBlockedURLs", { urls: ["*cloudflareinsights.com/*"] });
        await navigate(client, `${site.origin}/qr-code-generator/`);

        await context.test("keyboard dropdown selection and Reset restore defaults", async () => {
            await client.evaluate(`document.querySelector("#module-shape-trigger").focus()`);
            await pressKey(client, "ArrowDown");
            await waitFor(client, `document.activeElement?.getAttribute("role") === "option"`);
            await pressKey(client, "ArrowDown");
            await pressKey(client, "Enter");
            assert.equal(await client.evaluate(`document.querySelector("#module-shape").value`), "rounded");

            await client.evaluate(`(() => {
                const content = document.querySelector("#qr-content");
                content.value = "reset me";
                content.dispatchEvent(new Event("input", { bubbles: true }));
                document.querySelector("#reset-generator").click();
            })()`);
            assert.deepEqual(await client.evaluate(`(() => ({
                content: document.querySelector("#qr-content").value,
                moduleShape: document.querySelector("#module-shape").value,
                reliability: document.querySelector("#reliability").value,
                copyDisabled: document.querySelector("#copy-qr").disabled,
                downloadDisabled: document.querySelector("#download-qr").disabled,
            }))()`), {
                content: "",
                moduleShape: "square",
                reliability: "M",
                copyDisabled: true,
                downloadDisabled: true,
            });
        });

        await context.test("center text truncation waits for IME composition to end", async () => {
            await navigate(client, `${site.origin}/qr-code-generator/?test=center-text-composition`);
            const values = await client.evaluate(`(() => {
                const centerText = document.querySelector("#center-text");
                centerText.value = "あいうえおかき";
                centerText.dispatchEvent(new InputEvent("input", {
                    bubbles: true,
                    data: "き",
                    inputType: "insertCompositionText",
                    isComposing: true,
                }));
                const duringComposition = centerText.value;
                centerText.dispatchEvent(new CompositionEvent("compositionend", {
                    bubbles: true,
                    data: centerText.value,
                }));
                return { duringComposition, afterComposition: centerText.value };
            })()`);
            assert.deepEqual(values, {
                duringComposition: "あいうえおかき",
                afterComposition: "あいうえおか",
            });
        });

        await context.test("hue and pointer input update the custom color picker", async () => {
            await client.evaluate(`document.querySelector("#foreground-color-trigger").click()`);
            await waitFor(client, `!document.querySelector("#foreground-color-popover").hidden`);
            const hueState = await client.evaluate(`(() => {
                const popover = document.querySelector("#foreground-color-popover");
                const hue = popover.querySelector('input[type="range"]');
                hue.value = "240";
                hue.dispatchEvent(new Event("input", { bubbles: true }));
                return {
                    hue: hue.value,
                    planeHue: popover.querySelector(".generator-color-plane").style.getPropertyValue("--picker-hue"),
                };
            })()`);
            assert.equal(hueState.hue, "240");
            assert.match(hueState.planeHue, /hsl\(240 /u);

            const bounds = await client.evaluate(`(async () => {
                const plane = document.querySelector("#foreground-color-popover .generator-color-plane");
                document.documentElement.style.scrollBehavior = "auto";
                plane.scrollIntoView({ block: "center", behavior: "instant" });
                await new Promise((resolvePromise) => requestAnimationFrame(() => requestAnimationFrame(resolvePromise)));
                window.__qrspellPointerEvents = [];
                plane.addEventListener("pointerdown", (event) => {
                    window.__qrspellPointerEvents.push({ x: event.clientX, y: event.clientY });
                }, { once: true });
                const rect = plane.getBoundingClientRect();
                return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
            })()`);
            const x = bounds.left + (bounds.width * 0.75);
            const y = bounds.top + (bounds.height * 0.25);
            await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
            await client.send("Input.dispatchMouseEvent", {
                type: "mousePressed", x, y, button: "left", clickCount: 1,
            });
            await client.send("Input.dispatchMouseEvent", {
                type: "mouseReleased", x, y, button: "left", clickCount: 1,
            });
            const pointerState = await client.evaluate(`(() => ({
                color: document.querySelector("#foreground-color").value.toUpperCase(),
                events: window.__qrspellPointerEvents,
            }))()`);
            assert.equal(pointerState.events.length, 1, JSON.stringify({ bounds, pointerState }));
            assert.notEqual(pointerState.color, "#000000");
            const channelState = await client.evaluate(`(() => {
                const popover = document.querySelector("#foreground-color-popover");
                const sliders = [...popover.querySelectorAll(".generator-color-channel input")];
                const plane = popover.querySelector(".generator-color-plane");
                return {
                    labels: sliders.map((slider) => slider.getAttribute("aria-label")),
                    values: sliders.map((slider) => Number(slider.value)),
                    planeHidden: plane.getAttribute("aria-hidden"),
                    planeRole: plane.getAttribute("role"),
                };
            })()`);
            assert.deepEqual({
                labels: channelState.labels,
                planeHidden: channelState.planeHidden,
                planeRole: channelState.planeRole,
            }, {
                labels: ["QR color saturation", "QR color brightness"],
                planeHidden: "true",
                planeRole: null,
            });
            assert.ok(Math.abs(channelState.values[0] - 75) <= 1);
            assert.ok(Math.abs(channelState.values[1] - 75) <= 1);
        });

        await context.test("zero brightness preserves the selected saturation", async () => {
            await navigate(client, `${site.origin}/qr-code-generator/?test=zero-brightness`);
            const state = await client.evaluate(`(() => {
                document.querySelector("#foreground-color-trigger").click();
                const popover = document.querySelector("#foreground-color-popover");
                const hue = popover.querySelector('input[type="range"]');
                const [saturation, brightness] = popover.querySelectorAll(".generator-color-channel input");
                const color = document.querySelector("#foreground-color");
                const setChannel = (input, value) => {
                    input.value = String(value);
                    input.dispatchEvent(new Event("input", { bubbles: true }));
                };
                setChannel(brightness, 80);
                setChannel(hue, 210);
                setChannel(saturation, 75);
                const before = color.value;
                setChannel(brightness, 0);
                const atBlack = {
                    color: color.value,
                    saturation: Number(saturation.value),
                    thumbPosition: popover.querySelector(".generator-color-plane-thumb").style.left,
                };
                setChannel(brightness, 80);
                return { before, atBlack, after: color.value };
            })()`);
            assert.deepEqual(state.atBlack, {
                color: "#000000",
                saturation: 75,
                thumbPosition: "75%",
            });
            assert.equal(state.after, state.before);
        });

        await context.test("Reset clears the saturation preserved at zero brightness", async () => {
            await navigate(client, `${site.origin}/qr-code-generator/?test=reset-zero-brightness`);
            const state = await client.evaluate(`(() => {
                document.querySelector("#foreground-color-trigger").click();
                const popover = document.querySelector("#foreground-color-popover");
                const hue = popover.querySelector('input[type="range"]');
                const [saturation, brightness] = popover.querySelectorAll(".generator-color-channel input");
                const color = document.querySelector("#foreground-color");
                const setChannel = (input, value) => {
                    input.value = String(value);
                    input.dispatchEvent(new Event("input", { bubbles: true }));
                };
                setChannel(brightness, 80);
                setChannel(hue, 240);
                setChannel(saturation, 75);
                setChannel(brightness, 0);
                document.querySelector("#reset-generator").click();
                const afterReset = {
                    color: color.value,
                    hue: Number(hue.value),
                    saturation: Number(saturation.value),
                    thumbPosition: popover.querySelector(".generator-color-plane-thumb").style.left,
                };
                setChannel(brightness, 80);
                return { afterReset, afterBrightening: color.value.toUpperCase() };
            })()`);
            assert.deepEqual(state.afterReset, {
                color: "#000000",
                hue: 0,
                saturation: 0,
                thumbPosition: "0%",
            });
            assert.equal(state.afterBrightening, "#CCCCCC");
        });

        await context.test("exports stay disabled until the rendered QR is verified", async () => {
            await navigate(client, `${site.origin}/qr-code-generator/?test=verification`);
            await client.evaluate(`(() => {
                const content = document.querySelector("#qr-content");
                content.value = "verified browser test";
                content.dispatchEvent(new Event("input", { bubbles: true }));
            })()`);
            await waitFor(client, `document.querySelector("#verification-status").dataset.state === "verified"`);
            assert.deepEqual(await exportState(client), {
                state: "verified",
                copyDisabled: false,
                downloadDisabled: false,
            });

            await client.evaluate(`(() => {
                for (const id of ["foreground-color", "background-color"]) {
                    const input = document.querySelector("#" + id);
                    input.value = "#777777";
                    input.dispatchEvent(new Event("input", { bubbles: true }));
                }
            })()`);
            await waitFor(client, `document.querySelector("#verification-status").dataset.state === "warning"`);
            assert.deepEqual(await exportState(client), {
                state: "warning",
                copyDisabled: true,
                downloadDisabled: true,
            });
        });

        await context.test("whitespace-only content is encoded and verified exactly", async () => {
            await navigate(client, `${site.origin}/qr-code-generator/?test=whitespace-content`);
            await client.evaluate(`(() => {
                const content = document.querySelector("#qr-content");
                content.value = " \\t\\n ";
                content.dispatchEvent(new Event("input", { bubbles: true }));
            })()`);
            await waitFor(client, `document.querySelector("#verification-status").dataset.state === "verified"`);
            assert.deepEqual(await client.evaluate(`(() => ({
                count: document.querySelector("#character-count").textContent,
                copyDisabled: document.querySelector("#copy-qr").disabled,
                downloadDisabled: document.querySelector("#download-qr").disabled,
            }))()`), {
                count: "4 characters",
                copyDisabled: false,
                downloadDisabled: false,
            });
        });

        await context.test("oversized content is rejected before constructing the QR encoder", async () => {
            await navigate(client, `${site.origin}/qr-code-generator/?test=oversized-content`);
            await client.evaluate(`(() => {
                const OriginalQRCodeStyling = window.QRCodeStyling;
                window.__qrspellQrConstructorCalls = 0;
                window.QRCodeStyling = function (...argumentsList) {
                    window.__qrspellQrConstructorCalls += 1;
                    return new OriginalQRCodeStyling(...argumentsList);
                };
                window.QRCodeStyling.prototype = OriginalQRCodeStyling.prototype;
                const content = document.querySelector("#qr-content");
                content.value = "x".repeat(1024 * 1024);
                content.dispatchEvent(new Event("input", { bubbles: true }));
            })()`);
            await waitFor(client, `document.querySelector("#verification-status").dataset.state === "error"`);
            assert.deepEqual(await client.evaluate(`(() => ({
                message: document.querySelector("#verification-status span:last-child").textContent,
                characterCount: document.querySelector("#character-count").textContent,
                constructorCalls: window.__qrspellQrConstructorCalls,
                previewCleared: document.querySelector("#qr-preview-empty").hidden === false,
                copyDisabled: document.querySelector("#copy-qr").disabled,
                downloadDisabled: document.querySelector("#download-qr").disabled,
            }))()`), {
                message: "This content is too long for a QR code. Shorten it and try again.",
                characterCount: "5,596+ characters",
                constructorCalls: 0,
                previewCleared: true,
                copyDisabled: true,
                downloadDisabled: true,
            });
        });

        await context.test("numeric content above the byte limit reaches the compact-mode encoder", async () => {
            await navigate(client, `${site.origin}/qr-code-generator/?test=numeric-capacity`);
            await client.evaluate(`(() => {
                const OriginalQRCodeStyling = window.QRCodeStyling;
                window.__qrspellQrConstructorCalls = 0;
                window.QRCodeStyling = function (...argumentsList) {
                    window.__qrspellQrConstructorCalls += 1;
                    return new OriginalQRCodeStyling(...argumentsList);
                };
                window.QRCodeStyling.prototype = OriginalQRCodeStyling.prototype;
                const content = document.querySelector("#qr-content");
                content.value = "1".repeat(3000);
                content.dispatchEvent(new Event("input", { bubbles: true }));
            })()`);
            await waitFor(client, `document.querySelector("#verification-status").dataset.state !== "checking"`);
            assert.equal(await client.evaluate(`window.__qrspellQrConstructorCalls`), 1);
            assert.equal(await client.evaluate(
                `document.querySelector("#verification-status span:last-child").textContent.includes("too long")`,
            ), false);
        });

        await context.test("non-ASCII byte data declares UTF-8 with ECI 26", async () => {
            await navigate(client, `${site.origin}/qr-code-generator/?test=utf8-eci`);
            const decoded = await client.evaluate(`(async () => {
                const content = "สวัสดี 👋";
                const qr = new window.QRCodeStyling({
                    width: 512,
                    height: 512,
                    type: "canvas",
                    data: content,
                    qrOptions: { errorCorrectionLevel: "M" },
                });
                const blob = await qr.getRawData("png");
                const bitmap = await createImageBitmap(blob);
                const canvas = document.createElement("canvas");
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                const context2d = canvas.getContext("2d", { willReadFrequently: true });
                context2d.drawImage(bitmap, 0, 0);
                bitmap.close();
                const image = context2d.getImageData(0, 0, canvas.width, canvas.height);
                const result = window.jsQR(image.data, image.width, image.height);
                return {
                    data: result?.data,
                    chunks: result?.chunks?.map((chunk) => ({
                        type: chunk.type,
                        assignmentNumber: chunk.assignmentNumber,
                    })),
                };
            })()`);
            assert.equal(decoded.data, "สวัสดี 👋");
            assert.deepEqual(decoded.chunks.slice(0, 2), [
                { type: "eci", assignmentNumber: 26 },
                { type: "byte" },
            ]);
        });

        await context.test("two-emoji center text renders and remains scannable", async () => {
            await navigate(client, `${site.origin}/qr-code-generator/?test=two-emoji-center`);
            await client.evaluate(`(() => {
                const content = document.querySelector("#qr-content");
                content.value = "two emoji center test";
                content.dispatchEvent(new Event("input", { bubbles: true }));
                const reliability = document.querySelector("#reliability");
                reliability.value = "H";
                reliability.dispatchEvent(new Event("change", { bubbles: true }));
                const centerType = document.querySelector("#center-type");
                centerType.value = "text";
                centerType.dispatchEvent(new Event("change", { bubbles: true }));
                const centerText = document.querySelector("#center-text");
                centerText.value = "🐻🐼";
                centerText.dispatchEvent(new Event("input", { bubbles: true }));
            })()`);
            await waitFor(client, `document.querySelector("#verification-status").dataset.state === "verified"`);
            assert.equal(await client.evaluate(`document.querySelector("#copy-qr").disabled`), false);
        });

        await context.test("Copy PNG uses the already verified blob", async () => {
            await navigate(client, `${site.origin}/qr-code-generator/?test=copy-verified-blob`);
            await client.evaluate(`(() => {
                const content = document.querySelector("#qr-content");
                content.value = "copy verified blob test";
                content.dispatchEvent(new Event("input", { bubbles: true }));
            })()`);
            await waitFor(client, `document.querySelector("#verification-status").dataset.state === "verified"`);
            await client.evaluate(`(() => {
                window.__qrspellClipboardWriteCalled = false;
                Object.defineProperty(navigator, "clipboard", {
                    configurable: true,
                    value: {
                        write(items) {
                            window.__qrspellClipboardWriteCalled = items[0].types.includes("image/png");
                            return Promise.resolve();
                        },
                    },
                });
                window.QRCodeStyling.prototype.getRawData = () => new Promise(() => {});
                document.querySelector("#copy-qr").click();
            })()`);
            await waitFor(client, `window.__qrspellClipboardWriteCalled === true`);
            await waitFor(client, `document.querySelector("#verification-status").textContent.includes("PNG copied")`);
        });

        await context.test("stale clipboard results do not replace the current QR status", async () => {
            await navigate(client, `${site.origin}/qr-code-generator/?test=stale-copy`);
            await client.evaluate(`(() => {
                const content = document.querySelector("#qr-content");
                content.value = "stale copy test";
                content.dispatchEvent(new Event("input", { bubbles: true }));
            })()`);
            await waitFor(client, `document.querySelector("#verification-status").dataset.state === "verified"`);
            await client.evaluate(`(() => {
                window.__qrspellClipboardPromise = new Promise((resolvePromise, rejectPromise) => {
                    window.__qrspellResolveClipboard = resolvePromise;
                    window.__qrspellRejectClipboard = rejectPromise;
                });
                Object.defineProperty(navigator, "clipboard", {
                    configurable: true,
                    value: { write: () => window.__qrspellClipboardPromise },
                });
                document.querySelector("#copy-qr").click();
                document.querySelector("#reset-generator").click();
                window.__qrspellResolveClipboard();
            })()`);
            await client.evaluate(`Promise.resolve()`);
            assert.deepEqual(await client.evaluate(`(() => ({
                state: document.querySelector("#verification-status").dataset.state,
                message: document.querySelector("#verification-status span:last-child").textContent,
            }))()`), {
                state: "idle",
                message: "Enter content to create a QR code",
            });
        });

        await context.test("Download PNG uses the cached verified blob", async () => {
            await navigate(client, `${site.origin}/qr-code-generator/?test=download-verified-blob`);
            await client.evaluate(`(() => {
                const content = document.querySelector("#qr-content");
                content.value = "download verified blob test";
                content.dispatchEvent(new Event("input", { bubbles: true }));
            })()`);
            await waitFor(client, `document.querySelector("#verification-status").dataset.state === "verified"`);
            await client.evaluate(`(() => {
                window.QRCodeStyling.prototype.getRawData = () => {
                    throw new Error("Download should use the verified blob");
                };
                document.querySelector("#download-qr").click();
            })()`);
            await waitFor(client, `document.querySelector("#verification-status").textContent.includes("PNG downloaded")`);
        });

        await context.test("oversized center images are rejected before file reading", async () => {
            await navigate(client, `${site.origin}/qr-code-generator/?test=oversized-image`);
            await client.evaluate(`(() => {
                const content = document.querySelector("#qr-content");
                content.value = "oversized image test";
                content.dispatchEvent(new Event("input", { bubbles: true }));
            })()`);
            await waitFor(client, `document.querySelector("#verification-status").dataset.state === "verified"`);
            await client.evaluate(`(() => {
                const centerType = document.querySelector("#center-type");
                centerType.value = "image";
                centerType.dispatchEvent(new Event("change", { bubbles: true }));
                const transfer = new DataTransfer();
                transfer.items.add(new File(
                    [new Uint8Array((5 * 1024 * 1024) + 1)],
                    "too-large.png",
                    { type: "image/png" },
                ));
                const input = document.querySelector("#center-image");
                input.files = transfer.files;
                input.dispatchEvent(new Event("change", { bubbles: true }));
            })()`);
            await waitFor(client, `document.querySelector("#center-image-error").textContent.includes("no larger than 5 MB")`);
            assert.deepEqual(await client.evaluate(`(() => ({
                error: document.querySelector("#center-image-error").textContent,
                fileCount: document.querySelector("#center-image").files.length,
                previewCleared: document.querySelector("#qr-preview-empty").hidden === false,
                copyDisabled: document.querySelector("#copy-qr").disabled,
                downloadDisabled: document.querySelector("#download-qr").disabled,
            }))()`), {
                error: "Choose an image no larger than 5 MB.",
                fileCount: 0,
                previewCleared: true,
                copyDisabled: true,
                downloadDisabled: true,
            });
        });

        await context.test("oversized image dimensions are rejected before decoding", async () => {
            await navigate(client, `${site.origin}/qr-code-generator/?test=oversized-image-dimensions`);
            await client.evaluate(`(() => {
                window.__qrspellImageDecodeCalled = false;
                const originalCreateImageBitmap = window.createImageBitmap;
                window.createImageBitmap = (...argumentsList) => {
                    window.__qrspellImageDecodeCalled = true;
                    return originalCreateImageBitmap(...argumentsList);
                };
                const centerType = document.querySelector("#center-type");
                centerType.value = "image";
                centerType.dispatchEvent(new Event("change", { bubbles: true }));
                const bytes = Uint8Array.from([
                    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
                    0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
                    0, 0, 0x13, 0x88, 0, 0, 0, 1,
                ]);
                const transfer = new DataTransfer();
                transfer.items.add(new File([bytes], "too-wide.png", { type: "image/png" }));
                const input = document.querySelector("#center-image");
                input.files = transfer.files;
                input.dispatchEvent(new Event("change", { bubbles: true }));
            })()`);
            await waitFor(client, `document.querySelector("#center-image-error").textContent.includes("4096 × 4096")`);
            assert.deepEqual(await client.evaluate(`(() => ({
                error: document.querySelector("#center-image-error").textContent,
                decodeCalled: window.__qrspellImageDecodeCalled,
                fileCount: document.querySelector("#center-image").files.length,
            }))()`), {
                error: "Choose an image no larger than 4096 × 4096 px (16.8 MP).",
                decodeCalled: false,
                fileCount: 0,
            });
        });

        await context.test("corrupt center images are rejected before rendering", async () => {
            await navigate(client, `${site.origin}/qr-code-generator/?test=corrupt-image`);
            await client.evaluate(`(() => {
                const content = document.querySelector("#qr-content");
                content.value = "corrupt image test";
                content.dispatchEvent(new Event("input", { bubbles: true }));
            })()`);
            await waitFor(client, `document.querySelector("#verification-status").dataset.state === "verified"`);
            await client.evaluate(`(() => {
                const centerType = document.querySelector("#center-type");
                centerType.value = "image";
                centerType.dispatchEvent(new Event("change", { bubbles: true }));
                const transfer = new DataTransfer();
                transfer.items.add(new File(
                    [new Uint8Array([1, 2, 3, 4])],
                    "corrupt.png",
                    { type: "image/png" },
                ));
                const input = document.querySelector("#center-image");
                input.files = transfer.files;
                input.dispatchEvent(new Event("change", { bubbles: true }));
            })()`);
            await waitFor(client, `document.querySelector("#center-image-error").textContent.includes("could not be decoded")`);
            assert.deepEqual(await client.evaluate(`(() => ({
                error: document.querySelector("#center-image-error").textContent,
                fileCount: document.querySelector("#center-image").files.length,
                previewCleared: document.querySelector("#qr-preview-empty").hidden === false,
                copyDisabled: document.querySelector("#copy-qr").disabled,
                downloadDisabled: document.querySelector("#download-qr").disabled,
            }))()`), {
                error: "The selected image could not be decoded. Choose a valid PNG, JPEG, or WebP file.",
                fileCount: 0,
                previewCleared: true,
                copyDisabled: true,
                downloadDisabled: true,
            });
            await client.evaluate(`(() => {
                const content = document.querySelector("#qr-content");
                content.value = "edited after corrupt image";
                content.dispatchEvent(new Event("input", { bubbles: true }));
                const centerSize = document.querySelector("#center-size");
                centerSize.value = "0.3";
                centerSize.dispatchEvent(new Event("input", { bubbles: true }));
            })()`);
            await client.evaluate(`new Promise((resolvePromise) => setTimeout(resolvePromise, 300))`);
            assert.deepEqual(await client.evaluate(`(() => ({
                error: document.querySelector("#center-image-error").textContent,
                errorHidden: document.querySelector("#center-image-error").hidden,
                status: document.querySelector("#verification-status").dataset.state,
                previewCleared: document.querySelector("#qr-preview-empty").hidden === false,
                copyDisabled: document.querySelector("#copy-qr").disabled,
                downloadDisabled: document.querySelector("#download-qr").disabled,
            }))()`), {
                error: "The selected image could not be decoded. Choose a valid PNG, JPEG, or WebP file.",
                errorHidden: false,
                status: "error",
                previewCleared: true,
                copyDisabled: true,
                downloadDisabled: true,
            });
        });

        await context.test("stale image failures do not replace a newer center mode", async () => {
            await navigate(client, `${site.origin}/qr-code-generator/?test=stale-image`);
            await client.evaluate(`(() => {
                const content = document.querySelector("#qr-content");
                content.value = "stale image test";
                content.dispatchEvent(new Event("input", { bubbles: true }));
            })()`);
            await waitFor(client, `document.querySelector("#verification-status").dataset.state === "verified"`);
            await client.evaluate(`(() => {
                const originalArrayBuffer = Blob.prototype.arrayBuffer;
                Blob.prototype.arrayBuffer = function () {
                    if (this.size === 4) {
                        return new Promise((resolvePromise, reject) => {
                            setTimeout(() => reject(new Error("delayed image failure")), 200);
                        });
                    }
                    return originalArrayBuffer.call(this);
                };
                const centerType = document.querySelector("#center-type");
                centerType.value = "image";
                centerType.dispatchEvent(new Event("change", { bubbles: true }));
                const transfer = new DataTransfer();
                transfer.items.add(new File(
                    [new Uint8Array([1, 2, 3, 4])],
                    "slow-corrupt.png",
                    { type: "image/png" },
                ));
                const input = document.querySelector("#center-image");
                input.files = transfer.files;
                input.dispatchEvent(new Event("change", { bubbles: true }));
                centerType.value = "text";
                centerType.dispatchEvent(new Event("change", { bubbles: true }));
                const centerText = document.querySelector("#center-text");
                centerText.value = "QR";
                centerText.dispatchEvent(new Event("input", { bubbles: true }));
            })()`);
            await waitFor(client, `document.querySelector("#verification-status").dataset.state === "verified"`);
            await client.evaluate(`new Promise((resolvePromise) => setTimeout(resolvePromise, 300))`);
            assert.deepEqual(await client.evaluate(`(() => ({
                centerType: document.querySelector("#center-type").value,
                errorHidden: document.querySelector("#center-image-error").hidden,
                status: document.querySelector("#verification-status").dataset.state,
                previewVisible: document.querySelector("#qr-preview").children.length > 0,
                copyDisabled: document.querySelector("#copy-qr").disabled,
            }))()`), {
                centerType: "text",
                errorHidden: true,
                status: "verified",
                previewVisible: true,
                copyDisabled: false,
            });
        });

        await context.test("rendering stays blocked while a selected center image is loading", async () => {
            await navigate(client, `${site.origin}/qr-code-generator/?test=pending-center-image`);
            await client.evaluate(`(() => {
                const content = document.querySelector("#qr-content");
                content.value = "pending center image test";
                content.dispatchEvent(new Event("input", { bubbles: true }));
            })()`);
            await waitFor(client, `document.querySelector("#verification-status").dataset.state === "verified"`);
            await client.evaluate(`(() => {
                const bytes = Uint8Array.from(
                    atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="),
                    (character) => character.charCodeAt(0),
                );
                const originalArrayBuffer = Blob.prototype.arrayBuffer;
                Blob.prototype.arrayBuffer = function () {
                    if (this instanceof File && this.name === "slow-logo.png") {
                        return new Promise((resolvePromise) => {
                            window.__qrspellResolveCenterImage = () => resolvePromise(bytes.buffer);
                        });
                    }
                    return originalArrayBuffer.call(this);
                };
                const centerType = document.querySelector("#center-type");
                centerType.value = "image";
                centerType.dispatchEvent(new Event("change", { bubbles: true }));
                const transfer = new DataTransfer();
                transfer.items.add(new File([bytes], "slow-logo.png", { type: "image/png" }));
                const input = document.querySelector("#center-image");
                input.files = transfer.files;
                input.dispatchEvent(new Event("change", { bubbles: true }));
                const centerSize = document.querySelector("#center-size");
                centerSize.value = "0.3";
                centerSize.dispatchEvent(new Event("input", { bubbles: true }));
            })()`);
            await client.evaluate(`new Promise((resolvePromise) => setTimeout(resolvePromise, 300))`);
            assert.deepEqual(await client.evaluate(`(() => ({
                state: document.querySelector("#verification-status").dataset.state,
                message: document.querySelector("#verification-status span:last-child").textContent,
                previewCleared: document.querySelector("#qr-preview-empty").hidden === false,
                copyDisabled: document.querySelector("#copy-qr").disabled,
                downloadDisabled: document.querySelector("#download-qr").disabled,
            }))()`), {
                state: "checking",
                message: "Checking center image…",
                previewCleared: true,
                copyDisabled: true,
                downloadDisabled: true,
            });
            await client.evaluate(`window.__qrspellResolveCenterImage()`);
            await waitFor(client, `document.querySelector("#verification-status").dataset.state === "verified"`);
            assert.deepEqual(await client.evaluate(`(() => ({
                imageName: document.querySelector("#center-image-name").textContent,
                copyDisabled: document.querySelector("#copy-qr").disabled,
                downloadDisabled: document.querySelector("#download-qr").disabled,
            }))()`), {
                imageName: "slow-logo.png",
                copyDisabled: false,
                downloadDisabled: false,
            });
        });

        await context.test("valid center images without MIME metadata still render and verify", async () => {
            await navigate(client, `${site.origin}/qr-code-generator/?test=valid-image`);
            await client.evaluate(`(() => {
                const content = document.querySelector("#qr-content");
                content.value = "valid center image test";
                content.dispatchEvent(new Event("input", { bubbles: true }));
                const reliability = document.querySelector("#reliability");
                reliability.value = "H";
                reliability.dispatchEvent(new Event("change", { bubbles: true }));
                const centerType = document.querySelector("#center-type");
                centerType.value = "image";
                centerType.dispatchEvent(new Event("change", { bubbles: true }));
                const bytes = Uint8Array.from(
                    atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="),
                    (character) => character.charCodeAt(0),
                );
                const transfer = new DataTransfer();
                transfer.items.add(new File([bytes], "logo.png"));
                const input = document.querySelector("#center-image");
                input.files = transfer.files;
                input.dispatchEvent(new Event("change", { bubbles: true }));
            })()`);
            await waitFor(client, `document.querySelector("#verification-status").dataset.state === "verified"`);
            assert.deepEqual(await client.evaluate(`(() => ({
                errorHidden: document.querySelector("#center-image-error").hidden,
                imageName: document.querySelector("#center-image-name").textContent,
                copyDisabled: document.querySelector("#copy-qr").disabled,
                downloadDisabled: document.querySelector("#download-qr").disabled,
            }))()`), {
                errorHidden: true,
                imageName: "logo.png",
                copyDisabled: false,
                downloadDisabled: false,
            });
        });

        await context.test("thin panoramic center images remain visible in the rendered QR", async () => {
            await navigate(client, `${site.origin}/qr-code-generator/?test=thin-center-image`);
            await client.evaluate(`(async () => {
                const content = document.querySelector("#qr-content");
                content.value = "1".repeat(5596);
                content.dispatchEvent(new Event("input", { bubbles: true }));
                const exportSize = document.querySelector("#export-size");
                exportSize.value = "256";
                exportSize.dispatchEvent(new Event("change", { bubbles: true }));
                const centerType = document.querySelector("#center-type");
                centerType.value = "image";
                centerType.dispatchEvent(new Event("change", { bubbles: true }));
                const centerSize = document.querySelector("#center-size");
                centerSize.value = "0.16";
                centerSize.dispatchEvent(new Event("input", { bubbles: true }));
                const canvas = document.createElement("canvas");
                canvas.width = 4096;
                canvas.height = 100;
                const context2d = canvas.getContext("2d");
                context2d.fillStyle = "#FF0000";
                context2d.fillRect(0, 0, canvas.width, canvas.height);
                const blob = await new Promise((resolvePromise) => canvas.toBlob(resolvePromise, "image/png"));
                const transfer = new DataTransfer();
                transfer.items.add(new File([blob], "panorama.png", { type: "image/png" }));
                const input = document.querySelector("#center-image");
                input.files = transfer.files;
                input.dispatchEvent(new Event("change", { bubbles: true }));
            })()`);
            await waitFor(client, `document.querySelector("#verification-status").dataset.state === "verified"`);
            await client.evaluate(`(() => {
                Object.defineProperty(navigator, "clipboard", {
                    configurable: true,
                    value: {
                        async write(items) {
                            window.__qrspellCopiedPanorama = await items[0].getType("image/png");
                        },
                    },
                });
                document.querySelector("#copy-qr").click();
            })()`);
            await waitFor(client, `window.__qrspellCopiedPanorama instanceof Blob`);
            const rendered = await client.evaluate(`(async () => {
                const svg = document.querySelector("#qr-preview svg");
                const image = svg.querySelector("image");
                const serialized = new XMLSerializer().serializeToString(svg);
                const bitmap = await new Promise((resolvePromise, rejectPromise) => {
                    const preview = new Image();
                    preview.onload = () => resolvePromise(preview);
                    preview.onerror = () => rejectPromise(new Error("QR SVG could not be rasterized"));
                    preview.src = "data:image/svg+xml;base64," + btoa(serialized);
                });
                const canvas = document.createElement("canvas");
                canvas.width = bitmap.width;
                canvas.height = bitmap.height;
                const context2d = canvas.getContext("2d", { willReadFrequently: true });
                context2d.drawImage(bitmap, 0, 0);
                const pixels = context2d.getImageData(0, 0, canvas.width, canvas.height).data;
                let redPixels = 0;
                for (let index = 0; index < pixels.length; index += 4) {
                    if (pixels[index] > 180 && pixels[index + 1] < 100 && pixels[index + 2] < 100) {
                        redPixels += 1;
                    }
                }
                const exportedImage = await createImageBitmap(window.__qrspellCopiedPanorama);
                canvas.width = exportedImage.width;
                canvas.height = exportedImage.height;
                context2d.drawImage(exportedImage, 0, 0);
                const exportedPixels = context2d.getImageData(0, 0, canvas.width, canvas.height).data;
                let exportedRedPixels = 0;
                for (let index = 0; index < exportedPixels.length; index += 4) {
                    if (exportedPixels[index] > 180 && exportedPixels[index + 1] < 100 && exportedPixels[index + 2] < 100) {
                        exportedRedPixels += 1;
                    }
                }
                exportedImage.close();
                return {
                    width: Number.parseFloat(image.getAttribute("width")),
                    height: Number.parseFloat(image.getAttribute("height")),
                    redPixels,
                    exportedRedPixels,
                    copyDisabled: document.querySelector("#copy-qr").disabled,
                    downloadDisabled: document.querySelector("#download-qr").disabled,
                };
            })()`);
            assert.ok(rendered.width > 0, JSON.stringify(rendered));
            assert.ok(rendered.height > 0, JSON.stringify(rendered));
            assert.ok(rendered.redPixels > 0, JSON.stringify(rendered));
            assert.equal(rendered.exportedRedPixels, rendered.redPixels, JSON.stringify(rendered));
            assert.equal(rendered.copyDisabled, false);
            assert.equal(rendered.downloadDisabled, false);
        });
    } finally {
        await cleanupTestResources({ client, browser, site });
    }
});

test("optional Cloudflare baseline preserves Generator behavior and exact CSP", { timeout: 60_000 }, async (context) => {
    let site;
    let browser;
    let client;
    const beaconUrl = "https://static.cloudflareinsights.com/beacon.min.js";
    const ingestUrl = "https://cloudflareinsights.com/cdn-cgi/rum";
    const fixturePath = process.env.CLOUDFLARE_BEACON_FIXTURE;
    // CI uses a controlled probe; a temporary provider snapshot enables the real network canary audit.
    const beaconSource = fixturePath ? readFileSync(fixturePath, "utf8") : `
        (() => {
            const body = JSON.stringify({ location: location.origin + location.pathname, siteToken: JSON.parse(document.currentScript.dataset.cfBeacon).token });
            addEventListener("load", () => {
                const request = new XMLHttpRequest();
                request.open("POST", ${JSON.stringify(ingestUrl)});
                request.setRequestHeader("Content-Type", "application/json");
                request.send(body);
            });
            document.addEventListener("visibilitychange", () => navigator.sendBeacon(${JSON.stringify(ingestUrl)}, new Blob([body], { type: "application/json" })));
        })();`;
    const canaries = ["QR41_SECRET_20260928", "C41XYZ", "FILE41_PRIVATE", "IMAGE41_PRIVATE", "QUERY41_PRIVATE", "HASH41_PRIVATE", "REFERRER41_PRIVATE"];
    let mode;
    let requests = [];
    const interceptionErrors = [];
    const pendingInterceptions = new Set();
    try {
        site = await startStaticServer();
        browser = await startBrowser();
        const target = await createTarget(browser.debugOrigin, "about:blank");
        client = await CdpClient.connect(target.webSocketDebuggerUrl);
        await client.send("Page.enable");
        await client.send("Runtime.enable");
        await client.send("Browser.setDownloadBehavior", { behavior: "deny" });
        await client.send("Network.enable", { maxPostDataSize: 2_000_000 });
        await client.send("Page.addScriptToEvaluateOnNewDocument", { source: `
            window.__qrspellCspViolations = [];
            document.addEventListener("securitypolicyviolation", event => window.__qrspellCspViolations.push({ directive: event.effectiveDirective, url: event.blockedURI }));
        ` });
        client.on("Network.requestWillBeSent", ({ requestId, request }) => {
            if (new URL(request.url).hostname.endsWith("cloudflareinsights.com")) requests.push({ requestId, ...request });
        });
        client.on("Fetch.requestPaused", ({ requestId, request }) => {
            const operation = (async () => {
                const url = new URL(request.url);
                if (url.origin === site.origin || url.protocol === "data:" || url.protocol === "blob:") {
                    return client.send("Fetch.continueRequest", { requestId });
                }
                if (request.url === beaconUrl) {
                    if (mode === "beacon blocked") return client.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
                    return client.send("Fetch.fulfillRequest", {
                        requestId, responseCode: 200,
                        responseHeaders: [{ name: "Content-Type", value: "text/javascript" }],
                        body: Buffer.from(beaconSource).toString("base64"),
                    });
                }
                if (request.url === ingestUrl) {
                    if (mode === "ingestion blocked") return client.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
                    if (mode === "ingestion timeout" && request.method === "POST") return client.send("Fetch.failRequest", { requestId, errorReason: "TimedOut" });
                    return client.send("Fetch.fulfillRequest", {
                        requestId, responseCode: mode === "HTTP error" && request.method === "POST" ? 503 : 204,
                        responseHeaders: [
                            { name: "Access-Control-Allow-Origin", value: site.origin },
                            { name: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
                            { name: "Access-Control-Allow-Headers", value: "content-type" },
                        ],
                    });
                }
                // Every unexpected external request is blocked too; tests cannot emit production telemetry.
                return client.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
            })().catch(error => interceptionErrors.push(error)).finally(() => pendingInterceptions.delete(operation));
            pendingInterceptions.add(operation);
        });
        await client.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });

        for (mode of ["allowed", "beacon blocked", "ingestion blocked", "ingestion timeout", "HTTP error"]) {
            await context.test(mode, async () => {
                requests = [];
                await client.send("Page.navigate", {
                    url: `${site.origin}/qr-code-generator/?case=${encodeURIComponent(mode)}&secret=${canaries[4]}#${canaries[5]}`,
                    referrer: `${site.origin}/?secret=${canaries[6]}`,
                });
                await waitFor(client, `document.readyState === "complete" && Boolean(document.querySelector("#module-shape-trigger"))`);
                assert.deepEqual(await client.evaluate("window.__qrspellCspViolations"), [], "CSP must permit the declared beacon and ingestion endpoint");
                assert.equal(requests.filter(request => request.url === beaconUrl).length, 1);

                if (mode === "allowed") {
                    await client.evaluate(`Promise.all([
                        fetch(${JSON.stringify(site.origin + "/forbidden-connection")}).catch(() => {}),
                        fetch("https://cloudflareinsights.com/forbidden-connection").catch(() => {})
                    ])`);
                    const violations = await client.evaluate("window.__qrspellCspViolations");
                    assert.equal(violations.length, 2);
                    assert.ok(violations.every(violation => violation.directive === "connect-src"));
                }

                await client.evaluate(`(() => {
                    const content = document.querySelector("#qr-content");
                    content.value = ${JSON.stringify(canaries[0])};
                    content.dispatchEvent(new Event("input", { bubbles: true }));
                    const reliability = document.querySelector("#reliability");
                    reliability.value = "H";
                    reliability.dispatchEvent(new Event("change", { bubbles: true }));
                    const centerType = document.querySelector("#center-type");
                    centerType.value = "text";
                    centerType.dispatchEvent(new Event("change", { bubbles: true }));
                    const centerText = document.querySelector("#center-text");
                    centerText.value = ${JSON.stringify(canaries[1])};
                    centerText.dispatchEvent(new Event("input", { bubbles: true }));
                })()`);
                await waitFor(client, `document.querySelector("#verification-status").dataset.state === "verified"`);

                await client.evaluate(`(async () => {
                    const canvas = document.createElement("canvas");
                    canvas.width = canvas.height = 64;
                    const drawing = canvas.getContext("2d");
                    drawing.fillStyle = "#ffffff";
                    drawing.fillRect(0, 0, 64, 64);
                    drawing.fillStyle = "#000000";
                    drawing.fillRect(16, 16, 32, 32);
                    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
                    const transfer = new DataTransfer();
                    transfer.items.add(new File([blob, ${JSON.stringify(canaries[3])}], ${JSON.stringify(canaries[2] + ".png")}, { type: "image/png" }));
                    const centerType = document.querySelector("#center-type");
                    centerType.value = "image";
                    centerType.dispatchEvent(new Event("change", { bubbles: true }));
                    const image = document.querySelector("#center-image");
                    image.files = transfer.files;
                    image.dispatchEvent(new Event("change", { bubbles: true }));
                })()`);
                await waitFor(client, `document.querySelector("#verification-status").dataset.state === "verified" && document.querySelector("#center-image-name").textContent === ${JSON.stringify(canaries[2] + ".png")} && Boolean(document.querySelector("#qr-preview svg image"))`);
                await client.evaluate(`(() => {
                    window.__qrspellAnalyticsTestCopied = false;
                    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { write(items) {
                        window.__qrspellAnalyticsTestCopied = items[0].types.includes("image/png");
                        return Promise.resolve();
                    } } });
                    document.querySelector("#copy-qr").click();
                })()`);
                await waitFor(client, `window.__qrspellAnalyticsTestCopied && document.querySelector("#verification-status").textContent.includes("PNG copied")`);
                await client.evaluate('document.querySelector("#download-qr").click()');
                await waitFor(client, `document.querySelector("#verification-status").textContent.includes("PNG downloaded")`);
                await client.evaluate('document.querySelector("#reset-generator").click()');
                assert.deepEqual(await client.evaluate(`(() => ({ content: document.querySelector("#qr-content").value, state: document.querySelector("#verification-status").dataset.state }))()`), { content: "", state: "idle" });

                if (mode !== "beacon blocked") {
                    await waitForRequest(() => requests.some(request => request.url === ingestUrl && request.method === "POST"));
                    await client.evaluate(`(() => {
                        Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
                        document.dispatchEvent(new Event("visibilitychange"));
                    })()`);
                    await waitForRequest(() => requests.filter(request => request.url === ingestUrl && request.method === "POST").length >= 2);
                } else {
                    assert.equal(requests.filter(request => request.url === ingestUrl).length, 0);
                }
                await Promise.all([...pendingInterceptions]);
                assert.deepEqual(interceptionErrors, []);
                const envelopes = requests.filter(request => request.url === beaconUrl || request.url === ingestUrl);
                const posts = envelopes.filter(request => request.method === "POST");
                for (const request of posts) {
                    if (!request.postData) {
                        const result = await client.send("Network.getRequestPostData", { requestId: request.requestId });
                        request.postData = result.postData;
                    }
                }
                const serialized = JSON.stringify(envelopes);
                for (const canary of canaries) assert.ok(!serialized.includes(canary), `Analytics leaked ${canary}`);
                assert.doesNotMatch(serialized, /data:image|<svg|centerText|centerImage|moduleShape|finderShape|exportSize|reliability/u);
                assert.ok(posts.every(request => request.postData), "Capture the complete analytics body, not just request URLs");
                for (const request of posts) {
                    const payload = JSON.parse(request.postData);
                    assert.equal(payload.location, site.origin + "/qr-code-generator/");
                    assert.equal(payload.siteToken, "e43189ed6f5c43d29472b9b18c73b226");
                }
            });
        }
        context.diagnostic(fixturePath ? "Audited the intercepted provider snapshot; no production ingestion." : "Used a controlled beacon probe; provider snapshot audit is optional.");
    } finally {
        await cleanupTestResources({ client, browser, site });
    }
});

async function waitForRequest(condition, timeout = 7_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if (condition()) return;
        await new Promise(resolve => setTimeout(resolve, 40));
    }
    throw new Error("Timed out waiting for intercepted analytics request.");
}

test("browser test cleanup handles partially initialized resources", async () => {
    const profile = mkdtempSync(`${tmpdir()}/qrspell-browser-cleanup-test-`);
    const cleanupEvents = [];
    const browserProcess = {
        exitCode: null,
        signalCode: null,
        kill(signal) {
            cleanupEvents.push(signal);
            this.signalCode = signal;
            return true;
        },
    };
    const client = { close: () => cleanupEvents.push("client") };
    const site = {
        server: {
            close(completion) {
                cleanupEvents.push("server");
                completion();
            },
        },
    };

    await cleanupTestResources({ client, browser: { process: browserProcess, profile }, site });
    assert.deepEqual(cleanupEvents, ["client", "SIGTERM", "server"]);
    assert.equal(existsSync(profile), false);
    await cleanupTestResources({});
});

async function exportState(client) {
    return client.evaluate(`(() => ({
        state: document.querySelector("#verification-status").dataset.state,
        copyDisabled: document.querySelector("#copy-qr").disabled,
        downloadDisabled: document.querySelector("#download-qr").disabled,
    }))()`);
}

async function navigate(client, url) {
    await client.send("Page.navigate", { url });
    await waitFor(client, `document.readyState === "complete" && Boolean(document.querySelector("#module-shape-trigger"))`);
}

async function pressKey(client, key) {
    const keyCodes = { ArrowDown: 40, Enter: 13 };
    const code = keyCodes[key];
    await client.send("Input.dispatchKeyEvent", {
        type: "keyDown", key, code: key === "Enter" ? "Enter" : key, windowsVirtualKeyCode: code,
    });
    await client.send("Input.dispatchKeyEvent", {
        type: "keyUp", key, code: key === "Enter" ? "Enter" : key, windowsVirtualKeyCode: code,
    });
}

async function waitFor(client, expression, timeout = 7_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if (await client.evaluate(expression)) {
            return;
        }
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 40));
    }
    throw new Error(`Timed out waiting for browser condition: ${expression}`);
}

async function startStaticServer() {
    const server = createServer((request, response) => {
        try {
            const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
            const relative = pathname === "/"
                ? "index.html"
                : pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
            const file = resolve(root, relative);
            if (file !== root && !file.startsWith(`${root}${sep}`)) {
                response.writeHead(403).end();
                return;
            }
            if (!statSync(file).isFile()) {
                response.writeHead(404).end();
                return;
            }
            response.writeHead(200, {
                "Cache-Control": "no-store",
                "Content-Type": mimeTypes.get(extname(file)) || "application/octet-stream",
            });
            response.end(readFileSync(file));
        } catch {
            response.writeHead(404).end();
        }
    });
    await new Promise((resolvePromise, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolvePromise);
    });
    const address = server.address();
    return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server) {
    await new Promise((resolvePromise) => server.close(resolvePromise));
}

async function cleanupTestResources({ client, browser, site }) {
    const cleanupErrors = [];
    client?.close();
    if (browser) {
        try {
            await stopBrowser(browser);
        } catch (error) {
            cleanupErrors.push(error);
        }
    }
    if (site) {
        try {
            await closeServer(site.server);
        } catch (error) {
            cleanupErrors.push(error);
        }
    }
    if (cleanupErrors.length > 0) {
        const details = cleanupErrors.map((error) => error.message).join("; ");
        throw new AggregateError(cleanupErrors, `Browser test cleanup failed: ${details}`);
    }
}

async function stopBrowser(browser) {
    if (!hasProcessExited(browser.process)) {
        signalBrowserProcess(browser.process, "SIGTERM");
        if (!await waitForProcessExit(browser.process)) {
            signalBrowserProcess(browser.process, "SIGKILL");
            await waitForProcessExit(browser.process);
        }
    }
    rmSync(browser.profile, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
    });
}

function signalBrowserProcess(child, signal) {
    if (process.platform !== "win32" && Number.isInteger(child.pid)) {
        try {
            process.kill(-child.pid, signal);
            return;
        } catch (error) {
            if (error.code !== "ESRCH") {
                throw error;
            }
        }
    }
    child.kill(signal);
}

function hasProcessExited(child) {
    return child.exitCode !== null || child.signalCode !== null;
}

async function waitForProcessExit(child, timeoutMilliseconds = 2_000) {
    if (hasProcessExited(child)) {
        return true;
    }
    return new Promise((resolvePromise) => {
        const finish = (didExit) => {
            clearTimeout(timeout);
            child.removeListener("exit", handleExit);
            resolvePromise(didExit);
        };
        const handleExit = () => finish(true);
        const timeout = setTimeout(() => finish(false), timeoutMilliseconds);
        child.once("exit", handleExit);
    });
}

async function startBrowser() {
    const executable = findBrowserExecutable();
    const profile = mkdtempSync(`${tmpdir()}/qrspell-browser-test-`);
    const browserProcess = spawn(executable, [
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-default-apps",
        "--disable-sync",
        "--no-first-run",
        "--no-default-browser-check",
        "--remote-debugging-port=0",
        `--user-data-dir=${profile}`,
        "about:blank",
    ], {
        detached: process.platform !== "win32",
        stdio: ["ignore", "ignore", "pipe"],
    });

    try {
        const websocketUrl = await new Promise((resolvePromise, reject) => {
            const timeout = setTimeout(() => reject(new Error("Chrome did not expose a debugging endpoint.")), 10_000);
            browserProcess.once("error", (error) => {
                clearTimeout(timeout);
                reject(error);
            });
            browserProcess.stderr.on("data", (chunk) => {
                const match = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/u);
                if (match) {
                    clearTimeout(timeout);
                    resolvePromise(match[1]);
                }
            });
        });
        const endpoint = new URL(websocketUrl);
        return { process: browserProcess, profile, debugOrigin: `http://${endpoint.host}` };
    } catch (error) {
        try {
            await stopBrowser({ process: browserProcess, profile });
        } catch (cleanupError) {
            throw new AggregateError(
                [error, cleanupError],
                "Chrome setup failed and its temporary resources could not be cleaned up.",
            );
        }
        throw error;
    }
}

function findBrowserExecutable() {
    const candidates = [
        process.env.CHROME_BIN,
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ].filter(Boolean);
    for (const candidate of candidates) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }
    for (const command of ["google-chrome-stable", "google-chrome", "chromium", "chromium-browser"]) {
        const result = spawnSync("which", [command], { encoding: "utf8" });
        if (result.status === 0 && result.stdout.trim()) {
            return result.stdout.trim();
        }
    }
    throw new Error("Chrome or Chromium is required for QR generator browser tests.");
}

async function createTarget(debugOrigin, url) {
    const response = await fetch(`${debugOrigin}/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
    if (!response.ok) {
        throw new Error(`Could not create Chrome test target (${response.status}).`);
    }
    return response.json();
}

class CdpClient {
    static async connect(url) {
        const socket = new WebSocket(url);
        await new Promise((resolvePromise, reject) => {
            socket.addEventListener("open", resolvePromise, { once: true });
            socket.addEventListener("error", reject, { once: true });
        });
        return new CdpClient(socket);
    }

    constructor(socket) {
        this.socket = socket;
        this.nextID = 1;
        this.pending = new Map();
        this.listeners = new Map();
        socket.addEventListener("message", (event) => {
            const message = JSON.parse(String(event.data));
            if (!message.id) {
                for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
                return;
            }
            if (!this.pending.has(message.id)) return;
            const { resolve: resolvePromise, reject } = this.pending.get(message.id);
            this.pending.delete(message.id);
            if (message.error) {
                reject(new Error(message.error.message));
            } else {
                resolvePromise(message.result);
            }
        });
    }

    on(method, listener) {
        if (!this.listeners.has(method)) this.listeners.set(method, []);
        this.listeners.get(method).push(listener);
    }

    send(method, params = {}) {
        const id = this.nextID++;
        return new Promise((resolvePromise, reject) => {
            this.pending.set(id, { resolve: resolvePromise, reject });
            this.socket.send(JSON.stringify({ id, method, params }));
        });
    }

    async evaluate(expression) {
        const response = await this.send("Runtime.evaluate", {
            expression,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true,
        });
        if (response.exceptionDetails) {
            throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        }
        return response.result.value;
    }

    close() {
        this.socket.close();
    }
}

test("privacy-safe PostHog foundation audits the real pinned SDK without production ingestion", { timeout: 60_000 }, async context => {
    let site;
    let browser;
    let client;
    let mode = "allowed";
    let requests = [];
    let sdkLoads = 0;
    const pending = new Set();
    const interceptionErrors = [];
    const runtimeErrors = [];
    const unexpectedExternalRequests = [];
    const canaries = ["QR42_SECRET", "QUERY42_SECRET", "HASH42_SECRET", "REFERRER42_SECRET", "ERROR42_SECRET"];
    try {
        site = await startStaticServer();
        browser = await startBrowser();
        const target = await createTarget(browser.debugOrigin, "about:blank");
        client = await CdpClient.connect(target.webSocketDebuggerUrl);
        await client.send("Page.enable");
        await client.send("Runtime.enable");
        await client.send("Network.enable", { maxPostDataSize: 2_000_000 });
        // Exercise capture with a normal browser UA; production remains disabled and loopback is excluded.
        await client.send("Network.setUserAgentOverride", { userAgent: (await client.evaluate("navigator.userAgent")).replace("HeadlessChrome", "Chrome") });
        await client.send("Network.setCacheDisabled", { cacheDisabled: true });
        await client.send("Browser.setDownloadBehavior", { behavior: "deny" });
        client.on("Runtime.exceptionThrown", event => runtimeErrors.push(event));
        await client.send("Page.addScriptToEvaluateOnNewDocument", { source: `
            // Simulate a human browser only in this loopback sandbox fixture.
            Object.defineProperty(navigator, "webdriver", { value: false });
            const mode = new URL(location.href).searchParams.get('mode');
            if (mode === 'GPC') Object.defineProperty(navigator, 'globalPrivacyControl', { value: true });
            if (mode === 'DNT') Object.defineProperty(navigator, 'doNotTrack', { value: '1' });
            if (mode === 'offline') Object.defineProperty(navigator, 'onLine', { value: false });
            window.__analyticsCsp = [];
            document.addEventListener('securitypolicyviolation', event => window.__analyticsCsp.push(event.blockedURI));
        ` });
        client.on("Fetch.requestPaused", ({ requestId, request }) => {
            const operation = (async () => {
                const url = new URL(request.url);
                if (url.origin === site.origin) {
                    if (url.pathname.endsWith("/vendor/posthog/posthog.mjs")) {
                        sdkLoads++;
                        if (mode === "SDK blocked") return client.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
                    }
                    if (url.pathname.endsWith("/assets/analytics.mjs") && mode === "wrapper blocked") {
                        return client.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
                    }
                    return client.send("Fetch.continueRequest", { requestId });
                }
                if (url.origin === "https://eu.i.posthog.com") {
                    requests.push({ ...request });
                    if (request.method === "POST" && (mode === "endpoint blocked" || mode === "timeout")) return client.send("Fetch.failRequest", { requestId, errorReason: mode === "timeout" ? "TimedOut" : "BlockedByClient" });
                    return client.send("Fetch.fulfillRequest", {
                        requestId, responseCode: request.method === "OPTIONS" ? 200 : mode === "HTTP 4xx" ? 400 : mode === "HTTP 5xx" ? 503 : 200,
                        responseHeaders: [
                            { name: "Content-Type", value: "application/json" },
                            { name: "Access-Control-Allow-Origin", value: site.origin },
                            { name: "Access-Control-Allow-Methods", value: "POST, OPTIONS" },
                            { name: "Access-Control-Allow-Headers", value: "content-type" },
                        ],
                        body: Buffer.from('{"status":1}').toString("base64"),
                    });
                }
                if (url.origin !== "https://static.cloudflareinsights.com" && url.origin !== "https://cloudflareinsights.com") unexpectedExternalRequests.push(request.url);
                // The fake token and interception protect both provider and Cloudflare endpoints.
                return client.send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" });
            })().catch(error => interceptionErrors.push(error)).finally(() => pending.delete(operation));
            pending.add(operation);
        });
        await client.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });

        for (mode of ["allowed", "SDK blocked", "wrapper blocked", "endpoint blocked", "timeout", "HTTP 4xx", "HTTP 5xx", "offline", "GPC", "DNT"]) {
            await context.test(mode, async () => {
                requests = [];
                sdkLoads = 0;
                await client.send("Page.navigate", {
                    url: `${site.origin}/qr-code-generator/?mode=${encodeURIComponent(mode)}&secret=${canaries[1]}#${canaries[2]}`,
                    referrer: `${site.origin}/private?secret=${canaries[3]}`,
                });
                await waitFor(client, `document.readyState === 'complete' && Boolean(document.querySelector('#module-shape-trigger'))`);
                assert.equal(sdkLoads, 0, "Disabled production bootstrap must not even load the SDK on localhost");
                assert.equal(requests.length, 0, "Initialization must not emit automatic events");

                if (mode !== "wrapper blocked") {
                    const initialized = await client.evaluate(`(async () => {
                        const { createAnalytics } = await import('../assets/analytics.mjs');
                        window.__analytics = createAnalytics({ config: { enabled: true, environment: 'sandbox', token: 'phc_QRSpellBrowserTestOnly' } });
                        return window.__analytics.initAnalytics();
                    })()`);
                    assert.equal(initialized, !["SDK blocked", "offline", "GPC", "DNT"].includes(mode));
                    assert.equal(requests.length, 0, "Real SDK init must not request flags, emit events, or load dependencies");
                    if (initialized) {
                        const accepted = await client.evaluate(`(() => [
                            window.__analytics.captureEvent('site_page_viewed', { route: 'generator' }),
                            window.__analytics.captureEvent('generator_viewed'),
                            window.__analytics.captureEvent('generator_viewed', { content: ${JSON.stringify(canaries[0])} }),
                            window.__analytics.captureEvent('generator_viewed', { error: ${JSON.stringify(canaries[4])} }),
                        ])()`);
                        assert.deepEqual(accepted, [true, true, false, false]);
                        await waitForRequest(() => requests.filter(request => request.method === "POST").length >= 2);
                        for (const request of requests.filter(request => request.method === "POST")) {
                            assert.ok(request.postData, "Audit the actual SDK body");
                            const body = JSON.parse(request.postData);
                            assert.deepEqual(Object.keys(body).sort(), ["api_key", "batch", "sent_at"]);
                            assert.equal(body.api_key, "phc_QRSpellBrowserTestOnly");
                            const events = body.batch;
                            for (const event of events) {
                                assert.ok(["site_page_viewed", "generator_viewed"].includes(event.event));
                                assert.deepEqual(Object.keys(event.properties).sort(), [
                                    "analytics_schema_version", "environment", "token", "distinct_id", "$lib", "$lib_version", "$process_person_profile", "$geoip_disable",
                                    ...(event.event === "site_page_viewed" ? ["route"] : []),
                                ].sort());
                                assert.equal(event.properties.environment, "sandbox");
                                assert.equal(event.properties.distinct_id, "$posthog_cookieless");
                                assert.equal(event.properties.$process_person_profile, false);
                                assert.equal(event.properties.$geoip_disable, true);
                            }
                        }
                    } else assert.equal(requests.length, 0);
                }

                await client.evaluate(`(() => {
                    const input = document.querySelector('#qr-content');
                    input.value = ${JSON.stringify(canaries[0])};
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                })()`);
                await waitFor(client, `document.querySelector('#verification-status').dataset.state === 'verified'`);
                await client.evaluate(`(() => {
                    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: async () => { window.__copied42 = true; } } });
                    document.querySelector('#copy-qr').click();
                })()`);
                await waitFor(client, `window.__copied42 && document.querySelector('#verification-status').textContent.includes('PNG copied')`);
                await client.evaluate(`document.querySelector('#download-qr').click()`);
                await waitFor(client, `document.querySelector('#verification-status').textContent.includes('PNG downloaded')`);
                await client.evaluate(`document.querySelector('#reset-generator').click()`);
                assert.equal(await client.evaluate(`document.querySelector('#qr-content').value`), "");
                const storage = await client.evaluate(`({ cookies: document.cookie, local: Object.keys(localStorage), session: Object.keys(sessionStorage), csp: window.__analyticsCsp })`);
                assert.deepEqual(storage, { cookies: "", local: [], session: [], csp: [] });
                for (const canary of canaries) assert.ok(!JSON.stringify(requests).includes(canary), `Final outbound traffic must exclude ${canary}`);
                assert.deepEqual(runtimeErrors, [], "No unhandled analytics error may escape into the page");
                assert.deepEqual(unexpectedExternalRequests, [], "SDK must not load remote dependencies or contact other providers");
            });
        }
        await Promise.all([...pending]);
        assert.deepEqual(interceptionErrors, []);
        context.diagnostic("Real vendored SDK tested with fake token and fully intercepted network. Copy uses a clipboard stub; downloads are initiated and denied by the test browser.");
    } finally {
        await cleanupTestResources({ client, browser, site });
    }
});
