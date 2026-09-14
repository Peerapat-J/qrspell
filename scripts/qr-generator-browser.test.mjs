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
        const target = await createTarget(browser.debugOrigin, `${site.origin}/qr-code-generator/`);
        client = await CdpClient.connect(target.webSocketDebuggerUrl);
        await client.send("Page.enable");
        await client.send("Runtime.enable");
        await waitFor(client, `document.readyState === "complete" && Boolean(document.querySelector("#module-shape-trigger"))`);

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
                constructorCalls: window.__qrspellQrConstructorCalls,
                previewCleared: document.querySelector("#qr-preview-empty").hidden === false,
                copyDisabled: document.querySelector("#copy-qr").disabled,
                downloadDisabled: document.querySelector("#download-qr").disabled,
            }))()`), {
                message: "This content is too long for a QR code. Shorten it and try again.",
                constructorCalls: 0,
                previewCleared: true,
                copyDisabled: true,
                downloadDisabled: true,
            });
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
    } finally {
        await cleanupTestResources({ client, browser, site });
    }
});

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
        socket.addEventListener("message", (event) => {
            const message = JSON.parse(String(event.data));
            if (!message.id || !this.pending.has(message.id)) {
                return;
            }
            const { resolve: resolvePromise, reject } = this.pending.get(message.id);
            this.pending.delete(message.id);
            if (message.error) {
                reject(new Error(message.error.message));
            } else {
                resolvePromise(message.result);
            }
        });
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
