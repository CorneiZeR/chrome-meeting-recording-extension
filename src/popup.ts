/**
 * @context  Extension Popup (browser_action page)
 * @role     Control Panel — start/stop recording, save transcript, manage mic permission.
 * @lifetime Created each time the user opens the popup; destroyed when it closes.
 *           Do NOT rely on state persisting here between opens.
 *
 * This file is intentionally thin: it reads DOM elements and hands them to
 * PopupController, which owns all interaction logic.
 *
 * Message flow:
 *   popup → background: START_RECORDING, STOP_RECORDING, GET_RECORDING_STATUS
 *   popup → content script: GET_TRANSCRIPT, RESET_TRANSCRIPT, GET_CAPTION_STATE
 *   background → popup: RECORDING_STATE, RECORDING_SAVED
 *
 * @see src/popup/PopupController.ts   — all interaction logic
 * @see src/popup/MicPermissionService.ts — permission query + priming flow
 * @see src/shared/protocol.ts         — all message type definitions
 */
import { PopupController } from './popup/PopupController';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

const controller = new PopupController({
  // Header + config view
  saveBtn: byId<HTMLButtonElement>('save'),
  micBtn: byId<HTMLButtonElement>('enable-mic'),
  micModeSelect: byId<HTMLSelectElement>('mic-mode'),
  startBtn: byId<HTMLButtonElement>('start-rec'),
  storageModeSelect: byId<HTMLSelectElement>('storage-mode'),
  recordSelfVideoCheckbox: byId<HTMLInputElement>('record-self-video'),
  tabContentTypeGroup: byId('tab-content-type'),
  openSettingsBtn: byId<HTMLButtonElement>('open-settings'),
  openRecordingsBtn: byId<HTMLButtonElement>('open-recordings'),
  openDiagnosticsBtn: byId<HTMLButtonElement>('open-diagnostics'),
  ppHeader: byId('pp-header'),

  // View containers
  viewConfig: byId('view-config'),
  viewPermission: byId('view-permission'),
  viewRecording: byId('view-recording'),
  viewFinalizing: byId('view-finalizing'),

  // Permission interstitial
  permMicState: byId('perm-mic-state'),
  permCameraState: byId('perm-camera-state'),
  permissionCopy: byId('permission-copy'),
  grantPermissionBtn: byId<HTMLButtonElement>('grant-permission'),
  permissionContinueBtn: byId<HTMLButtonElement>('permission-continue'),

  // Recording view
  recBanner: byId('rec-banner'),
  recLabel: byId('rec-label'),
  recTimer: byId('rec-timer'),
  chipTranscript: byId('chip-transcript'),
  chipTranscriptLabel: byId('chip-transcript-label'),
  chipStorage: byId('chip-storage'),
  chipStorageLabel: byId('chip-storage-label'),
  micRow: byId('row-mic'),
  micModeLabel: byId('mic-mode-label'),
  micMeterBars: Array.from(document.querySelectorAll<HTMLElement>('#row-mic .meter span')),
  muteMicBtn: byId<HTMLButtonElement>('mute-mic'),
  cameraRow: byId('row-camera'),
  hideCameraBtn: byId<HTMLButtonElement>('hide-camera'),
  pauseBtn: byId<HTMLButtonElement>('pause-recording'),
  stopBtn: byId<HTMLButtonElement>('stop-rec'),
  discardBtn: byId<HTMLButtonElement>('discard-rec'),

  // Finalizing view
  finalizingLabel: byId('finalizing-label'),
  finalizingSub: byId('finalizing-sub'),
  finalizingFiles: byId('finalizing-files'),
  uploadRing: byId('upload-ring'),
  uploadRingArc: byId('upload-ring-arc'),
  uploadRingLabel: byId('upload-ring-label'),
  metaStorage: byId('meta-storage'),
  metaDuration: byId('meta-duration'),
  metaMic: byId('meta-mic'),
  metaCamera: byId('meta-camera'),

  // Session tabs + per-job upload view
  sessionTabs: byId('session-tabs'),
  viewUpload: byId('view-upload'),
  uploadProgress: byId('upload-progress'),
  uploadDone: byId('upload-done'),
  uploadJobLabel: byId('upload-job-label'),
  uploadJobPct: byId('upload-job-pct'),
  uploadBarFill: byId('upload-bar-fill'),
  uploadJobMeta: byId('upload-job-meta'),
  uploadJobSub: byId('upload-job-sub'),
  uploadJobFiles: byId('upload-job-files'),
  uploadJobOpenDrive: byId<HTMLButtonElement>('upload-job-open-drive'),
  uploadJobRetry: byId<HTMLButtonElement>('upload-job-retry'),
  uploadJobCancel: byId<HTMLButtonElement>('upload-job-cancel'),
  cameraWarning: byId('camera-warning'),
  cameraWarningText: byId('camera-warning-text'),
  tabSourceSub: byId('tab-source-sub'),

  // Shared status / toast line
  recordingStatusEl: byId('recording-status'),
});

controller.init();
