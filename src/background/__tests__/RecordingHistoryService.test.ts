import { RecordingHistoryService } from '../RecordingHistoryService';
import type { RecordingHistoryEntry } from '../../shared/recordingHistory';

class MemoryRepository {
  entries = new Map<string, RecordingHistoryEntry>();
  async list() { return [...this.entries.values()].sort((a, b) => b.createdAt - a.createdAt); }
  async get(id: string) { return this.entries.get(id); }
  async put(entry: RecordingHistoryEntry) { this.entries.set(entry.id, structuredClone(entry)); }
  async rename(id: string, name: string) {
    const entry = this.entries.get(id);
    if (!entry) return undefined;
    const next = { ...entry, name, userNamed: true as const };
    this.entries.set(id, next); return next;
  }
  async remove(id: string) { return this.entries.delete(id); }
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
});
