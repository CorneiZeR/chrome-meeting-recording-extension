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

  list() { return this.repository.list(); }
  rename(id: string, name: string) { return this.repository.rename(id, name); }
  remove(id: string) { return this.repository.remove(id); }

  async createPending(historyId: string, files: PendingFile[], storageMode: StorageMode): Promise<void> {
    await this.mutate(historyId, (current) => {
      if (!current) return {
        id: historyId,
        name: recordingLabelFromFilename(files[0]?.filename ?? 'Recording'),
        createdAt: this.now(),
        storageMode,
        status: 'saving',
        files: files.map((file) => ({ ...file, destination: storageMode, status: 'pending' })),
      };
      const known = new Set(current.files.map((file) => file.id));
      const additions = files.filter((file) => !known.has(file.id))
        .map((file) => ({ ...file, destination: storageMode, status: 'pending' as const }));
      return additions.length ? { ...current, files: [...current.files, ...additions] } : current;
    });
  }

  async localSaveSettled(
    historyId: string,
    stream: RecordingStream,
    downloadId: number | undefined,
    settled: DownloadSettledResult,
    error?: string,
  ): Promise<void> {
    await this.mutate(historyId, (current) => {
      if (!current) return current;
      const status: RecordingHistoryFile['status'] = settled === 'complete' ? 'available' : 'unavailable';
      const files = current.files.map((file) => file.stream === stream
        ? { ...file, destination: 'local' as const, status, downloadId, error: error ?? (status === 'unavailable' ? `Download ${settled}` : undefined) }
        : file);
      return { ...current, files, status: summarize(files) };
    });
  }

  async applyTerminalUploadJob(job: UploadJob): Promise<void> {
    if (job.status === 'uploading' || !job.historyId) return;
    const historyId = job.historyId;
    await this.mutate(historyId, (current) => {
      if (!current) {
        const files = job.files.map((file) => ({
          id: `${historyId}:${file.stream}`,
          stream: file.stream,
          filename: file.filename,
          destination: file.status === 'uploaded' ? 'drive' as const : 'local' as const,
          status: file.status === 'uploaded' ? 'available' as const : 'pending' as const,
          bytes: file.bytes,
          driveFileId: file.driveFileId,
          webViewLink: file.webViewLink,
        }));
        return { id: historyId, name: job.label, createdAt: job.startedAt, storageMode: 'drive' as const, status: summarize(files), files };
      }
      const files = current.files.map((file) => {
        const update = job.files.find((candidate) => candidate.stream === file.stream);
        if (!update) return file;
        if (update.status === 'uploaded') {
          return { ...file, destination: 'drive' as const, status: 'available' as const, driveFileId: update.driveFileId, webViewLink: update.webViewLink };
        }
        return { ...file, status: 'pending' as const };
      });
      return { ...current, storageMode: 'drive', files, status: summarize(files) };
    });
  }

  async openLocalFile(recordingId: string, fileId: string): Promise<void> {
    const entry = await this.repository.get(recordingId);
    const file = entry?.files.find((candidate) => candidate.id === fileId);
    if (!file?.downloadId) throw new Error('This local file is no longer available');
    await this.openDownload(file.downloadId);
  }

  private mutate(id: string, reduce: (entry: RecordingHistoryEntry | undefined) => RecordingHistoryEntry | undefined): Promise<void> {
    const previous = this.tails.get(id) ?? Promise.resolve();
    const next = previous.then(async () => {
      const updated = reduce(await this.repository.get(id));
      if (updated) await this.repository.put(updated);
    });
    this.tails.set(id, next.catch(() => {}));
    return next;
  }
}

function summarize(files: RecordingHistoryFile[]): RecordingHistoryEntry['status'] {
  if (files.some((file) => file.status === 'unavailable')) return 'partial';
  if (files.every((file) => file.status === 'available')) return 'complete';
  return 'saving';
}
