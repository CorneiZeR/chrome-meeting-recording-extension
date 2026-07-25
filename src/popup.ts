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
import { initializeExtensionTheme } from './shared/theme';

initializeExtensionTheme();

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

const menuButton = byId<HTMLButtonElement>('open-menu');
const menu = byId<HTMLElement>('popup-menu');
if (menuButton && menu) {
  const closeMenu = () => { menu.hidden = true; menuButton.setAttribute('aria-expanded', 'false'); };
  menuButton.addEventListener('click', () => {
    const open = menu.hidden;
    menu.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (event) => {
    if (!menu.hidden && !menu.contains(event.target as Node) && !menuButton.contains(event.target as Node)) closeMenu();
  });
  menu.addEventListener('click', closeMenu);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });
}

/** Accessible custom select surfaces keep the native controls as the data source. */
function wireSelect(selectId: string, triggerId: string, optionsId: string): void {
  const select = byId<HTMLSelectElement>(selectId);
  const trigger = byId<HTMLButtonElement>(triggerId);
  const options = byId<HTMLElement>(optionsId);
  if (!select || !trigger || !options) return;
  const close = () => {
    options.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  };
  const sync = () => {
    const option = select.selectedOptions[0];
    const label = trigger.querySelector<HTMLElement>('[data-select-label]');
    if (label) label.textContent = option?.textContent ?? '';
    else trigger.textContent = option?.textContent ?? '';
    // The destination trigger mirrors the selected option's real icon instead
    // of permanently showing the Drive cloud after Local disk is selected.
    if (selectId === 'storage-mode') {
      const selectedIcon = options.querySelector<SVGElement>(`[role="option"][data-value="${select.value}"] svg`);
      const currentIcon = trigger.querySelector<SVGElement>('svg');
      if (selectedIcon && currentIcon) {
        const icon = selectedIcon.cloneNode(true) as SVGElement;
        icon.classList.add('select-storage-icon');
        currentIcon.replaceWith(icon);
      }
    }
    options.querySelectorAll<HTMLButtonElement>('[role="option"]').forEach((item) => {
      item.setAttribute('aria-selected', String(item.dataset.value === select.value));
    });
  };
  trigger.addEventListener('click', () => {
    const willOpen = options.hidden;
    document.querySelectorAll<HTMLElement>('.select-options').forEach((other) => {
      if (other === options) return;
      other.hidden = true;
      document.querySelector<HTMLButtonElement>(`[aria-controls="${other.id}"]`)?.setAttribute('aria-expanded', 'false');
    });
    options.hidden = !willOpen;
    trigger.setAttribute('aria-expanded', String(willOpen));
  });
  options.addEventListener('click', (event) => {
    const option = (event.target as HTMLElement).closest<HTMLButtonElement>('[role="option"]');
    if (!option?.dataset.value) return;
    select.value = option.dataset.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    sync();
    close();
    trigger.focus();
  });
  select.addEventListener('change', sync);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
  document.addEventListener('click', (event) => {
    if (!options.hidden && !options.contains(event.target as Node) && !trigger.contains(event.target as Node)) close();
  });
  sync();
}

wireSelect('storage-mode', 'storage-mode-trigger', 'storage-mode-options');
wireSelect('mic-mode', 'mic-mode-trigger', 'mic-mode-options');

const captureToggle = byId<HTMLButtonElement>('toggle-capture-setup');
const captureDetails = byId<HTMLElement>('capture-details');
const captureSummary = byId<HTMLElement>('capture-summary-value');
const syncCaptureSummary = () => {
  const mic = byId<HTMLSelectElement>('mic-mode')?.value ?? 'separate';
  const cameraOn = byId<HTMLInputElement>('record-self-video')?.checked ?? false;
  if (captureSummary) captureSummary.textContent = `CAM ${cameraOn ? 'ON' : 'OFF'} · MIC ${mic.toUpperCase()} · 720P`;
};
if (captureToggle && captureDetails) {
  captureToggle.addEventListener('click', () => {
    const expanded = captureToggle.getAttribute('aria-expanded') === 'true';
    captureToggle.setAttribute('aria-expanded', String(!expanded));
    captureDetails.hidden = expanded;
  });
  ['mic-mode', 'record-self-video'].forEach((id) => byId<HTMLInputElement | HTMLSelectElement>(id)?.addEventListener('change', syncCaptureSummary));
  document.querySelectorAll<HTMLInputElement>('input[name="tab-content-type"]').forEach((input) => input.addEventListener('change', syncCaptureSummary));
  syncCaptureSummary();
}

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
  micDeviceLabel: byId('mic-device-label'),
  micDeviceTrigger: byId<HTMLButtonElement>('mic-device-trigger'),
  muteMicBtn: byId<HTMLButtonElement>('mute-mic'),
  cameraRow: byId('row-camera'),
  cameraDeviceLabel: byId('camera-device-label'),
  cameraDeviceTrigger: byId<HTMLButtonElement>('camera-device-trigger'),
  hideCameraBtn: byId<HTMLButtonElement>('hide-camera'),
  devicePicker: byId('device-picker'),
  devicePickerTitle: byId('device-picker-title'),
  devicePickerList: byId('device-picker-list'),
  devicePickerError: byId('device-picker-error'),
  devicePickerTrack: byId('device-picker-track'),
  devicePickerMode: byId('device-picker-mode'),
  devicePickerClose: byId<HTMLButtonElement>('device-picker-close'),
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
