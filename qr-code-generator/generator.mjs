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
    reliability: "M",
    centerType: "none",
    centerSize: "0.24",
};

let currentQr;
let currentContent = "";
let centerImageDataUrl = "";
let renderTimer;
let renderID = 0;
const customSelectInstances = [];

if (!window.QRCodeStyling || !window.jsQR) {
    setStatus("error", "The QR generator could not load. Refresh the page and try again.");
    disableExport();
} else {
    bindControls();
    enhanceSelects();
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

function enhanceSelects() {
    for (const select of elements.form.querySelectorAll("select")) {
        const wrapper = document.createElement("div");
        const trigger = document.createElement("button");
        const value = document.createElement("span");
        const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        const chevronPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const menu = document.createElement("div");
        const label = elements.form.querySelector(`label[for="${select.id}"]`);

        wrapper.className = "generator-select";
        trigger.className = "generator-select-trigger";
        trigger.type = "button";
        trigger.id = `${select.id}-trigger`;
        trigger.setAttribute("aria-haspopup", "listbox");
        trigger.setAttribute("aria-expanded", "false");
        trigger.setAttribute("aria-controls", `${select.id}-menu`);
        const labelText = label?.textContent.trim() || select.name;
        trigger.setAttribute("aria-label", labelText);
        value.className = "generator-select-value";
        chevron.classList.add("generator-select-chevron");
        chevron.setAttribute("viewBox", "0 0 20 20");
        chevron.setAttribute("aria-hidden", "true");
        chevronPath.setAttribute("d", "m6 8 4 4 4-4");
        chevronPath.setAttribute("fill", "none");
        chevronPath.setAttribute("stroke", "currentColor");
        chevronPath.setAttribute("stroke-linecap", "round");
        chevronPath.setAttribute("stroke-linejoin", "round");
        chevronPath.setAttribute("stroke-width", "1.8");
        chevron.append(chevronPath);
        trigger.append(value, chevron);

        menu.className = "generator-select-menu";
        menu.id = `${select.id}-menu`;
        menu.setAttribute("role", "listbox");
        menu.setAttribute("aria-label", labelText);
        menu.hidden = true;

        const instance = { select, wrapper, trigger, value, menu, labelText, options: [] };
        for (const nativeOption of select.options) {
            const option = document.createElement("div");
            const optionLabel = document.createElement("span");
            const check = document.createElement("span");
            option.className = "generator-select-option";
            option.dataset.value = nativeOption.value;
            option.setAttribute("role", "option");
            option.tabIndex = -1;
            optionLabel.textContent = nativeOption.textContent;
            check.className = "generator-select-check";
            check.textContent = "✓";
            check.setAttribute("aria-hidden", "true");
            option.append(optionLabel, check);
            option.addEventListener("click", () => chooseCustomOption(instance, nativeOption.value));
            option.addEventListener("keydown", (event) => handleCustomOptionKeydown(event, instance));
            menu.append(option);
            instance.options.push(option);
        }

        select.before(wrapper);
        wrapper.append(select, trigger, menu);
        select.classList.add("generator-native-select");
        select.tabIndex = -1;
        select.setAttribute("aria-hidden", "true");
        if (label) {
            label.htmlFor = trigger.id;
        }

        trigger.addEventListener("click", () => toggleCustomSelect(instance));
        trigger.addEventListener("keydown", (event) => handleCustomTriggerKeydown(event, instance));
        select.addEventListener("change", () => syncCustomSelect(instance));
        wrapper.addEventListener("focusout", (event) => {
            if (!wrapper.contains(event.relatedTarget)) {
                closeCustomSelect(instance);
            }
        });
        customSelectInstances.push(instance);
        syncCustomSelect(instance);
    }

    document.addEventListener("pointerdown", (event) => {
        if (!event.target.closest(".generator-select")) {
            closeAllCustomSelects();
        }
    });
    window.addEventListener("blur", closeAllCustomSelects);
}

function toggleCustomSelect(instance) {
    if (instance.menu.hidden) {
        openCustomSelect(instance);
    } else {
        closeCustomSelect(instance);
    }
}

function openCustomSelect(instance) {
    closeAllCustomSelects(instance);
    instance.menu.hidden = false;
    instance.wrapper.classList.add("is-open");
    instance.trigger.setAttribute("aria-expanded", "true");
    const selected = instance.options.find((option) => option.dataset.value === instance.select.value);
    window.requestAnimationFrame(() => selected?.focus());
}

function closeCustomSelect(instance, restoreFocus = false) {
    instance.menu.hidden = true;
    instance.wrapper.classList.remove("is-open");
    instance.trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) {
        instance.trigger.focus();
    }
}

function closeAllCustomSelects(except) {
    for (const instance of customSelectInstances) {
        if (instance !== except) {
            closeCustomSelect(instance);
        }
    }
}

function chooseCustomOption(instance, nextValue) {
    const changed = instance.select.value !== nextValue;
    instance.select.value = nextValue;
    syncCustomSelect(instance);
    closeCustomSelect(instance, true);
    if (changed) {
        instance.select.dispatchEvent(new Event("change", { bubbles: true }));
    }
}

function syncCustomSelect(instance) {
    const selectedOption = [...instance.select.options]
        .find((option) => option.value === instance.select.value);
    instance.value.textContent = selectedOption?.textContent || "";
    instance.trigger.setAttribute(
        "aria-label",
        `${instance.labelText}: ${selectedOption?.textContent || ""}`,
    );
    for (const option of instance.options) {
        option.setAttribute("aria-selected", String(option.dataset.value === instance.select.value));
    }
}

function syncAllCustomSelects() {
    for (const instance of customSelectInstances) {
        syncCustomSelect(instance);
    }
}

function handleCustomTriggerKeydown(event, instance) {
    if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        openCustomSelect(instance);
    } else if (event.key === "Escape") {
        closeCustomSelect(instance);
    }
}

function handleCustomOptionKeydown(event, instance) {
    const currentIndex = instance.options.indexOf(event.currentTarget);
    let nextIndex;
    if (event.key === "ArrowDown") {
        nextIndex = (currentIndex + 1) % instance.options.length;
    } else if (event.key === "ArrowUp") {
        nextIndex = (currentIndex - 1 + instance.options.length) % instance.options.length;
    } else if (event.key === "Home") {
        nextIndex = 0;
    } else if (event.key === "End") {
        nextIndex = instance.options.length - 1;
    } else if (["Enter", " "].includes(event.key)) {
        event.preventDefault();
        chooseCustomOption(instance, event.currentTarget.dataset.value);
        return;
    } else if (event.key === "Escape") {
        event.preventDefault();
        closeCustomSelect(instance, true);
        return;
    } else if (event.key.length === 1) {
        const character = event.key.toLocaleLowerCase();
        nextIndex = instance.options.findIndex((option) => (
            option.textContent.trim().toLocaleLowerCase().startsWith(character)
        ));
    }

    if (nextIndex !== undefined && nextIndex >= 0) {
        event.preventDefault();
        instance.options[nextIndex].focus();
    }
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
    syncAllCustomSelects();
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
