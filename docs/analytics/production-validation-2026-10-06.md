# Production rollout evidence — 2026-10-06

This dated record accompanies [production-rollout.md](production-rollout.md)
and [dashboard-spec.md](dashboard-spec.md). Values below are an observed canary
snapshot from 2026-10-06, not current totals or representative product results.

## Release

[PR #55](https://github.com/Peerapat-J/qrspell/pull/55) merged production activation
and the cache-version/documentation review fixes into `dev`.
[PR #56](https://github.com/Peerapat-J/qrspell/pull/56) merged into `main` on
2026-10-05 at 23:32:49 Asia/Bangkok (16:32:49 UTC).

- Release commit: `9b56f728dcb9c7b99b843ff7ae4afd17e117f5fe`.
- Pages build: `built`, updated 2026-10-05 23:33:22 Asia/Bangkok (16:33:22 UTC).
- [Pages workflow](https://github.com/Peerapat-J/qrspell/actions/runs/37341670256)
  and [main CI](https://github.com/Peerapat-J/qrspell/actions/runs/37341673408)
  succeeded; GitHub deployment/CI metadata was rechecked on 2026-10-06.
- Public Generator: [qrspell.app](https://qrspell.app/qr-code-generator/).
- Schema: `analytics_schema_version = 2`; environment: `production`.

## Saved dashboard and insights

[QRSpell production](https://eu.posthog.com/project/286136/dashboard/999543)
uses the existing EU project 286136. All 17 saved tiles rendered after refresh
on 2026-10-06. No public sharing link was created and no project/privacy/access
settings were changed during dashboard authoring. Existing sandbox insights
were preserved.

| View | Saved insight |
| --- | --- |
| Acquisition | [Acquisition](https://eu.posthog.com/project/286136/insights/aprwNKHD) |
| Activation | [Activation](https://eu.posthog.com/project/286136/insights/dDxRvW4i) |
| App interest | [App interest](https://eu.posthog.com/project/286136/insights/FNu4US6C) |
| App interest after export | [App interest after export](https://eu.posthog.com/project/286136/insights/Vrebblvr) |
| Exports by method | [Exports by method](https://eu.posthog.com/project/286136/insights/yYAKHDeH) |
| Exports by size | [Exports by size](https://eu.posthog.com/project/286136/insights/vx10T17H) |
| Exports by module shape | [Exports by module shape](https://eu.posthog.com/project/286136/insights/jDs8GbEZ) |
| Exports by finder shape | [Exports by finder shape](https://eu.posthog.com/project/286136/insights/QoR1q0pS) |
| Exports by reliability | [Exports by reliability](https://eu.posthog.com/project/286136/insights/YVcMeW0y) |
| Exports by center type | [Exports by center type](https://eu.posthog.com/project/286136/insights/3untIweo) |
| Generation outcomes | [Generation outcomes](https://eu.posthog.com/project/286136/insights/tT0oj58a) |
| Verified rate | [Verified rate](https://eu.posthog.com/project/286136/insights/R8Ns3mpW) |
| Warning rate | [Warning rate](https://eu.posthog.com/project/286136/insights/cp7umtHW) |
| Inverted modules warning rate | [Inverted modules warning rate](https://eu.posthog.com/project/286136/insights/7iUtn84m) |
| Low contrast warning rate | [Low contrast warning rate](https://eu.posthog.com/project/286136/insights/198QvXYa) |
| Dense content warning rate | [Dense content warning rate](https://eu.posthog.com/project/286136/insights/5O6t9EIf) |
| Weak center reliability warning rate | [Weak center reliability warning rate](https://eu.posthog.com/project/286136/insights/QN9KpmWc) |

## Query verification

Actual saved query definitions were read back from their native insight views.
Every insight and every funnel step uses production AND schema-v2 filters, the
release lower bound `2026-10-05T23:33:22+07:00` and a moving end. Internal/test
exclusion is enabled. Time series group by day in Asia/Bangkok.

The four funnels are sequential/ordered, count unique users and use a 30-minute
conversion window. Intermediate events are allowed. App Store steps have no
placement restriction. The minute interval on the app-interest query was removed
so its moving end is not truncated to the current minute.

Five warning views use saved HogQL replacements because the original Trends
queries rendered blank despite a positive denominator. The old five were
detached from the dashboard, not deleted. Each replacement computes
`countIf(predicate) / nullIf(count(), 0)` over `qr_generation_completed` with
all six settled outcomes (`verified`, `capacity_rejected`, `decode_failed`,
`decoded_mismatch`, `render_failed`, `center_image_rejected`). Predicates are
`toFloat(properties.warning_count) > 0` or the corresponding warning property
`= 'true'`, matching HogQL JSON property lookup. The queries include explicit
release/now bounds and `AND {filters}`; source filters enable internal/test
exclusion and a dynamic date end. Percent formatting uses two decimals; the
ratio is not multiplied by 100 or coerced from null to zero.

A temporary, unsaved Yesterday date selection on the warning-rate insight
removed the October 6 point and returned an empty plot. This verified that date
filters apply and absent data is not presented as a measured 0%. The canonical
dashboard was restored with no date override.

## Observed canary snapshot

The owner supplied a production/schema-v2 Activity screenshot on 2026-10-06
(`codex-clipboard-ae9a97f7-cc0b-4b95-8a23-d9605b718b5f.png`). Saved charts were
reconciled against one another:

| Measurement | Observed result |
| --- | --- |
| Acquisition: viewed → started | 1 → 1 identity; 100%; 11 seconds |
| Activation: started → exported | 1 → 1 identity; 100%; 19 seconds |
| App interest: viewed → App Store click | 1 → 0 |
| App interest after export | 1 → 0 |
| Export actions | Copy 2 + Download 1 = 3 |
| Export size | 512: 3 |
| Module shape | rounded: 2; square: 1 |
| Finder shape | rounded: 2; square: 1 |
| Reliability | Q: 2; M: 1 |
| Center type | text: 2; none: 1 |
| Settled outcomes | verified 19 + decode_failed 5 = 24 |
| Verified rate | 19 / 24 = 79.17% |
| Warning rate and each of four warning-category rates | 0 / 24 = 0% |

The tiny funnel sample and repeated verification events do not establish a
representative conversion rate. No production App Store click or nonzero
warning numerator was observed during dashboard verification. Empty/zero views
are valid results, not proof of those event paths. No synthetic production
events were sent to populate them. The evidence does not claim receipt of all
seven approved event names, all six quality outcomes, or a complete production
Raw audit of provider-added properties.

## Existing validation and interpretation limits

The owner reported real clipboard paste, opened PNG and normal/blocked/tracker-
blocker journeys passing on 2026-10-05, both with and without a blocker. This is
owner-reported manual evidence, separate from the automated schema-v2 SDK,
network/storage, DNT/GPC and failure checks recorded in
[schema-v2-validation.md](schema-v2-validation.md). These tests were not repeated
for this documentation update. Sandbox Raw evidence is not a production Raw audit.

Saved dashboard and funnel descriptions disclose:

- Observed traffic only; opt-outs, blockers, offline operation and delivery
  failures reduce coverage. No reliable delivery-coverage view is available.
- Cookieless identity rotates daily. Weekly/monthly unique counts are not exact
  people counts; a journey crossing midnight may lose its identity continuity.
- Copy records a successful clipboard write; Download records initiation, not
  a durable disk save. App Store clicks are interest, not installations.
  Repeated export actions are not additional people.
- Quality counts are settled automatic verification after 600 ms, deduplicated
  for identical configurations and capped at 256 configurations per document.
  They do not measure deliberate completion or every editor change.
- Cloudflare remains separate traffic/performance context; its counts are not
  used as PostHog conversion denominators.

Coverage notes and the specification link are readable in the saved dashboard
header. The saved text card remains narrow and scrollable after unsuccessful
native resize attempts; this is a presentation limitation, not a missing graph.

## Follow-up status

[Issue #57](https://github.com/Peerapat-J/qrspell/issues/57) was created on
2026-10-06 and assigned to `Peerapat-J`, with review date **2026-10-20
(`Asia/Bangkok`)** after approximately two weeks of observation. The owner reports
normal use without problems; production stays enabled during observation. The
issue covers noise, unused fields/events, coverage, retention, representative
production Raw sampling and an adequate sample before changing product defaults.
Task creation is complete; review results and remaining Raw evidence are pending.
Neither this record nor task creation closes Issue #46.
