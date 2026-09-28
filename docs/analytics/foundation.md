# Analytics foundation (#42)

Production tracking is disabled in `assets/analytics-config.mjs`, with no
production token. The static-site validator enforces that gate. No website
or Generator events are instrumented by this change; #43 and #44 own those
call sites. #45 and the architecture-v1 production gates must pass before
changing the production configuration and its validation gate.

## API

```js
import { captureEvent } from "../../assets/analytics.mjs";
captureEvent("site_page_viewed", { route: "generator" });
```

`initAnalytics()` resolves to a readiness boolean and never rejects.
`captureEvent()` returns whether the wrapper locally accepted the event;
it does not report delivery, clipboard success, or download completion.
Schema version and environment are owned by the wrapper and cannot be
overridden by callers. Events before readiness are dropped; there is no
event buffer or persistent retry queue in the wrapper.

`disableAnalytics()` disables the instance for the remainder of the page,
including its provider before-send hook. It does not persist an opt-out.
The v1 opt-out policy remains DNT/GPC, with no new storage or opt-out UI.

The optional bootstrap is a separate HTML module and dynamically imports
the wrapper. The provider adapter dynamically imports the pinned slim
no-external PostHog ESM build only after initialization is permitted.
Generator startup never waits for either import or analytics readiness.
Initialization has a three-second timeout; a late provider cannot re-enable
an instance after that timeout.

## Runtime gates and data handling

- Production requires the exact `https://qrspell.app` origin and declines
  webdriver contexts. Localhost, other ports, previews, and file URLs are
  disabled even if an enabled production config is accidentally supplied.
- Explicit sandbox instances are confined to localhost/loopback and emit
  `environment = sandbox`. Automated browser tests use a fake public token
  and intercept every external request; no real provider token is needed.
- DNT/GPC and offline state are checked before initialization and capture.
- No analytics cookies, localStorage, or sessionStorage are used. The SDK
  uses cookieless mode, memory persistence, and disabled persistence.
- `event-schema-v1.json` is the source of truth. Regenerate its deeply frozen
  browser module with `node scripts/generate-analytics-schema.mjs`; CI checks
  it with `--check`.
- Unknown event names, properties, missing required fields, or unapproved
  values reject the entire event. Property getters, symbol keys, structured
  values, and inherited properties are not accepted.
- Before send, provider enrichment is discarded and transport fields are
  rebuilt with the cookieless marker, no person processing, exact SDK version,
  expected project token, and `$geoip_disable: true`.
- Requests are unbatched and uncompressed so their final envelopes can be
  inspected. SDK network errors remain optional and are not user-facing.
- Generator CSP retains the exact Cloudflare script/ingest permissions and
  adds only `https://eu.i.posthog.com` to `connect-src`. The SDK stays local;
  no PostHog script origin, wildcard, or unsafe-eval is allowed.

## Automated verification

```sh
node scripts/generate-analytics-schema.mjs --check
node --test scripts/*.test.mjs
node scripts/validate-static-site.mjs
```

The foundation browser test uses the real pinned SDK and intercepts all
external traffic. It audits final event bodies and storage, and checks
Generator Verify, Copy, Download, and Reset with SDK/wrapper load failures,
blocked ingestion, timeout, HTTP 400/503, offline signal, DNT, and GPC.
Copy uses a clipboard stub; browser downloads are initiated and denied by
the test harness. Physical clipboard/disk and tracker-blocker QA remain manual.

The complete content/image/referrer/error canary matrix after instrumentation
and the production Privacy Policy remain #45 release gates.

## Manual checklist


For manual non-production validation on localhost, initialize an explicit instance
in DevTools using the non-production project's public `phc_` token (never a
personal API key):

```js
const { createAnalytics } = await import("/assets/analytics.mjs");
const sandbox = createAnalytics({
    config: { enabled: true, environment: "sandbox", token: "phc_REPLACE_WITH_SANDBOX_PROJECT_TOKEN" },
});
await sandbox.initAnalytics();
sandbox.captureEvent("site_page_viewed", { route: "generator" });
sandbox.captureEvent("generator_viewed");
// Disable for the remainder of this page when finished.
sandbox.disableAnalytics();
```

1. Serve the checkout on localhost and open Generator. In Network, confirm
   production boot loads no PostHog SDK or ingestion request. Generate a QR,
   verify it, copy/paste its PNG, download/open its PNG, and reset.
2. Use a non-production EU project only for an explicit local sandbox instance
   through the API above. Confirm no event is sent merely by initialization;
   send approved test events and inspect their complete requests and raw events.
   Check the cookieless marker, no person processing, no GeoIP enrichment,
   and empty local-origin analytics cookie/localStorage/sessionStorage.
3. Block the SDK or EU ingestion host in DevTools, then repeat Generator
   actions. Repeat with offline, timeout, HTTP errors, and a tracker blocker.
4. Turn on DNT/GPC before initializing a sandbox instance. Confirm the SDK
   is not loaded and no event is sent. Check keyboard controls and navigation.
5. Record manual results separately. Do not insert a production token or
   enable public tracking as part of this checklist.

## Verification record — 2026-09-28

- Automated: all 124 tests passed, including the real pinned SDK network/storage
  audit and the existing Generator browser suite; no tests were skipped.
- Generated schema check and static-site validation passed.
- Browser test processes were closed after each run.
- Manual tracker-blocker, physical clipboard, disk-save, and raw EU project
  verification remain pending; automated interception does not prove delivery
  to the production provider.
- Production tracking remains disabled with an empty token.
