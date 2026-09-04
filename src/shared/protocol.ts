/**
 * @file shared/protocol.ts
 *
 * Single source of truth for all inter-context message contracts in the
 * extension.
 */

import type { MeetingProviderInfo } from './provider';
import type { RecorderRuntimeSettingsSnapshot } from './settings';
import type { PerfSettings } from './perf';
import type {
  RecordingRunConfig,
  RecordingStatusView,
  RecordingPhase,
  RecordingCaptureDevices,
  RecordingInputDevice,
  CapturedTabResolution,
  UploadJob,
  UploadSummary,
} from './recording';
import {
  BG_TO_OFFSCREEN_RUNTIME_CONNECT,
  CONTENT_TO_BG_MESSAGE_TYPES,
  OFFSCREEN_TO_BG_MESSAGE_TYPES,
  PERF_EVENT_MESSAGE_TYPE,
  PERF_REPORT_STATE_MESSAGE_TYPE,
  POPUP_TO_BG_MESSAGE_TYPES,
  POPUP_TO_CONTENT_MESSAGE_TYPES,
} from './protocolMessageTypes';
import { getMessageType, hasKnownMessageType } from './typeGuards';
import type { RecordingHistoryCursor, RecordingHistoryEntry } from './recordingHistory';

export type RpcId = string;

export type RpcRequest<T extends { type: string }> = T & { __id?: RpcId };
export type RpcResponse<T = unknown> = { __respFor: RpcId; payload: T };

export type CommandResult =
  | { ok: true; session: RecordingStatusView }
  | { ok: false; error: string; session: RecordingStatusView };

export type DriveTokenResponse =
  | { ok: true; token: string }
  | { ok: false; error: string };

/** What the settings page shows about the connected Google account. */
export type DriveConnectionView = {
  connected: boolean;
  email: string | null;
  /** False when the browser decides the account (Chrome's native sign-in), so no picker is offered. */
  canChooseAccount: boolean;
};

export type DriveConnectResponse =
  | { ok: true; connection: DriveConnectionView }
  | { ok: false; error: string };

export type DriveDisconnectResponse = { ok: true } | { ok: false; error: string };

export type PopupStartRecording = {
  type: 'START_RECORDING';
  tabId: number;
  runConfig: RecordingRunConfig;
};

export type PopupStopRecording = { type: 'STOP_RECORDING' };
/** Stops the active capture and permanently deletes its temporary media artifacts. */
export type PopupDiscardRecording = { type: 'DISCARD_RECORDING' };
export type PopupGetRecordingStatus = { type: 'GET_RECORDING_STATUS' };
export type PopupGetDriveToken = { type: 'GET_DRIVE_TOKEN'; refresh?: boolean };
/** Reads the stored Google grant for the settings page, without prompting. */
export type PopupGetDriveConnection = { type: 'GET_DRIVE_CONNECTION' };
/** Runs the interactive Google account picker + consent from the settings page. */
export type PopupConnectDrive = { type: 'CONNECT_DRIVE' };
/** Revokes the Google grant and forgets it. */
export type PopupDisconnectDrive = { type: 'DISCONNECT_DRIVE' };
/** Toggles microphone mute on the live recording; the mic emits silence while muted. */
export type PopupSetMicMuted = { type: 'SET_MIC_MUTED'; muted: boolean };
/** Toggles the camera on the live self-video recording; it emits black frames while hidden. */
export type PopupSetCameraMuted = { type: 'SET_CAMERA_MUTED'; muted: boolean };
/** Switches the live microphone or camera track to a different enumerated input. */
export type PopupSetInputDevice = { type: 'SET_INPUT_DEVICE'; device: RecordingInputDevice; deviceId: string };
/** Pauses/resumes the whole recording; the paused span is absent from the files (seamless join). */
export type PopupSetPaused = { type: 'SET_PAUSED'; paused: boolean };
/** Dismisses a finished background upload job's tab (ADR-0004). */
export type PopupDismissUploadJob = { type: 'DISMISS_UPLOAD_JOB'; jobId: string };
/** Retries a failed/partial background upload job (ADR-0004). */
export type PopupRetryUploadJob = { type: 'RETRY_UPLOAD_JOB'; jobId: string };
/** Cancels an active Drive upload and downloads every unfinished file locally. */
export type PopupCancelUploadJob = { type: 'CANCEL_UPLOAD_JOB'; jobId: string };
/** Marks the one-time completed-upload naming prompt handled without renaming. */
export type PopupSkipRecordingNaming = { type: 'SKIP_RECORDING_NAMING'; jobId: string };
/** Reads one bounded, newest-first page of recording history. */
export type PopupListRecordingHistory = { type: 'LIST_RECORDING_HISTORY'; cursor?: RecordingHistoryCursor };
export type PopupRenameRecordingHistory = { type: 'RENAME_RECORDING_HISTORY'; id: string; name: string };
export type PopupSetRecordingHistoryNote = { type: 'SET_RECORDING_HISTORY_NOTE'; id: string; note: string };
export type PopupRemoveRecordingHistory = { type: 'REMOVE_RECORDING_HISTORY'; id: string };
export type PopupOpenRecordingHistoryFile = { type: 'OPEN_RECORDING_HISTORY_FILE'; recordingId: string; fileId: string };

/**
 * Asks the background for the live meeting transcript. Sent by the offscreen
 * document while finalizing, because that is the one point every stop path
 * (popup button, shortcut, auto-stop, watchdog) funnels through.
 */
export type OffscreenGetMeetingTranscript = { type: 'GET_MEETING_TRANSCRIPT' };

export type PopupToBg =
  | OffscreenGetMeetingTranscript
  | PopupStartRecording
  | PopupStopRecording
  | PopupDiscardRecording
  | PopupGetRecordingStatus
  | PopupGetDriveToken
  | PopupGetDriveConnection
  | PopupConnectDrive
  | PopupDisconnectDrive
  | PopupSetMicMuted
  | PopupSetCameraMuted
  | PopupSetInputDevice
  | PopupSetPaused
  | PopupDismissUploadJob
  | PopupRetryUploadJob
  | PopupCancelUploadJob
  | PopupSkipRecordingNaming
  | PopupListRecordingHistory
  | PopupRenameRecordingHistory
  | PopupSetRecordingHistoryNote
  | PopupRemoveRecordingHistory
  | PopupOpenRecordingHistoryFile;

export type PopupToBgResponse<T extends PopupToBg> =
  T extends OffscreenGetMeetingTranscript ? { cues: import('./transcript').TranscriptCue[]; startedAt?: number } :
  T extends PopupStartRecording ? CommandResult :
  T extends PopupStopRecording ? CommandResult :
  T extends PopupDiscardRecording ? CommandResult :
  T extends PopupGetRecordingStatus ? { session: RecordingStatusView } :
  T extends PopupGetDriveToken ? DriveTokenResponse :
  T extends PopupGetDriveConnection ? { connection: DriveConnectionView } :
  T extends PopupConnectDrive ? DriveConnectResponse :
  T extends PopupDisconnectDrive ? DriveDisconnectResponse :
  T extends PopupSetMicMuted ? CommandResult :
  T extends PopupSetCameraMuted ? CommandResult :
  T extends PopupSetInputDevice ? CommandResult :
  T extends PopupSetPaused ? CommandResult :
  T extends PopupDismissUploadJob ? { session: RecordingStatusView } :
  T extends PopupRetryUploadJob ? CommandResult :
  T extends PopupCancelUploadJob ? CommandResult :
  T extends PopupListRecordingHistory ? { ok: true; entries: RecordingHistoryEntry[]; nextCursor?: RecordingHistoryCursor } | { ok: false; error: string } :
  T extends PopupRenameRecordingHistory ? { ok: true; entry?: RecordingHistoryEntry; session?: RecordingStatusView } | { ok: false; error: string } :
  T extends PopupSkipRecordingNaming ? CommandResult :
  T extends PopupSetRecordingHistoryNote ? { ok: true; entry?: RecordingHistoryEntry } | { ok: false; error: string } :
  T extends PopupRemoveRecordingHistory ? { ok: true; removed: boolean } | { ok: false; error: string } :
  T extends PopupOpenRecordingHistoryFile ? { ok: true } | { ok: false; error: string } :
  never;

export type PopupGetTranscript = { type: 'GET_TRANSCRIPT' };
export type PopupResetTranscript = { type: 'RESET_TRANSCRIPT' };
/** Asks the content script whether the Meet captions region is currently present. */
export type PopupGetCaptionState = { type: 'GET_CAPTION_STATE' };
/** Asks the content script to switch Meet's captions on when they are off. */
export type ContentEnableCaptions = { type: 'ENABLE_CAPTIONS' };
/** Asks the content script for committed utterances with their epoch-ms timings. */
export type ContentGetTranscriptCues = { type: 'GET_TRANSCRIPT_CUES' };

export type PopupToContent =
  | ContentEnableCaptions
  | ContentGetTranscriptCues
  | PopupGetTranscript
  | PopupResetTranscript
  | PopupGetCaptionState;

export type PopupToContentResponse<T extends PopupToContent> =
  T extends PopupGetTranscript ? { transcript: string; provider: MeetingProviderInfo } :
  T extends PopupResetTranscript ? { ok: true } :
  T extends PopupGetCaptionState ? { captionsActive: boolean } :
  T extends ContentGetTranscriptCues ? { cues: import('./transcript').TranscriptCue[] } :
  T extends ContentEnableCaptions ? { enabled: boolean } :
  never;

export type ContentMeetingEnded = {
  type: 'MEETING_ENDED';
  meetingId: string | null;
  reason?: string;
};

export type BgToPopup =
  | { type: 'RECORDING_STATE'; session: RecordingStatusView }
  | { type: 'RECORDING_SAVED'; filename?: string }
  | { type: 'RECORDING_SAVE_ERROR'; filename?: string; error: string };

/**
 * Typed phase update emitted by the offscreen document and applied to the
 * background-owned session. Both ends are our own code, so the receiver trusts
 * this shape instead of re-normalizing arbitrary input.
 */
export type OffscreenPhaseUpdate = {
  phase: RecordingPhase;
  /**
   * Run epoch echoed back from the offscreen's OFFSCREEN_START. The background
   * fences stale status by dropping any update whose epoch ≠ the current run's;
   * see ADR-0003. Optional so a pre-epoch offscreen reads as "no epoch" (dropped
   * during an active run) rather than a type error.
   */
  epoch?: number;
  uploadSummary?: UploadSummary;
  error?: string;
  warnings?: string[];
  tabResolution?: CapturedTabResolution;
  capturedDevices?: RecordingCaptureDevices;
  /** Bounded anonymous producer snapshot carried only to the background coordinator. */
};

export type BgToOffscreenRpc =
  | RpcRequest<{
      type: 'OFFSCREEN_START';
      streamId: string;
      meetingSlug: string;
      runConfig: RecordingRunConfig;
      recorderSettings: RecorderRuntimeSettingsSnapshot;
      perfSettings: PerfSettings;
      historyId: string;
      /** Monotonic run epoch the offscreen must echo in OFFSCREEN_STATE; see ADR-0003. */
      epoch: number;
    }>
  | RpcRequest<{ type: 'OFFSCREEN_STOP' }>
  | RpcRequest<{ type: 'OFFSCREEN_DISCARD' }>
  | RpcRequest<{ type: 'OFFSCREEN_SET_MIC_MUTED'; muted: boolean }>
  | RpcRequest<{ type: 'OFFSCREEN_SET_CAMERA_MUTED'; muted: boolean }>
  | RpcRequest<{ type: 'OFFSCREEN_SET_INPUT_DEVICE'; device: RecordingInputDevice; deviceId: string }>
  | RpcRequest<{ type: 'OFFSCREEN_SET_PAUSED'; paused: boolean }>
  | RpcRequest<{ type: 'OFFSCREEN_RETRY_UPLOAD'; jobId: string }>
  | RpcRequest<{ type: 'OFFSCREEN_CANCEL_UPLOAD'; jobId: string }>
  | RpcRequest<{
      type: 'OFFSCREEN_RENAME_DRIVE_RESOURCES';
      resources: Array<{ id: string; name: string }>;
    }>;

export type BgToOffscreenOneWay =
  | { type: 'REVOKE_BLOB_URL'; blobUrl: string; opfsFilename?: string }
  /** Background persisted a terminal upload outcome and history state. */
  | { type: 'OFFSCREEN_ACK_UPLOAD_STATE'; jobId: string };

export type BgToOffscreenRuntime =
  | { type: 'OFFSCREEN_CONNECT' };

export type OffscreenToBg =
  | { type: 'OFFSCREEN_READY'; version?: string }
  | ({ type: 'OFFSCREEN_STATE' } & OffscreenPhaseUpdate)
  | { type: 'OFFSCREEN_UPLOAD_STATE'; job: UploadJob }
  | { type: 'OFFSCREEN_SAVE'; historyId: string; stream: import('./recording').RecordingStream; filename: string; blobUrl: string; opfsFilename?: string };


/**
 * Asks a producer to report its current diagnostics state again.
 *
 * The background clears the perf snapshot when a new recording starts, which
 * discards state a producer reported once and would not repeat — the caption
 * observer count is reported on change, and a steady count never changes again.
 */
export type PerfReportStateMessage = { type: 'PERF_REPORT_STATE' };

export type PerfEventMessage = {
  type: 'PERF_EVENT';
  entry: {
    source: string;
    scope: string;
    event: string;
    ts: number;
    fields: Record<string, string | number | boolean | null>;
  };
};

export type E2EDriveFetchMessage = {
  type: 'E2E_DRIVE_FETCH';
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
};

/** Checks whether a runtime message belongs to the popup -> background command set. */
export function isPopupToBgMessage(value: unknown): value is PopupToBg {
  return hasKnownMessageType(value, POPUP_TO_BG_MESSAGE_TYPES);
}

/** Checks whether a tab message belongs to the popup -> content command set. */
export function isPopupToContentMessage(value: unknown): value is PopupToContent {
  return hasKnownMessageType(value, POPUP_TO_CONTENT_MESSAGE_TYPES);
}

/** Checks whether a content script message reports that the active meeting ended. */
export function isMeetingEndedMessage(value: unknown): value is ContentMeetingEnded {
  return hasKnownMessageType(value, CONTENT_TO_BG_MESSAGE_TYPES);
}

/** Checks whether a port/runtime message belongs to the offscreen -> background set. */
export function isOffscreenToBgMessage(value: unknown): value is OffscreenToBg {
  return hasKnownMessageType(value, OFFSCREEN_TO_BG_MESSAGE_TYPES);
}

/** Checks whether a runtime nudge is asking the offscreen page to reconnect its port. */
export function isBgToOffscreenRuntimeMessage(value: unknown): value is BgToOffscreenRuntime {
  return getMessageType(value) === BG_TO_OFFSCREEN_RUNTIME_CONNECT;
}

/** Checks whether a message asks a producer to re-state its diagnostics. */
export function isPerfReportStateMessage(value: unknown): value is PerfReportStateMessage {
  return getMessageType(value) === PERF_REPORT_STATE_MESSAGE_TYPE;
}

/** Checks whether a message is a structured performance event emitted by another context. */
export function isPerfEventMessage(value: unknown): value is PerfEventMessage {
  return getMessageType(value) === PERF_EVENT_MESSAGE_TYPE;
}

export function isE2EDriveFetchMessage(value: unknown): value is E2EDriveFetchMessage {
  return getMessageType(value) === 'E2E_DRIVE_FETCH';
}

/** Creates a lightweight random request id for port-based RPC messages. */
export function makeId(): string {
  return Math.random().toString(36).slice(2);
}
