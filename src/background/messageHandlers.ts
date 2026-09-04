/**
 * @file background/messageHandlers.ts
 *
 * Registers the chrome.runtime.onMessage listener and dispatches incoming
 * popup commands to their dedicated handlers.
 */

import { connectDrive, disconnectDrive, fetchDriveTokenWithFallback, getDriveConnection } from './driveAuth';
import { isE2EMockDriveBuild } from '../shared/build';
import { handleMeetingEndedMessage } from './recordingAutoStop';
import {
  isE2EDriveFetchMessage,
  isMeetingEndedMessage,
  isPerfEventMessage,
  isPopupToBgMessage,
  type CommandResult,
} from '../shared/protocol';
import { toStatusView } from '../shared/recording';
import { type PerfEventEntry } from '../shared/perf';
import type { RecordingController } from './RecordingController';
import type { RecordingSession } from './RecordingSession';
import type { PerfDebugStore } from './PerfDebugStore';
import type { CpuSampler } from './perf/CpuSampler';
import type { RecordingHistoryService } from './RecordingHistoryService';
import { isRecordingHistoryMessage } from '../shared/recordingHistory';

export type MessageHandlersDeps = {
  L: { log: (...a: any[]) => void; warn: (...a: any[]) => void; error: (...a: any[]) => void };
  session: RecordingSession;
  perfDebugStore: PerfDebugStore;
  controller: RecordingController;
  /** Dev-only system CPU sampler; null in production (no `system.cpu` permission). */
  cpuSampler?: CpuSampler | null;
  history?: RecordingHistoryService;
};

/**
 * Registers the chrome.runtime.onMessage listener that dispatches popup
 * commands to PERF_EVENT, GET_DRIVE_TOKEN, the Drive connect/disconnect pair,
 * START_RECORDING, STOP_RECORDING,
 * and GET_RECORDING_STATUS handlers.
 */
export function registerMessageHandlers({ L, session, perfDebugStore, controller, cpuSampler, history }: MessageHandlersDeps) {
  chrome.runtime.onMessage.addListener((
    msg: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => {
    if (
      (typeof __E2E_MOCK_DRIVE_BUILD__ !== 'undefined'
        ? __E2E_MOCK_DRIVE_BUILD__
        : isE2EMockDriveBuild())
      && isE2EDriveFetchMessage(msg)
    ) {
      if (!msg.url.startsWith('https://www.googleapis.com/')) {
        sendResponse({ ok: false, error: 'E2E Drive bridge rejected non-Google URL' });
        return false;
      }
      fetch(msg.url, {
        method: msg.method,
        headers: msg.headers,
        body: msg.body,
      })
        .then(async (response) => {
          const headers: Record<string, string> = {};
          response.headers.forEach((value, name) => {
            headers[name] = value;
          });
          sendResponse({
            ok: true,
            status: response.status,
            statusText: response.statusText,
            headers,
            body: await response.text(),
          });
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      return true;
    }

    if (isPerfEventMessage(msg)) {
      const entry = msg.entry as PerfEventEntry;
      perfDebugStore.record(entry);
      // Piggyback a system-CPU read on each runtime sample (dev builds only).
      // chrome.system.cpu lives in the background context, so we sample here on
      // the existing per-sample wake rather than running a separate SW timer.
      if (cpuSampler && entry.scope === 'runtime' && entry.event === 'sample') {
        void cpuSampler.sample().then((cpuPercent) => {
          if (cpuPercent != null) {
            perfDebugStore.record({
              source: entry.source,
              scope: 'runtime',
              event: 'cpu',
              ts: Date.now(),
              fields: { cpuPercent },
            });
          }
        });
      }
      sendResponse({ ok: true });
      return false;
    }

    if (isMeetingEndedMessage(msg)) {
      handleMeetingEndedMessage(msg, sender, { session, controller })
        .then((res) => sendResponse(res))
        .catch((e: any) => sendResponse({ ok: false, stopped: false, error: e?.message || String(e) }));
      return true;
    }

    if (!isPopupToBgMessage(msg)) return false;

    if (msg.type === 'GET_MEETING_TRANSCRIPT') {
      // Asked by the offscreen document during finalize. The transcript lives in
      // the Meet tab's content script, which the offscreen page cannot address,
      // so the background relays it and adds the capture origin the cue times are
      // rendered against.
      const snapshot = session.getSnapshot();
      const targetTabId = snapshot.targetTabId;
      const startedAt = snapshot.captureStartedAt;
      if (typeof targetTabId !== 'number') {
        sendResponse({ cues: [], ...(startedAt != null ? { startedAt } : {}) });
        return true;
      }
      chrome.tabs.sendMessage(targetTabId, { type: 'GET_TRANSCRIPT_CUES' })
        .then((response: { cues?: import('../shared/transcript').TranscriptCue[] } | undefined) => {
          sendResponse({ cues: response?.cues ?? [], ...(startedAt != null ? { startedAt } : {}) });
        })
        .catch((e: unknown) => {
          // A closed or reloaded Meet tab is normal: the recording still saves,
          // it just has no transcript to go with it.
          L.warn('Transcript unavailable from the meeting tab:', e instanceof Error ? e.message : String(e));
          sendResponse({ cues: [], ...(startedAt != null ? { startedAt } : {}) });
        });
      return true;
    }

    if (msg.type === 'GET_DRIVE_TOKEN') {
      fetchDriveTokenWithFallback({ refresh: msg.refresh === true })
        .then((res) => {
          if (!res.ok) L.warn('GET_DRIVE_TOKEN failed:', res.error);
          sendResponse(res);
        })
        .catch((e: any) => {
          const error = e?.message || String(e);
          L.error('GET_DRIVE_TOKEN unexpected failure:', error);
          sendResponse({ ok: false, error });
        });
      return true;
    }

    if (msg.type === 'GET_DRIVE_CONNECTION') {
      getDriveConnection()
        .then((connection) => sendResponse({ connection }))
        .catch((e: unknown) => {
          L.warn('GET_DRIVE_CONNECTION failed:', e instanceof Error ? e.message : String(e));
          sendResponse({ connection: { connected: false, email: null } });
        });
      return true;
    }

    if (msg.type === 'CONNECT_DRIVE') {
      connectDrive()
        .then((res) => {
          if (!res.ok) L.warn('CONNECT_DRIVE failed:', res.error);
          sendResponse(res);
        })
        .catch((e: unknown) => {
          const error = e instanceof Error ? e.message : String(e);
          L.error('CONNECT_DRIVE unexpected failure:', error);
          sendResponse({ ok: false, error });
        });
      return true;
    }

    if (msg.type === 'DISCONNECT_DRIVE') {
      disconnectDrive()
        .then((res) => {
          if (!res.ok) L.warn('DISCONNECT_DRIVE failed:', res.error);
          sendResponse(res);
        })
        .catch((e: unknown) => {
          const error = e instanceof Error ? e.message : String(e);
          L.error('DISCONNECT_DRIVE unexpected failure:', error);
          sendResponse({ ok: false, error });
        });
      return true;
    }

    const send = sendResponse as (r: CommandResult) => void;

    (async () => {
      if (
        ['LIST_RECORDING_HISTORY', 'RENAME_RECORDING_HISTORY', 'SET_RECORDING_HISTORY_NOTE', 'REMOVE_RECORDING_HISTORY', 'OPEN_RECORDING_HISTORY_FILE'].includes(msg.type)
        && !isRecordingHistoryMessage(msg)
      ) {
        throw new Error('Malformed recording history request');
      }
      if (msg.type === 'LIST_RECORDING_HISTORY') {
        if (!history) throw new Error('Recording history is unavailable');
        sendResponse({ ok: true, ...(await history.listPage(msg.cursor)) }); return;
      }
      if (msg.type === 'RENAME_RECORDING_HISTORY') {
        if (!history) throw new Error('Recording history is unavailable');
        const entry = await history.rename(msg.id, msg.name);
        let renamedSnapshot = session.getSnapshot();
        const job = renamedSnapshot.uploadJobs?.find((candidate) => candidate.historyId === msg.id);
        if (entry && job) {
          renamedSnapshot = session.upsertUploadJob({
            ...job,
            label: entry.name,
            namingStatus: 'named',
            driveFolderId: entry.driveFolderId ?? job.driveFolderId,
            driveFolderName: entry.driveFolderName ?? job.driveFolderName,
            folderWebViewLink: entry.folderWebViewLink ?? job.folderWebViewLink,
            files: job.files.map((file) => {
              const renamed = entry.files.find((candidate) => candidate.stream === file.stream);
              return renamed ? { ...file, filename: renamed.filename } : file;
            }),
          });
          await session.flush();
        }
        sendResponse({ ok: true, entry, session: toStatusView(renamedSnapshot) }); return;
      }
      if (msg.type === 'SET_RECORDING_HISTORY_NOTE') {
        if (!history) throw new Error('Recording history is unavailable');
        sendResponse({ ok: true, entry: await history.setNote(msg.id, msg.note) }); return;
      }
      if (msg.type === 'REMOVE_RECORDING_HISTORY') {
        if (!history) throw new Error('Recording history is unavailable');
        sendResponse({ ok: true, removed: await history.remove(msg.id) }); return;
      }
      if (msg.type === 'OPEN_RECORDING_HISTORY_FILE') {
        if (!history) throw new Error('Recording history is unavailable');
        await history.openLocalFile(msg.recordingId, msg.fileId);
        sendResponse({ ok: true }); return;
      }
      if (msg.type === 'START_RECORDING')    { send(await controller.start(msg)); return; }
      if (msg.type === 'STOP_RECORDING')     { send(await controller.stop('popup stop button')); return; }
      if (msg.type === 'DISCARD_RECORDING')  { send(await controller.discard('popup discard button')); return; }
      if (msg.type === 'SET_MIC_MUTED')      { send(await controller.setMicMuted(msg.muted)); return; }
      if (msg.type === 'SET_CAMERA_MUTED')   { send(await controller.setCameraMuted(msg.muted)); return; }
      if (msg.type === 'SET_INPUT_DEVICE')   { send(await controller.setInputDevice(msg.device, msg.deviceId)); return; }
      if (msg.type === 'SET_PAUSED')         { send(await controller.setPaused(msg.paused)); return; }
      if (msg.type === 'GET_RECORDING_STATUS') { sendResponse({ session: toStatusView(session.getSnapshot()) }); return; }
      if (msg.type === 'DISMISS_UPLOAD_JOB')   { sendResponse({ session: toStatusView(session.removeUploadJob(msg.jobId)) }); return; }
      if (msg.type === 'RETRY_UPLOAD_JOB')     { send(await controller.retryUpload(msg.jobId)); return; }
      if (msg.type === 'CANCEL_UPLOAD_JOB')    { send(await controller.cancelUpload(msg.jobId)); return; }
      if (msg.type === 'SKIP_RECORDING_NAMING') {
        const job = session.getSnapshot().uploadJobs?.find((candidate) => candidate.id === msg.jobId);
        if (!job || job.status !== 'completed') { send({ ok: false, error: 'Completed upload was not found', session: toStatusView(session.getSnapshot()) }); return; }
        const skippedSnapshot = session.upsertUploadJob({ ...job, namingStatus: 'skipped' });
        await session.flush();
        send({ ok: true, session: toStatusView(skippedSnapshot) }); return;
      }
    })().catch((err) => {
      console.error('[background] top-level error', err);
      const error = String(err);
      if (isPopupToBgMessage(msg) && ['LIST_RECORDING_HISTORY', 'RENAME_RECORDING_HISTORY', 'SET_RECORDING_HISTORY_NOTE', 'REMOVE_RECORDING_HISTORY', 'OPEN_RECORDING_HISTORY_FILE'].includes(msg.type)) {
        sendResponse({ ok: false, error });
      } else {
        session.fail(error);
        sendResponse({ ok: false, error, session: toStatusView(session.getSnapshot()) } satisfies CommandResult);
      }
    });

    return true;
  });
}
