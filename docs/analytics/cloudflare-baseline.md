# QR Generator Cloudflare baseline

Tracking issue: [#41](https://github.com/Peerapat-J/qrspell/issues/41).
Prepared on 2026-09-28. Production deployment and dashboard verification are pending.

## Coverage and CSP

Before #41 the existing site token appeared once on each of these six pages:
`/`, `/privacy/`, `/changelog/`, `/helpcenter/`, `/legal/`, and `/Acknowledgements/`.
The Generator adds `/qr-code-generator/` to that baseline with the same token.
The validator checks all seven HTML files for exactly one guarded local loader,
the site token, and disabled SPA measurement. All pages are static documents;
route changes must not forward arbitrary paths. The product-event SDK is a
separate optional path documented in [foundation.md](foundation.md).

Site-wide CSP permits the exact HTTPS script
`https://static.cloudflareinsights.com/beacon.min.js` and ingestion URL
`https://cloudflareinsights.com/cdn-cgi/rum`. It does not permit wildcard hosts,
an entire analytics origin, broad HTTPS connections, or same-origin connections.
The separately approved EU product-event origin is allowed for PostHog. The
Generator also permits local data/blob images and inline styles needed by its
renderer; other pages permit only local images/styles. Every page uses
`no-referrer` for outgoing requests. QR libraries and Generator runtime remain
local assets; they make no network requests.

## Data and failure behavior

The beacon reports public page location, sanitized referrer, navigation timing,
browser timing metadata, and Core Web Vitals. This Cloudflare traffic baseline is
separate from the stricter manual product-event schema in #40. Do not combine
Cloudflare counts with another provider's funnel numerator or denominator.
The Cloudflare script reviewed on 2026-09-28 (version 2026.9.1) strips query,
fragment, username, and password from reported page and referrer URLs. Its hosted
code can change, so repeat the network canary check before production enablement.

The 2026-09-29 audit found that URL cleaning retains an incoming referrer's path.
`assets/cloudflare-bootstrap.mjs` therefore loads the hosted beacon only on the
exact production origin, outside webdriver contexts, and with an empty,
origin-only, or registered same-origin public referrer. Referrer credentials,
query/fragment, foreign paths and unknown same-origin paths suppress the beacon
before any external script request. Local files, localhost and preview origins
also suppress it. Loader errors leave the page usable. These exclusions reduce
Cloudflare coverage; its observed counts must not be interpreted as all visits.
The immediate `/legal/` redirect skips its own beacon and measures the destination
document, avoiding requests cancelled during navigation.

No QR content, center text or emoji, uploaded file/image, generated SVG/PNG,
clipboard data, or Generator settings are passed to the beacon. The script is
deferred and independent of Generator setup, rendering, and export. A blocked
script, blocked ingestion, timeout, or HTTP error may omit traffic measurements;
it must not create a visible Generator error or disable a control. Users may block
`static.cloudflareinsights.com` and `cloudflareinsights.com` normally; no proxy is
added to bypass blockers. Traffic measurement details are documented here; the
public Privacy Policy covers the QRSpell macOS app.

## Edge analytics availability

On 2026-09-28 live DNS resolved `qrspell.app` to GitHub Pages addresses
`185.199.108.153` through `185.199.111.153`; HTTPS responses had `Server: GitHub.com`
and Fastly headers, without Cloudflare proxy headers. This traffic is not currently
proxied through Cloudflare, so Cloudflare edge analytics is not available for it.
No Cloudflare dashboard plan/settings were changed or inferred. If DNS/proxy
configuration changes, recheck the endpoint and analytics coverage. Keep the
current manual beacon endpoint unless a separate deployment decision changes it.

Sources:
- [Cloudflare data origin and collection](https://developers.cloudflare.com/web-analytics/data-metrics/data-origin-and-collection/)
- [Cloudflare FAQs, manual setup and edge analytics](https://developers.cloudflare.com/web-analytics/faq/)
- [Disabling SPA measurement](https://developers.cloudflare.com/web-analytics/get-started/web-analytics-spa/)

## Verification

Run `node --test scripts/*.test.mjs`, `node scripts/validate-static-site.mjs`, and
`git diff --check`. The browser suite intercepts Cloudflare requests before page
load: no automated test sends data to production analytics. It checks exact CSP
permissions, blocked beacon, blocked ingestion, simulated timeout, HTTP failure, and unaffected
generation, verification, Copy, Download, and Reset with a controlled beacon probe.

To additionally audit the current hosted beacon without sending production data,
download it to a temporary file and run the same intercepted browser suite:

```sh
curl -fsSL https://static.cloudflareinsights.com/beacon.min.js -o /tmp/qrspell-cloudflare-beacon.js
CLOUDFLARE_BEACON_FIXTURE=/tmp/qrspell-cloudflare-beacon.js node --test scripts/qr-generator-browser.test.mjs
```

The provider script is a temporary test input, not vendored or changed in production.
The test places canaries in QR content, center text, uploaded image bytes/filename,
and URL query/fragment, captures beacon requests, and checks that they do not leak.
Clipboard writes are stubbed in this automated check; real clipboard and downloaded
file handling remain a manual check. Browser downloads are denied during tests so
they do not write files to the user's Downloads folder.

Local verification on 2026-09-28:
- Static-site validator and `git diff --check`: Pass.
- Entire suite with the controlled probe: 92 tests passed, none skipped.
- Provider snapshot audit: all five scenarios passed (6 tests including the parent).
  No production ingestion was performed; every endpoint response was intercepted.
- Provider script SHA-256:
  `08c4fd72f9d96a7aa554510dff2c293973b1b092dff1b9b282bce9111b50ef41`.
- Test-owned Chrome processes and temporary profiles were closed/removed.

After deployment (pending):
- Record the deployment time as the Generator baseline start date.
- Inspect the deployed CSP and confirm one beacon with the existing token.
- Check `/qr-code-generator/` traffic/performance in the Cloudflare dashboard;
  local interception cannot prove production ingestion or dashboard visibility.
- With and without a tracker blocker, create/verify a QR, Copy it to a real app,
  Download/open its PNG, and Reset. Repeat with ingestion blocked/offline.
- Inspect Network requests using canary values; confirm no QR, center, image,
  filename, query/fragment, or settings data appears in URLs, headers, or bodies.

## Foundation integration (#42)

The Generator also loads the optional local analytics bootstrap. As of
2026-10-05, the owner-approved release configuration enables PostHog production
capture with the existing EU project's public token. Live production receipt
awaits deployment; see [production-rollout.md](production-rollout.md).
CSP permits only the exact EU ingestion origin `https://eu.i.posthog.com`
in addition to the Cloudflare permissions above. No PostHog script origin or
broad connection permission is added.
