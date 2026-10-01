# Schema-v2 provider validation

Issue: [#46](https://github.com/Peerapat-J/qrspell/issues/46)

The existing QRSpell EU project is selected for local validation and production.
Local test events carry `environment = sandbox`. Production reporting must use
`environment = production`, schema version 2 and the production release date
onward on every insight and funnel step. Production capture remains disabled
until the pre-release checks in [production-rollout.md](production-rollout.md)
pass.

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

## Remaining provider and manual checks

| Check | Status |
| --- | --- |
| Schema-v2 warning event received with four boolean flags and matching count | Pass for the observed case |
| Verified outcome with zero warnings and four false flags received | Pending |
| Safe journey events and `qr_exported` for both `copy` and `download` received | Pending provider evidence |
| Ordered funnel and method/property breakdown using sandbox and schema-v2 filters | Pending |
| Final outbound body and provider-added properties contain only approved data | Pending v2 evidence |
| Local-origin analytics cookies, localStorage and sessionStorage absent | Pending v2 evidence |
| Real Generator browser, clipboard, disk and tracker-blocker checks from #45 | Pending |
| Remaining project settings, retention and DPA review | Pending |
| Production delivery, dashboard and canary checks | Pending reviewed release |

The earlier [v1 validation](sandbox-validation.md) remains historical evidence.
Do not reuse it to mark these v2 checks complete.
