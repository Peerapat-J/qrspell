// Kept independent of Generator/site startup: even module-load failure is optional.
import("./analytics.mjs").then(({ initAnalytics }) => initAnalytics()).catch(() => {});
