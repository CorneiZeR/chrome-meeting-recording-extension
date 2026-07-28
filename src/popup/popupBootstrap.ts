/**
 * Owns the popup document's element map.
 *
 * Keeping this map in one deep module prevents the production popup and the
 * development preview from silently drifting onto different DOM contracts.
 */

import { PopupController } from './PopupController';

const byId = <T extends HTMLElement>(doc: Document, id: string): T | null =>
  doc.getElementById(id) as T | null;

export function createPopupController(doc: Document = document): PopupController {
  return new PopupController({
    // Header + config view
    saveBtn: byId<HTMLButtonElement>(doc, 'save'),
    micBtn: byId<HTMLButtonElement>(doc, 'enable-mic'),
    micModeSelect: byId<HTMLSelectElement>(doc, 'mic-mode'),
    startBtn: byId<HTMLButtonElement>(doc, 'start-rec'),
    storageModeSelect: byId<HTMLSelectElement>(doc, 'storage-mode'),
    recordSelfVideoCheckbox: byId<HTMLInputElement>(doc, 'record-self-video'),
    tabContentTypeGroup: byId(doc, 'tab-content-type'),
    openSettingsBtn: byId<HTMLButtonElement>(doc, 'open-settings'),
    openRecordingsBtn: byId<HTMLButtonElement>(doc, 'open-recordings'),
    openDiagnosticsBtn: byId<HTMLButtonElement>(doc, 'open-diagnostics'),
    ppHeader: byId(doc, 'pp-header'),

    // View containers
    viewConfig: byId(doc, 'view-config'),
    viewPermission: byId(doc, 'view-permission'),
    viewRecording: byId(doc, 'view-recording'),
    viewFinalizing: byId(doc, 'view-finalizing'),

    // Permission interstitial
    permMicState: byId(doc, 'perm-mic-state'),
    permCameraState: byId(doc, 'perm-camera-state'),
    permissionCopy: byId(doc, 'permission-copy'),
    grantPermissionBtn: byId<HTMLButtonElement>(doc, 'grant-permission'),
    permissionContinueBtn: byId<HTMLButtonElement>(doc, 'permission-continue'),

    // Recording view
    recBanner: byId(doc, 'rec-banner'),
    recLabel: byId(doc, 'rec-label'),
    recTimer: byId(doc, 'rec-timer'),
    chipTranscript: byId(doc, 'chip-transcript'),
    chipTranscriptLabel: byId(doc, 'chip-transcript-label'),
    chipStorage: byId(doc, 'chip-storage'),
    chipStorageLabel: byId(doc, 'chip-storage-label'),
    micRow: byId(doc, 'row-mic'),
    micModeLabel: byId(doc, 'mic-mode-label'),
    micDeviceLabel: byId(doc, 'mic-device-label'),
    micDeviceTrigger: byId<HTMLButtonElement>(doc, 'mic-device-trigger'),
    muteMicBtn: byId<HTMLButtonElement>(doc, 'mute-mic'),
    cameraRow: byId(doc, 'row-camera'),
    cameraDeviceLabel: byId(doc, 'camera-device-label'),
    cameraDeviceTrigger: byId<HTMLButtonElement>(doc, 'camera-device-trigger'),
    hideCameraBtn: byId<HTMLButtonElement>(doc, 'hide-camera'),
    devicePicker: byId(doc, 'device-picker'),
    devicePickerTitle: byId(doc, 'device-picker-title'),
    devicePickerList: byId(doc, 'device-picker-list'),
    devicePickerError: byId(doc, 'device-picker-error'),
    devicePickerTrack: byId(doc, 'device-picker-track'),
    devicePickerMode: byId(doc, 'device-picker-mode'),
    devicePickerClose: byId<HTMLButtonElement>(doc, 'device-picker-close'),
    pauseBtn: byId<HTMLButtonElement>(doc, 'pause-recording'),
    stopBtn: byId<HTMLButtonElement>(doc, 'stop-rec'),
    discardBtn: byId<HTMLButtonElement>(doc, 'discard-rec'),

    // Finalizing view
    finalizingLabel: byId(doc, 'finalizing-label'),
    finalizingSub: byId(doc, 'finalizing-sub'),
    finalizingFiles: byId(doc, 'finalizing-files'),
    uploadRing: byId(doc, 'upload-ring'),
    uploadRingArc: byId(doc, 'upload-ring-arc'),
    uploadRingLabel: byId(doc, 'upload-ring-label'),
    metaStorage: byId(doc, 'meta-storage'),
    metaDuration: byId(doc, 'meta-duration'),
    metaMic: byId(doc, 'meta-mic'),
    metaCamera: byId(doc, 'meta-camera'),

    // Session tabs + per-job upload view
    sessionTabs: byId(doc, 'session-tabs'),
    viewUpload: byId(doc, 'view-upload'),
    uploadProgress: byId(doc, 'upload-progress'),
    uploadDone: byId(doc, 'upload-done'),
    uploadJobLabel: byId(doc, 'upload-job-label'),
    uploadJobPct: byId(doc, 'upload-job-pct'),
    uploadBarFill: byId(doc, 'upload-bar-fill'),
    uploadJobMeta: byId(doc, 'upload-job-meta'),
    uploadJobSub: byId(doc, 'upload-job-sub'),
    uploadJobFiles: byId(doc, 'upload-job-files'),
    uploadJobOpenDrive: byId<HTMLButtonElement>(doc, 'upload-job-open-drive'),
    uploadJobRetry: byId<HTMLButtonElement>(doc, 'upload-job-retry'),
    uploadJobCancel: byId<HTMLButtonElement>(doc, 'upload-job-cancel'),
    cameraWarning: byId(doc, 'camera-warning'),
    cameraWarningText: byId(doc, 'camera-warning-text'),
    tabSourceSub: byId(doc, 'tab-source-sub'),

    // Shared status / toast line
    recordingStatusEl: byId(doc, 'recording-status'),
  });
}
