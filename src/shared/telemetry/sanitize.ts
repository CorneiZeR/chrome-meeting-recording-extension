import {
  TELEMETRY_MAX_CONTEXT_TAGS,
  TELEMETRY_MAX_METRIC_VALUE,
  TELEMETRY_MAX_STRING,
  type SanitizedTelemetryError,
} from './contracts';

export function boundedMetric(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.min(TELEMETRY_MAX_METRIC_VALUE, value);
}

export function boundedString(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, TELEMETRY_MAX_STRING);
}

export function sanitizeTags(tags?: Record<string, unknown>): Record<string, string> {
  if (!tags) return {};
  const sanitized: Record<string, string> = {};
  const allowed: Record<string, ReadonlySet<string>> = {
    stream: new Set(['tab', 'mic', 'self-video', 'unknown']),
    phase: new Set(['idle', 'starting', 'recording', 'stopping', 'failed', 'uploading']),
    status: new Set(['started', 'completed', 'partial', 'failed', 'canceled', 'fallback', 'unknown']),
    storage_mode: new Set(['local', 'drive', 'unknown']),
    microphone_mode: new Set(['off', 'mixed', 'separate', 'unknown']),
    source: new Set(['background', 'offscreen', 'captions', 'unknown']),
    worker: new Set(['true', 'false']),
  };
  for (const [key, value] of Object.entries(tags)) {
    const normalized = String(value);
    if (!allowed[key]?.has(normalized)) continue;
    sanitized[key] = normalized;
    if (Object.keys(sanitized).length >= TELEMETRY_MAX_CONTEXT_TAGS) break;
  }
  return sanitized;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 8);
}

function normalizedExtensionFrames(stack: string): string[] {
  const extensionOrigin = typeof chrome !== 'undefined' && chrome.runtime?.id
    ? `chrome-extension://${chrome.runtime.id}/`
    : 'chrome-extension://';
  return stack.split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes(extensionOrigin))
    .slice(0, 4)
    .map((line) => line
      .replace(/chrome-extension:\/\/[a-z]+\//gi, 'extension:///')
      .replace(/:\d+:\d+/g, ':#:'));
}

export function sanitizeError(error: unknown): SanitizedTelemetryError | undefined {
  if (!(error instanceof Error) && !(typeof DOMException !== 'undefined' && error instanceof DOMException)) return undefined;
  const name = boundedString(error.name || 'Error').replace(/[^A-Za-z0-9_.-]/g, '') || 'Error';
  const frames = normalizedExtensionFrames(typeof error.stack === 'string' ? error.stack : '');
  return frames.length > 0 ? { name, fingerprint: fnv1a(frames.join('\n')) } : { name };
}
