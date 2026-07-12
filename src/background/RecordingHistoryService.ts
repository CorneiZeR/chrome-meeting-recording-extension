import type { DownloadSettledResult } from '../platform/chrome/downloads';
import type { RecordingStream, StorageMode, UploadJob } from '../shared/recording';
import {
  recordingLabelFromFilename,
  type RecordingHistoryEntry,
  type RecordingHistoryFile,
} from '../shared/recordingHistory';
import type { RecordingHistoryRepositoryPort } from './RecordingHistoryRepository';

type PendingFile = Pick<RecordingHistoryFile, 'id' | 'stream' | 'filename' | 'bytes'>;

export class RecordingHistoryService {
  private readonly tails = new Map<string, Promise<void>>();

  constructor(
    private readonly repository: RecordingHistoryRepositoryPort,
    private readonly openDownload: (downloadId: number) => Promise<void>,
    private readonly now: () => number = Date.now,
  ) {}

  async listPage(cursor?: RecordingHistoryCursor): Promise<RecordingHistoryPage> {
    return await this.repository.listPage({ cursor });
  }

  async list(): Promise<RecordingHistoryEntry[]> {
    return (await this.listPage()).entries;
  }

  async rename(id: string, name: string): Promise<RecordingHistoryEntry | undefined> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Recording name cannot be blank');
    const updated = await this.repository.update(id, (current) => {
      if (!current || current.deletedAt) return current;
      return { ...current, name: trimmed, userNamed: true as const };
    });
    return updated?.deletedAt ? undefined : updated;
  }

  async remove(id: string): Promise<boolean> {
    let removed = false;
    await this.repository.update(id, (current) => {
      if (!current || current.deletedAt) return current;
      removed = true;
      return { ...current, deletedAt: this.now() };
    });
    return removed;
  }

  async createPending(historyId: string, files: PendingFile[], storageMode: StorageMode): Promise<void> {
    await this.repository.update(historyId, (current) => {
      if (current?.deletedAt) return current;
      if (!current) return createEntry(historyId, files, storageMode, this.now());
      const known = new Set(current.files.map((file) => file.id));
      const additions = files.filter((file) => !known.has(file.id))
        .map((file) => ({ ...file, destination: storageMode, status: 'pending' as const }));
      return additions.length ? { ...current, files: [...current.files, ...additions], status: summarize([...current.files, ...additions]) } : current;
    });
  }
  }

  async localSaveSettled(
    historyId: string,
    stream: RecordingStream,
    downloadId: number | undefined,
    settled: DownloadSettledResult,
    error?: string,
  ): Promise<void> {
    await this.repository.update(historyId, (current) => {
      if (!current || current.deletedAt) return current;
      const status: RecordingHistoryFile['status'] = settled === 'complete' ? 'available' : 'unavailable';
      const files = current.files.map((file) => file.stream === stream
        ? {
            ...file,
            destination: 'local' as const,
            status,
            downloadId,
            error: error ?? (status === 'unavailable' ? `Download ${settled}` : undefined),
          }
        : file);
      return { ...current, files, status: summarize(files) };
    });
  }

  async openLocalFile(recordingId: string, fileId: string): Promise<void> {
    const entry = await this.repository.get(recordingId);
    const file = entry && !entry.deletedAt ? entry.files.find((candidate) => candidate.id === fileId) : undefined;
    if (!file?.downloadId) throw new Error('This local file is no longer available');
    await this.openDownload(file.downloadId);
  }
}

function createEntry(historyId: string, files: PendingFile[], storageMode: StorageMode, createdAt: number): RecordingHistoryEntry {
  const nextFiles = files.map((file) => ({ ...file, destination: storageMode, status: 'pending' as const }));
  return {
    id: historyId,
    name: recordingLabelFromFilename(files[0]?.filename ?? 'Recording'),
    createdAt,
    storageMode,
    status: summarize(nextFiles),
    files: nextFiles,
  };
}
}

function summarize(files: RecordingHistoryFile[]): RecordingHistoryEntry['status'] {
  if (files.some((file) => file.status === 'unavailable')) return 'partial';
  if (files.every((file) => file.status === 'available')) return 'complete';
  return 'saving';
}
