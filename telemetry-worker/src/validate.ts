import { ALLOWED_METRICS } from './metricNames';

export const MAX_BODY_BYTES = 32 * 1024;
const MAX_METRIC = 1_000_000_000;
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT = /^[0-9a-f]{8}$/;
const incidents = new Set(['recording_start_failed', 'recording_runtime_failed', 'required_stream_lost', 'storage_open_failed', 'storage_write_failed', 'storage_backpressure_stop', 'recording_finalize_failed', 'upload_partial', 'upload_failed', 'recording_interrupted', 'application_error', 'unhandled_rejection']);
const reasons = new Set(['incident', 'recording_complete', 'upload_complete', 'recovery']);
const severities = new Set(['warning', 'error', 'fatal']);
const browserFamilies = new Set(['chrome', 'chromium', 'edge', 'firefox', 'unknown']);
const osFamilies = new Set(['windows', 'macos', 'android', 'cros', 'linux', 'unknown']);
const hardwareBuckets = new Set(['unknown', '1-2', '3-4', '5-8', '9+']);
const networkClasses = new Set(['unknown', 'slow-2g', '2g', '3g', '4g']);
const storageModes = new Set(['local', 'drive', 'unknown']);
const microphoneModes = new Set(['off', 'mixed', 'separate', 'unknown']);
const resolutionBuckets = new Set(['unknown', '<=360p', '<=480p', '<=720p', '<=1080p', '>1080p']);
const frameRateBuckets = new Set(['unknown', '<=15', '<=30', '<=60', '>60']);
const contextCodes = new Set(['run_started', 'capture_requested', 'capture_ready', 'capture_failed', 'recorder_started', 'stream_lost', 'storage_opened', 'storage_failed', 'backpressure', 'stop_requested', 'protective_stop', 'artifact_sealed', 'finalize_started', 'finalize_completed', 'upload_started', 'upload_retry', 'upload_completed', 'upload_partial', 'upload_failed', 'upload_canceled', 'recovery', 'application_error']);
const stages = new Set(['settings_load', 'runtime_ready', 'offscreen_start', 'offscreen_rpc', 'opfs_open', 'opfs_write', 'capture_stream', 'media_recorder', 'offscreen_phase', 'drive_upload', 'recovery', 'offscreen_window', 'offscreen_promise', 'runtime']);
const tagValues: Record<string, Set<string>> = {
  stream: new Set(['tab', 'mic', 'self-video', 'unknown']), phase: new Set(['idle', 'starting', 'recording', 'stopping', 'failed', 'uploading']),
  status: new Set(['started', 'completed', 'partial', 'failed', 'canceled', 'fallback', 'unknown']), storage_mode: storageModes,
  microphone_mode: microphoneModes, source: new Set(['background', 'offscreen', 'captions', 'unknown']), worker: new Set(['true', 'false']),
};

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => !!value && typeof value === 'object' && !Array.isArray(value);
const keysAre = (value: RecordValue, required: string[], optional: string[] = []): boolean => {
  const keys = Object.keys(value);
  return required.every((key) => keys.includes(key)) && keys.every((key) => required.includes(key) || optional.includes(key));
};
const short = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 128;
const metric = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_METRIC;
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10_000_000_000_000;

function validContext(value: unknown): boolean {
  if (!Array.isArray(value) || value.length > 32) return false;
  return value.every((event) => record(event) && keysAre(event, ['code', 'at', 'tags']) && contextCodes.has(String(event.code)) && timestamp(event.at)
    && record(event.tags) && Object.keys(event.tags).length <= 8
    && Object.entries(event.tags).every(([key, tag]) => typeof tag === 'string' && tagValues[key]?.has(tag)));
}

function validIncident(value: unknown): boolean {
  if (!record(value) || !keysAre(value, ['incidentId', 'kind', 'stage', 'severity', 'at', 'context'], ['durationMs', 'error'])) return false;
  if (!ID.test(String(value.incidentId)) || !incidents.has(String(value.kind)) || !stages.has(String(value.stage)) || !severities.has(String(value.severity)) || !timestamp(value.at) || !validContext(value.context)) return false;
  if (value.durationMs !== undefined && !metric(value.durationMs)) return false;
  if (value.error !== undefined) {
    if (!record(value.error) || !keysAre(value.error, [], ['name', 'fingerprint'])) return false;
    if (value.error.name !== undefined && !short(value.error.name)) return false;
    if (value.error.fingerprint !== undefined && !FINGERPRINT.test(String(value.error.fingerprint))) return false;
  }
  return true;
}

export type ValidBatch = {
  schemaVersion: 1; batchId: string; runId: string; flushReason: string; startedAt: number; endedAt: number;
  release: Record<string, string>; runtime: Record<string, string>; recording: Record<string, unknown>;
  summary: Record<string, number>; incidents: Array<Record<string, any>>;
};

export function validateBatch(value: unknown, now = Date.now()): ValidBatch | null {
  if (!record(value) || !keysAre(value, ['schemaVersion', 'batchId', 'runId', 'flushReason', 'startedAt', 'endedAt', 'release', 'runtime', 'recording', 'summary', 'incidents'])) return null;
  if (value.schemaVersion !== 1 || !ID.test(String(value.batchId)) || !ID.test(String(value.runId)) || !reasons.has(String(value.flushReason))) return null;
  if (!timestamp(value.startedAt) || !timestamp(value.endedAt) || value.endedAt < value.startedAt || value.endedAt > now + 300_000 || value.startedAt < now - 45 * 86_400_000) return null;
  if (!record(value.release) || !keysAre(value.release, ['version', 'buildId', 'browserTarget']) || !Object.values(value.release).every(short)) return null;
  if (!record(value.runtime) || !keysAre(value.runtime, ['browserFamily', 'browserMajor', 'osFamily', 'osMajor', 'cpuBucket', 'memoryBucket', 'networkClass']) || !Object.values(value.runtime).every(short)) return null;
  if (!browserFamilies.has(String(value.runtime.browserFamily)) || !osFamilies.has(String(value.runtime.osFamily))
    || !hardwareBuckets.has(String(value.runtime.cpuBucket)) || !hardwareBuckets.has(String(value.runtime.memoryBucket))
    || !networkClasses.has(String(value.runtime.networkClass))) return null;
  if (!record(value.recording) || !keysAre(value.recording, ['storageMode', 'microphoneMode', 'separateCamera', 'tabResolution', 'tabFrameRate', 'cameraResolution', 'cameraFrameRate'])) return null;
  if (typeof value.recording.separateCamera !== 'boolean' || Object.entries(value.recording).some(([key, item]) => key !== 'separateCamera' && !short(item))) return null;
  if (!storageModes.has(String(value.recording.storageMode)) || !microphoneModes.has(String(value.recording.microphoneMode))
    || !resolutionBuckets.has(String(value.recording.tabResolution)) || !resolutionBuckets.has(String(value.recording.cameraResolution))
    || !frameRateBuckets.has(String(value.recording.tabFrameRate)) || !frameRateBuckets.has(String(value.recording.cameraFrameRate))) return null;
  if (!record(value.summary) || Object.keys(value.summary).length > 64 || !Object.entries(value.summary).every(([key, item]) => ALLOWED_METRICS.has(key) && metric(item))) return null;
  if (!Array.isArray(value.incidents) || value.incidents.length > 10 || !value.incidents.every(validIncident)) return null;
  return value as ValidBatch;
}
