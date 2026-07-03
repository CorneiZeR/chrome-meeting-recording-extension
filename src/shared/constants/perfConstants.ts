/**
 * @file shared/constants/perfConstants.ts
 *
 * Core constants and defaults for performance diagnostic logging.
 */

import { isDevBuild } from '../build';
import type { PerfFlags, PerfSettings } from '../types/perfTypes';

export const PERF_SETTINGS_STORAGE_KEY = 'perfSettings';
export const PERF_DEBUG_SNAPSHOT_STORAGE_KEY = 'perfDebugSnapshot';
// Hard ceiling on the retained raw event log. The whole snapshot is persisted to
// chrome.storage.session (~10MB quota) on every event, so an unbounded log would
// eventually exceed quota and silently freeze the persisted copy mid-run. 4000
// keeps the payload to a few MB; whole-session count/avg/max are maintained
// incrementally and are unaffected by eviction. On overflow the store evicts the
// oldest high-frequency sample first (see HIGH_FREQUENCY_PERF_EVENTS), preserving
// rare signal events so a multi-hour recording still keeps its failures/warnings.
export const PERF_EVENT_BUFFER_LIMIT = 4000;

// Per-chunk / per-sample / per-mutation events. These dominate the raw log (a long
// recording emits thousands) and are evicted first on overflow, because their
// whole-run statistics already live in `summary` and they carry little individual
// forensic value — unlike the rare signal events (lifecycle, failures, warnings,
// opens/closes, finalize) which we keep for the whole session.
export const HIGH_FREQUENCY_PERF_EVENTS: ReadonlySet<string> = new Set([
  'runtime:sample',
  'runtime:cpu',
  'recorder:chunk_persisted',
  'recorder:bitrate_observed',
  'storage:opfs_write_complete',
  'drive:chunk_uploaded',
  'captions:mutation_processed',
]);

export const DEFAULT_PERF_SETTINGS: PerfSettings = {
  audioPlaybackBridgeMode: 'always',
  adaptiveSelfVideoProfile: true,
  extendedTimeslice: false,
  dynamicDriveChunkSizing: true,
  parallelUploadConcurrency: 2,
  opfsWorkerStorage: true,
  debugMode: isDevBuild(),
};

export const PERF_FLAGS: PerfFlags = {
  audioPlaybackBridgeMode: DEFAULT_PERF_SETTINGS.audioPlaybackBridgeMode,
  adaptiveSelfVideoProfile: DEFAULT_PERF_SETTINGS.adaptiveSelfVideoProfile,
  extendedTimeslice: DEFAULT_PERF_SETTINGS.extendedTimeslice,
  dynamicDriveChunkSizing: DEFAULT_PERF_SETTINGS.dynamicDriveChunkSizing,
  parallelUploadConcurrency: DEFAULT_PERF_SETTINGS.parallelUploadConcurrency,
  opfsWorkerStorage: DEFAULT_PERF_SETTINGS.opfsWorkerStorage,
};
