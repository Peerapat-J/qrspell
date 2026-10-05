# Schema-v2 provider validation

Issue: [#46](https://github.com/Peerapat-J/qrspell/issues/46)

The existing QRSpell EU project is selected for local validation and production.
Local test events carry `environment = sandbox`. Production reporting must use
`environment = production`, schema version 2 and the production release date
onward on every insight and funnel step. The owner approved production
activation on 2026-10-05 and the feature branch enables the reviewed EU project.
Live production receipt remains unverified until deployment; see
[production-rollout.md](production-rollout.md).

## 2026-10-02: warning event received

The repository owner initialized the local sandbox and used **Send safe
journey**, **Send download export** and **Send warning categories**. The local
page displayed seven event entries. This log records capture attempts; it does
not prove delivery of all seven events.

The owner then supplied a PostHog Activity screenshot with expanded
`qr_generation_completed` properties. Evidence reference:
`codex-clipboard-e47d396c-26b1-4421-9bc7-6d8491fa13cb.png`. The event's displayed
**Sent at** value was `2026-10-01T17:41:14.284Z` (2026-10-02 00:41:14.284
Asia/Bangkok).

| Observed property | Value |
| --- | --- |
| `analytics_schema_version` | `2` (number) |
| `environment` | `sandbox` |
| `outcome` | `decode_failed` |
| `warning_count` | `4` (number) |
| `warning_dense_content` | `true` (boolean) |
| `warning_inverted_modules` | `true` (boolean) |
| `warning_low_contrast` | `true` (boolean) |
| `warning_weak_center_reliability` | `true` (boolean) |
| GeoIP disabled | `true` |
| Person profile processing flag | `false` |
| Distinct ID | `$posthog_cookieless` transport marker |
| Library version | `1.435.5` |

**Pass for this case:** PostHog received the v2 warning event. The four warning
properties are booleans, and the count equals the number of true flags. The
`decode_failed` outcome is an intentional synthetic test case, not evidence of
a failure in the real Generator.

No QR content, filename, URL/referrer or GeoIP location properties are visible
in this screenshot. A screenshot of one event's Properties is not a complete
raw-request, provider-enrichment, storage or identity-rotation audit. The
processing flag is evidence of the requested control, not an independent check
of the project's People records.

The harness loads PostHog's live EU test SDK, which reported version `1.435.5`.
Production uses the vendored `1.434.17` build. This result proves the new fields
were ingested through the harness; it does not replace checks of the production
adapter and its final request envelope.

## 2026-10-02: export and page-event records inspected

The owner supplied the expanded Raw record for `qr_exported` with
`method = copy` as text, followed by screenshots of the download, Generator
view and page view records. The Activity view showed seven entries in the test
batch. Combined screenshots show all five harness event types, including
`generator_started` and both `qr_generation_completed` entries. Complete
properties for `generator_started` and the verified quality case were not
inspected at this stage; the latter is covered by the 2026-10-05 evidence below.

| Record | Evidence | Observed result |
| --- | --- | --- |
| `qr_exported`, `method = copy` | Expanded Raw text supplied in chat; Sent at `2026-10-01T17:41:09.793Z` | Received; all displayed properties match the export contract |
| `qr_exported`, `method = download` | `codex-clipboard-51467e63-1286-4187-a770-06ebfe12de1c.png`; Sent at `2026-10-01T17:41:10.3Z` | Received; all displayed properties match the export contract |
| `generator_viewed` | `codex-clipboard-7e3a6688-e1be-4253-ab2f-fb8a4cec480c.png` | Received; only the base business properties and approved transport fields are present |
| `site_page_viewed`, `route = generator` | `codex-clipboard-6b496405-f9e6-4136-8c24-15d842e65bfc.png` | Received; the finite route value is present without a page URL |

All four complete Raw records have `analytics_schema_version = 2`,
`environment = sandbox`, `person_mode = propertyless`,
`$process_person_profile = false` and `$geoip_disable = true`. Their business
properties match the schema. The export settings are `center_type = none`,
`export_size = 512`, `finder_shape = rounded`, `module_shape = square` and
`reliability = Q`. The records contain the cookieless transport marker, SDK
metadata, send time and public token. Top-level ingestion metadata includes
created time, event time, team ID, event UUID and an empty `elements_chain`.
No QR content, filename, full URL/query/hash, referrer, GeoIP location or raw
error properties are present in these four records.

**Pass for these records:** both export methods, Generator view and page view
were ingested with the expected schema and properties. Event UUIDs and
server-created timestamps are ingestion metadata, not an added business
property. No public token value or complete browser screenshot is stored in
this evidence document.

These observations do not prove the ordered funnel, browser storage state or
the final outbound HTTP body. They also do not test a real clipboard write,
disk download or production adapter; the harness emits synthetic events.

## 2026-10-05: verified outcome and export breakdown inspected

The owner supplied two expanded Activity Properties screenshots:
`codex-clipboard-cb95525b-1114-4887-bb1e-5a5b50858adb.png` repeats the warning
case above; `codex-clipboard-bb8cb9e9-2df2-4ad5-9866-c7a857dca74b.png` shows
its no-warning counterpart from the same 2026-10-02 synthetic batch. The latter
has **Sent at** `2026-10-01T17:41:09.792Z`.

| Observed property | Verified case | Warning case |
| --- | --- | --- |
| `analytics_schema_version` | `2` (number) | `2` (number) |
| `environment` | `sandbox` | `sandbox` |
| `outcome` | `verified` | `decode_failed` |
| `warning_count` | `0` (number) | `4` (number) |
| `warning_dense_content` | `false` (boolean) | `true` (boolean) |
| `warning_inverted_modules` | `false` (boolean) | `true` (boolean) |
| `warning_low_contrast` | `false` (boolean) | `true` (boolean) |
| `warning_weak_center_reliability` | `false` (boolean) | `true` (boolean) |

Both displayed records retain GeoIP disabled, person profile processing false,
the cookieless transport marker and SDK version `1.435.5`. The verified case
has the same approved export settings described above. **Pass for these two
cases:** the provider received the expected outcome, numeric count and four
boolean flags, with the count matching the number of true categories. These
Properties screenshots do not replace complete Raw or outbound network audits,
and the synthetic verified event does not test the real QR verifier.

The owner also supplied
`codex-clipboard-dc3cf205-e3b3-4a97-8d40-958791e68570.png` for the saved insight
**QRSpell sandbox — Export method breakdown**. The visible configuration is
`qr_exported`, **Total count**, breakdown `method`, and a **Match all** group
containing `environment = sandbox` AND `analytics_schema_version = 2`.
The view was computed a few seconds earlier and displayed **No changes**.
Within **Last 7 days**, both the detailed totals and the 2026-10-02 (UTC+7)
tooltip show `copy = 1` and `download = 1`; the 2026-09-28 counts visible before
the schema filter are excluded. **Pass for this breakdown:** v2 filtering and
method counts match the two synthetic export events. This does not verify the
ordered funnel, other property breakdowns or production reporting.

## 2026-10-05: automated SDK, network and storage checks

The following focused browser run passed **29 tests**, with no failures or
skips, on the current schema-v2 branch:

```sh
node --test --test-name-pattern='privacy-safe PostHog foundation|Generator product events audit' scripts/qr-generator-browser.test.mjs
```

The run exercises the vendored PostHog SDK and actual Generator event call
sites. It inspects the complete outbound batch body and approved property
values, checks private canaries in URLs, headers and encoded request bodies,
and checks that cookies, localStorage and sessionStorage are empty. It also
covers blocked modules/SDK/endpoints, timeout, HTTP 4xx/5xx, offline, DNT and
GPC while Generator actions remain usable.

**Pass within the automated test environment:** schema-v2 SDK payload, storage
and failure-handling checks. The tests use fake sandbox tokens and intercept
all external requests. Clipboard writes are stubbed and downloads are initiated
but denied. These results close the automated checks without proving live
provider behavior, a real clipboard paste, a saved/opened file or a real tracker
blocker.

GitHub was checked on the same date: [#45](https://github.com/Peerapat-J/qrspell/issues/45)
is closed and [PR #54](https://github.com/Peerapat-J/qrspell/pull/54) is merged.
The implementation does not need to be repeated. That repository status alone
is not evidence that the separate manual effects above were checked.

## 2026-10-05: owner reports real manual checks passed

The owner tested the real Generator served locally with an in-memory sandbox
configuration and the existing project's public token. The temporary QA server
leaves the repository production configuration disabled and tokenless. It also
provides a second page whose additional CSP blocks analytics connections.

The owner reported in chat:

- The normal and blocked-analytics journeys passed.
- Copy produced an image that could be pasted into another application.
- The downloaded PNG opened successfully.
- The Generator remained usable both with and without the owner's tracker
  blocker enabled.
- Discard client IP data is enabled in the PostHog project.

**Pass as owner-reported manual evidence:** normal and blocked Generator
behavior, actual clipboard paste, opened PNG and tracker-blocker compatibility.
These checks are separate from the automated clipboard stubs and denied
downloads. The tracker-blocker product/version and browser version were not
specified; no request trace was supplied. The report establishes product
usability, not independent proof that a blocker suppressed every analytics
request. Live production event, storage and blocker-suppression checks remain
part of the release canary.

## Remaining provider and manual checks

| Check | Status |
| --- | --- |
| Schema-v2 warning event received with four boolean flags and matching count | Pass for the observed case |
| Verified outcome with zero warnings and four false flags received | Pass for the observed Properties record on 2026-10-05 |
| Safe journey event names and `qr_exported` for both `copy` and `download` received | Pass for delivery; Raw inspected for both exports, Generator view and page view; `generator_started` properties still uninspected |
| Export method breakdown using sandbox and schema-v2 filters | Pass on 2026-10-05: copy and download each total 1 |
| Ordered funnel and other property breakdowns using sandbox and schema-v2 filters | Pending; the saved funnel screenshot did not show a fresh computation |
| Ingested properties contain only approved data | Pass for the four complete Raw records above; both quality cases inspected through Properties |
| Final outbound HTTP body contains only approved data | Pass in the automated v2 SDK/Generator tests; live production inspection remains part of the release canary |
| Local-origin analytics cookies, localStorage and sessionStorage absent | Pass in the automated v2 browser tests; live production storage inspection remains part of the release canary |
| Real Generator clipboard, disk and tracker-blocker checks | Pass as owner-reported manual evidence on 2026-10-05; production blocker-suppression trace remains part of the canary |
| Provider review and owner decision | Free plan confirmed; code capture settings and current provider documents reviewed on 2026-10-05. Owner accepted Free retention without a guaranteed 12-month deletion bound and the reviewed processing boundaries; activation approved on 2026-10-05; see [provider review](provider-review-2026-10-05.md). |
| Production delivery, dashboard and canary checks | Pending reviewed release |

The earlier [v1 validation](sandbox-validation.md) remains historical evidence.
Do not reuse it to mark these v2 checks complete.
