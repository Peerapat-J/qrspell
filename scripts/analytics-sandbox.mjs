import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const host = "127.0.0.1";
const port = 41741;
const contract = JSON.parse(readFileSync(new URL("../docs/analytics/event-schema-v1.json", import.meta.url), "utf8"));
const browserContract = JSON.stringify({
    events: contract.events,
    providerTransportProperties: contract.provider_transport_property_allowlist,
}).replaceAll("<", "\\u003c");

const html = String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://eu.i.posthog.com; connect-src https://eu.i.posthog.com; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'">
  <title>QRSpell analytics sandbox</title>
  <style>body{font:16px system-ui;max-width:760px;margin:48px auto;padding:0 20px}label,input,button{display:block;margin:12px 0}input{width:100%;padding:10px}button{padding:10px 14px}pre{white-space:pre-wrap;background:#f4f4f4;padding:16px}</style>
  <script src="https://eu.i.posthog.com/static/array.js"></script>
</head>
<body>
  <h1>QRSpell analytics sandbox</h1>
  <p><strong>Privacy revision 3:</strong> GeoIP disabled; audit transport is uncompressed.</p>
  <p>Local-only validation page. The token stays in page memory.</p>
  <label for="token">Public PostHog project token (phc_...)</label>
  <input id="token" type="password" autocomplete="off" spellcheck="false">
  <button id="initialize">Initialize sandbox</button>
  <button id="journey" disabled>Send safe journey</button>
  <button id="download" disabled>Send download export</button>
  <pre id="status">Not initialized.</pre>
  <script>
    const status = document.querySelector('#status');
    const journey = document.querySelector('#journey');
    const download = document.querySelector('#download');
    const contract = ${browserContract};
    const base = Object.freeze({ analytics_schema_version: 1, environment: 'sandbox' });
    const settings = Object.freeze({ module_shape: 'square', finder_shape: 'rounded', export_size: 512, reliability: 'Q', center_type: 'none' });
    const approvedEvents = new Set(Object.keys(contract.events));
    const providerTransportProperties = new Set(contract.providerTransportProperties);
    const log = [];
    let initialized = false;

    window.addEventListener('load', () => {
      status.textContent = window.posthog?.init
        ? 'Privacy revision 3 ready. Enter the public project token.'
        : 'PostHog test SDK did not load. Check the Network panel.';
    });

    function isScalar(value) {
      return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
    }

    function validateBusinessProperties(name, properties) {
      const definition = contract.events[name];
      if (!definition) return false;
      const allowed = new Set(Object.keys(definition.properties));

      if (Object.keys(properties).some((property) => !allowed.has(property))) return false;
      if (definition.required.some((property) => !Object.hasOwn(properties, property))) return false;

      return Object.entries(properties).every(([property, value]) => {
        if (!isScalar(value)) return false;
        const rule = definition.properties[property];
        if (Object.hasOwn(rule, 'const') && value !== rule.const) return false;
        return !rule.enum || rule.enum.includes(value);
      });
    }

    function sanitizePostHogEvent(event) {
      const definition = event && contract.events[event.event];
      if (!definition || !event.properties) return null;

      const businessProperties = {};
      for (const property of Object.keys(definition.properties)) {
        if (Object.hasOwn(event.properties, property)) {
          businessProperties[property] = event.properties[property];
        }
      }
      if (!validateBusinessProperties(event.event, businessProperties)) return null;

      const properties = { ...businessProperties };
      for (const property of providerTransportProperties) {
        const value = event.properties[property];
        if (isScalar(value)) properties[property] = value;
      }
      properties.$geoip_disable = true;

      return {
        uuid: event.uuid,
        event: event.event,
        properties,
        timestamp: event.timestamp
      };
    }

    function safeCapture(name, properties) {
      if (!approvedEvents.has(name) || !validateBusinessProperties(name, properties)) {
        status.textContent = 'Analytics event rejected by the local contract.';
        return false;
      }
      try {
        window.posthog.capture(name, properties, { send_instantly: true });
      } catch {
        // Analytics failure must never block the product action being measured.
      }
      log.push({ name, properties });
      status.textContent = JSON.stringify(log, null, 2);
      return true;
    }

    document.querySelector('#initialize').addEventListener('click', () => {
      if (initialized) return;
      const token = document.querySelector('#token').value.trim();
      if (!/^phc_[A-Za-z0-9]+$/u.test(token)) {
        status.textContent = 'Enter the public phc_ project token. Do not enter a phx_ Personal API key.';
        return;
      }
      if (!window.posthog?.init) {
        status.textContent = 'PostHog test SDK did not load. Check the Network panel.';
        return;
      }
      const doNotTrack = navigator.doNotTrack?.toLowerCase();
      if (navigator.globalPrivacyControl === true || doNotTrack === '1' || doNotTrack === 'yes') {
        status.textContent = 'Analytics disabled by the browser privacy signal. No event was sent.';
        return;
      }
      window.posthog.init(token, {
        api_host: 'https://eu.i.posthog.com',
        ui_host: 'https://eu.posthog.com',
        defaults: '2026-05-30',
        cookieless_mode: 'always',
        person_profiles: 'never',
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        capture_exceptions: false,
        disable_session_recording: true,
        disable_surveys: true,
        disable_external_dependency_loading: true,
        advanced_disable_flags: true,
        save_campaign_params: false,
        save_referrer: false,
        respect_dnt: true,
        request_batching: false,
        disable_compression: true,
        before_send: sanitizePostHogEvent
      });
      initialized = true;
      document.querySelector('#token').value = '';
      document.querySelector('#token').disabled = true;
      document.querySelector('#initialize').disabled = true;
      journey.disabled = false;
      download.disabled = false;
      status.textContent = 'Privacy revision 3 initialized. No event has been sent.';
    });

    journey.addEventListener('click', () => {
      safeCapture('site_page_viewed', { ...base, route: 'generator' });
      safeCapture('generator_viewed', { ...base });
      safeCapture('generator_started', { ...base });
      safeCapture('qr_generation_completed', { ...base, ...settings, outcome: 'verified', warning_count: 0 });
      safeCapture('qr_exported', { ...base, ...settings, method: 'copy' });
    });

    download.addEventListener('click', () => {
      safeCapture('qr_exported', { ...base, ...settings, method: 'download' });
    });
  </script>
</body>
</html>`;

const server = createServer((request, response) => {
    if (request.url !== "/" && request.url !== "/favicon.ico") {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
    }
    if (request.url === "/favicon.ico") {
        response.writeHead(204);
        response.end();
        return;
    }
    response.writeHead(200, {
        "cache-control": "no-store",
        "content-security-policy": "default-src 'none'; script-src 'unsafe-inline' https://eu.i.posthog.com; connect-src https://eu.i.posthog.com; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'",
        "content-type": "text/html; charset=utf-8",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
    });
    response.end(html);
});

server.listen(port, host, () => {
    console.log(`QRSpell analytics sandbox: http://${host}:${port}/`);
    console.log("Press Ctrl+C to stop.");
});
