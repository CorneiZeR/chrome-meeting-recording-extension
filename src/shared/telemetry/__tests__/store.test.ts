import 'fake-indexeddb/auto';
import { TelemetryStore } from '../store';
import type { TelemetryBatchV1 } from '../contracts';

const makeBatch = (index: number, padding = 0): TelemetryBatchV1 => ({
  schemaVersion: 1,
  batchId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  runId: '00000000-0000-4000-8000-000000000999',
  flushReason: 'recording_complete', startedAt: 1, endedAt: 2,
  release: { version: '1', buildId: 'b', browserTarget: 'chrome' },
  runtime: { browserFamily: 'chrome', browserMajor: '1', osFamily: 'macos', osMajor: '1', cpuBucket: '3-4', memoryBucket: '3-4', networkClass: '4g' },
  recording: { storageMode: 'local', microphoneMode: 'off', separateCamera: false, tabResolution: 'unknown', tabFrameRate: 'unknown', cameraResolution: 'unknown', cameraFrameRate: 'unknown' },
  summary: padding ? { ['x'.repeat(Math.min(63, padding))]: 1 } : {}, incidents: [],
});

describe('TelemetryStore bounds', () => {
  beforeEach(async () => {
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('meeting-recorder-telemetry-v1');
      request.onsuccess = () => resolve(); request.onerror = () => resolve(); request.onblocked = () => resolve();
    });
  });

  it('keeps at most ten batches and delivers oldest first', async () => {
    const store = new TelemetryStore();
    for (let index = 0; index < 12; index += 1) await store.enqueue(makeBatch(index));
    const batches = await store.listOutbox();
    expect(batches).toHaveLength(10);
    expect(batches[0].batchId).toContain('000000000002');
    expect(batches[9].batchId).toContain('000000000011');
  });

  it('deduplicates batch IDs and bounds active checkpoints to four', async () => {
    const store = new TelemetryStore();
    expect(await store.enqueue(makeBatch(1))).toBe(true);
    expect(await store.enqueue(makeBatch(1))).toBe(false);
    for (let index = 0; index < 6; index += 1) await store.putCheckpoint({ runId: `run-${index}`, updatedAt: index, payload: {} });
    const checkpoints = await store.listCheckpoints();
    expect(checkpoints).toHaveLength(4);
    expect(checkpoints.map((entry) => entry.runId).sort()).toEqual(['run-2', 'run-3', 'run-4', 'run-5']);
  });

  it('clears outbox and checkpoints together for opt-out', async () => {
    const store = new TelemetryStore();
    await store.enqueue(makeBatch(1));
    await store.putCheckpoint({ runId: 'run', updatedAt: 1, payload: {} });
    await store.clear();
    expect(await store.listOutbox()).toEqual([]);
    expect(await store.listCheckpoints()).toEqual([]);
  });
});
