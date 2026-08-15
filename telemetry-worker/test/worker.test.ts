import { describe, expect, it } from 'vitest';
import worker, { type Env } from '../src/index';

const origin = 'chrome-extension://kiineaoggnikfpcicndeocnbmaeediom';
const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const valid = () => ({
  schemaVersion: 1, batchId: id('1'), runId: id('2'), flushReason: 'incident', startedAt: Date.now() - 1000, endedAt: Date.now(),
  release: { version: '1.2.3', buildId: 'abc', browserTarget: 'chrome' },
  runtime: { browserFamily: 'chrome', browserMajor: '140', osFamily: 'macos', osMajor: '15', cpuBucket: '5-8', memoryBucket: '5-8', networkClass: '4g' },
  recording: { storageMode: 'local', microphoneMode: 'mixed', separateCamera: false, tabResolution: '<=1080p', tabFrameRate: '<=30', cameraResolution: 'unknown', cameraFrameRate: 'unknown' },
  summary: { 'capture.attempts': 1 },
  incidents: [{ incidentId: id('3'), kind: 'application_error', stage: 'runtime', severity: 'error', at: Date.now(), context: [] }],
});

function mockEnv(options: { rate?: boolean; fail?: boolean } = {}): Env & { incidentBatches: number } {
  let ingestToken: string | null = null;
  const env: any = {
    ALLOWED_EXTENSION_ORIGINS: origin,
    TELEMETRY_RATE_LIMITER: { limit: async () => ({ success: options.rate !== false }) },
    incidentBatches: 0,
    TELEMETRY_DB: {
      prepare(sql: string) {
        let bindings: any[] = [];
        return {
          sql,
          get bindings() { return bindings; },
          bind(...values: any[]) { bindings = values; return this; },
          async run() {
            if (options.fail) throw new Error('D1 unavailable');
            if (sql.startsWith('INSERT OR IGNORE INTO telemetry_batches') && ingestToken === null) ingestToken = bindings.at(-1);
            return { success: true };
          },
          async first() { return ingestToken ? { ingest_token: ingestToken } : null; },
        };
      },
      async batch(statements: any[]) {
        if (options.fail) throw new Error('D1 unavailable');
        const insert = statements[0];
        const candidateToken = insert.bindings.at(-1);
        const newlyAccepted = ingestToken === null;
        if (newlyAccepted) ingestToken = candidateToken;
        if (newlyAccepted && statements.slice(1).some((statement) => statement.bindings.at(-1) === ingestToken)) env.incidentBatches += 1;
        return statements;
      },
    },
  };
  return env;
}

const request = (body: unknown, requestOrigin = origin, method = 'POST') => new Request('https://telemetry.example/api/telemetry/batches', {
  method, headers: { origin: requestOrigin, 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.1' },
  ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
});

describe('telemetry Worker', () => {
  it('returns exact-origin preflight headers', async () => {
    const response = await worker.fetch(request(null, origin, 'OPTIONS'), mockEnv());
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(origin);
    expect(response.headers.get('vary')).toBe('Origin');
  });

  it('rejects lookalike origins without reflecting CORS', async () => {
    const response = await worker.fetch(request(valid(), `${origin}.evil.example`), mockEnv());
    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('rejects malformed payloads before D1', async () => {
    const env = mockEnv();
    const prepare = env.TELEMETRY_DB.prepare.bind(env.TELEMETRY_DB);
    let touched = false;
    env.TELEMETRY_DB.prepare = ((sql: string) => { touched = true; return prepare(sql); }) as any;
    expect((await worker.fetch(request({ ...valid(), filename: 'private.webm' }), env)).status).toBe(400);
    expect(touched).toBe(false);
  });

  it('accepts idempotent redelivery without duplicating incidents', async () => {
    const env = mockEnv();
    expect((await worker.fetch(request(valid()), env)).status).toBe(202);
    expect((await worker.fetch(request(valid()), env)).status).toBe(202);
    expect(env.incidentBatches).toBe(1);
  });

  it('returns retryable statuses for rate limits and D1 failures', async () => {
    expect((await worker.fetch(request(valid()), mockEnv({ rate: false }))).status).toBe(429);
    expect((await worker.fetch(request(valid()), mockEnv({ fail: true }))).status).toBe(503);
  });

  it('allows only POST/OPTIONS JSON and runs scheduled expiry', async () => {
    const env = mockEnv();
    expect((await worker.fetch(request(null, origin, 'GET'), env)).status).toBe(405);
    const wrongType = new Request('https://telemetry.example/api/telemetry/batches', { method: 'POST', headers: { origin, 'content-type': 'text/plain' }, body: '{}' });
    expect((await worker.fetch(wrongType, env)).status).toBe(415);
    let expiryRan = false;
    env.TELEMETRY_DB.prepare = ((sql: string) => ({
      bind: () => ({ run: async () => { expiryRan = sql.startsWith('DELETE FROM telemetry_batches'); } }),
    })) as any;
    await worker.scheduled({} as ScheduledController, env);
    expect(expiryRan).toBe(true);
  });
});
