import {
  ALLOWED_CONTEXT_CODES,
  ALLOWED_TELEMETRY_METRICS,
  TELEMETRY_MAX_CONTEXT_EVENTS,
  TELEMETRY_MAX_INCIDENTS,
  TELEMETRY_MAX_METRICS,
  createTelemetryId,
  type TelemetryContextEvent,
  type TelemetryFlushReason,
  type TelemetryIncident,
  type TelemetryIncidentInput,
  type TelemetrySink,
  type TelemetrySnapshot,
  type TelemetrySource,
} from './contracts';
import { boundedMetric, boundedString, sanitizeError, sanitizeTags } from './sanitize';

export type TelemetryAccumulatorCallbacks = {
  onCheckpoint?: (snapshot: TelemetrySnapshot, critical: boolean) => void | Promise<void>;
  onFlush?: (snapshot: TelemetrySnapshot, reason: TelemetryFlushReason) => void | Promise<void>;
};

export class TelemetryAccumulator implements TelemetrySink {
  private summary: Record<string, number> = {};
  private contexts: TelemetryContextEvent[] = [];
  private incidents: TelemetryIncident[] = [];
  private startedAt = Date.now();

  constructor(
    readonly runId: string,
    readonly source: TelemetrySource,
    private readonly callbacks: TelemetryAccumulatorCallbacks = {},
  ) {}

  increment(metric: string, value = 1): void {
    const safe = boundedMetric(value);
    if (!ALLOWED_TELEMETRY_METRICS.has(metric) || safe === null) return;
    if (!(metric in this.summary) && Object.keys(this.summary).length >= TELEMETRY_MAX_METRICS) return;
    this.summary[metric] = boundedMetric((this.summary[metric] ?? 0) + safe) ?? 0;
  }

  measure(metric: string, value: number): void {
    const safe = boundedMetric(value);
    if (!ALLOWED_TELEMETRY_METRICS.has(metric) || safe === null) return;
    if (!(metric in this.summary) && Object.keys(this.summary).length >= TELEMETRY_MAX_METRICS) return;
    this.summary[metric] = Math.max(this.summary[metric] ?? 0, safe);
  }

  context(code: string, tags?: Record<string, unknown>): void {
    if (!ALLOWED_CONTEXT_CODES.has(code)) return;
    this.contexts.push({ code, at: Date.now(), tags: sanitizeTags(tags) });
    if (this.contexts.length > TELEMETRY_MAX_CONTEXT_EVENTS) this.contexts.splice(0, this.contexts.length - TELEMETRY_MAX_CONTEXT_EVENTS);
  }

  incident(input: TelemetryIncidentInput): void {
    if (this.incidents.length >= TELEMETRY_MAX_INCIDENTS) return;
    const durationMs = boundedMetric(input.durationMs);
    this.incidents.push({
      incidentId: createTelemetryId(),
      kind: input.kind,
      stage: boundedString(input.stage),
      severity: input.severity ?? 'error',
      at: Date.now(),
      ...(durationMs === null ? {} : { durationMs }),
      ...(input.error ? { error: sanitizeError(input.error) } : {}),
      context: this.contexts.map((event) => ({ ...event, tags: { ...event.tags } })),
    });
  }

  checkpoint(critical = false): void {
    try {
      const result = this.callbacks.onCheckpoint?.(this.snapshot(), critical);
      if (result) void Promise.resolve(result).catch(() => {});
    } catch {}
  }

  flush(reason: TelemetryFlushReason): void {
    try {
      const result = this.callbacks.onFlush?.(this.snapshot(), reason);
      if (result) void Promise.resolve(result).catch(() => {});
    } catch {}
    this.incidents = [];
  }

  snapshot(): TelemetrySnapshot {
    return {
      runId: this.runId,
      source: this.source,
      startedAt: this.startedAt,
      endedAt: Date.now(),
      summary: { ...this.summary },
      incidents: this.incidents.map((incident) => ({
        ...incident,
        error: incident.error ? { ...incident.error } : undefined,
        context: incident.context.map((event) => ({ ...event, tags: { ...event.tags } })),
      })),
    };
  }

  reset(): void {
    this.summary = {};
    this.contexts = [];
    this.incidents = [];
    this.startedAt = Date.now();
  }
}
