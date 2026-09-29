// Independent of Generator/site startup: imports and initialization are optional.
import("./site-analytics.mjs").then(({ startSiteAnalytics }) => startSiteAnalytics()).catch(() => {});
