/**
 * @context Extension settings page.
 * @role    Configure default run behavior, the Google Drive connection, and
 *          advanced recorder parameters.
 *
 * This file is intentionally thin: it reads DOM elements and hands them to
 * SettingsController, which owns all interaction logic (load/apply, save/reset,
 * tooltips). Mirrors popup.ts → PopupController.
 *
 * @see src/settings/SettingsController.ts — all interaction logic
 */

import { SettingsController, type SettingsElements } from './settings/SettingsController';
import { initializeExtensionTheme } from './shared/theme';

initializeExtensionTheme();

const el: SettingsElements = {
  theme: document.getElementById('theme') as HTMLSelectElement | null,
  recordingMode: document.getElementById('recording-mode') as HTMLSelectElement | null,
  micMode: document.getElementById('mic-mode') as HTMLSelectElement | null,
  separateCamera: document.getElementById('separate-camera') as HTMLInputElement | null,
  autoEnableCaptions: document.getElementById('auto-enable-captions') as HTMLInputElement | null,
  tabRecordingFormat: document.getElementById('tab-recording-format') as HTMLSelectElement | null,
  cameraRecordingFormat: document.getElementById('camera-recording-format') as HTMLSelectElement | null,
  microphoneRecordingFormat: document.getElementById('microphone-recording-format') as HTMLSelectElement | null,
  selfVideoResolutionPreset: document.getElementById('self-video-resolution-preset') as HTMLSelectElement | null,
  selfVideoAutoResolution: document.getElementById('self-video-auto-resolution') as HTMLInputElement | null,
  selfVideoFrameRate: document.getElementById('self-video-frame-rate') as HTMLInputElement | null,
  tabContentType: document.getElementById('tab-content-type') as HTMLSelectElement | null,
  tabResolutionPreset: document.getElementById('tab-resolution-preset') as HTMLSelectElement | null,
  tabMaxFrameRate: document.getElementById('tab-max-frame-rate') as HTMLInputElement | null,
  micEchoCancellation: document.getElementById('mic-echo-cancellation') as HTMLInputElement | null,
  micNoiseSuppression: document.getElementById('mic-noise-suppression') as HTMLInputElement | null,
  micAutoGain: document.getElementById('mic-auto-gain') as HTMLInputElement | null,
  chunkDefaultTimeslice: document.getElementById('chunk-default-timeslice') as HTMLInputElement | null,
  chunkExtendedTimeslice: document.getElementById('chunk-extended-timeslice') as HTMLInputElement | null,
  themeCycle: document.getElementById('theme-cycle') as HTMLButtonElement | null,
  themeCycleValue: document.getElementById('theme-cycle-value'),
  driveStatus: document.getElementById('drive-status'),
  driveConnectBtn: document.getElementById('drive-connect') as HTMLButtonElement | null,
  driveDisconnectBtn: document.getElementById('drive-disconnect') as HTMLButtonElement | null,
  driveNotice: document.getElementById('drive-notice'),
  professionalToggle: document.getElementById('professional-toggle') as HTMLButtonElement | null,
  professionalFields: document.getElementById('professional-fields'),
  professionalSummary: document.getElementById('professional-summary'),
  resetBtn: document.getElementById('reset-settings') as HTMLButtonElement | null,
  status: document.getElementById('status') as HTMLElement | null,
};

void new SettingsController(el).init();

// E2E-only: expose crash-recovery entry points on `window` so a Playwright test
// can drive them from this page (which has chrome.storage + OPFS, unlike the
// e2e recorder tab). Gated on the compile-time build flag (not the runtime
// helper) so webpack dead-code-eliminates the import — and its chunk — from
// production builds entirely.
if (typeof __E2E_MOCK_DRIVE_BUILD__ !== 'undefined' && __E2E_MOCK_DRIVE_BUILD__) {
  void import('../tests/e2e/helpers/e2eRecoveryBridge').then((m) => m.installRecoveryTestBridge());
}
