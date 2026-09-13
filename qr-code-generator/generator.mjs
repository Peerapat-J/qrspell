import {
    buildQrOptions,
    createTextBadgeDataUrl,
    quietZoneMargin,
    readabilityWarnings,
} from "./generator-core.mjs";

const elements = {
    form: document.querySelector(".generator-controls"),
    content: document.querySelector("#qr-content"),
    characterCount: document.querySelector("#character-count"),
    moduleShape: document.querySelector("#module-shape"),
    finderShape: document.querySelector("#finder-shape"),
    foreground: document.querySelector("#foreground-color"),
    foregroundValue: document.querySelector("#foreground-value"),
    background: document.querySelector("#background-color"),
    backgroundValue: document.querySelector("#background-value"),
    exportSize: document.querySelector("#export-size"),
    reliability: document.querySelector("#reliability"),
    centerType: document.querySelector("#center-type"),
    centerTextField: document.querySelector("#center-text-field"),
    centerText: document.querySelector("#center-text"),
    centerImageField: document.querySelector("#center-image-field"),
    centerImage: document.querySelector("#center-image"),
    centerImageName: document.querySelector("#center-image-name"),
    centerSizeField: document.querySelector("#center-size-field"),
    centerSize: document.querySelector("#center-size"),
    centerSizeValue: document.querySelector("#center-size-value"),
    preview: document.querySelector("#qr-preview"),
    previewEmpty: document.querySelector("#qr-preview-empty"),
    status: document.querySelector("#verification-status"),
    warnings: document.querySelector("#readability-warnings"),
    copyButton: document.querySelector("#copy-qr"),
    downloadButton: document.querySelector("#download-qr"),
    resetButton: document.querySelector("#reset-generator"),
};

const defaultState = {
    moduleShape: "square",
    finderShape: "square",
    foreground: "#000000",
    background: "#FFFFFF",
    exportSize: "512",
    reliability: "Q",
    centerType: "none",
    centerSize: "0.24",
};

let currentQr;
let currentContent = "";
let centerImageDataUrl = "";
let renderTimer;
let renderID = 0;

if (!window.QRCodeStyling || !window.jsQR) {
    setStatus("error", "The QR generator could not load. Refresh the page and try again.");
    disableExport();
} else {
    bindControls();
    updateCenterFields();
    updateColorValues();
    updateCharacterCount();
    renderEmptyState();
}

function bindControls() {
    elements.form.addEventListener("input", (event) => {
        if (event.target === elements.centerImage) {
            return;
        }

        updateColorValues();
        updateCharacterCount();
        updateCenterFields();
        scheduleRender();
    });

    elements.form.addEventListener("change", (event) => {
        if (event.target === elements.centerImage) {
            loadCenterImage();
            return;
        }

        updateCenterFields();
        scheduleRender();
    });

    elements.copyButton.addEventListener("click", copyPng);
    elements.downloadButton.addEventListener("click", downloadPng);
    elements.resetButton.addEventListener("click", resetGenerator);
}

function scheduleRender() {
    window.clearTimeout(renderTimer);
    renderID += 1;
    disableExport();

    if (!elements.content.value.trim()) {
        renderEmptyState();
        return;
    }

    setStatus("checking", "Checking QR data…");
    renderTimer = window.setTimeout(renderQr, 180);
}

async function renderQr() {
    const content = elements.content.value;
    currentContent = content;
    renderID += 1;
    const activeRenderID = renderID;

    if (!content.trim()) {
        renderEmptyState();
        return;
    }

    const settings = currentSettings(content);
    renderWarnings(settings);
    setStatus("checking", "Checking QR data…");
    disableExport();

    try {
        const options = buildQrOptions(settings);
        currentQr = new window.QRCodeStyling(options);
        const moduleCount = currentQr?._qr?.getModuleCount?.();
        if (moduleCount) {
            options.margin = quietZoneMargin(options.width, moduleCount);
            currentQr = new window.QRCodeStyling(options);
        }
        elements.preview.replaceChildren();
        currentQr.append(elements.preview);

        const blob = await currentQr.getRawData("png");
        if (activeRenderID !== renderID) {
            return;
        }

        const decoded = await decodeQrBlob(blob);
        if (activeRenderID !== renderID) {
            return;
        }

        enableExport();
        if (decoded === content) {
            setStatus("verified", "QR data verified");
        } else if (decoded) {
            setStatus("error", "The decoded QR data does not match your content.");
        } else {
            setStatus("warning", "This design could not be verified. Try stronger contrast or simpler styling.");
        }
    } catch (error) {
        if (activeRenderID !== renderID) {
            return;
        }

        currentQr = undefined;
        elements.preview.replaceChildren(elements.previewEmpty);
        elements.previewEmpty.hidden = false;
        disableExport();
        setStatus("error", readableError(error));
    }
}

function currentSettings(content) {
    let centerImage = "";
    if (elements.centerType.value === "text") {
        centerImage = createTextBadgeDataUrl(
            elements.centerText.value,
            elements.foreground.value,
            elements.background.value,
        );
    } else if (elements.centerType.value === "image") {
        centerImage = centerImageDataUrl;
    }

    return {
        content,
        moduleShape: elements.moduleShape.value,
        finderShape: elements.finderShape.value,
        foreground: elements.foreground.value,
        background: elements.background.value,
        exportSize: elements.exportSize.value,
        reliability: elements.reliability.value,
        centerImage,
        centerSize: elements.centerSize.value,
        hasCenterContent: Boolean(centerImage),
    };
}

function renderWarnings(settings) {
    const messages = readabilityWarnings(settings);
    elements.warnings.replaceChildren();
    elements.warnings.hidden = messages.length === 0;

    for (const message of messages) {
        const item = document.createElement("li");
        item.textContent = message;
        elements.warnings.append(item);
    }
}

async function decodeQrBlob(blob) {
    const imageData = await blobToImageData(blob);
    const result = window.jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "attemptBoth",
    });
    return result?.data ?? "";
}

async function blobToImageData(blob) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
        throw new Error("The generated QR image could not be checked.");
    }

    if ("createImageBitmap" in window) {
        const bitmap = await window.createImageBitmap(blob);
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
    } else {
        const image = await loadBlobImage(blob);
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        context.drawImage(image, 0, 0);
    }

    return context.getImageData(0, 0, canvas.width, canvas.height);
}

function loadBlobImage(blob) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const image = new Image();
        image.addEventListener("load", () => {
            URL.revokeObjectURL(url);
            resolve(image);
        }, { once: true });
        image.addEventListener("error", () => {
            URL.revokeObjectURL(url);
            reject(new Error("The generated QR image could not be read."));
        }, { once: true });
        image.src = url;
    });
}

async function loadCenterImage() {
    const [file] = elements.centerImage.files;
    centerImageDataUrl = "";
    elements.centerImageName.textContent = "No image selected";

    if (!file) {
        scheduleRender();
        return;
    }

    if (!file.type.startsWith("image/")) {
        setStatus("error", "Choose an image file for the center logo.");
        elements.centerImage.value = "";
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        setStatus("error", "Choose an image smaller than 5 MB.");
        elements.centerImage.value = "";
        return;
    }

    try {
        centerImageDataUrl = await readFileAsDataUrl(file);
        elements.centerImageName.textContent = file.name;
        scheduleRender();
    } catch {
        centerImageDataUrl = "";
        elements.centerImage.value = "";
        setStatus("error", "The selected image could not be read.");
    }
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener("load", () => resolve(String(reader.result)), { once: true });
        reader.addEventListener("error", () => reject(reader.error), { once: true });
        reader.readAsDataURL(file);
    });
}

async function copyPng() {
    if (!currentQr) {
        return;
    }

    try {
        const blob = await currentQr.getRawData("png");
        if (!navigator.clipboard?.write || !window.ClipboardItem) {
            throw new Error("Copying images is not supported in this browser. Download the PNG instead.");
        }
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setStatus("verified", "PNG copied");
    } catch (error) {
        setStatus("error", readableError(error));
    }
}

async function downloadPng() {
    if (!currentQr) {
        return;
    }

    try {
        const blob = await currentQr.getRawData("png");
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "QRSpell-QRCode.png";
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setStatus("verified", "PNG downloaded");
    } catch (error) {
        setStatus("error", readableError(error));
    }
}

function resetGenerator() {
    elements.form.reset();
    elements.moduleShape.value = defaultState.moduleShape;
    elements.finderShape.value = defaultState.finderShape;
    elements.foreground.value = defaultState.foreground;
    elements.background.value = defaultState.background;
    elements.exportSize.value = defaultState.exportSize;
    elements.reliability.value = defaultState.reliability;
    elements.centerType.value = defaultState.centerType;
    elements.centerSize.value = defaultState.centerSize;
    centerImageDataUrl = "";
    elements.centerImageName.textContent = "No image selected";
    updateCenterFields();
    updateColorValues();
    updateCharacterCount();
    renderEmptyState();
    elements.content.focus();
}

function renderEmptyState() {
    renderID += 1;
    currentQr = undefined;
    elements.preview.replaceChildren(elements.previewEmpty);
    elements.previewEmpty.hidden = false;
    elements.warnings.replaceChildren();
    elements.warnings.hidden = true;
    setStatus("idle", "Enter content to create a QR code");
    disableExport();
}

function updateCenterFields() {
    const type = elements.centerType.value;
    elements.centerTextField.hidden = type !== "text";
    elements.centerImageField.hidden = type !== "image";
    elements.centerSizeField.hidden = type === "none";
    elements.centerSizeValue.textContent = `${Math.round(Number(elements.centerSize.value) * 100)}%`;
}

function updateColorValues() {
    elements.foregroundValue.textContent = elements.foreground.value.toUpperCase();
    elements.backgroundValue.textContent = elements.background.value.toUpperCase();
}

function updateCharacterCount() {
    const count = [...elements.content.value].length;
    elements.characterCount.textContent = `${count.toLocaleString()} character${count === 1 ? "" : "s"}`;
}

function setStatus(state, message) {
    elements.status.dataset.state = state;
    elements.status.querySelector("span:last-child").textContent = message;
}

function enableExport() {
    elements.copyButton.disabled = false;
    elements.downloadButton.disabled = false;
}

function disableExport() {
    elements.copyButton.disabled = true;
    elements.downloadButton.disabled = true;
}

function readableError(error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/code length overflow|too long/iu.test(message)) {
        return "This content is too long for a QR code. Shorten it and try again.";
    }
    return message || "The QR code could not be created.";
}
