// Independent of Generator/site startup: imports and initialization are optional.
import("./site-analytics.mjs?v=20261005a").then(({ startSiteAnalytics }) => startSiteAnalytics()).catch(() => {});
