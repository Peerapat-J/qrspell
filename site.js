(function () {
    const controlledVideos = document.querySelectorAll("[data-loop-delay], [data-playback-rate]");

    controlledVideos.forEach((video) => {
        const playbackRate = Number(video.dataset.playbackRate);
        const loopDelay = Number(video.dataset.loopDelay);

        if (Number.isFinite(playbackRate) && playbackRate > 0) {
            const applyPlaybackRate = () => {
                video.defaultPlaybackRate = playbackRate;
                video.playbackRate = playbackRate;
            };

            applyPlaybackRate();
            video.addEventListener("loadedmetadata", applyPlaybackRate);
        }

        if (Number.isFinite(loopDelay) && loopDelay > 0) {
            let restartTimer;
            video.loop = false;

            video.addEventListener("ended", () => {
                window.clearTimeout(restartTimer);
                restartTimer = window.setTimeout(() => {
                    video.currentTime = 0;
                    const playPromise = video.play();

                    if (playPromise && typeof playPromise.catch === "function") {
                        playPromise.catch(() => {});
                    }
                }, loopDelay);
            });
        }
    });

    const contactForm = document.querySelector("[data-contact-form]");
    const contactEmailLink = document.querySelector("[data-contact-email-link]");

    if (contactForm && contactEmailLink) {
        const recipient = contactEmailLink.dataset.recipient || "peerapat.jardrit@gmail.com";
        const fields = ["name", "email", "message"];

        const getCategoryLabel = () => {
            const selectedCategory = contactForm.querySelector("input[name='category']:checked");
            const label = selectedCategory?.closest("label")?.querySelector("strong")?.textContent.trim();

            return label || "Support";
        };

        const buildMailto = () => {
            const formData = new FormData(contactForm);
            const category = getCategoryLabel();
            const name = String(formData.get("name") || "").trim();
            const email = String(formData.get("email") || "").trim();
            const message = String(formData.get("message") || "").trim();
            const subject = `QRSpell ${category}`;
            const body = [
                `Category: ${category}`,
                `Name: ${name || "Not provided"}`,
                `Email: ${email || "Not provided"}`,
                "",
                "Message:",
                message || "Not provided",
            ].join("\n");

            return `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        };

        const updateMailto = () => {
            contactEmailLink.href = buildMailto();
        };

        fields.forEach((fieldName) => {
            contactForm.elements[fieldName]?.addEventListener("input", updateMailto);
        });

        contactForm.querySelectorAll("input[name='category']").forEach((categoryOption) => {
            categoryOption.addEventListener("change", updateMailto);
        });

        contactForm.addEventListener("submit", (event) => {
            event.preventDefault();
            updateMailto();
            window.location.href = contactEmailLink.href;
        });

        contactEmailLink.addEventListener("click", updateMailto);
        updateMailto();
    }
})();
