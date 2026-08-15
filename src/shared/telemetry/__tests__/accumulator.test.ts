import { TelemetryAccumulator } from '../accumulator';
import { TELEMETRY_MAX_CONTEXT_EVENTS, TELEMETRY_MAX_METRIC_VALUE } from '../contracts';
import { sanitizeError } from '../sanitize';
import { reducePerfEntryToTelemetry } from '../perfReducer';

describe('production telemetry privacy reducer', () => {
  it('keeps only allowlisted bounded metrics with duration denominators', () => {
    const accumulator = new TelemetryAccumulator('run', 'offscreen');
    reducePerfEntryToTelemetry({ source: 'offscreen', scope: 'recorder', event: 'chunk_persisted', ts: 1, fields: { bytes: 42, durationMs: 5, filename: 'private.webm' } }, accumulator);
    accumulator.increment('not.allowed', 100);
    accumulator.increment('recorder.bytes', Number.POSITIVE_INFINITY);
    accumulator.increment('recorder.bytes', TELEMETRY_MAX_METRIC_VALUE * 2);
    expect(accumulator.snapshot().summary).toEqual({
      'recorder.chunks': 1,
      'recorder.bytes': TELEMETRY_MAX_METRIC_VALUE,
      'recorder.write.count': 1,
      'recorder.write.total_ms': 5,
      'recorder.write.max_ms': 5,
    });
    expect(JSON.stringify(accumulator.snapshot())).not.toContain('private.webm');
  });

  it('evicts old breadcrumb context and copies it only into incidents', () => {
    const accumulator = new TelemetryAccumulator('run', 'background');
    for (let index = 0; index < TELEMETRY_MAX_CONTEXT_EVENTS + 5; index += 1) accumulator.context('run_started', { stream: index < 5 ? 'mic' : 'tab', private: { nested: true } });
    accumulator.incident({ kind: 'application_error', stage: 'runtime', error: new Error('must never leave') });
    const incident = accumulator.snapshot().incidents[0];
    expect(incident.context).toHaveLength(TELEMETRY_MAX_CONTEXT_EVENTS);
    expect(incident.context[0].tags.stream).toBe('tab');
    expect(JSON.stringify(incident)).not.toContain('must never leave');
    expect(JSON.stringify(accumulator.snapshot())).not.toContain('nested');
  });

  it('fingerprints only normalized same-extension frames without stack text', () => {
    const error = new Error('secret meeting name');
    error.stack = 'Error: secret meeting name\n at capture (chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/background.js:10:22)\n at external (https://example.com/app.js:1:2)';
    const sanitized = sanitizeError(error)!;
    expect(sanitized.name).toBe('Error');
    expect(sanitized.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(sanitized).not.toHaveProperty('message');
    expect(sanitized).not.toHaveProperty('stack');
  });

  it('maps caption totals, maxima, and denominators without retaining text', () => {
    const accumulator = new TelemetryAccumulator('run', 'captions');
    reducePerfEntryToTelemetry({ source: 'captions', scope: 'captions', event: 'mutation_processed', ts: 1, fields: { changed: true, coalesced: false, durationMs: 3, sourceLatencyMs: 8, textLength: 999 } }, accumulator);
    expect(accumulator.snapshot().summary).toMatchObject({
      'captions.mutations': 1, 'captions.changes': 1, 'captions.processing.count': 1,
      'captions.processing.total_ms': 3, 'captions.processing.max_ms': 3,
      'captions.source_latency.count': 1, 'captions.source_latency.total_ms': 8,
    });
    expect(JSON.stringify(accumulator.snapshot())).not.toContain('textLength');
  });
});
