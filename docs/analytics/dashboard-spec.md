# Issue #46: product analytics dashboard

This is the reviewable definition of the production dashboard. Create the saved
insights in the existing PostHog EU project once the production gates in
[architecture-v1.md](architecture-v1.md) pass. The repository owner selected a
single project for local validation and production on 2026-10-02. Exclude local
sandbox events from production reporting with the filters below. Project
settings, retention and usage allowance remain shared.

## Shared settings

- Source: PostHog product events only. Cloudflare Web Analytics remains a
  separate traffic and performance baseline. Never divide a Cloudflare count
  by a PostHog count.
- Filter every event step with `environment = production` and the deployed
  `analytics_schema_version`. Keep older schema versions separate when comparing
  across a schema change.
- Set project timezone to `Asia/Bangkok`. Show a daily trend and a selectable
  date range beginning on the production release date. Mark release and schema
  changes with dated annotations.
- Funnel order: Sequential, so intermediate events are allowed. Start with a
  30-minute conversion window, record it in each insight description, and
  revisit it from observed journey timing. A window crossing midnight can
  lose a cookieless identity match because the provider rotates its salt daily.
- Label every chart as observed traffic. DNT/GPC, blockers, offline use and
  delivery failures remove observations. Weekly or monthly unique-person counts
  are not exact people counts in cookieless mode.

## Funnel insights

| Insight | Step A | Step B | What the result means |
| --- | --- | --- | --- |
| Acquisition | `generator_viewed` | `generator_started` | An observed Generator view led to the first non-empty input. |
| Activation | `generator_started` | `qr_exported` | An observed start led to a successful Copy API write or download initiation. |
| App interest | `generator_viewed` | `app_store_clicked` | An observed Generator view was followed by an App Store link click. |
| App interest after export | `qr_exported` | `app_store_clicked` | An observed export was followed by an App Store link click. |

Use PostHog's funnel counts and conversion calculation for both steps. Do not
manually combine event totals or Cloudflare pageviews. `app_store_clicked` is
interest, not an install or purchase. The `app_store_clicked.source` breakdown
can show which CTA was used; do not restrict the main funnel to only the
`generator_cta` source because header and footer links are also valid clicks.

## Export behavior

Create trends of total `qr_exported` events, broken down separately by `method`
(`copy` or `download`), `export_size`, `module_shape`, `finder_shape`,
`reliability`, and `center_type`. Label these as export actions rather than
unique users. A person may export more than once. A browser download event
means initiation, not confirmed storage on disk.

## Quality

Use total `qr_generation_completed` events for each denominator. Break down
settled outcomes by the approved `outcome` enum. Show the verified rate as
`outcome = verified` divided by all settled outcomes and show each safe failure
category separately. Show the warning rate as `warning_count > 0` divided by
all settled outcomes. Break warning categories down by the approved boolean
properties once the warning-category schema change is deployed; never send or
chart warning text, QR content or raw errors.

A quality event represents the latest configuration after 600 ms of no change
and completion of rendering or verification. The browser deduplicates identical
configurations and caps quality events at 256 per document. It is not a count of
all render attempts, all input changes, or people deliberately finishing a QR.

## Delivery health

If PostHog exposes a reliable ingestion or delivery diagnostic for this
project, link that insight or operational view with its exact definition.
Otherwise mark delivery health as unavailable. Event totals alone cannot
estimate how much traffic was blocked or opted out.

## Dashboard description

Put the shared settings and limitations above in a visible dashboard text card,
and link this specification. Record each saved insight URL and dashboard URL in
the rollout record. Compare production canary journeys with the saved funnels
before treating the dashboard as validated.
