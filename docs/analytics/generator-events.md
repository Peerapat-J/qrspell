# Generator product events (#44)

Generator instrumentation is optional. `generator.mjs` dynamically imports its
controller independently of controls, rendering and website instrumentation.
All outbound events still go through the shared wrapper and sanitizer. Production
remains disabled and tokenless; #45 and the architecture gates govern activation.
The shared website lifecycle owns `site_page_viewed` and `app_store_clicked`.

## Counting rules

| Event | Rule |
| --- | --- |
| `generator_viewed` | Once per Generator document, after analytics initializes. |
| `generator_started` | First empty-to-non-empty transition per document. Whitespace is content, matching the renderer. Clearing or Reset does not restart the counter. |
| `qr_generation_completed` | Latest non-empty configuration has been unchanged for 600 ms and its render/verification or image validation has finished. |
| `qr_exported` | Each successful Clipboard API write (`method=copy`) or browser download initiation (`method=download`). Download does not confirm a disk save. |
| `generator_reset` | Reset changes content, any control, selected/cached image, or image-validation failure state. Reset on defaults emits nothing; color comparison ignores hex case. |
| `app_store_clicked` | Shared website event with `source=generator_cta` (or header/footer), with no extra Generator click handler. |

Initialization retains only the first-start flag and current configuration/result.
Input before initialization may produce the started event once initialization
succeeds, even if the user has since cleared the form. A late optional-module load
also observes that flag and the latest result. Exports and resets before readiness
are dropped; no history or persistent event/retry queue is added. Events represent
observed analytics, not a complete count of all actions or confirmed delivery.

## Settling, stale work and deduplication

The analytics timer is 600 ms from the latest configuration change. It is separate
from the unchanged 180 ms UI render timer. If verification takes longer, analytics
waits for its result without delaying controls or exports. Every change cancels
the pending quality result. Render IDs, analytics revisions and a final check
after asynchronous hashing prevent old results from being reported.

The local SHA-256 digest covers content, shapes, colors, export size, reliability,
center type, and active center size/text/image. Inactive center fields are ignored.
Valid images use their local data URL; rejected-image attempts use local file name,
size, modification time and MIME metadata without reading oversized files. Two
rejected files with identical metadata can therefore be deduplicated even if their
bytes differ. These values and digests are never event properties or transmitted.

At most 256 distinct quality configurations are reported per document. Digests
remain in a bounded memory-only Set with no eviction; returning to a previously
reported state, including after Reset, cannot repeat its quality event. After
reaching the cap, new quality configurations are suppressed until a new document
load. Explicit Copy/Download and Reset events are not subject to this cap. No raw
configuration history, cookies, localStorage or sessionStorage is added. Without
WebCrypto, quality events are omitted; exports and other product behavior continue.

## Outcomes and approved properties

- `verified`: decoded content exactly matches the current QR payload.
- `capacity_rejected`: the capacity check rejects content before rendering.
- `decode_failed`: verification decodes no QR content.
- `decoded_mismatch`: verification decodes a different payload.
- `render_failed`: QR creation, rasterization or verification throws.
- `center_image_rejected`: current center-image validation fails. Reported only
  with non-empty QR content; selecting an image alone is not a QR generation.

Quality properties are `outcome`, `module_shape`, `finder_shape`, `export_size`,
`reliability`, `center_type`, `warning_count` (0–4), and four warning-category
booleans: `warning_inverted_modules`, `warning_low_contrast`,
`warning_dense_content`, and `warning_weak_center_reliability`. Count reflects
displayed readability warnings; capacity/image rejection clears every flag and
reports zero.
Exports contain `method` and the five approved settings of the verified QR.
A successful pending Copy keeps that snapshot even if the user has edited or
reset the form during the Clipboard write; it cannot update a newer QR's status.
The wrapper owns `analytics_schema_version=2` and `environment`.

No QR content, center text, image bytes/data URLs, filenames, colors, exact center
size, exact content length, raw errors, generated PNG/SVG or deduplication keys
are sent. Warning messages and raw inputs are not sent: only four approved boolean
category flags leave the browser. Unknown enum values suppress the event rather
than widening the contract.

Use `generator_viewed → generator_started` for acquisition,
`generator_started → qr_exported` for activation, and
`generator_viewed → app_store_clicked` for App Store interest. Use the same provider
for both sides of each funnel. Automatic generation outcomes are quality signals,
not deliberate user completion. Quality rates describe observed settled states,
with the deduplication/cap limitations above.

## Verification

`generator-event-properties.test.mjs` checks the scalar selection, hostile inputs
and four simultaneous production warnings. `generator-analytics.test.mjs` checks
settling, late verification, initialization, stale hashing, deduplication, caps,
export snapshots and exceptions. Browser hook tests exercise all six outcomes,
rapid typing/sliders, Reset, failed Copy, successful Copy during editing and stale
render completion with a local capture stub.

Browser network tests use the real pinned SDK, a fake sandbox token/config and
interception of every external request. They inspect the final SDK envelopes for
QR/center/image/filename/query/fragment/referrer/error canaries and closed enums,
check empty storage, and exercise disabled production, missing Generator/property/
wrapper/SDK modules, capture throws/rejections, blocked ingestion, timeout, HTTP
400/503, offline, DNT and GPC. They prove outbound shape and failure isolation;
they do not prove delivery to a real provider.

Run `node --test scripts/*.test.mjs`,
`node scripts/generate-analytics-schema.mjs --check`, and
`node scripts/validate-static-site.mjs`.

Manual QA remains: a real tracker blocker, physical clipboard paste, saving the
browser download to disk, and delivery/raw-event inspection in an approved
non-production provider project. The internal data-handling record, site-wide
CSP, and full release canary matrix remain #45 gates. The public Privacy Policy
covers the macOS app.

## Schema v2 addition — 2026-09-30

Issue #46 adds four boolean warning-category properties. The browser test now
checks that the displayed warning count and categories match the captured event;
unit tests check simultaneous categories, count consistency and hostile values.
The previous sandbox/provider screenshots and 2026-09-29 verification record
were for schema v1. Repeat real-provider delivery and raw-event checks for v2
before production activation.

## Verification record — 2026-09-29

- All 201 tests passed with no skips (`node --test scripts/*.test.mjs`).
- Generated-schema, static-site, changed-module syntax and diff checks passed.
- SDK-envelope tests used fake sandbox configuration and intercepted every
  external request; no real project token or production provider traffic was used.
- The browser failure matrix covers all optional-module failures, capture throws/
  rejections, blocked/timed-out ingestion, HTTP errors, offline and DNT/GPC.
- Clipboard success/failure used a stub; browser downloads were initiated and
  denied by the harness. Physical clipboard/disk, tracker-blocker and approved
  real-provider delivery checks remain manual.
- Production configuration remains disabled and tokenless.
