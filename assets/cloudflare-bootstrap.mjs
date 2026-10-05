const publicPaths = new Set(["/", "/qr-code-generator/", "/privacy/", "/changelog/", "/helpcenter/", "/Acknowledgements/", "/legal/"]);

export function safeCloudflareReferrer(value, origin) {
    if (value === "") return true;
    try {
        const url = new URL(value);
        if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return false;
        return url.pathname === "/" || url.origin === origin && publicPaths.has(url.pathname);
    } catch {
        return false;
    }
}

export function startCloudflareBeacon({ document = globalThis.document, origin = globalThis.location?.origin, navigator = globalThis.navigator } = {}) {
    try {
        // Local files, previews and test pages must never emit a production baseline.
        if (origin !== "https://qrspell.app" || navigator?.webdriver === true || !document || !safeCloudflareReferrer(document.referrer, origin)) return false;
        // Redirect documents are measured at their destination, without a cancelled beacon.
        if (document.querySelector('meta[http-equiv="refresh"]')) return false;
        if (document.querySelector("script[data-cloudflare-runtime]")) return false;
        const config = JSON.parse(document.querySelector("script[data-cf-beacon]")?.dataset.cfBeacon ?? "null");
        if (!config || Object.keys(config).sort().join(",") !== "spa,token" || config.spa !== false
            || config.token !== "e43189ed6f5c43d29472b9b18c73b226") return false;
        const script = document.createElement("script");
        script.src = "https://static.cloudflareinsights.com/beacon.min.js";
        script.defer = true;
        script.dataset.cfBeacon = JSON.stringify(config);
        script.dataset.cloudflareRuntime = "";
        document.head.append(script);
        return true;
    } catch {
        return false;
    }
}

startCloudflareBeacon();
