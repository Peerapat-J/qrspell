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
