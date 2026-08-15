import { describe, expect, it } from 'vitest';
import { validateBatch } from '../src/validate';

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const valid = () => ({
  schemaVersion: 1, batchId: id('1'), runId: id('2'), flushReason: 'recording_complete',
  startedAt: Date.now() - 1000, endedAt: Date.now(),
  release: { version: '1.2.3', buildId: 'abc', browserTarget: 'chrome' },
  runtime: { browserFamily: 'chrome', browserMajor: '140', osFamily: 'macos', osMajor: '15', cpuBucket: '5-8', memoryBucket: '5-8', networkClass: '4g' },
  recording: { storageMode: 'local', microphoneMode: 'mixed', separateCamera: false, tabResolution: '<=1080p', tabFrameRate: '<=30', cameraResolution: 'unknown', cameraFrameRate: 'unknown' },
  summary: { 'capture.attempts': 1 }, incidents: [],
});

describe('validateBatch', () => {
  it('accepts the exact v1 shape', () => expect(validateBatch(valid())).not.toBeNull());
  it('rejects unknown keys and private/raw fields', () => {
    expect(validateBatch({ ...valid(), transcript: 'private' })).toBeNull();
    expect(validateBatch({ ...valid(), incidents: [{ incidentId: id('3'), kind: 'application_error', stage: 'runtime', severity: 'error', at: Date.now(), context: [], message: 'raw' }] })).toBeNull();
  });
  it('rejects metric cardinality and invalid numbers', () => {
    expect(validateBatch({ ...valid(), summary: Object.fromEntries(Array.from({ length: 65 }, (_, index) => [`m.${index}`, 1])) })).toBeNull();
    expect(validateBatch({ ...valid(), summary: { metric: Number.NaN } })).toBeNull();
  });
});
