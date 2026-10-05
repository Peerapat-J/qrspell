# PostHog provider review: 2026-10-05

## Evidence and release status

The owner confirmed on 2026-10-05 that the existing QRSpell EU project still
uses the Free plan, without adding a card or changing plans. Reuse that project;
no second project or upgrade is required. Clipboard paste, opened PNG, normal
and blocked journeys and a real tracker blocker passed by owner report. See
[schema-v2-validation.md](schema-v2-validation.md). Do not repeat those checks
just to collect more screenshots.

The code and provider documents have been reviewed below. After this review,
the owner explicitly instructed: “ยอมรับเงื่อนไข Free แล้วเปิด production ต่อ”.
This accepts proceeding with the Free-plan retention and international
processing boundaries presented in the review. The activation change updates
the internal retention policy and enables the existing EU project on the
feature branch. This records release authorization, not deployment or a signed
DPA. No further owner confirmation or repeat Generator QA is required for this
activation change.

## Retention: correct the earlier interpretation

[PostHog pricing](https://posthog.com/pricing), reviewed on 2026-10-05, says
Free events/metadata have one year of guaranteed retention. Its FAQ also allows
cold storage after a year and possible later deletion. This is not a guarantee
that every copy is deleted by month 12. The owner's Free-plan confirmation
establishes the plan, not a deletion deadline.

The earlier Free-plan retention passes in
[sandbox-validation.md](sandbox-validation.md) establish the advertised window
only; they do not establish the maximum deletion bound in
[architecture-v1.md](architecture-v1.md#retention-and-deletion). That strict gate
was unresolved before the owner's explicit policy revision. Do not relabel
the earlier maximum-deletion gate as a verified provider capability or edit
historical records to imply provider deletion was inspected.

The owner chose to revise the internal policy to use Free-plan retention
without a guaranteed 12-month deletion bound. The activation change updates
both the architecture and rollout record accordingly. A dashboard date filter
does not delete older data. No upgrade or second project is part of the choice.

## DPA and processing locations

Reviewed the actual legal agreement at [PostHog DPA](https://posthog.com/dpa),
not its illustrative summaries. It describes processing on customer
instructions, customer responsibilities, breach handling, deletion/return at
service end and international transfers. Clause 10.2 permits processing
outside the protected area, including the US. EU Cloud is a primary storage
choice, not a promise that all processing stays in the EU.

Reviewing this text does not accept or sign it for the owner. The DPA preview
says only a signed agreement is binding. If the owner chooses to execute a DPA,
use the [EU legal page](https://eu.posthog.com/legal) and complete that action
personally. This record does not claim a signed agreement exists or determine
which legal obligations apply to every website.

The [subprocessor list](https://posthog.com/subprocessors), updated June 12,
2026 and reviewed October 5, lists these Core Services vendors:

| Vendor | Listed purpose and location relevant to EU Cloud |
| --- | --- |
| AWS | Cloud storage in Germany |
| Wiz | Security vulnerability operations in Germany and France |
| PlanetScale | Database operations/monitoring in Germany |
| Modal Labs | Isolated compute in Germany |
| Cloudflare | Edge/routing/security; worldwide transit locations |

This is the published Core Services list, not evidence that every vendor was
in the path of a sampled QRSpell event. It does not cover account/support data
or claim a complete review of the site's AI/Internal tabs. AI features,
destinations, warehouse imports and third-party integrations remain outside
the approved QRSpell event use. Re-review the provider list after a relevant
feature or provider change.

## Schema-v2 and collection configuration

Version 2 adds four boolean categories for warnings already displayed by the
Generator. It adds no QR content, identity, URL, filename or free-form error
field. The existing engineering choice of no analytics banner and respecting
DNT/GPC is unchanged; this is not a blanket legal-compliance conclusion.

The current adapter, `assets/analytics-posthog.mjs`, explicitly disables
autocapture, automatic pageviews/pageleave, exceptions, dead clicks, heatmaps,
performance capture, replay, surveys, conversations, tours, experiments, flags
and external dependency loading. Persistence is disabled, profiles are never
created, and `before_send` rebuilds an allowlisted envelope. Automated tests
exercise the actual pinned SDK; provider Raw records and owner manual results
are documented separately. This is code/runtime evidence, not a claim that
every project UI switch has been inspected.

Previously confirmed project controls remain: EU Cloud, Asia/Bangkok,
cookieless tracking, client IP discard and Web vitals autocapture off. No new
settings screenshot is required for these recorded controls.

## Prepared activation and rollback

`scripts/analytics-release-policy.mjs` pins the reviewed EU public token and
rejects activation until `productionCaptureApproved` is explicitly true.
`scripts/validate-static-site.mjs` uses that policy without changing the SDK,
CSP or route checks. Disabled/tokenless remains a valid rollback.

The owner resolved the provider decisions on 2026-10-05. The activation change
sets `productionCaptureApproved = true` and enables `assets/analytics-config.mjs`
with the existing EU public token together, records the decision and reruns
validation. Tests cover the approved token, another
project, missing/malformed fields, wrong environments and rollback. An
approval flag is a review guard, not proof of provider compliance.

Deployment goes through the normal repository workflow. Production dashboard,
live event and canary verification follow deployment; issue #46 stays open
until that evidence is complete.

## Validation of the prepared change

Completed on 2026-10-05: schema generation check passed, static-site validation
passed and the full `node --test scripts/*.test.mjs` suite passed **274 tests,
zero failures, zero skips**. The first sandboxed run could not bind localhost
(`EPERM`); rerunning with local-fixture permission completed successfully in
43.3 seconds. Browser tests intercept external traffic, use fake tokens and
stub clipboard/deny disk downloads. These results do not assert production
provider delivery. The separate owner-reported real clipboard/disk/blocker
checks already passed and need no repetition here.

Code preparation commit: `f104201` (`feat(analytics): prepare production config
validation`). At that preparation step the config was disabled/tokenless. The
subsequent owner-approved activation enables it on this branch. Deployment,
push and PR creation are separate from this local change.

## Activation validation after owner approval

On 2026-10-05 (Asia/Bangkok), with the enabled production config and reviewed
public token in place: generated schema check passed, the full suite passed
**274 tests, zero failures/skips** in 42.8 seconds, static-site validation passed
and `git diff --check` passed. Browser fixtures intercepted external traffic;
this run did not send production events. The production environment still
requires the exact `https://qrspell.app` origin, respects DNT/GPC and declines
webdriver; local previews do not become production traffic. Deploy the reviewed
activation commit before recording the live release date or provider receipt.
