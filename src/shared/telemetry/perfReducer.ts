import type { PerfEventEntry } from '../types/perfTypes';
import type { TelemetrySink } from './contracts';

const numberField = (entry: PerfEventEntry, ...names: string[]): number | null => {
  for (const name of names) {
    const value = entry.fields[name];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  }
  return null;
};

const addDuration = (sink: TelemetrySink, prefix: string, value: number | null): void => {
  if (value === null) return;
  sink.increment(`${prefix}.count`);
  sink.increment(`${prefix}.total_ms`, value);
  sink.measure(`${prefix}.max_ms`, value);
};

export function reducePerfEntryToTelemetry(entry: PerfEventEntry, sink: TelemetrySink): void {
  const key = `${entry.scope}.${entry.event}`;
  const duration = numberField(entry, 'durationMs', 'elapsedMs', 'latencyMs', 'writeMs');
  const bytes = numberField(entry, 'bytes', 'sizeBytes', 'artifactBytes', 'chunkBytes', 'totalBytes');
  switch (key) {
    case 'capture.stream_acquired':
      sink.increment('capture.attempts'); sink.increment('capture.successes'); addDuration(sink, 'capture.start', duration); sink.context('capture_ready'); break;
    case 'capture.stream_failed':
      sink.increment('capture.attempts'); sink.increment('capture.failures'); sink.context('capture_failed'); break;
    case 'recorder.recorder_started': sink.increment('recorder.starts'); sink.context('recorder_started'); break;
    case 'recorder.chunk_persisted':
      sink.increment('recorder.chunks'); if (bytes !== null) sink.increment('recorder.bytes', bytes); addDuration(sink, 'recorder.write', duration); break;
    case 'recorder.artifact_sealed':
      if (bytes !== null) sink.increment('recorder.artifact_bytes', bytes); addDuration(sink, 'recorder.seal', duration); sink.context('artifact_sealed'); break;
    case 'storage.opfs_opened': sink.increment('storage.opens'); sink.context('storage_opened'); break;
    case 'storage.open_failed':
    case 'storage.opfs_open_failed': sink.increment('storage.open_failures'); sink.context('storage_failed'); sink.incident({ kind: 'storage_open_failed', stage: 'opfs_open' }); sink.flush('incident'); break;
    case 'storage.write_complete':
    case 'storage.opfs_write_complete':
      sink.increment('storage.writes'); if (entry.fields.worker === true) sink.increment('storage.worker_writes');
      sink.measure('storage.pending_writes.max', numberField(entry, 'peakPendingWrites', 'pendingWrites') ?? 0); break;
    case 'storage.write_failed': sink.increment('storage.write_failures'); sink.context('storage_failed'); break;
    case 'storage.write_failure_stop': sink.context('protective_stop'); sink.incident({ kind: 'storage_write_failed', stage: 'opfs_write' }); sink.flush('incident'); break;
    case 'storage.write_backpressure': sink.increment('storage.soft_backpressure'); sink.context('backpressure'); break;
    case 'storage.write_ceiling':
    case 'storage.write_backpressure_ceiling': sink.increment('storage.hard_backpressure'); sink.context('protective_stop'); sink.incident({ kind: 'storage_backpressure_stop', stage: 'opfs_write' }); sink.flush('incident'); break;
    case 'storage.closed':
    case 'storage.opfs_closed': sink.increment('storage.closes'); break;
    case 'storage.cleanup':
    case 'storage.opfs_cleanup': sink.increment('storage.cleanups'); break;
    case 'lifecycle.failure': sink.increment('lifecycle.failures'); break;
    case 'lifecycle.required_stream_lost': sink.context('stream_lost'); sink.incident({ kind: 'required_stream_lost', stage: 'capture_stream' }); sink.flush('incident'); break;
    case 'lifecycle.recorder_error': sink.increment('lifecycle.failures'); sink.incident({ kind: 'recording_runtime_failed', stage: 'media_recorder' }); sink.flush('incident'); break;
    case 'lifecycle.protective_stop': sink.context('protective_stop'); break;
    case 'lifecycle.stop_requested': sink.context('stop_requested'); break;
    case 'finalizer.local_save_requested': sink.increment('local_save.requests'); sink.context('finalize_started'); break;
    case 'finalizer.download_complete': sink.increment('local_save.successes'); break;
    case 'finalizer.download_failed': sink.increment('local_save.failures'); break;
    case 'finalizer.finalize_complete': addDuration(sink, 'finalize', duration); sink.context('finalize_completed'); break;
    case 'drive.chunk_uploaded':
      sink.increment('upload.chunks'); if (bytes !== null) sink.increment('upload.bytes', bytes); addDuration(sink, 'upload.request', duration);
      sink.increment('upload.retries', Math.max(0, (numberField(entry, 'attempts') ?? 1) - 1)); break;
    case 'drive.file_uploaded': sink.increment('upload.files'); break;
    case 'drive.retry': sink.increment('upload.retries'); sink.context('upload_retry'); break;
    case 'captions.mutation_processed':
      sink.increment('captions.mutations'); sink.increment('captions.changes', entry.fields.changed === true ? 1 : numberField(entry, 'changes', 'changedCount') ?? 0);
      sink.increment('captions.coalesced', entry.fields.coalesced === true ? 1 : numberField(entry, 'coalesced', 'coalescedCount') ?? 0);
      sink.increment('captions.misses', numberField(entry, 'missed', 'missedCount') ?? 0);
      addDuration(sink, 'captions.processing', numberField(entry, 'processingMs', 'durationMs'));
      addDuration(sink, 'captions.source_latency', numberField(entry, 'sourceLatencyMs', 'latencyMs')); break;
    case 'captions.observer_count': sink.measure('captions.observers.max', numberField(entry, 'count', 'observerCount', 'activeBlockObservers') ?? 0); break;
    case 'captions.long_task':
      sink.increment('captions.long_tasks', numberField(entry, 'count') ?? 1);
      sink.increment('captions.long_task.total_ms', numberField(entry, 'totalMs') ?? duration ?? 0);
      sink.measure('captions.long_task.max_ms', numberField(entry, 'maxMs') ?? duration ?? 0); break;
    case 'runtime.sample':
      sink.increment('runtime.samples'); addDuration(sink, 'runtime.event_loop_lag', numberField(entry, 'eventLoopLagMs'));
      sink.measure('runtime.long_tasks', numberField(entry, 'longTaskCount') ?? 0);
      sink.measure('runtime.long_task.total_ms', numberField(entry, 'longTaskDurationMs') ?? 0);
      sink.measure('runtime.active_recorders.max', numberField(entry, 'activeRecorders') ?? 0);
      sink.measure('runtime.heap_bucket.max', numberField(entry, 'heapBucket') ?? 0); break;
    default: break;
  }
}
