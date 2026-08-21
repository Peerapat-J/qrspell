(function () {
    const previewTriggers = [...document.querySelectorAll(".app-preview-trigger")];
    const imageLightbox = document.querySelector(".image-lightbox");

    if (imageLightbox && previewTriggers.length > 0) {
        const lightboxImage = imageLightbox.querySelector(".image-lightbox-image");
        const lightboxStage = imageLightbox.querySelector(".image-lightbox-stage");
        const counter = imageLightbox.querySelector(".image-lightbox-counter");
        const closeButton = imageLightbox.querySelector(".image-lightbox-close");
        const previousButton = imageLightbox.querySelector(".image-lightbox-previous");
        const nextButton = imageLightbox.querySelector(".image-lightbox-next");
        let activePreviewIndex = 0;
        let openingTrigger;

        const showPreview = (index) => {
            activePreviewIndex = index;

            const sourceImage = previewTriggers[activePreviewIndex].querySelector("img");
            lightboxImage.src = sourceImage.dataset.fullSrc || sourceImage.currentSrc || sourceImage.src;
            lightboxImage.alt = sourceImage.alt;
            counter.textContent = `${activePreviewIndex + 1} of ${previewTriggers.length}`;
            previousButton.disabled = activePreviewIndex === 0;
            nextButton.disabled = activePreviewIndex === previewTriggers.length - 1;
        };

        const closeLightbox = () => {
            imageLightbox.close();
        };

        previewTriggers.forEach((trigger, index) => {
            trigger.addEventListener("click", () => {
                openingTrigger = trigger;
                showPreview(index);
                imageLightbox.showModal();
                closeButton.focus();
            });
        });

        previousButton.addEventListener("click", () => {
            showPreview(activePreviewIndex - 1);
        });

        nextButton.addEventListener("click", () => {
            showPreview(activePreviewIndex + 1);
        });

        closeButton.addEventListener("click", closeLightbox);

        lightboxStage.addEventListener("click", (event) => {
            if (event.target === lightboxStage) {
                closeLightbox();
            }
        });

        imageLightbox.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                closeLightbox();
            }

            if (event.key === "ArrowLeft" && activePreviewIndex > 0) {
                event.preventDefault();
                showPreview(activePreviewIndex - 1);
            }

            if (event.key === "ArrowRight" && activePreviewIndex < previewTriggers.length - 1) {
                event.preventDefault();
                showPreview(activePreviewIndex + 1);
            }
        });

        imageLightbox.addEventListener("close", () => {
            openingTrigger?.focus();
        });
    }

    const copyButtons = document.querySelectorAll("[data-copy-value]");

    copyButtons.forEach((button) => {
        const defaultText = button.textContent;

        button.addEventListener("click", async () => {
            const value = button.dataset.copyValue || "";

            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(value);
                } else {
                    copyTextFallback(value);
                }

                button.textContent = "Copied";
                button.dataset.copyState = "success";
            } catch {
                selectCommandText(button);
                button.textContent = "Selected";
                button.dataset.copyState = "fallback";
            }

            window.clearTimeout(button.copyResetTimer);
            button.copyResetTimer = window.setTimeout(() => {
                button.textContent = defaultText;
                delete button.dataset.copyState;
            }, 1800);
        });
    });

    function copyTextFallback(value) {
        const textArea = document.createElement("textarea");
        textArea.value = value;
        textArea.setAttribute("readonly", "");
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.append(textArea);

        try {
            textArea.select();

            if (!document.execCommand("copy")) {
                throw new Error("Copy command failed");
            }
        } finally {
            textArea.remove();
        }
    }

    function selectCommandText(button) {
        const code = button.closest(".command-copy")?.querySelector("code");

        if (!code || !window.getSelection) {
            return;
        }

        const range = document.createRange();
        range.selectNodeContents(code);

        const selection = window.getSelection();
        if (!selection) {
            return;
        }

        selection.removeAllRanges();
        selection.addRange(range);
    }
})();
