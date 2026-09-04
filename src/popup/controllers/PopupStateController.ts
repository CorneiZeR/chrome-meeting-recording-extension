/**
 * @file popup/controllers/PopupStateController.ts
 *
 * Manages internal popup state: active run config, warnings, upload summary
 * deduplication, and the idle-phase status line computation.
 */

import { applyRunConfigToForm, buildRunConfigFromForm } from '../popupRunConfig';
import {
  buildDefaultRunConfigFromSettings,
  getSelfVideoProfileSettings,
  loadExtensionSettingsFromStorage,
  saveRunConfigAsDefaults,
  type SelfVideoProfileSettings,
} from '../../shared/settings';
import {
  createDefaultRunConfig,
  getRunConfigOrDefault,
  type RecordingPhase,
  type RecordingRunConfig,
  type RecordingStatusView,
  type UploadSummary,
} from '../../shared/recording';
import { sendToBackground } from '../../shared/messages';
import { formatUploadFallbackMessage } from '../popupStatus';
import type { PopupElements } from '../popupView';

export type PopupStateCallbacks = {
  onPhaseChange: (phase: RecordingPhase, session: RecordingStatusView) => void;
  onToast: (msg: string) => void;
  onAlert: (msg: string) => void;
};

/** Idle view used as the popup's local fallback when the background is unreachable. */
function createIdleStatusView(): RecordingStatusView {
  return { phase: 'idle', runConfig: null, updatedAt: Date.now() };
}

export class PopupStateController {
  private activeRunConfig: RecordingRunConfig | null = createDefaultRunConfig();
  private idleDefaultRunConfig: RecordingRunConfig = createDefaultRunConfig();
  private selfVideoProfile: SelfVideoProfileSettings = getSelfVideoProfileSettings();
  private shownUploadSummary = '';
  /** True while a config is being mirrored into the form, so echoed `change` events are ignored. */
  private applyingRunConfig = false;

  constructor(private readonly el: PopupElements, private readonly callbacks: PopupStateCallbacks) {
    for (const control of [
      this.el.storageModeSelect,
      this.el.micModeSelect,
      this.el.recordSelfVideoCheckbox,
      // A radio group has no single control; `change` bubbles from its inputs.
      this.el.tabContentTypeGroup,
    ]) {
      control?.addEventListener('change', () => this.onSetupFormChange());
    }
  }

  /** Handles any edit to the pre-start form: refresh the warning, remember the choice. */
  private onSetupFormChange(): void {
    this.updateCameraResolutionWarning();
    // Applying a config to the form dispatches `change` so the styled selectors
    // can re-sync; that echo is not a user choice and must never be written back
    // (it would persist a restored session's config as the new defaults).
    if (this.applyingRunConfig) return;
    void this.rememberSetupChoices();
  }

  /**
   * Remembers the choices made in the pre-start form.
   *
   * The popup keeps no state of its own, so without this every control would
   * fall back to the persisted default on each open and anyone recording with a
   * non-default setup — no camera, no microphone, local instead of Drive — would
   * have to re-enter it every time. Each choice is written into the same default
   * the settings page edits, and mirrored into the idle default so an incoming
   * idle snapshot cannot revert the form the user just changed.
   */
  private async rememberSetupChoices(): Promise<void> {
    const config = buildRunConfigFromForm(this.el);
    this.idleDefaultRunConfig = config;
    try {
      await saveRunConfigAsDefaults(config);
    } catch (error) {
      // A failed write only costs the user the memory of this choice; the run
      // itself reads the form, so the recording must not be disturbed.
      console.warn('[popup] failed to remember the pre-start choices', error);
    }
  }

  /** Loads settings-derived defaults and hydrates the live background session state. */
  async refreshInitialState() {
    try {
      const settings = await loadExtensionSettingsFromStorage();
      this.idleDefaultRunConfig = buildDefaultRunConfigFromSettings(settings);
      this.selfVideoProfile = getSelfVideoProfileSettings(settings);
    } catch {
      this.idleDefaultRunConfig = createDefaultRunConfig();
      this.selfVideoProfile = getSelfVideoProfileSettings();
    }

    this.setActiveRunConfig({ ...this.idleDefaultRunConfig });

    try {
      const res = await sendToBackground({ type: 'GET_RECORDING_STATUS' });
      this.applySession(res.session);
    } catch {
      this.callbacks.onPhaseChange('idle', createIdleStatusView());
    }
  }

  /** Applies the popup-facing status view from background into the popup state. */
  applySession(snapshot: RecordingStatusView) {
    const runConfig = snapshot.phase === 'idle'
      ? { ...this.idleDefaultRunConfig }
      : getRunConfigOrDefault(snapshot.runConfig);
    this.setActiveRunConfig(runConfig);
    this.callbacks.onPhaseChange(snapshot.phase, snapshot);

    if (snapshot.phase === 'failed' && snapshot.error) {
      this.callbacks.onToast(`Recording error: ${snapshot.error}`);
    }

    this.handleUploadSummary(snapshot.phase, snapshot.uploadSummary);
  }

  /**
   * Applies an explicit deterministic session for the development preview.
   * Unlike a real idle background snapshot, an idle preview may intentionally
   * carry a run configuration so the setup form can exercise each option.
   */
  applyPreviewSession(snapshot: RecordingStatusView): void {
    this.setActiveRunConfig(snapshot.runConfig ? { ...snapshot.runConfig } : createDefaultRunConfig());
    this.callbacks.onPhaseChange(snapshot.phase, snapshot);
  }

  /** Reads the run configuration from the popup form. */
  getRunConfigFromForm(): RecordingRunConfig {
    return buildRunConfigFromForm(this.el);
  }

  getIdleDefaultRunConfig(): RecordingRunConfig {
    return this.idleDefaultRunConfig;
  }

  getActiveRunConfig(): RecordingRunConfig | null {
    return this.activeRunConfig;
  }

  private setActiveRunConfig(config: RecordingRunConfig | null) {
    this.activeRunConfig = config;
    this.applyingRunConfig = true;
    try {
      applyRunConfigToForm(this.el, config);
    } finally {
      this.applyingRunConfig = false;
    }
    this.updateCameraResolutionWarning(config?.recordSelfVideo);
  }

  private updateCameraResolutionWarning(recordSelfVideo = this.el.recordSelfVideoCheckbox?.checked ?? false) {
    const warning = this.el.cameraWarning;
    const text = this.el.cameraWarningText;
    if (!warning || !text) return;
    const height = this.selfVideoProfile.height;
    const show = recordSelfVideo && height < 1080;
    warning.hidden = !show;
    text.textContent = show ? `Camera delivering ${height}p · raise in settings` : '';
  }

  private handleUploadSummary(phase: RecordingPhase, summary?: UploadSummary) {
    if (phase !== 'idle' || !summary) return;

    const key = JSON.stringify(summary);
    if (this.shownUploadSummary === key) return;
    this.shownUploadSummary = key;

    const fallbackMessage = formatUploadFallbackMessage(summary);
    if (fallbackMessage) {
      this.callbacks.onAlert(fallbackMessage);
      return;
    }

    if (summary.uploaded.length > 0) {
      this.callbacks.onToast(`Uploaded ${summary.uploaded.length} file(s) to Google Drive`);
    }
  }
}
