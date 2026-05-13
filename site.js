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
})();
