import {
    buildQrOptions,
    createTextBadgeDataUrl,
    detectSupportedImageType,
    fitsQrCapacity,
    hexToHsv,
    hsvToHex,
    quietZoneMargin,
    readImageDimensions,
    readabilityWarnings,
    truncateGraphemes,
} from "./generator-core.mjs?v=20260914b";

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
    centerImageError: document.querySelector("#center-image-error"),
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
let currentQrVerified = false;
let currentVerifiedPngBlob;
let centerImageDataUrl = "";
let centerImageLoadID = 0;
let renderTimer;
let renderID = 0;
const maximumCenterImageBytes = 5 * 1024 * 1024;
const maximumCenterImageDimension = 4096;
const maximumCenterImagePixels = 4096 * 4096;
const centerImageDimensionError = "Choose an image no larger than 4096 × 4096 px (16.8 MP).";
const customSelectInstances = [];
const customColorInstances = [];

if (!window.QRCodeStyling || !window.jsQR) {
    setStatus("error", "The QR generator could not load. Refresh the page and try again.");
    disableExport();
} else {
    bindControls();
    enhanceSelects();
    enhanceColorInputs();
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

        if (event.target === elements.centerText) {
            elements.centerText.value = truncateGraphemes(elements.centerText.value, 6);
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

        if (event.target === elements.centerType) {
            if (elements.centerType.value !== "image") {
                centerImageLoadID += 1;
                clearCenterImageError();
            } else if (elements.centerImage.files.length > 0 && !centerImageDataUrl) {
                loadCenterImage();
                return;
            }
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
    closeAllColorPickers();
    instance.menu.hidden = false;
    instance.wrapper.classList.add("is-open");
    instance.trigger.setAttribute("aria-expanded", "true");
    const selected = instance.options.find((option) => option.dataset.value === instance.select.value);
    window.requestAnimationFrame(() => selected?.focus());
}

function enhanceColorInputs() {
    for (const input of [elements.foreground, elements.background]) {
        const originalControl = input.closest(".generator-color-control");
        const output = originalControl.querySelector("output");
        const field = originalControl.closest(".generator-field");
        const labelText = field.querySelector(".generator-field-label")?.textContent.trim() || "Color";
        const wrapper = document.createElement("div");
        const trigger = document.createElement("button");
        const swatch = document.createElement("span");
        const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        const chevronPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        const popover = document.createElement("div");
        const plane = document.createElement("div");
        const planeThumb = document.createElement("span");
        const hueLabel = document.createElement("label");
        const hueLabelText = document.createElement("span");
        const hueInput = document.createElement("input");
        const channelControls = document.createElement("div");
        const saturationControl = createColorChannelControl(`${labelText} saturation`, "Saturation");
        const brightnessControl = createColorChannelControl(`${labelText} brightness`, "Brightness");
        const values = document.createElement("div");
        const currentSwatch = document.createElement("span");
        const hexLabel = document.createElement("label");
        const hexLabelText = document.createElement("span");
        const hexInput = document.createElement("input");
        const presets = document.createElement("div");
        const doneButton = document.createElement("button");

        wrapper.className = "generator-color-control is-enhanced";
        trigger.className = "generator-color-trigger";
        trigger.type = "button";
        trigger.id = `${input.id}-trigger`;
        trigger.setAttribute("aria-haspopup", "dialog");
        trigger.setAttribute("aria-expanded", "false");
        trigger.setAttribute("aria-controls", `${input.id}-popover`);
        swatch.className = "generator-color-swatch";
        chevron.classList.add("generator-color-chevron");
        chevron.setAttribute("viewBox", "0 0 20 20");
        chevron.setAttribute("aria-hidden", "true");
        chevronPath.setAttribute("d", "m6 8 4 4 4-4");
        chevronPath.setAttribute("fill", "none");
        chevronPath.setAttribute("stroke", "currentColor");
        chevronPath.setAttribute("stroke-linecap", "round");
        chevronPath.setAttribute("stroke-linejoin", "round");
        chevronPath.setAttribute("stroke-width", "1.8");
        chevron.append(chevronPath);
        trigger.append(swatch, output, chevron);

        popover.className = "generator-color-popover";
        popover.id = `${input.id}-popover`;
        popover.setAttribute("role", "dialog");
        popover.setAttribute("aria-label", `${labelText} picker`);
        popover.hidden = true;

        plane.className = "generator-color-plane";
        plane.setAttribute("aria-hidden", "true");
        planeThumb.className = "generator-color-plane-thumb";
        plane.append(planeThumb);

        hueLabel.className = "generator-hue-control";
        hueLabelText.className = "visually-hidden";
        hueLabelText.textContent = `${labelText} hue`;
        hueInput.type = "range";
        hueInput.min = "0";
        hueInput.max = "359";
        hueInput.step = "1";
        hueInput.setAttribute("aria-label", `${labelText} hue`);
        hueLabel.append(hueLabelText, hueInput);

        channelControls.className = "generator-color-channels";
        channelControls.append(saturationControl.label, brightnessControl.label);

        values.className = "generator-color-values";
        currentSwatch.className = "generator-current-color";
        currentSwatch.setAttribute("aria-hidden", "true");
        hexLabel.className = "generator-hex-control";
        hexLabelText.textContent = "Hex";
        hexInput.type = "text";
        hexInput.inputMode = "text";
        hexInput.maxLength = 7;
        hexInput.spellcheck = false;
        hexInput.autocomplete = "off";
        hexLabel.append(hexLabelText, hexInput);
        values.append(currentSwatch, hexLabel);

        presets.className = "generator-color-presets";
        presets.setAttribute("aria-label", "Suggested colors");
        for (const preset of ["#000000", "#334155", "#2563EB", "#059669", "#D97706", "#DC2626", "#7C3AED", "#FFFFFF"]) {
            const presetButton = document.createElement("button");
            presetButton.className = "generator-color-preset";
            presetButton.type = "button";
            presetButton.dataset.color = preset;
            presetButton.style.setProperty("--preset-color", preset);
            presetButton.setAttribute("aria-label", preset);
            presetButton.addEventListener("click", () => applyColor(instance, preset));
            presets.append(presetButton);
        }

        doneButton.className = "generator-color-done";
        doneButton.type = "button";
        doneButton.textContent = "Done";
        popover.append(plane, hueLabel, channelControls, values, presets, doneButton);

        originalControl.replaceWith(wrapper);
        wrapper.append(input, trigger, popover);
        input.classList.add("generator-native-color");
        input.tabIndex = -1;
        input.setAttribute("aria-hidden", "true");

        const instance = {
            input,
            wrapper,
            trigger,
            swatch,
            popover,
            plane,
            planeThumb,
            hueInput,
            saturationInput: saturationControl.input,
            saturationOutput: saturationControl.output,
            brightnessInput: brightnessControl.input,
            brightnessOutput: brightnessControl.output,
            hexInput,
            currentSwatch,
            presets,
            doneButton,
            labelText,
            hue: 0,
            saturation: 0,
            brightness: 0,
        };
        customColorInstances.push(instance);
        syncColorPicker(instance);

        trigger.addEventListener("click", () => toggleColorPicker(instance));
        input.addEventListener("input", () => syncColorPicker(instance));
        hueInput.addEventListener("input", (event) => {
            event.stopPropagation();
            instance.hue = Number(hueInput.value);
            applyColor(instance, hsvToHex(instance.hue, instance.saturation, instance.brightness));
        });
        saturationControl.input.addEventListener("input", (event) => {
            event.stopPropagation();
            instance.saturation = clampPercent(Number(saturationControl.input.value));
            applyColor(instance, hsvToHex(instance.hue, instance.saturation, instance.brightness));
        });
        brightnessControl.input.addEventListener("input", (event) => {
            event.stopPropagation();
            instance.brightness = clampPercent(Number(brightnessControl.input.value));
            applyColor(instance, hsvToHex(instance.hue, instance.saturation, instance.brightness));
        });
        hexInput.addEventListener("input", (event) => {
            event.stopPropagation();
            const value = hexInput.value.trim();
            if (/^#[0-9A-F]{6}$/iu.test(value)) {
                applyColor(instance, value);
            }
        });
        hexInput.addEventListener("change", (event) => {
            event.stopPropagation();
            hexInput.value = input.value.toUpperCase();
        });
        plane.addEventListener("pointerdown", (event) => {
            plane.setPointerCapture(event.pointerId);
            updateColorFromPointer(event, instance);
        });
        plane.addEventListener("pointermove", (event) => {
            if (plane.hasPointerCapture(event.pointerId)) {
                updateColorFromPointer(event, instance);
            }
        });
        doneButton.addEventListener("click", () => closeColorPicker(instance, true));
        popover.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                closeColorPicker(instance, true);
            }
        });
        wrapper.addEventListener("focusout", (event) => {
            if (!wrapper.contains(event.relatedTarget)) {
                closeColorPicker(instance);
            }
        });
    }

    document.addEventListener("pointerdown", (event) => {
        if (!event.target.closest(".generator-color-control")) {
            closeAllColorPickers();
        }
    });
}

function createColorChannelControl(ariaLabel, visibleLabel) {
    const label = document.createElement("label");
    const labelText = document.createElement("span");
    const input = document.createElement("input");
    const output = document.createElement("output");
    label.className = "generator-color-channel";
    labelText.textContent = visibleLabel;
    input.type = "range";
    input.min = "0";
    input.max = "100";
    input.step = "1";
    input.setAttribute("aria-label", ariaLabel);
    output.textContent = "0%";
    label.append(labelText, input, output);
    return { label, input, output };
}

function toggleColorPicker(instance) {
    if (instance.popover.hidden) {
        openColorPicker(instance);
    } else {
        closeColorPicker(instance);
    }
}

function openColorPicker(instance) {
    closeAllColorPickers(instance);
    closeAllCustomSelects();
    instance.popover.hidden = false;
    instance.wrapper.classList.add("is-open");
    instance.trigger.setAttribute("aria-expanded", "true");
    window.requestAnimationFrame(() => instance.hueInput.focus());
}

function closeColorPicker(instance, restoreFocus = false) {
    instance.popover.hidden = true;
    instance.wrapper.classList.remove("is-open");
    instance.trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) {
        instance.trigger.focus();
    }
}

function closeAllColorPickers(except) {
    for (const instance of customColorInstances) {
        if (instance !== except) {
            closeColorPicker(instance);
        }
    }
}

function applyColor(instance, value) {
    instance.input.value = value;
    syncColorPicker(instance);
    instance.input.dispatchEvent(new Event("input", { bubbles: true }));
}

function syncColorPicker(instance) {
    const color = instance.input.value.toUpperCase();
    const hsv = hexToHsv(color);
    if (hsv.saturation > 0) {
        instance.hue = hsv.hue;
    }
    instance.saturation = hsv.saturation;
    instance.brightness = hsv.brightness;
    instance.swatch.style.background = color;
    instance.currentSwatch.style.background = color;
    instance.hexInput.value = color;
    instance.hueInput.value = String(Math.round(instance.hue));
    instance.saturationInput.value = String(Math.round(instance.saturation));
    instance.saturationOutput.textContent = `${Math.round(instance.saturation)}%`;
    instance.brightnessInput.value = String(Math.round(instance.brightness));
    instance.brightnessOutput.textContent = `${Math.round(instance.brightness)}%`;
    instance.plane.style.setProperty("--picker-hue", `hsl(${instance.hue} 100% 50%)`);
    instance.planeThumb.style.left = `${instance.saturation}%`;
    instance.planeThumb.style.top = `${100 - instance.brightness}%`;
    instance.trigger.setAttribute("aria-label", `${instance.labelText}: ${color}`);
    for (const preset of instance.presets.children) {
        preset.setAttribute("aria-pressed", String(preset.dataset.color === color));
    }
}

function syncAllColorPickers() {
    for (const instance of customColorInstances) {
        syncColorPicker(instance);
    }
}

function updateColorFromPointer(event, instance) {
    const bounds = instance.plane.getBoundingClientRect();
    instance.saturation = clampPercent(((event.clientX - bounds.left) / bounds.width) * 100);
    instance.brightness = clampPercent((1 - ((event.clientY - bounds.top) / bounds.height)) * 100);
    applyColor(instance, hsvToHex(instance.hue, instance.saturation, instance.brightness));
}

function clampPercent(value) {
    return Math.min(Math.max(value, 0), 100);
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

    if (isCenterImageLoadPending()) {
        setStatus("checking", "Checking center image…");
        return;
    }

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
    if (!fitsQrCapacity(content, settings.reliability)) {
        currentQr = undefined;
        elements.preview.replaceChildren(elements.previewEmpty);
        elements.previewEmpty.hidden = false;
        elements.warnings.replaceChildren();
        elements.warnings.hidden = true;
        disableExport();
        setStatus("error", "This content is too long for a QR code. Shorten it and try again.");
        return;
    }
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

        if (decoded === content) {
            currentVerifiedPngBlob = blob;
            currentQrVerified = true;
            enableExport();
            setStatus("verified", "QR data verified");
        } else if (decoded) {
            disableExport();
            setStatus("error", "The decoded QR data does not match your content.");
        } else {
            disableExport();
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
    const activeLoadID = ++centerImageLoadID;
    centerImageDataUrl = "";
    elements.centerImageName.textContent = "No image selected";
    clearCenterImageError();
    invalidateRenderedQr();

    if (!file) {
        scheduleRender();
        return;
    }

    if (file.size > maximumCenterImageBytes) {
        rejectCenterImage("Choose an image no larger than 5 MB.");
        return;
    }

    elements.centerImageName.textContent = file.name;
    setStatus("checking", "Checking center image…");
    try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!isCurrentCenterImageLoad(activeLoadID, file)) {
            return;
        }
        const detectedType = detectSupportedImageType(bytes);
        if (!detectedType) {
            throw new Error("The file is not a supported image format.");
        }
        const dimensions = readImageDimensions(bytes, detectedType);
        if (!dimensions) {
            throw new Error("The image dimensions could not be read.");
        }
        assertSafeCenterImageDimensions(dimensions.width, dimensions.height);
        const normalizedImage = file.type === detectedType
            ? file
            : new Blob([file], { type: detectedType });
        await decodeCenterImageFile(normalizedImage);
        if (!isCurrentCenterImageLoad(activeLoadID, file)) {
            return;
        }
        const dataUrl = await readFileAsDataUrl(normalizedImage);
        if (!isCurrentCenterImageLoad(activeLoadID, file)) {
            return;
        }
        centerImageDataUrl = dataUrl;
        scheduleRender();
    } catch (error) {
        if (!isCurrentCenterImageLoad(activeLoadID, file)) {
            return;
        }
        rejectCenterImage(error?.message === centerImageDimensionError
            ? centerImageDimensionError
            : "The selected image could not be decoded. Choose a valid PNG, JPEG, or WebP file.");
    }
}

function isCurrentCenterImageLoad(loadID, file) {
    return loadID === centerImageLoadID
        && elements.centerType.value === "image"
        && elements.centerImage.files[0] === file;
}

function isCenterImageLoadPending() {
    return elements.centerType.value === "image"
        && elements.centerImage.files.length > 0
        && !centerImageDataUrl;
}

async function decodeCenterImageFile(file) {
    if ("createImageBitmap" in window) {
        const bitmap = await window.createImageBitmap(file);
        try {
            assertSafeCenterImageDimensions(bitmap.width, bitmap.height);
        } finally {
            bitmap.close();
        }
        return;
    }

    await loadCenterImageFile(file);
}

function loadCenterImageFile(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        const timeout = window.setTimeout(() => finish(() => reject(new Error("Image decoding timed out."))), 5000);
        const finish = (completion) => {
            window.clearTimeout(timeout);
            URL.revokeObjectURL(url);
            image.onload = null;
            image.onerror = null;
            completion();
        };
        image.onload = () => finish(() => {
            try {
                assertSafeCenterImageDimensions(image.naturalWidth, image.naturalHeight);
                resolve();
            } catch (error) {
                reject(error);
            }
        });
        image.onerror = () => finish(() => reject(new Error("Image decoding failed.")));
        image.src = url;
    });
}

function assertSafeCenterImageDimensions(width, height) {
    if (width < 1 || height < 1) {
        throw new Error("The selected image has no visible pixels.");
    }
    if (width > maximumCenterImageDimension
        || height > maximumCenterImageDimension
        || width * height > maximumCenterImagePixels) {
        throw new Error(centerImageDimensionError);
    }
}

function rejectCenterImage(message) {
    centerImageDataUrl = "";
    elements.centerImage.value = "";
    elements.centerImageName.textContent = "No image selected";
    elements.centerImageError.textContent = message;
    elements.centerImageError.hidden = false;
    invalidateRenderedQr();
    setStatus("error", message);
}

function clearCenterImageError() {
    elements.centerImageError.textContent = "";
    elements.centerImageError.hidden = true;
}

function invalidateRenderedQr() {
    window.clearTimeout(renderTimer);
    renderID += 1;
    currentQr = undefined;
    elements.preview.replaceChildren(elements.previewEmpty);
    elements.previewEmpty.hidden = false;
    elements.warnings.replaceChildren();
    elements.warnings.hidden = true;
    disableExport();
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
    if (!currentQr || !currentQrVerified || !currentVerifiedPngBlob) {
        return;
    }

    const activeRenderID = renderID;
    const blob = currentVerifiedPngBlob;
    try {
        if (!navigator.clipboard?.write || !window.ClipboardItem) {
            throw new Error("Copying images is not supported in this browser. Download the PNG instead.");
        }
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        if (activeRenderID !== renderID || blob !== currentVerifiedPngBlob) {
            return;
        }
        setStatus("verified", "PNG copied");
    } catch (error) {
        if (activeRenderID !== renderID || blob !== currentVerifiedPngBlob) {
            return;
        }
        setStatus("error", readableError(error));
    }
}

async function downloadPng() {
    if (!currentQr || !currentQrVerified || !currentVerifiedPngBlob) {
        return;
    }

    const activeRenderID = renderID;
    const blob = currentVerifiedPngBlob;
    try {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "QRSpell-QRCode.png";
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        if (activeRenderID !== renderID || blob !== currentVerifiedPngBlob) {
            return;
        }
        setStatus("verified", "PNG downloaded");
    } catch (error) {
        if (activeRenderID !== renderID || blob !== currentVerifiedPngBlob) {
            return;
        }
        setStatus("error", readableError(error));
    }
}

function resetGenerator() {
    centerImageLoadID += 1;
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
    for (const instance of customColorInstances) {
        instance.hue = 0;
    }
    centerImageDataUrl = "";
    elements.centerImageName.textContent = "No image selected";
    clearCenterImageError();
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
    syncAllColorPickers();
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
    currentQrVerified = false;
    currentVerifiedPngBlob = undefined;
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
