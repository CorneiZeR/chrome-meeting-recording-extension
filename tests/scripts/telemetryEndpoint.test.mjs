import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  telemetryHostPermission,
  resolveTelemetryEndpoint,
  MISSING_ENDPOINT_WARNING,
} = require('../../scripts/lib/telemetryEndpoint.cjs');

test('derives only the exact telemetry origin host permission', () => {
  assert.equal(
    telemetryHostPermission('https://meeting-recorder.example.workers.dev/api/telemetry/batches'),
    'https://meeting-recorder.example.workers.dev/*'
  );
});

test('fails closed for unsafe or imprecise telemetry endpoints', () => {
  for (const endpoint of [
    'http://meeting-recorder.example/api/telemetry/batches',
    'https://meeting-recorder.example/api/telemetry/batches/extra',
    'https://meeting-recorder.example/api/telemetry/batches?token=secret',
    'https://user:password@meeting-recorder.example/api/telemetry/batches',
  ]) {
    assert.throws(() => telemetryHostPermission(endpoint), /TELEMETRY_ENDPOINT/);
  }
});

test('a production build without an endpoint is allowed, and says so', () => {
  // A build that cannot report telemetry is still a build worth having:
  // anyone packaging this from a fork has no Worker of their own.
  const resolved = resolveTelemetryEndpoint('', { isDevBuild: false });
  assert.equal(resolved.endpoint, '');
  assert.equal(resolved.hostPermission, '', 'no endpoint means no host permission is requested');
  assert.equal(resolved.warning, MISSING_ENDPOINT_WARNING);
});

test('a development build without an endpoint warns about nothing', () => {
  assert.equal(resolveTelemetryEndpoint(undefined, { isDevBuild: true }).warning, '');
  assert.equal(resolveTelemetryEndpoint('   ', { isDevBuild: true }).endpoint, '');
});

test('a configured endpoint is carried through with its host permission', () => {
  const resolved = resolveTelemetryEndpoint(
    '  https://meeting-recorder.example.workers.dev/api/telemetry/batches  '
  );
  assert.equal(resolved.endpoint, 'https://meeting-recorder.example.workers.dev/api/telemetry/batches');
  assert.equal(resolved.hostPermission, 'https://meeting-recorder.example.workers.dev/*');
  assert.equal(resolved.warning, '');
});

test('a malformed endpoint still fails the build rather than degrading silently', () => {
  // Degrading a typo to "no telemetry" would hide the mistake behind a build
  // that looks fine.
  assert.throws(
    () => resolveTelemetryEndpoint('https://meeting-recorder.example/wrong/path'),
    /TELEMETRY_ENDPOINT/
  );
});
