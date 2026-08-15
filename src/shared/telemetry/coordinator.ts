import { getBuildId } from '../build';
import { collectCoarseRuntime, UNKNOWN_RECORDING_CONTEXT } from './config';
import {
  ALLOWED_TELEMETRY_METRICS,
  ALLOWED_CONTEXT_CODES,
  TELEMETRY_INCIDENT_KINDS,
  TELEMETRY_MAX_BATCH_BYTES,
  TELEMETRY_MAX_INCIDENTS,
  createTelemetryId,
  type TelemetryBatchV1,
  type TelemetryFlushReason,
  type TelemetryRecording,
  type TelemetrySnapshot,
} from './contracts';
import { TelemetryDelivery, TELEMETRY_RETRY_ALARM } from './delivery';
import { TelemetryStore, type TelemetryCheckpoint } from './store';
import { boundedMetric, boundedString, sanitizeTags } from './sanitize';

type ActiveRun = { runId: string; epoch?: number; recording: TelemetryRecording; snapshots: Map<string, TelemetrySnapshot>; uploadJobIds: Set<string>; lastCheckpointAt: number };
const TELEMETRY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INCIDENT_STAGES = new Set(['settings_load', 'runtime_ready', 'offscreen_start', 'offscreen_rpc', 'opfs_open', 'opfs_write', 'capture_stream', 'media_recorder', 'offscreen_phase', 'drive_upload', 'recovery', 'offscreen_window', 'offscreen_promise', 'runtime']);

export class TelemetryCoordinator {
  private readonly store: TelemetryStore;
  private readonly delivery: TelemetryDelivery;
  private runs = new Map<string, ActiveRun>();
  private enabled = true;

  constructor(store = new TelemetryStore(), delivery?: TelemetryDelivery) {
    this.store = store;
    this.delivery = delivery ?? new TelemetryDelivery(store);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.runs.clear();
      void this.store.clear().catch(() => {});
      void chrome.alarms?.clear?.(TELEMETRY_RETRY_ALARM);
    }
  }

  startRun(runId: string, recording = UNKNOWN_RECORDING_CONTEXT, epoch?: number): void {
    if (!this.enabled) return;
    this.runs.set(runId, { runId, epoch, recording, snapshots: new Map(), uploadJobIds: new Set(), lastCheckpointAt: 0 });
  }

  updateRun(runId: string, recording: TelemetryRecording, epoch?: number): void {
    const run = this.runs.get(runId);
    if (!run) { this.startRun(runId, recording, epoch); return; }
    run.recording = recording;
    run.epoch = epoch ?? run.epoch;
  }

  async merge(snapshot: TelemetrySnapshot, critical = false): Promise<void> {
    if (!this.enabled) return;
    const sanitized = this.sanitizeSnapshot(snapshot);
    if (!sanitized) return;
    snapshot = sanitized;
    const run: ActiveRun = this.runs.get(snapshot.runId) ?? { runId: snapshot.runId, epoch: undefined, recording: UNKNOWN_RECORDING_CONTEXT, snapshots: new Map(), uploadJobIds: new Set(), lastCheckpointAt: 0 };
    run.snapshots.set(snapshot.source, snapshot);
    this.runs.set(snapshot.runId, run);
    const now = Date.now();
    if (critical || now - run.lastCheckpointAt >= 60_000) {
      run.lastCheckpointAt = now;
      await this.store.putCheckpoint({ runId: run.runId, epoch: run.epoch, updatedAt: now, payload: this.serializeRun(run) });
    }
  }

  async flush(runId: string, reason: TelemetryFlushReason): Promise<void> {
    if (!this.enabled) return;
    const run = this.runs.get(runId);
    if (!run) return;
    const batch = this.buildBatch(run, reason);
    if (!batch) return;
    await this.delivery.enqueue(batch);
    if (reason === 'incident') {
      for (const snapshot of run.snapshots.values()) snapshot.incidents = [];
    }
    if (reason !== 'incident' && (reason !== 'recording_complete' || run.recording.storageMode !== 'drive')) {
      this.runs.delete(runId);
      await this.store.removeCheckpoint(runId);
    }
  }

  bindUploadJob(runId: string, jobId: string): void {
    const run = this.runs.get(runId);
    if (!run || !jobId) return;
    run.uploadJobIds.add(jobId);
    void this.store.putCheckpoint({ runId, epoch: run.epoch, updatedAt: Date.now(), payload: this.serializeRun(run) }).catch(() => {});
  }

  runIdForUploadJob(jobId: string): string | null {
    for (const run of this.runs.values()) if (run.uploadJobIds.has(jobId)) return run.runId;
    return null;
  }

  async recover(liveEpochs: Set<number>, liveUploadJobIds = new Set<string>()): Promise<void> {
    if (!this.enabled) return;
    for (const checkpoint of await this.store.listCheckpoints()) {
      const run = this.deserializeRun(checkpoint);
      if (!run) { await this.store.removeCheckpoint(checkpoint.runId); continue; }
      if ((checkpoint.epoch != null && liveEpochs.has(checkpoint.epoch)) || [...run.uploadJobIds].some((jobId) => liveUploadJobIds.has(jobId))) {
        this.runs.set(run.runId, run); continue;
      }
      let background = run.snapshots.get('background');
      if (!background) {
        background = { runId: run.runId, source: 'background', startedAt: checkpoint.updatedAt, endedAt: Date.now(), summary: {}, incidents: [] };
        run.snapshots.set('background', background);
      }
      background.incidents.push({
        incidentId: createTelemetryId(), kind: 'recording_interrupted', stage: 'recovery', severity: 'error', at: Date.now(), context: [],
      });
      const batch = this.buildBatch(run, 'recovery');
      if (batch) await this.delivery.enqueue(batch);
      await this.store.removeCheckpoint(checkpoint.runId);
    }
    await this.delivery.deliver();
  }

  async deliverPending(): Promise<void> { if (this.enabled) await this.delivery.deliver(); }

  private serializeRun(run: ActiveRun): unknown {
    return { recording: run.recording, snapshots: Array.from(run.snapshots.values()), uploadJobIds: Array.from(run.uploadJobIds) };
  }

  private sanitizeSnapshot(value: TelemetrySnapshot): TelemetrySnapshot | null {
    if (!value || !TELEMETRY_ID.test(value.runId) || !['background', 'offscreen', 'captions'].includes(value.source)) return null;
    const now = Date.now();
    const startedAt = typeof value.startedAt === 'number' && Number.isFinite(value.startedAt) ? Math.max(now - 45 * 86_400_000, Math.min(now + 300_000, value.startedAt)) : now;
    const endedAt = typeof value.endedAt === 'number' && Number.isFinite(value.endedAt) ? Math.max(startedAt, Math.min(now + 300_000, value.endedAt)) : now;
    const summary: Record<string, number> = {};
    for (const [metric, raw] of Object.entries(value.summary ?? {})) {
      const safe = boundedMetric(raw);
      if (safe === null || !ALLOWED_TELEMETRY_METRICS.has(metric)) continue;
      summary[metric] = safe;
      if (Object.keys(summary).length >= 64) break;
    }
    const incidents = (Array.isArray(value.incidents) ? value.incidents : []).slice(0, 10).flatMap((incident) => {
      if (!incident || !TELEMETRY_ID.test(incident.incidentId) || !TELEMETRY_INCIDENT_KINDS.includes(incident.kind) || !INCIDENT_STAGES.has(incident.stage)) return [];
      const durationMs = boundedMetric(incident.durationMs);
      const fingerprint = incident.error?.fingerprint && /^[0-9a-f]{8}$/.test(incident.error.fingerprint) ? incident.error.fingerprint : undefined;
      const name = incident.error?.name ? boundedString(incident.error.name).replace(/[^A-Za-z0-9_.-]/g, '') : undefined;
      return [{
        incidentId: incident.incidentId, kind: incident.kind, stage: incident.stage,
        severity: ['warning', 'error', 'fatal'].includes(incident.severity) ? incident.severity : 'error' as const,
        at: typeof incident.at === 'number' && Number.isFinite(incident.at) ? Math.max(startedAt, Math.min(endedAt, incident.at)) : endedAt,
        ...(durationMs === null ? {} : { durationMs }),
        ...((name || fingerprint) ? { error: { ...(name ? { name } : {}), ...(fingerprint ? { fingerprint } : {}) } } : {}),
        context: (Array.isArray(incident.context) ? incident.context : []).slice(-32).flatMap((event) => {
          if (!event || !ALLOWED_CONTEXT_CODES.has(event.code)) return [];
          return [{ code: event.code, at: typeof event.at === 'number' && Number.isFinite(event.at) ? Math.max(startedAt, Math.min(endedAt, event.at)) : endedAt, tags: sanitizeTags(event.tags) }];
        }),
      }];
    });
    return { runId: value.runId, source: value.source, startedAt, endedAt, summary, incidents };
  }

  private deserializeRun(checkpoint: TelemetryCheckpoint): ActiveRun | null {
    const payload = checkpoint.payload as { recording?: TelemetryRecording; snapshots?: TelemetrySnapshot[]; uploadJobIds?: string[] };
    if (!payload || !Array.isArray(payload.snapshots)) return null;
    return { runId: checkpoint.runId, epoch: checkpoint.epoch, recording: payload.recording ?? UNKNOWN_RECORDING_CONTEXT, snapshots: new Map(payload.snapshots.map((snapshot) => [snapshot.source, snapshot])), uploadJobIds: new Set((payload.uploadJobIds ?? []).filter((value) => typeof value === 'string').slice(0, 4)), lastCheckpointAt: checkpoint.updatedAt };
  }

  private buildBatch(run: ActiveRun, reason: TelemetryFlushReason): TelemetryBatchV1 | null {
    const snapshots = Array.from(run.snapshots.values());
    const mergedSummary: Record<string, number> = {};
    for (const snapshot of snapshots) for (const [metric, value] of Object.entries(snapshot.summary)) mergedSummary[metric] = Math.min(1_000_000_000, (mergedSummary[metric] ?? 0) + value);
    const priority = [...ALLOWED_TELEMETRY_METRICS].sort((left, right) => {
      const denominator = (name: string) => name.endsWith('.count') || name.endsWith('attempts') || name.endsWith('samples') || name.endsWith('jobs') ? 0 : name.endsWith('.max_ms') || name.endsWith('.max') ? 2 : 1;
      return denominator(left) - denominator(right);
    });
    const summary = Object.fromEntries(priority.filter((metric) => metric in mergedSummary).slice(0, 64).map((metric) => [metric, mergedSummary[metric]]));
    const incidents = snapshots.flatMap((snapshot) => snapshot.incidents).slice(0, TELEMETRY_MAX_INCIDENTS);
    if ((reason === 'incident' || reason === 'recovery') && incidents.length === 0) return null;
    const batch: TelemetryBatchV1 = {
      schemaVersion: 1, batchId: createTelemetryId(), runId: run.runId, flushReason: reason,
      startedAt: Math.min(...snapshots.map((snapshot) => snapshot.startedAt), Date.now()), endedAt: Date.now(),
      release: {
        version: chrome.runtime?.getManifest?.().version ?? 'unknown',
        buildId: getBuildId().slice(0, 128) || 'unknown',
        browserTarget: (typeof __BROWSER_TARGET__ === 'string' ? __BROWSER_TARGET__ : 'unknown').slice(0, 128),
      },
      runtime: collectCoarseRuntime(), recording: run.recording, summary, incidents,
    };
    while (new TextEncoder().encode(JSON.stringify(batch)).byteLength > TELEMETRY_MAX_BATCH_BYTES && incidents.some((incident) => incident.context.length > 0)) {
      const incident = incidents.find((candidate) => candidate.context.length > 0)!;
      incident.context.shift();
    }
    while (new TextEncoder().encode(JSON.stringify(batch)).byteLength > TELEMETRY_MAX_BATCH_BYTES && incidents.length > 0) incidents.shift();
    return new TextEncoder().encode(JSON.stringify(batch)).byteLength <= TELEMETRY_MAX_BATCH_BYTES ? batch : null;
  }
}
