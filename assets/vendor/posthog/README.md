# PostHog browser SDK

- Package: `posthog-js@1.434.17`
- Upstream: https://github.com/PostHog/posthog-js
- Source artifact: https://registry.npmjs.org/posthog-js/-/posthog-js-1.434.17.tgz
- Entry point: `dist/module.slim.no-external.js`, copied unchanged as `posthog.mjs`.
- License: upstream `LICENSE` included beside the bundle.
- SHA-256 and npm tarball integrity: `manifest.json`.

The slim, no-external ESM build is loaded only by the provider adapter after
the analytics gate passes. It is not a separate HTML script or a Generator
startup dependency. The source map is intentionally not vendored; the bundle's
upstream sourceMappingURL comment is preserved and does not trigger runtime loading.

To upgrade, select an exact npm release, verify its tarball against npm's
SHA-512 integrity, replace the bundle/license/manifest, update the adapter pin,
and rerun the complete storage, final-envelope, failure, and CSP audit.
Do not switch to a floating CDN script or an SDK default snippet.
