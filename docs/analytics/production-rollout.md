# Issue #46: production analytics rollout and review

This runbook records the work that remains after the local implementation.
On 2026-10-02, the repository owner selected the existing PostHog EU project
for both local validation and production. No additional project or plan upgrade
is required by this rollout. Until the project review, schema-v2 validation and
#45 manual checks pass, `assets/analytics-config.mjs` stays disabled and tokenless,
and `scripts/validate-static-site.mjs` keeps rejecting an enabled config.
Do not put a Personal API key or Project secret key in this repository.

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
- [ ] Client IP discard enabled (reconfirm the existing setting).
- [ ] Product-event retention is 12 months or less.
- [ ] DPA, current subprocessors, international processing and schema-v2
      privacy/consent decision reviewed.
- [x] Web vitals autocapture is off (screenshot supplied on 2026-10-05).
- [ ] Other unused capture features remain off: autocapture, automatic pageviews,
      session replay, surveys, heatmaps, exception capture, ad integrations, flags
      and external SDK dependencies.

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

## 3. Prepare the release change

Only after sections 1–2 and the #45 manual checks pass:

- [ ] Set `enabled: true` and the existing project's public `phc_` token in
      `assets/analytics-config.mjs`; keep `environment: "production"`.
- [ ] Change the static-site validator from its temporary disabled/tokenless
      rule to an exact, reviewed production-token/configuration rule. Keep its
      SDK pin, CSP and route checks. Add validator tests for missing, malformed,
      wrong-project and disabled configurations.
- [ ] Run `node scripts/generate-analytics-schema.mjs --check`,
      `node --test scripts/*.test.mjs`, `node scripts/validate-static-site.mjs`
      and `git diff --check`. Record automated and manual results separately.
- [ ] Deploy the reviewed release through the normal repository workflow.
      Record commit, release date/time (`Asia/Bangkok`) and schema version 2.

## 4. Create and verify the production dashboard

Follow [dashboard-spec.md](dashboard-spec.md). Save the four sequential funnels,
export breakdowns, settled outcome/failure views, warning rate and four warning
category views. Apply `environment = production` and
`analytics_schema_version = 2` to every insight or step. Add a visible text
card with the coverage and identity limitations, and annotate the release and
schema-change dates. Link delivery diagnostics only if the provider supplies a
reliable one; otherwise mark the view unavailable.

Record the dashboard and saved-insight URLs. Use a fresh normal browser to run
one controlled journey: open Generator, enter safe test content, wait for
verification, Copy, initiate Download and click an App Store link. Check that
the expected events arrive in the correct order and that the saved funnels
include the journey. Two export events in one journey do not imply two people
in the activation funnel. Do not mix Cloudflare counts into these rates.

## 5. Production canary and post-launch review

- [ ] Activity filtered to `environment = production`, schema version 2 and
      the release date onward shows only the seven approved event names:
      `site_page_viewed`, `app_store_clicked`, `generator_viewed`,
      `generator_started`, `qr_generation_completed`, `qr_exported`,
      `generator_reset`.
- [ ] Sample each event and each quality outcome; compare event properties with
      `event-schema-v2.json`, including provider-added fields. All business
      values are in closed low-cardinality enums or booleans.
- [ ] Production insights exclude `environment = sandbox`, missing or older
      schema versions and pre-release test traffic. Check each funnel step's
      filters; sandbox events may remain in the shared project's Activity.
- [ ] DNT/GPC and a real tracker blocker suppress product events while
      navigation, Verify, Copy, Download and Reset still work.
- [ ] Dashboard descriptions disclose blocked/opted-out traffic, daily
      cookieless identity rotation, quality-event deduplication and export/
      App Store-click meaning.
- [ ] Schedule a dated review after an agreed observation period. At that
      review, assess event volume/noise, unused events/properties, blocker
      coverage, retention and whether a reverse proxy has a justified purpose.
      Record the minimum sample size and observation period required before
      changing any product default. Do not add a proxy solely to evade blockers.

## Evidence record

| Field | Value |
| --- | --- |
| Project selection | Existing QRSpell EU project selected for sandbox and production on 2026-10-02; URL/ID in private release record |
| Project settings and DPA review | Asia/Bangkok and cookieless enabled shown on 2026-10-02; Web vitals autocapture off shown on 2026-10-05; remaining settings and DPA review pending |
| Schema-v2 sandbox provider check | Both quality cases received; export, Generator view and page view Raw records inspected on 2026-10-02; verified zero-warning Properties and v2 export method counts inspected on 2026-10-05; remaining checks in [schema-v2-validation.md](schema-v2-validation.md) |
| #45 manual browser/clipboard/disk/blocker QA | Pending |
| Release commit and date/time | Pending |
| Dashboard and insight URLs | Pending |
| Production raw-event and canary results | Pending |
| Dated post-launch review task | Pending |
