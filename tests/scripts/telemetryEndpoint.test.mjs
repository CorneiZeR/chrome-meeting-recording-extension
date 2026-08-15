import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { telemetryHostPermission } = require('../../scripts/lib/telemetryEndpoint.cjs');

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
