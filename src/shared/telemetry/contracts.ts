export const TELEMETRY_SCHEMA_VERSION = 1 as const;
export const TELEMETRY_MAX_BATCH_BYTES = 32 * 1024;
export const TELEMETRY_MAX_METRICS = 64;
export const TELEMETRY_MAX_INCIDENTS = 10;
export const TELEMETRY_MAX_CONTEXT_EVENTS = 32;
export const TELEMETRY_MAX_CONTEXT_TAGS = 8;
export const TELEMETRY_MAX_STRING = 128;
export const TELEMETRY_MAX_METRIC_VALUE = 1_000_000_000;

export const TELEMETRY_INCIDENT_KINDS = [
  'recording_start_failed',
  'recording_runtime_failed',
  'required_stream_lost',
  'storage_open_failed',
  'storage_write_failed',
  'storage_backpressure_stop',
  'recording_finalize_failed',
  'upload_partial',
  'upload_failed',
  'recording_interrupted',
  'application_error',
  'unhandled_rejection',
] as const;

export type TelemetryIncidentKind = typeof TELEMETRY_INCIDENT_KINDS[number];
export type TelemetryFlushReason = 'incident' | 'recording_complete' | 'upload_complete' | 'recovery';
export type TelemetrySeverity = 'warning' | 'error' | 'fatal';
export type TelemetrySource = 'background' | 'offscreen' | 'captions';

export type TelemetryContextEvent = {
  code: string;
  at: number;
  tags: Record<string, string>;
};

export type SanitizedTelemetryError = {
  name?: string;
  fingerprint?: string;
};

export type TelemetryIncident = {
  incidentId: string;
  kind: TelemetryIncidentKind;
  stage: string;
  severity: TelemetrySeverity;
  at: number;
  durationMs?: number;
  error?: SanitizedTelemetryError;
  context: TelemetryContextEvent[];
};

export type TelemetryRuntime = {
  browserFamily: string;
  browserMajor: string;
  osFamily: string;
  osMajor: string;
  cpuBucket: string;
  memoryBucket: string;
  networkClass: string;
};

export type TelemetryRecording = {
  storageMode: 'local' | 'drive' | 'unknown';
  microphoneMode: 'off' | 'mixed' | 'separate' | 'unknown';
  separateCamera: boolean;
  tabResolution: string;
  tabFrameRate: string;
  cameraResolution: string;
  cameraFrameRate: string;
};

export type TelemetryBatchV1 = {
  schemaVersion: 1;
  batchId: string;
  runId: string;
  flushReason: TelemetryFlushReason;
  startedAt: number;
  endedAt: number;
  release: {
    version: string;
    buildId: string;
    browserTarget: string;
  };
  runtime: TelemetryRuntime;
  recording: TelemetryRecording;
  summary: Record<string, number>;
  incidents: TelemetryIncident[];
};

export type TelemetrySnapshot = {
  runId: string;
  source: TelemetrySource;
  startedAt: number;
  endedAt: number;
  summary: Record<string, number>;
  incidents: TelemetryIncident[];
};

export type TelemetryIncidentInput = {
  kind: TelemetryIncidentKind;
  stage: string;
  severity?: TelemetrySeverity;
  durationMs?: number;
  error?: unknown;
};

export interface TelemetrySink {
  increment(metric: string, value?: number): void;
  measure(metric: string, value: number): void;
  context(code: string, tags?: Record<string, unknown>): void;
  incident(input: TelemetryIncidentInput): void;
  checkpoint(critical?: boolean): void;
  flush(reason: TelemetryFlushReason): void;
}

export const ALLOWED_TELEMETRY_METRICS = new Set<string>([
  'capture.attempts', 'capture.successes', 'capture.failures', 'capture.start.count', 'capture.start.total_ms', 'capture.start.max_ms',
  'recorder.starts', 'recorder.chunks', 'recorder.bytes', 'recorder.write.count', 'recorder.write.total_ms', 'recorder.write.max_ms',
  'recorder.seal.count', 'recorder.seal.total_ms', 'recorder.seal.max_ms', 'recorder.artifact_bytes',
  'storage.opens', 'storage.open_failures', 'storage.writes', 'storage.write_failures', 'storage.worker_writes', 'storage.pending_writes.max',
  'storage.soft_backpressure', 'storage.hard_backpressure', 'storage.closes', 'storage.cleanups',
  'recording.duration.count', 'recording.duration.total_ms', 'recording.duration.max_ms',
  'finalize.count', 'finalize.total_ms', 'finalize.max_ms', 'local_save.requests', 'local_save.successes', 'local_save.failures',
  'upload.jobs', 'upload.files', 'upload.chunks', 'upload.bytes', 'upload.request.count', 'upload.request.total_ms', 'upload.request.max_ms',
  'upload.job.count', 'upload.job.total_ms', 'upload.job.max_ms', 'upload.retries', 'upload.concurrency.max',
  'upload.completed', 'upload.partial', 'upload.failed', 'upload.canceled',
  'captions.mutations', 'captions.changes', 'captions.coalesced', 'captions.misses', 'captions.processing.count',
  'captions.processing.total_ms', 'captions.processing.max_ms', 'captions.source_latency.count', 'captions.source_latency.total_ms',
  'captions.source_latency.max_ms', 'captions.observers.max', 'captions.long_tasks', 'captions.long_task.total_ms', 'captions.long_task.max_ms',
  'runtime.samples', 'runtime.event_loop_lag.count', 'runtime.event_loop_lag.total_ms', 'runtime.event_loop_lag.max_ms',
  'runtime.long_tasks', 'runtime.long_task.total_ms', 'runtime.active_recorders.max', 'runtime.heap_bucket.max',
  'lifecycle.failures',
]);

export const ALLOWED_CONTEXT_CODES = new Set([
  'run_started', 'capture_requested', 'capture_ready', 'capture_failed', 'recorder_started', 'stream_lost',
  'storage_opened', 'storage_failed', 'backpressure', 'stop_requested', 'protective_stop', 'artifact_sealed',
  'finalize_started', 'finalize_completed', 'upload_started', 'upload_retry', 'upload_completed', 'upload_partial',
  'upload_failed', 'upload_canceled', 'recovery', 'application_error',
]);

export function createTelemetryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
