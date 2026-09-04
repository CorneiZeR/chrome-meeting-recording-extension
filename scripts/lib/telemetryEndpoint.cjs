'use strict';

/**
 * @file scripts/lib/telemetryEndpoint.cjs
 *
 * The telemetry endpoint's build-time policy, in one tested place: what a
 * configured endpoint must look like, and what a build does without one.
 */

const TELEMETRY_PATH = '/api/telemetry/batches';

const MISSING_ENDPOINT_WARNING =
  'TELEMETRY_ENDPOINT is not set; this build ships with anonymous diagnostics inert '
  + '(collected locally, never delivered) and no telemetry host permission.';

function telemetryHostPermission(endpoint) {
  if (!endpoint) return '';
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.pathname !== TELEMETRY_PATH || url.search || url.hash || url.username || url.password) {
    throw new Error(`TELEMETRY_ENDPOINT must be an HTTPS URL ending exactly in ${TELEMETRY_PATH}`);
  }
  return `${url.origin}/*`;
}

/**
 * Resolves the endpoint a build should embed.
 *
 * An absent endpoint is **allowed**, in production too: the extension records
 * diagnostics locally and `TelemetryDelivery` refuses to send anything without a
 * valid endpoint, so the result is a working build whose diagnostics never leave
 * the machine. It warns rather than failing, because a build that cannot report
 * telemetry is still a build worth having — someone packaging this from a fork
 * has no Worker of their own.
 *
 * A *malformed* endpoint still throws. That is a typo, and silently degrading it
 * to "no telemetry" would hide the mistake behind a build that looks fine.
 */
function resolveTelemetryEndpoint(rawEndpoint, options = {}) {
  const endpoint = String(rawEndpoint ?? '').trim();
  if (!endpoint) {
    return {
      endpoint: '',
      hostPermission: '',
      warning: options.isDevBuild ? '' : MISSING_ENDPOINT_WARNING,
    };
  }
  return { endpoint, hostPermission: telemetryHostPermission(endpoint), warning: '' };
}

module.exports = {
  TELEMETRY_PATH,
  MISSING_ENDPOINT_WARNING,
  telemetryHostPermission,
  resolveTelemetryEndpoint,
};
