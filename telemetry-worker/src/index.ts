import { MAX_BODY_BYTES, validateBatch, type ValidBatch } from './validate';

type RateLimiter = { limit(options: { key: string }): Promise<{ success: boolean }> };
export interface Env {
  TELEMETRY_DB: D1Database;
  TELEMETRY_RATE_LIMITER: RateLimiter;
  ALLOWED_EXTENSION_ORIGINS: string;
}

const DAY_MS = 86_400_000;
const RETENTION_MS = 30 * DAY_MS;

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  const allowed = env.ALLOWED_EXTENSION_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : null;
}

function cors(origin: string): HeadersInit {
  return { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'Origin' };
}

function response(status: number, body: string, origin?: string): Response {
  return new Response(body, { status, headers: { 'content-type': 'application/json; charset=utf-8', ...(origin ? cors(origin) : { vary: 'Origin' }) } });
}

async function ephemeralRateKey(request: Request): Promise<string> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const day = Math.floor(Date.now() / DAY_MS);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${day}:${ip}`));
  return Array.from(new Uint8Array(digest).slice(0, 12), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function ingest(batch: ValidBatch, env: Env): Promise<void> {
  const receivedAt = Date.now();
  const expiresAt = receivedAt + RETENTION_MS;
  const ingestToken = crypto.randomUUID();
  const insertBatch = env.TELEMETRY_DB.prepare(`INSERT OR IGNORE INTO telemetry_batches (
    batch_id, run_id, schema_version, flush_reason, started_at, ended_at,
    release_version, build_id, browser_target, browser_family, browser_major,
    os_family, os_major, storage_mode, runtime_json, recording_json, summary_json,
    received_at, expires_at, ingest_token
  ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(batch.batchId, batch.runId, batch.flushReason, batch.startedAt, batch.endedAt,
      batch.release.version, batch.release.buildId, batch.release.browserTarget,
      batch.runtime.browserFamily, batch.runtime.browserMajor, batch.runtime.osFamily,
      batch.runtime.osMajor, batch.recording.storageMode, JSON.stringify(batch.runtime),
      JSON.stringify(batch.recording), JSON.stringify(batch.summary), receivedAt, expiresAt, ingestToken)
  const insertIncidents = batch.incidents.map((incident) => env.TELEMETRY_DB.prepare(`INSERT OR IGNORE INTO telemetry_incidents (
    incident_id, batch_id, kind, stage, severity, happened_at, duration_ms,
    error_name, error_fingerprint, context_json, expires_at
  ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM telemetry_batches WHERE batch_id = ? AND ingest_token = ?)`)
    .bind(incident.incidentId, batch.batchId, incident.kind, incident.stage, incident.severity,
      incident.at, incident.durationMs ?? null, incident.error?.name ?? null,
      incident.error?.fingerprint ?? null, JSON.stringify(incident.context), expiresAt, batch.batchId, ingestToken));
  // D1 batch executes atomically: a database failure cannot commit the batch row
  // without its incidents, and the ingest-token predicate makes redelivery a no-op.
  await env.TELEMETRY_DB.batch([insertBatch, ...insertIncidents]);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/api/telemetry/batches') return response(404, '{"error":"not_found"}');
    const origin = allowedOrigin(request, env);
    if (!origin) return response(403, '{"error":"origin_rejected"}');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (request.method !== 'POST') return response(405, '{"error":"method_not_allowed"}', origin);
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return response(415, '{"error":"unsupported_media_type"}', origin);
    const declaredHeader = request.headers.get('content-length');
    const declared = Number(declaredHeader ?? 0);
    if (declared > MAX_BODY_BYTES) return response(413, '{"error":"too_large"}', origin);
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_BODY_BYTES) return response(413, '{"error":"too_large"}', origin);
    if (declaredHeader !== null && (!Number.isFinite(declared) || declared < 0 || declared !== bytes.byteLength)) return response(400, '{"error":"invalid_content_length"}', origin);
    let decoded: unknown;
    try { decoded = JSON.parse(new TextDecoder().decode(bytes)); } catch { return response(400, '{"error":"invalid_json"}', origin); }
    const batch = validateBatch(decoded);
    if (!batch) return response(400, '{"error":"invalid_batch"}', origin);
    const rate = await env.TELEMETRY_RATE_LIMITER.limit({ key: await ephemeralRateKey(request) });
    if (!rate.success) return response(429, '{"error":"rate_limited"}', origin);
    try { await ingest(batch, env); } catch { return response(503, '{"error":"temporarily_unavailable"}', origin); }
    return response(202, '{"accepted":true}', origin);
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const now = Date.now();
    await env.TELEMETRY_DB.prepare('DELETE FROM telemetry_batches WHERE expires_at <= ?').bind(now).run();
  },
};
