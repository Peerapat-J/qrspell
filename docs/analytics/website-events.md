# Website events (#43)

Production stays disabled. The optional bootstrap starts `site-analytics.mjs`;
all provider access remains behind `analytics.mjs`. The page lifecycle is held
in a WeakMap: repeated starts, including concurrent starts, do not duplicate
initialization, page views, or CTA listeners.

## Page views and App Store interest

Each HTML body declares a closed `data-analytics-route`. After initialization
succeeds, `site_page_viewed` fires once for that document. Reloading creates a
new document and a new view; hash changes and BFCache restores do not create
another view. Unknown routes produce no website events. `/legal/` remains an
immediate redirect to `/Acknowledgements/`: its short-lived document can leave
before analytics is ready, so a legal view is best effort and must not delay
the redirect. The destination reports its own acknowledgements document.

Each QRSpell Mac App Store link declares one stable `data-analytics-source`:
header, homepage_hero, generator_cta, or footer. The validator checks both the
destination and its position. Delegated click and middle-button auxclick
listeners handle nested elements and normal keyboard activation. Canceled,
right-button, unknown-source, and unrelated-link events are ignored.

Capture runs before native navigation without awaiting delivery, preventing
default, changing focus, or rewriting href/target/rel. Clicks before readiness
are dropped. SDK/module/network failures preserve native navigation. An App
Store click measures interest, not installation, purchase, or confirmed delivery.

## Campaign decision — 2026-09-29

The owner currently uses no UTM campaigns or social pages. **No UTM values are
registered or collected**, and referrer is not read. Example campaign values
in tests are fixtures only. UTM-looking personal data is dropped while the
safe page view and click still fire.

The approved parser keys are utm_source, utm_medium, and utm_campaign. It accepts
one occurrence per key, a query of at most 2048 characters, and a decoded value
of at most 64 characters. Values are trimmed, lowercased, and must match a
closed property enum in the event schema. Unknown keys, duplicate values,
URLs, email addresses, control characters, malformed values, and unregistered
names are dropped; values are never truncated into an approved name.

Attribution is a snapshot of the current document only. No cookies,
localStorage, sessionStorage, link rewriting, or cross-page campaign retention
are introduced. Full URL, query/hash, DOM text, and raw referrer are never sent.

Before a real campaign is used, add its reviewed normalized values as optional
utm_source/utm_medium/utm_campaign property enums to the applicable page-view
and click event definitions in event-schema-v1.json. Regenerate the browser
schema, add acceptance and final-envelope tests, and annotate the contract
change. Referrer collection needs a separate documented decision.

## Verification

Unit tests cover one-time readiness, routes, activation behavior, provider
failure, and hostile attribution inputs. Static validation checks every page
and CTA. Browser tests audit the actual pinned SDK envelopes and storage with
a fake sandbox token and interception of all external requests.

Manual tracker-blocker and real-provider delivery checks remain separate from
automated browser interception. Production activation remains gated by #45
and architecture-v1.md.

## Verification record — 2026-09-29

- All 155 tests passed with no skips (`node --test scripts/*.test.mjs`), including
  the existing QR Generator suite and the new website SDK-envelope/navigation
  suite. Syntax, generated-schema, contract, static-site, and diff checks passed.
- Browser tests intercepted the real pinned SDK with a fake sandbox token and
  config served only by the test fixture. Every external request was intercepted;
  no production provider data was sent. Local storage and cookies stayed empty.
- Native pointer/keyboard navigation used a same-tab App Store fixture so the
  destination was fully intercepted. The original href, `_blank` target, and
  `noopener noreferrer` were checked before the fixture changed target.
- Unit tests also cover middle-button activation and rejecting control
  characters in campaign values, including leading/trailing tabs and newlines.
- Manual checks remain: original new-tab/middle-click behavior, VoiceOver,
  a real tracker blocker, and delivery/raw-event inspection in an approved
  non-production provider project. Interception proves outgoing shape and
  failure behavior, not real provider delivery.
- No real UTM values are registered. Production remains disabled and tokenless;
  #45 and the architecture gates still govern activation.
