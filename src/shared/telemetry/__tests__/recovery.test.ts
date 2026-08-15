import { TelemetryCoordinator } from '../coordinator';
import type { TelemetryCheckpoint } from '../store';

describe('telemetry recovery', () => {
  it('rebuilds untrusted cross-context snapshots from allowlisted fields only', async () => {
    const store = { putCheckpoint: jest.fn(), removeCheckpoint: jest.fn(), clear: jest.fn(), listCheckpoints: jest.fn(), enqueue: jest.fn(), listOutbox: jest.fn(), removeBatch: jest.fn() };
    const delivery = { enqueue: jest.fn().mockResolvedValue(undefined), deliver: jest.fn() };
    const coordinator = new TelemetryCoordinator(store as any, delivery as any);
    const runId = '00000000-0000-4000-8000-000000000010';
    coordinator.startRun(runId);
    await coordinator.merge({
      runId, source: 'offscreen', startedAt: Date.now() - 10, endedAt: Date.now(),
      summary: { 'recorder.chunks': 1, 'private.filename': 2 },
      incidents: [{
        incidentId: '00000000-0000-4000-8000-000000000011', kind: 'application_error', stage: 'runtime', severity: 'error', at: Date.now(),
        error: { name: 'Error', fingerprint: '1234abcd', stack: 'raw stack' } as any,
        context: [{ code: 'application_error', at: Date.now(), tags: { stream: 'tab', filename: 'meeting.webm' } as any }],
        message: 'raw message',
      } as any],
    }, true);
    await coordinator.flush(runId, 'incident');
    const encoded = JSON.stringify(delivery.enqueue.mock.calls[0][0]);
    expect(encoded).toContain('recorder.chunks');
    expect(encoded).not.toContain('private.filename');
    expect(encoded).not.toContain('meeting.webm');
    expect(encoded).not.toContain('raw stack');
    expect(encoded).not.toContain('raw message');
  });

  it('queues one idempotent interruption and removes its stale checkpoint', async () => {
    const checkpoint: TelemetryCheckpoint = {
      runId: '00000000-0000-4000-8000-000000000001', epoch: 5, updatedAt: 1,
      payload: {
        recording: { storageMode: 'local', microphoneMode: 'off', separateCamera: false, tabResolution: 'unknown', tabFrameRate: 'unknown', cameraResolution: 'unknown', cameraFrameRate: 'unknown' },
        snapshots: [{ runId: '00000000-0000-4000-8000-000000000001', source: 'background', startedAt: 1, endedAt: 2, summary: {}, incidents: [] }],
      },
    };
    const checkpoints = [checkpoint];
    const store = {
      listCheckpoints: jest.fn(async () => [...checkpoints]),
      removeCheckpoint: jest.fn(async (runId: string) => { const index = checkpoints.findIndex((item) => item.runId === runId); if (index >= 0) checkpoints.splice(index, 1); }),
      putCheckpoint: jest.fn(), clear: jest.fn(), enqueue: jest.fn(), listOutbox: jest.fn(), removeBatch: jest.fn(),
    };
    const delivery = { enqueue: jest.fn().mockResolvedValue(undefined), deliver: jest.fn().mockResolvedValue(undefined) };
    const coordinator = new TelemetryCoordinator(store as any, delivery as any);
    await coordinator.recover(new Set());
    await coordinator.recover(new Set());
    expect(delivery.enqueue).toHaveBeenCalledTimes(1);
    expect(delivery.enqueue.mock.calls[0][0].incidents).toEqual([expect.objectContaining({ kind: 'recording_interrupted', stage: 'recovery' })]);
    expect(store.removeCheckpoint).toHaveBeenCalledWith(checkpoint.runId);
  });

  it('resumes a checkpoint that belongs to a live hydrated epoch', async () => {
    const store = {
      listCheckpoints: jest.fn().mockResolvedValue([{ runId: 'run', epoch: 7, updatedAt: 1, payload: { snapshots: [] } }]),
      removeCheckpoint: jest.fn(), clear: jest.fn(), enqueue: jest.fn(), listOutbox: jest.fn(), removeBatch: jest.fn(), putCheckpoint: jest.fn(),
    };
    const delivery = { enqueue: jest.fn(), deliver: jest.fn() };
    await new TelemetryCoordinator(store as any, delivery as any).recover(new Set([7]));
    expect(delivery.enqueue).not.toHaveBeenCalled();
    expect(store.removeCheckpoint).not.toHaveBeenCalled();
  });

  it('resumes a detached upload checkpoint even while capture is idle', async () => {
    const store = {
      listCheckpoints: jest.fn().mockResolvedValue([{ runId: 'run', updatedAt: 1, payload: { snapshots: [], uploadJobIds: ['upload-1'] } }]),
      removeCheckpoint: jest.fn(), clear: jest.fn(), enqueue: jest.fn(), listOutbox: jest.fn(), removeBatch: jest.fn(), putCheckpoint: jest.fn(),
    };
    const delivery = { enqueue: jest.fn(), deliver: jest.fn() };
    const coordinator = new TelemetryCoordinator(store as any, delivery as any);
    await coordinator.recover(new Set(), new Set(['upload-1']));
    expect(coordinator.runIdForUploadJob('upload-1')).toBe('run');
    expect(delivery.enqueue).not.toHaveBeenCalled();
    expect(store.removeCheckpoint).not.toHaveBeenCalled();
  });
});
