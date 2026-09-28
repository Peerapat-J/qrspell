# PostHog EU sandbox validation

Issue: [#40](https://github.com/Peerapat-J/qrspell/issues/40)

This is a non-production test. Do not add the PostHog snippet to a public
QRSpell page and do not use a Personal API key.

## Preconditions

- [x] Provider project is in PostHog EU Cloud.
- [x] Project timezone is Asia/Bangkok.
- [x] Discard client IP data is enabled.
- [x] Cookieless tracking is enabled in Project Settings > Web analytics.
- [x] Session Replay, Autocapture, Surveys, Heatmaps, Error Tracking, and ad
      integrations are unused by the sandbox configuration and observed event
      stream.
- [x] Product Analytics retention is confirmed as 12 months on the selected
      free plan.

The project settings above were supplied in screenshots on 2026-09-28. The
retention result uses PostHog's pricing terms reviewed on the same date; plan
and feature settings must be rechecked before production and after any plan
change.

## Run the local sandbox

1. From this branch, run:

   ```sh
   node scripts/analytics-sandbox.mjs
   ```

2. Open `http://127.0.0.1:41741/`.
3. Paste the public `phc_...` project token into the local page. Do not use a
   Personal API key (`phx_...`) or Project secret key.
4. Click **Initialize sandbox**.
5. Click **Send safe journey** once, then **Send download export** once.
6. Keep DevTools Network and Application tabs open for the checks below.

The token stays in page memory and is not written by the harness. The harness
serves only on loopback and exits with `Ctrl+C`. It loads the EU SDK only for
this sandbox; the production gate still requires a reviewed pinned/vendored
build. Its final `before_send` sanitizer removes provider enrichment not listed
in the contract before a request leaves the browser. Compression is disabled so
the final request payload remains directly inspectable in DevTools.

## Required PostHog checks

### 1. Raw events

Open **Activity** and filter to the last 30 minutes. Confirm these events arrive:

- `site_page_viewed`
- `generator_viewed`
- `generator_started`
- `qr_generation_completed`
- `qr_exported`

Open representative raw events. Only schema-v1 business properties plus the
six provider transport/control fields listed in `event-schema-v1.json` may
appear in the raw request. PostHog may show server-derived metadata in its UI;
record it separately. Neither the raw request nor the UI may expose the test
page's full URL/query/hash, GeoIP properties, or a stable identity.

Evidence:

- Date/time: 2026-09-28 01:56 Asia/Bangkok
- Screenshot/reference: Activity and expanded `qr_exported` properties supplied
  during the #40 validation session.
- Result: **Pass.** All five event types arrived; `qr_exported` arrived for both
  `copy` and `download`. URL/screen was empty, `$geoip_disable` was `true`,
  person-profile processing was `false`, and no GeoIP, URL, referrer, content,
  image, or free-form payload property was present.

### 2. Property breakdown

Create **Product analytics > Trends**:

- Event: `qr_exported`
- Breakdown: event property `method`
- Expected values: `copy`, `download`
- Filter: `environment = sandbox`

Evidence:

- Date/time: 2026-09-28
- Screenshot/reference: Trends result supplied during the #40 validation
  session.
- Result: **Pass.** `qr_exported` with `environment = sandbox` broke down into
  `method = copy` and `method = download`. Each value had two events because
  the initial and privacy-revision-2 sandbox runs were both included.

### 3. Ordered funnel

Create **Product analytics > Funnel** with ordered steps:

1. `generator_viewed`
2. `generator_started`
3. `qr_exported`

Apply `environment = sandbox` to every step. The one test journey should reach
all three steps. Do not combine a Cloudflare count with this funnel.

Evidence:

- Date/time: 2026-09-28
- Screenshot/reference: Funnel result supplied during the #40 validation
  session.
- Result: **Pass.** The ordered `generator_viewed -> generator_started ->
  qr_exported` funnel with `environment = sandbox` showed one cookieless person
  completing every step and a 100% sandbox conversion rate.

### 4. Cookie and browser-storage inspection

On the local sandbox page, open DevTools > Application and inspect:

- Cookies for `http://127.0.0.1:41741`
- Local Storage
- Session Storage

Expected: no PostHog cookie or storage key. Also reload the page and confirm the
token field is empty and no PostHog identity remains.

Judge cookies by their **Domain**, not only by the selected DevTools tree item.
Cookies such as `ph_authenticated_*` or `ph_current_project_*` with Domain
`.posthog.com` belong to the authenticated PostHog dashboard session. They are
not analytics storage scoped to the QRSpell/local origin. Any PostHog identity
cookie whose Domain is `127.0.0.1` or the future QRSpell domain is a failure.

Evidence:

- Date/time: 2026-09-28
- Screenshot/reference: DevTools Application screenshots supplied during the
  #40 validation session.
- Result: **Pass.** Local Storage and Session Storage for
  `http://127.0.0.1:41741` were empty after reload. No cookie scoped to the
  local origin was observed. Existing `.posthog.com` dashboard-login cookies
  were identified separately and are not QRSpell analytics storage.

### 5. Network envelope and failure behavior

In DevTools > Network:

- inspect every request to `eu.i.posthog.com`;
- confirm request bodies contain no prohibited canary or full URL;
- block `eu.i.posthog.com`, repeat the buttons, and confirm the page remains
  usable with no uncaught error.

Evidence:

- Date/time: 2026-09-28
- Screenshot/reference: DevTools Network request payload supplied during the
  #40 validation session.
- Result: **Pass.** The uncompressed `site_page_viewed` request contained
  only the project token, cookieless distinct-ID marker, library/version,
  person-profile control, `$geoip_disable`, timestamps/UUID, and the three
  allowlisted business properties. It contained no URL, referrer, GeoIP,
  content, image, error, or free-form property. With `eu.i.posthog.com` blocked
  in DevTools, the export request failed and retried through `retry_count=3`
  while the sandbox remained responsive and recorded the action locally.

## Final decision

- Provider result: **Conditional Go** for a later production implementation,
  subject to the production gates in `architecture-v1.md`.
- Retention result: **Pass for the free plan** — PostHog publishes one-year
  event retention. A paid-plan change is a mandatory review because the
  published default increases to seven years.
- Production tracking enabled: **No**
- Reviewer/date: Validated with the repository owner on 2026-09-28.

The sandbox validation passed. PostHog remains Conditional Go until every
production gate in `architecture-v1.md` passes; a mandatory-gate failure makes
it No-go.

## Run log

### 2026-09-28 — initial EU sandbox run

- Event delivery: Pass. Five event types arrived; `qr_exported` arrived once
  each for `copy` and `download`.
- URL suppression: Pass. Activity showed no URL/screen value.
- Cookieless marker: Pass. Activity showed `$posthog_cookieless`.
- GeoIP boundary: **Fail.** PostHog added city, country, postal code, latitude,
  longitude, and timezone even though project cookieless mode and client-IP
  discard were enabled.
- Remediation: the outbound sanitizer now forces `$geoip_disable: true` on
  every event. A clean second run is required before the raw-event gate passes.

### 2026-09-28 — privacy revision 2 EU sandbox run

- Event delivery and approved business properties: Pass.
- URL/referrer suppression: Pass. Activity showed no URL/screen value.
- GeoIP boundary: Pass. `$geoip_disable` was `true`; no location enrichment was
  present.
- Identity boundary: Pass. The cookieless marker was present and person-profile
  processing was `false`.
- At this point the property breakdown, ordered funnel, browser storage,
  blocked-host behavior, and retention checks were still outstanding; the
  final run below completed them.

### 2026-09-28 — privacy revision 3 final sandbox run

- Property breakdown: Pass. `method` produced `copy` and `download`.
- Ordered funnel: Pass. One cookieless person completed all three ordered
  steps in the sandbox.
- Browser persistence: Pass. The local origin's Local Storage and Session
  Storage were empty after reload; no local-origin analytics cookie existed.
- Final request envelope: Pass. Uncompressed inspection showed only approved
  transport/control and schema-v1 business properties.
- Blocked-host behavior: Pass. DevTools blocked the EU ingestion origin;
  requests failed and retried while the sandbox remained usable.
- Retention: Pass for the selected free plan at its published 12-month window.
