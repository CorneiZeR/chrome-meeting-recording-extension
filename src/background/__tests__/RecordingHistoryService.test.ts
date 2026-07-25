import { RecordingHistoryService } from '../RecordingHistoryService';
import type { RecordingHistoryEntry } from '../../shared/recordingHistory';

class MemoryRepository {
  entries = new Map<string, RecordingHistoryEntry>();
  async listPage() {
    return { entries: [...this.entries.values()].filter((entry) => !entry.deletedAt).sort((a, b) => b.createdAt - a.createdAt) };
  }
  async get(id: string) { return this.entries.get(id); }
  async update(id: string, mutate: (entry: RecordingHistoryEntry | undefined) => RecordingHistoryEntry | undefined) {
    const current = this.entries.get(id);
    const next = mutate(current ? structuredClone(current) : undefined);
    if (next) this.entries.set(id, structuredClone(next));
    return next;
  }
}

describe('RecordingHistoryService', () => {
  it('groups local artifacts and writes terminal statuses without touching files', async () => {
    const repo = new MemoryRepository();
    const open = jest.fn();
    const service = new RecordingHistoryService(repo, open, () => 10);
    await service.createPending('r1', [{ id: 'r1:tab', stream: 'tab', filename: 'demo-recording.webm' }], 'local');
    await service.createPending('r1', [{ id: 'r1:mic', stream: 'mic', filename: 'demo-mic.webm' }], 'local');
    await service.localSaveSettled('r1', 'tab', 1, 'complete');
    await service.localSaveSettled('r1', 'mic', 2, 'complete');
    expect(await service.list()).toEqual([expect.objectContaining({ id: 'r1', status: 'complete', files: [
      expect.objectContaining({ id: 'r1:tab', downloadId: 1, status: 'available' }),
      expect.objectContaining({ id: 'r1:mic', downloadId: 2, status: 'available' }),
    ] })]);
    await service.remove('r1');
    expect(open).not.toHaveBeenCalled();
  });

  it('keeps metadata when opening a missing local file fails', async () => {
    const repo = new MemoryRepository();
    const service = new RecordingHistoryService(repo, jest.fn().mockRejectedValue(new Error('Missing')));
    await service.createPending('r1', [{ id: 'r1:tab', stream: 'tab', filename: 'demo-recording.webm' }], 'local');
    await service.localSaveSettled('r1', 'tab', 1, 'complete');
    await expect(service.openLocalFile('r1', 'r1:tab')).rejects.toThrow('Missing');
    expect(await repo.get('r1')).toBeDefined();
  });

  it('persists a user note and clears it without changing the recording files', async () => {
    const repo = new MemoryRepository();
    const service = new RecordingHistoryService(repo, jest.fn(), () => 10);
    await service.createPending('r1', [{ id: 'r1:tab', stream: 'tab', filename: 'demo-recording.webm' }], 'local');

    await service.setNote('r1', '  Review decisions at 42:10.  ');
    expect(await repo.get('r1')).toEqual(expect.objectContaining({ note: 'Review decisions at 42:10.' }));

    await service.setNote('r1', '');
    expect((await repo.get('r1'))?.note).toBeUndefined();
  });

  it('keeps an already available local fallback available when a retry fails', async () => {
    const repo = new MemoryRepository();
    const service = new RecordingHistoryService(repo, jest.fn(), () => 10);
    await service.createPending('r1', [{ id: 'r1:tab', stream: 'tab', filename: 'demo-recording.webm' }], 'local');
    await service.localSaveSettled('r1', 'tab', 7, 'complete');

    await service.applyTerminalUploadJob({
      id: 'job-1',
      historyId: 'r1',
      label: 'Demo',
      status: 'failed',
      progress: 1,
      files: [{ stream: 'tab', filename: 'demo-recording.webm', status: 'fallback' }],
      startedAt: 10,
      finishedAt: 11,
    });

    expect((await service.list())[0]).toEqual(expect.objectContaining({
      status: 'complete',
      files: [expect.objectContaining({ stream: 'tab', destination: 'local', status: 'available', downloadId: 7 })],
    }));
  });

  it('does not resurrect a deleted entry when delayed upload recovery reports its job', async () => {
    const repo = new MemoryRepository();
    const service = new RecordingHistoryService(repo, jest.fn(), () => 10);
    await service.createPending('r1', [{ id: 'r1:tab', stream: 'tab', filename: 'demo-recording.webm' }], 'drive');
    await service.remove('r1');

    await service.applyUploadJob({
      id: 'job-1',
      historyId: 'r1',
      label: 'Demo',
      status: 'completed',
      progress: 1,
      files: [{ stream: 'tab', filename: 'demo-recording.webm', status: 'uploaded', driveFileId: 'drive-1' }],
      startedAt: 10,
      finishedAt: 11,
    });

    expect(await service.list()).toEqual([]);
    expect(await repo.get('r1')).toEqual(expect.objectContaining({ deletedAt: 10 }));
  });

  it('keeps a recovered retry pending on Drive instead of claiming a nonexistent local fallback', async () => {
    const repo = new MemoryRepository();
    const service = new RecordingHistoryService(repo, jest.fn(), () => 10);

    await service.applyUploadJob({
      id: 'job-1',
      historyId: 'r1',
      label: 'Demo',
      status: 'failed',
      recoveryPending: true,
      progress: 1,
      files: [{ stream: 'tab', filename: 'demo-recording.webm', status: 'retry-pending', error: 'network down' }],
      startedAt: 10,
      finishedAt: 11,
    });

    expect((await service.list())[0]).toEqual(expect.objectContaining({
      files: [expect.objectContaining({ destination: 'drive', status: 'pending', error: 'network down' })],
    }));
  });
});
