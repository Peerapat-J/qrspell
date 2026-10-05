# Issue #46: production analytics rollout and review

This runbook records the approved production rollout and its remaining follow-up.
Release and dashboard evidence was recorded on 2026-10-06; see the
[dated production record](production-validation-2026-10-06.md).
On 2026-10-02, the repository owner selected the existing PostHog EU project
for both local validation and production. No additional project or plan upgrade
is required by this rollout. On 2026-10-05 the owner accepted the Free-plan
retention and processing boundaries and authorized production activation.
`assets/analytics-config.mjs` enables the existing EU public token in the release
merged to `main` through PR #56 on 2026-10-05. The validator pins that reviewed
project. GitHub Pages deployment succeeded and production schema-v2 events were
observed on 2026-10-06. Local approval, deployment and observed delivery are
separate evidence items below.
Do not put a Personal API key or Project secret key in this repository.

## Release sequence

Do not turn every evidence item below into a separate screenshot request.
Reuse the recorded results and collect only missing project settings and manual
effects in one pre-release session. The 2026-10-05 focused browser run passed
29 tests for schema-v2 SDK payloads, storage and failure handling; see
[schema-v2-validation.md](schema-v2-validation.md). Issue #45 is closed and its
implementation in PR #54 is merged. The owner reported real clipboard, opened
PNG and normal/blocked/tracker-blocker journeys passed on 2026-10-05. Keep this
manual evidence separate from automated results and implementation status.

The project/provider review, owner acceptance and real Generator
clipboard/download/blocker checks are recorded; do not ask the owner to repeat
these checks. The release in section 3 is deployed. The production dashboard
and its 17 saved insights were verified on 2026-10-06, as recorded in sections
4–5. The snapshot is a small canary, not representative conversion data or a
complete audit of every event/outcome. The dated post-launch review is tracked
in [Issue #57](https://github.com/Peerapat-J/qrspell/issues/57) for
2026-10-20 (`Asia/Bangkok`). This documentation update does not close Issue #46.

## 1. Review the existing project

Use the existing QRSpell EU project and its public `phc_` project token for both
local validation and the production release. Record its Project URL/ID in the
private release record. Local test events carry `environment = sandbox`; the
public site carries `environment = production`. Apply the environment, schema
version and release-date filters in [dashboard-spec.md](dashboard-spec.md) to
every production insight and funnel step. This is query separation: project
settings, retention and usage allowance remain shared. Confirm in the live
project:

- [x] EU Cloud and timezone `Asia/Bangkok` (screenshots supplied on 2026-10-02).
- [x] Cookieless tracking enabled in Web analytics (screenshot on 2026-10-02).
- [x] Client IP discard enabled (owner confirmed on 2026-10-05).
- [x] Free-plan retention accepted by the owner on 2026-10-05 without a
      guaranteed 12-month deletion bound. This revises the earlier internal
      maximum policy; it does not prove provider deletion by that deadline.
      See [provider-review-2026-10-05.md](provider-review-2026-10-05.md).
- [x] DPA/Core Services subprocessors, international processing and schema-v2
      collection decision reviewed; the owner accepted proceeding under these
      boundaries on 2026-10-05. This does not assert an executed DPA.
- [x] Web vitals autocapture is off (screenshot supplied on 2026-10-05).
- [x] The adapter explicitly disables unused capture features; the pinned-SDK
      automated tests pass. This is code/runtime evidence rather than an audit
      of every project UI switch; see the dated provider review.

Web vitals evidence reference: `codex-clipboard-f9bcba1c-b723-4e2f-adac-db8a98a69009.png`.
The main **Enable web vitals autocapture** toggle is off. This confirms that
specific project control, not the remaining capture settings or network checks.

The historical [sandbox validation](sandbox-validation.md) proves only schema
v1 behavior. Do not use its screenshots as proof that v2 was delivered. Record
new evidence in [schema-v2-validation.md](schema-v2-validation.md).

## 2. Validate schema v2 in the sandbox

Serve the checkout with `node scripts/analytics-sandbox.mjs` and use only the
selected project's public token on the local page. Send the built-in
safe journey, an export of each method and a case with approved warning flags.
Never send QR content, filenames, private URLs, images or canary secrets to a
real provider. In PostHog Activity, inspect raw events and their properties.
Verify `analytics_schema_version = 2`, `environment = sandbox`, the approved
outcomes and four boolean warning categories. Confirm that the warning count
matches the number of true categories in the test cases.

Check the final request body in DevTools, and separately inspect any fields
added by PostHog after ingestion. Verify no URL/referrer, GeoIP, content,
filename, error, stable browser ID or person profile. The local origin must
have no analytics cookie, localStorage or sessionStorage. Check ordered funnel
and method/property breakdowns in the provider. Repeat Generator Verify, Copy,
Download and Reset while blocking the EU endpoint; the product must still work.
Record the browser/version, time, test journey, request/body evidence, raw-event
evidence and result. Manual clipboard paste, opened download and a real tracker
blocker are separate checks from the automated suite.

## 3. Release and deployment

The owner authorized activation on 2026-10-05. PR #55 merged activation and
review fixes into `dev`; [PR #56](https://github.com/Peerapat-J/qrspell/pull/56)
merged `dev` into `main` at 2026-10-05 23:32:49 (`Asia/Bangkok`). Production
receipt was observed on 2026-10-06:

- [x] Set `enabled: true` and the existing project's public `phc_` token in
      `assets/analytics-config.mjs`; keep `environment: "production"`.
- [x] Prepare an exact reviewed-token/configuration rule in
      `scripts/analytics-release-policy.mjs`, used by the static-site validator.
      SDK pin, CSP and route checks remain. Tests reject missing, malformed and
      wrong-project configurations and permit disabled/tokenless rollback.
- [x] Record the owner's provider decision and set
      `productionCaptureApproved = true` together with the enabled production
      config. Disabled/tokenless remains a supported rollback.
- [x] Prepared validator verified on 2026-10-05: 274 tests pass, no failures or
      skips; schema/static-site/whitespace checks pass. Repeat after activation.
- [x] Activation validation passed on 2026-10-05: schema check, **274 tests
      passed, zero failures/skips**, static-site validator and whitespace check.
      Commands: `node scripts/generate-analytics-schema.mjs --check`,
      `node --test scripts/*.test.mjs`, `node scripts/validate-static-site.mjs`
      and `git diff --check`. Record automated and manual results separately.
- [x] Deploy the reviewed release through the normal repository workflow.
      Commit `9b56f728dcb9c7b99b843ff7ae4afd17e117f5fe`; GitHub Pages reported
      `built` at **2026-10-05 23:33:22 (`Asia/Bangkok`)**, schema version **2**.
      [Pages run](https://github.com/Peerapat-J/qrspell/actions/runs/37341670256)
      and [main CI](https://github.com/Peerapat-J/qrspell/actions/runs/37341673408)
      succeeded. Deployment status was rechecked on 2026-10-06.

## 4. Create and verify the production dashboard

The [QRSpell production dashboard](https://eu.posthog.com/project/286136/dashboard/999543)
contains four sequential funnels, six export breakdowns and seven settled-quality
views. All 17 saved insights rendered without loading/error headings after the
2026-10-06 refresh. Their links, query checks and observed values are in the
[dated production record](production-validation-2026-10-06.md).

Every insight and funnel step filters `environment = production` and
`analytics_schema_version = 2`, starting at the deployment timestamp with a
moving end. Funnels use sequential ordering, unique users and a 30-minute
window; internal/test exclusion is enabled. Dashboard descriptions and a saved
text card disclose coverage, identity and event-meaning limitations. The header
notes are readable; the text card remains narrow and scrollable. Delivery
coverage diagnostics are unavailable. Cloudflare counts are not included in
PostHog conversion rates.

The canary showed acquisition and activation completing for one observed
identity, three export actions and 24 settled outcomes. App Store funnels had
zero clicks. This verifies the saved zero-result views, not a completed App Store
click journey. No synthetic production events or repeat owner QA were requested.

## 5. Production canary and post-launch review

- [x] Owner-supplied Activity evidence on 2026-10-06 shows production/schema-v2
      Generator quality and export events. The saved release-filtered queries
      reconcile the observed counts; see the dated production record. The
      schema allows only `site_page_viewed`, `app_store_clicked`,
      `generator_viewed`, `generator_started`, `qr_generation_completed`,
      `qr_exported` and `generator_reset`. This does not assert that all seven
      names were observed in production.
- [ ] Complete representative production Raw sampling of event types and
      quality outcomes as they become available, including provider-added
      fields. Existing evidence covers sandbox Raw samples and the production
      canary snapshot; it does not establish a full production Raw audit or
      receipt of every outcome. Compare with `event-schema-v2.json` and retain
      closed low-cardinality enums/booleans; do not generate private test content.
- [x] Saved production insights and each funnel step exclude sandbox, missing/
      older schemas and pre-release traffic. The actual saved query definitions
      and moving date ranges were read back on 2026-10-06. Sandbox events remain
      in the shared project and are excluded from production queries.
- [x] Automated schema-v2 privacy/failure checks passed; the owner separately
      reported real clipboard paste, opened PNG and normal/blocked/tracker-blocker
      journeys working on 2026-10-05. Automated DNT/GPC checks and manual blocker
      evidence are distinct; this does not claim a manual production DNT/GPC audit.
- [x] Saved dashboard/funnel descriptions disclose blocked/opted-out traffic,
      daily cookieless identity rotation, quality-event deduplication and export/
      App Store-click meaning.
- [x] Create a dated review task after approximately two weeks of observation:
      [Issue #57](https://github.com/Peerapat-J/qrspell/issues/57), assigned to
      `Peerapat-J`, review date **2026-10-20 (`Asia/Bangkok`)**. Creating the task
      does not mean the review has been performed. At that review, assess event
      volume/noise, unused events/properties, blocker
      coverage, retention and whether a reverse proxy has a justified purpose.
      Record the minimum sample size and observation period required before
      changing any product default. Do not add a proxy solely to evade blockers.

## Evidence record

| Field | Value |
| --- | --- |
| Project selection | Existing QRSpell EU project selected for sandbox and production on 2026-10-02; URL/ID in private release record |
| Project settings and DPA review | Asia/Bangkok and cookieless enabled shown on 2026-10-02; Web vitals autocapture off shown and client IP discard confirmed on 2026-10-05; Free plan confirmed by owner; adapter capture settings and provider documents reviewed; owner accepted the provider retention/processing boundaries and revised the internal maximum-retention policy on 2026-10-05; no signed DPA is asserted; see [dated review](provider-review-2026-10-05.md) |
| Schema-v2 sandbox provider check | Both quality cases received; export, Generator view and page view Raw records inspected on 2026-10-02; verified zero-warning Properties and v2 export method counts inspected on 2026-10-05; remaining checks in [schema-v2-validation.md](schema-v2-validation.md) |
| #45 implementation and manual effects | Issue closed and PR #54 merged; automated v2 SDK/network/storage/failure checks pass (29 tests, 2026-10-05); owner reported real clipboard, opened PNG and normal/blocked/tracker-blocker journeys passed on 2026-10-05 |
| Release commit and date/time | [PR #56](https://github.com/Peerapat-J/qrspell/pull/56), commit `9b56f728dcb9c7b99b843ff7ae4afd17e117f5fe`; Pages built 2026-10-05 23:33:22 Asia/Bangkok; schema 2; deployment and main CI success rechecked 2026-10-06 |
| Dashboard and insight URLs | [QRSpell production](https://eu.posthog.com/project/286136/dashboard/999543); all 17 canonical insight links and saved-query checks in the [dated production record](production-validation-2026-10-06.md) |
| Production raw-event and canary results | Production/schema-v2 Activity screenshot supplied 2026-10-06; saved charts reconciled 3 exports and 24 settled outcomes; acquisition/activation 1 completing identity each; App Store clicks 0; complete production Raw sampling remains unverified; see the [dated record](production-validation-2026-10-06.md) |
| Dated post-launch review task | [Issue #57](https://github.com/Peerapat-J/qrspell/issues/57), created 2026-10-06; assigned to Peerapat-J; review 2026-10-20 Asia/Bangkok after approximately two weeks; review results remain pending |
