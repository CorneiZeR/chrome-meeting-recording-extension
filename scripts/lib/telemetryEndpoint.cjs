'use strict';

const TELEMETRY_PATH = '/api/telemetry/batches';

function telemetryHostPermission(endpoint) {
  if (!endpoint) return '';
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.pathname !== TELEMETRY_PATH || url.search || url.hash || url.username || url.password) {
    throw new Error(`TELEMETRY_ENDPOINT must be an HTTPS URL ending exactly in ${TELEMETRY_PATH}`);
  }
  return `${url.origin}/*`;
}

module.exports = { TELEMETRY_PATH, telemetryHostPermission };
