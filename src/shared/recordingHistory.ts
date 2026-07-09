import type { RecordingStream, StorageMode } from './recording';

export type RecordingHistoryFile = {
  id: string;
  stream: RecordingStream;
  filename: string;
  destination: StorageMode;
  status: 'pending' | 'available' | 'unavailable';
  bytes?: number;
  downloadId?: number;
  driveFileId?: string;
  webViewLink?: string;
  error?: string;
};

export type RecordingHistoryEntry = {
  id: string;
  name: string;
  userNamed?: true;
  createdAt: number;
  storageMode: StorageMode;
  status: 'saving' | 'complete' | 'partial';
  files: RecordingHistoryFile[];
};

export type RecordingHistoryMessage =
  | { type: 'LIST_RECORDING_HISTORY' }
  | { type: 'RENAME_RECORDING_HISTORY'; id: string; name: string }
  | { type: 'REMOVE_RECORDING_HISTORY'; id: string }
  | { type: 'OPEN_RECORDING_HISTORY_FILE'; recordingId: string; fileId: string };

export function createRecordingHistoryId(): string {
  return `recording:${crypto.randomUUID()}`;
}

export function recordingLabelFromFilename(filename: string): string {
  return filename.replace(/-(recording|mic|self-video)\.webm$/, '') || filename;
}

export function isRecordingHistoryMessage(value: unknown): value is RecordingHistoryMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  if (message.type === 'LIST_RECORDING_HISTORY') return true;
  if (message.type === 'RENAME_RECORDING_HISTORY') {
    return typeof message.id === 'string' && message.id.length > 0 && typeof message.name === 'string';
  }
  if (message.type === 'REMOVE_RECORDING_HISTORY') {
    return typeof message.id === 'string' && message.id.length > 0;
  }
  return message.type === 'OPEN_RECORDING_HISTORY_FILE'
    && typeof message.recordingId === 'string' && message.recordingId.length > 0
    && typeof message.fileId === 'string' && message.fileId.length > 0;
}
