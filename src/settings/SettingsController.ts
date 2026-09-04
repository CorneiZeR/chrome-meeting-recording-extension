/**
 * @file settings/SettingsController.ts
 *
 * Owns all settings-page interaction: load saved settings → apply to the form,
 * autosave/reset, the Google Drive connection, page status, and the single
 * delegated tooltip controller. The `settings.ts` entry is a thin shell that
 * queries the DOM and hands the elements here — mirroring
 * `popup.ts → PopupController` and `debug.ts → DebugDashboard`.
 *
 * The page has no unsaved state: every edit is written immediately, exactly like
 * the popup's pre-start form, and a change made anywhere else is mirrored back
 * through the storage-changed listener. An explicit Save button could not
 * survive next to a popup that writes at once — the stale form would silently
 * overwrite whatever the popup had just stored.
 */

import {
  DEFAULT_EXTENSION_SETTINGS,
  EXTENSION_SETTINGS_STORAGE_KEY,
  loadExtensionSettingsFromStorage,
  normalizeExtensionSettings,
  resetExtensionSettingsToDefaults,
  saveExtensionSettingsToStorage,
  type ExtensionSettings,
} from '../shared/settings';
import { getRecordingFormatCapabilities, type RecordingFormatCapabilities } from '../shared/recordingFormats';
import { applyThemePreference } from '../shared/theme';
import { sendToBackground } from '../shared/messages';
import type { DriveConnectionView } from '../shared/protocol';
import { addStorageChangedListener } from '../platform/chrome/storage';

export type SettingsElements = {
  theme: HTMLSelectElement | null;
  recordingMode: HTMLSelectElement | null;
  micMode: HTMLSelectElement | null;
  separateCamera: HTMLInputElement | null;
  autoEnableCaptions: HTMLInputElement | null;
  tabRecordingFormat?: HTMLSelectElement | null;
  cameraRecordingFormat?: HTMLSelectElement | null;
  microphoneRecordingFormat?: HTMLSelectElement | null;
  selfVideoResolutionPreset: HTMLSelectElement | null;
  selfVideoAutoResolution: HTMLInputElement | null;
  selfVideoFrameRate: HTMLInputElement | null;
  tabContentType: HTMLSelectElement | null;
  tabResolutionPreset: HTMLSelectElement | null;
  tabMaxFrameRate: HTMLInputElement | null;
  micEchoCancellation: HTMLInputElement | null;
  micNoiseSuppression: HTMLInputElement | null;
  micAutoGain: HTMLInputElement | null;
  chunkDefaultTimeslice: HTMLInputElement | null;
  chunkExtendedTimeslice: HTMLInputElement | null;
  themeCycle: HTMLButtonElement | null;
  themeCycleValue: HTMLElement | null;
  driveStatus: HTMLElement | null;
  driveConnectBtn: HTMLButtonElement | null;
  driveDisconnectBtn: HTMLButtonElement | null;
  driveNotice: HTMLElement | null;
  professionalToggle: HTMLButtonElement | null;
  professionalFields: HTMLElement | null;
  professionalSummary: HTMLElement | null;
  resetBtn: HTMLButtonElement | null;
  status: HTMLElement | null;
};

/** How long to wait after the last keystroke in a number field before saving it. */
const TYPING_SAVE_DELAY_MS = 400;

type SettingsDocument = Document & {
  __recorderSettingsSelectAbortController__?: AbortController;
};

export class SettingsController {
  private readonly formatCapabilities: RecordingFormatCapabilities = getRecordingFormatCapabilities();
  /** True while settings are being mirrored into the form, so the echo is not saved back. */
  private applying = false;
  /** Monotonic edit counter: only the newest write may write its result back to the form. */
  private editSeq = 0;
  /** Serializes writes so the last edit is the last one to reach storage. */
  private writeChain: Promise<void> = Promise.resolve();
  /** Writes of ours not yet settled; while any is pending, storage events are our own echo. */
  private inFlightWrites = 0;
  /** The payload of our last write, to recognize its own trailing storage event. */
  private lastWrittenJson = '';
  private typingSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private driveConnection: DriveConnectionView = { connected: false, email: null, canChooseAccount: true };

  constructor(private readonly el: SettingsElements) {}

  /** Loads saved settings into the form and wires save/reset + the tooltip controller. */
  async init(): Promise<void> {
    this.wireConsoleControls();

    try {
      const stored = await loadExtensionSettingsFromStorage();
      this.applySettings(stored);
    } catch (error) {
      console.error('[settings] failed to load settings', error);
      this.applySettings(DEFAULT_EXTENSION_SETTINGS);
      this.setStatus('Failed to load saved settings. Using defaults.', true);
    }
    this.applyFormatCapabilities();

    this.wireAutosave();
    this.wireDriveControls();

    this.el.resetBtn?.addEventListener('click', async () => {
      // Reset drops every section at once, the theme included, so it asks
      // first rather than being one misclick away.
      if (!this.confirmReset()) return;
      try {
        const defaults = await resetExtensionSettingsToDefaults();
        this.applySettings(defaults);
        this.setStatus('Reset to defaults');
      } catch (error) {
        console.error('[settings] failed to reset settings', error);
        this.setStatus('Reset failed', true);
      }
    });

    void this.refreshDriveConnection();
  }

  /** Confirmation seam for Reset; overridden in tests that exercise the reset path. */
  protected confirmReset(): boolean {
    return typeof confirm !== 'function'
      || confirm('Reset every setting — the theme included — back to its default?');
  }

  /**
   * Persists the whole form on every edit and mirrors changes written elsewhere.
   *
   * Because nothing is ever pending, an external change can always be applied
   * to the form: there is no user edit for it to clobber.
   */
  private wireAutosave(): void {
    document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach((control) => {
      control.addEventListener('change', () => {
        if (this.applying) return;
        this.cancelTypingSave();
        void this.saveFromForm();
      });
      // A number field only emits `change` when it is committed — typically on
      // blur. Nothing blurs the last field a user touches, so without an `input`
      // path a typed value would sit there unsaved, and the old Save button was
      // what used to commit it. Debounced so a save is not queued per keystroke.
      if (control instanceof HTMLInputElement && (control.type === 'number' || control.type === 'text')) {
        control.addEventListener('input', () => {
          if (this.applying) return;
          this.setStatus('Saving…');
          this.cancelTypingSave();
          this.typingSaveTimer = setTimeout(() => {
            this.typingSaveTimer = null;
            void this.saveFromForm();
          }, TYPING_SAVE_DELAY_MS);
        });
      }
    });

    addStorageChangedListener((changes, areaName) => {
      if (areaName !== 'local' || this.applying) return;
      const change = changes[EXTENSION_SETTINGS_STORAGE_KEY];
      if (!change) return;
      // Our own writes come back as storage events too, and they arrive late.
      // Mirroring one while a newer edit is still being written would put the
      // *older* payload back into the form — and the pending write would then
      // read that form and persist the value the user had already replaced.
      if (this.inFlightWrites > 0) return;
      // A debounced keystroke save is pending work the counter does not see, and
      // mirroring now would rewrite the field still being typed in — after which
      // that pending write would persist the mirrored value over the typed one.
      if (this.typingSaveTimer !== null || this.isTypingInAField()) return;
      const incoming = normalizeExtensionSettings(change.newValue);
      if (JSON.stringify(incoming) === this.lastWrittenJson) return;
      this.applySettings(incoming);
    });
  }

  private cancelTypingSave(): void {
    if (this.typingSaveTimer === null) return;
    clearTimeout(this.typingSaveTimer);
    this.typingSaveTimer = null;
  }

  /** True while a number/text field is focused, so a save must not rewrite it. */
  private isTypingInAField(): boolean {
    const active = document.activeElement;
    return active instanceof HTMLInputElement && (active.type === 'number' || active.type === 'text');
  }

  /**
   * Queues a write of the whole form.
   *
   * Writes are **chained**, so the last edit is the last one to reach storage
   * rather than whichever request happened to resolve last.
   */
  private saveFromForm(): Promise<void> {
    const seq = ++this.editSeq;
    this.inFlightWrites += 1;
    // Set synchronously: anything watching the status line (a person or an e2e
    // harness) must be able to tell a pending write from a settled one.
    this.setStatus('Saving…');
    this.writeChain = this.writeChain.then(() => this.writeOnce(seq));
    return this.writeChain;
  }

  private async writeOnce(seq: number): Promise<void> {
    const written = await this.attemptWrite(seq);
    this.inFlightWrites -= 1;
    if (written) this.settleStatus();
  }

  /** Performs one write, reporting its own failures; never throws. */
  private async attemptWrite(seq: number): Promise<boolean> {
    const unavailable = this.selectedUnsupportedFormat();
    if (unavailable) {
      this.setStatus(`${unavailable} is unavailable in this browser. Select WebM instead.`, true);
      try {
        this.applySettings(await loadExtensionSettingsFromStorage());
      } catch (error) {
        console.error('[settings] failed to reload settings after an unavailable format', error);
      }
      return false;
    }
    try {
      const saved = await saveExtensionSettingsToStorage(this.readSettingsFromForm());
      this.lastWrittenJson = JSON.stringify(saved);
      // A write whose edit has been superseded must not touch the form: it would
      // put back the value it was told to save, over the newer one.
      if (seq !== this.editSeq) return false;
      // Mirroring the normalized result back is what shows a clamped number —
      // but never into a field still being typed in, where it would fight the
      // user mid-value. Blurring it emits `change`, which applies it then.
      if (!this.isTypingInAField()) this.applySettings(saved);
      return true;
    } catch (error) {
      console.error('[settings] failed to save settings', error);
      this.setStatus('Save failed', true);
      return false;
    }
  }

  /**
   * Reports "Saved" only when nothing is pending.
   *
   * A debounced keystroke save counts as pending: otherwise an earlier write
   * settling would leave the page — and anything watching it — believing the
   * value just typed had already been stored.
   */
  private settleStatus(): void {
    this.setStatus(this.inFlightWrites > 0 || this.typingSaveTimer !== null ? 'Saving…' : 'Saved');
  }

  /** Updates the inline page status message after load/save/reset actions. */
  private setStatus(text: string, isError = false): void {
    if (!this.el.status) return;
    this.el.status.textContent = text;
    this.el.status.style.color = isError ? 'var(--error)' : 'var(--success)';
  }

  /** Mirrors normalized settings into the current form controls. */
  private applySettings(settings: Readonly<ExtensionSettings>): void {
    this.applying = true;
    try {
      this.writeSettingsToForm(settings);
    } finally {
      this.applying = false;
    }
  }

  private writeSettingsToForm(settings: Readonly<ExtensionSettings>): void {
    const el = this.el;
    if (el.theme) el.theme.value = settings.appearance.theme;
    applyThemePreference(settings.appearance.theme);
    if (el.recordingMode) el.recordingMode.value = settings.basic.recordingMode;
    if (el.micMode) el.micMode.value = settings.basic.microphoneRecordingMode;
    if (el.separateCamera) el.separateCamera.checked = settings.basic.separateCameraCapture;
    if (el.autoEnableCaptions) el.autoEnableCaptions.checked = settings.basic.autoEnableCaptions;
    if (el.tabRecordingFormat) el.tabRecordingFormat.value = settings.basic.tabRecordingFormat;
    if (el.cameraRecordingFormat) el.cameraRecordingFormat.value = settings.basic.cameraRecordingFormat;
    if (el.microphoneRecordingFormat) el.microphoneRecordingFormat.value = settings.basic.microphoneRecordingFormat;
    if (el.selfVideoResolutionPreset) {
      el.selfVideoResolutionPreset.value = settings.basic.selfVideoResolutionPreset;
    }
    if (el.selfVideoAutoResolution) {
      el.selfVideoAutoResolution.checked = settings.basic.selfVideoUseAutoResolution;
    }
    if (el.selfVideoFrameRate) el.selfVideoFrameRate.value = String(settings.professional.selfVideoFrameRate);
    if (el.tabContentType) el.tabContentType.value = settings.professional.tabContentType;
    if (el.tabResolutionPreset) {
      el.tabResolutionPreset.value = settings.professional.tabResolutionPreset;
    }
    if (el.tabMaxFrameRate) el.tabMaxFrameRate.value = String(settings.professional.tabMaxFrameRate);
    if (el.micEchoCancellation) el.micEchoCancellation.checked = settings.professional.microphoneEchoCancellation;
    if (el.micNoiseSuppression) el.micNoiseSuppression.checked = settings.professional.microphoneNoiseSuppression;
    if (el.micAutoGain) el.micAutoGain.checked = settings.professional.microphoneAutoGainControl;
    if (el.chunkDefaultTimeslice) el.chunkDefaultTimeslice.value = String(settings.professional.chunkDefaultTimesliceMs);
    if (el.chunkExtendedTimeslice) el.chunkExtendedTimeslice.value = String(settings.professional.chunkExtendedTimesliceMs);
    this.syncConsoleControls();
    this.renderDriveConnection();
  }

  /** Reads the current form state into the storage payload expected by settings normalization. */
  private readSettingsFromForm(): unknown {
    const el = this.el;
    return {
      appearance: {
        theme: el.theme?.value,
      },
      basic: {
        recordingMode: el.recordingMode?.value,
        microphoneRecordingMode: el.micMode?.value,
        separateCameraCapture: el.separateCamera?.checked,
        autoEnableCaptions: el.autoEnableCaptions?.checked,
        tabRecordingFormat: el.tabRecordingFormat?.value,
        cameraRecordingFormat: el.cameraRecordingFormat?.value,
        microphoneRecordingFormat: el.microphoneRecordingFormat?.value,
        selfVideoResolutionPreset: el.selfVideoResolutionPreset?.value,
        selfVideoUseAutoResolution: !!el.selfVideoAutoResolution?.checked,
      },
      professional: {
        selfVideoFrameRate: Number(el.selfVideoFrameRate?.value),
        tabContentType: el.tabContentType?.value,
        tabResolutionPreset: el.tabResolutionPreset?.value,
        tabMaxFrameRate: Number(el.tabMaxFrameRate?.value),
        microphoneEchoCancellation: !!el.micEchoCancellation?.checked,
        microphoneNoiseSuppression: !!el.micNoiseSuppression?.checked,
        microphoneAutoGainControl: !!el.micAutoGain?.checked,
        chunkDefaultTimesliceMs: Number(el.chunkDefaultTimeslice?.value),
        chunkExtendedTimesliceMs: Number(el.chunkExtendedTimeslice?.value),
      },
    };
  }

  /** Disables native and custom-selector options unavailable in this Chromium build. */
  private applyFormatCapabilities(): void {
    this.setFormatAvailability(
      'tab-recording-format',
      'mp4',
      this.formatCapabilities.tabMp4,
      'MP4 tab recording is unavailable in this browser.'
    );
    this.setFormatAvailability(
      'camera-recording-format',
      'mp4',
      this.formatCapabilities.cameraMp4,
      'MP4 camera recording is unavailable in this browser.'
    );
    this.setFormatAvailability(
      'microphone-recording-format',
      'm4a',
      this.formatCapabilities.microphoneM4a,
      'M4A/AAC microphone recording is unavailable in this browser.'
    );
    this.syncConsoleControls();
  }

  private setFormatAvailability(selectId: string, value: string, available: boolean, message: string): void {
    const select = document.getElementById(selectId) as HTMLSelectElement | null;
    const nativeOption = Array.from(select?.options ?? []).find((option) => option.value === value);
    if (nativeOption) nativeOption.disabled = !available;

    const selectorOptions = document.getElementById(`${selectId}-options`);
    const customOption = selectorOptions?.querySelector<HTMLButtonElement>(`[role="option"][data-value="${value}"]`);
    if (customOption) {
      customOption.disabled = !available;
      customOption.setAttribute('aria-disabled', String(!available));
      customOption.title = available ? '' : message;
    }

    const note = document.getElementById(`${selectId}-note`);
    if (note) {
      note.textContent = available ? '' : message;
      note.hidden = available;
    }
  }

  private selectedUnsupportedFormat(): string | null {
    if (this.el.tabRecordingFormat?.value === 'mp4' && !this.formatCapabilities.tabMp4) return 'MP4 tab format';
    if (this.el.cameraRecordingFormat?.value === 'mp4' && !this.formatCapabilities.cameraMp4) return 'MP4 camera format';
    if (this.el.microphoneRecordingFormat?.value === 'm4a' && !this.formatCapabilities.microphoneM4a) return 'M4A microphone format';
    return null;
  }

  /** Wires the reference console controls to the existing form fields. */
  private wireConsoleControls(): void {
    this.el.themeCycle?.addEventListener('click', () => {
      this.cycleSelect(this.el.theme);
      if (this.el.theme) applyThemePreference(this.el.theme.value as ExtensionSettings['appearance']['theme']);
      this.syncConsoleControls();
    });

    this.wireSelectControls();

    document.querySelectorAll<HTMLElement>('[data-checkbox]').forEach((control) => {
      control.addEventListener('click', (event) => {
        const target = (event.target as Element | null)?.closest<HTMLButtonElement>('[data-value]');
        const input = document.getElementById(control.dataset.checkbox ?? '') as HTMLInputElement | null;
        if (!target || !input) return;
        input.checked = target.dataset.value === 'true';
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });

    this.el.professionalToggle?.addEventListener('click', () => {
      const isOpen = this.el.professionalToggle?.getAttribute('aria-expanded') === 'true';
      this.setProfessionalOpen(!isOpen);
    });

    document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select').forEach((control) => {
      control.addEventListener('change', () => {
        if (control === this.el.theme) applyThemePreference(control.value as ExtensionSettings['appearance']['theme']);
        this.syncConsoleControls();
      });
    });
  }

  /** Advances the titlebar theme control and emits its normal change event. */
  private cycleSelect(select: HTMLSelectElement | null): void {
    if (!select || select.options.length === 0) return;
    select.selectedIndex = (select.selectedIndex + 1) % select.options.length;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /** Wires popup-style listboxes to the form-backed settings selects. */
  private wireSelectControls(): void {
    const settingsDocument = document as SettingsDocument;
    settingsDocument.__recorderSettingsSelectAbortController__?.abort();
    const abortController = new AbortController();
    settingsDocument.__recorderSettingsSelectAbortController__ = abortController;
    const listenerOptions = { signal: abortController.signal };
    const triggers = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-select]'));
    const close = (trigger: HTMLButtonElement) => {
      const optionsId = trigger.getAttribute('aria-controls');
      const options = optionsId ? document.getElementById(optionsId) : null;
      if (options) options.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    };
    const closeAll = (except?: HTMLButtonElement) => {
      triggers.forEach((trigger) => {
        if (trigger !== except) close(trigger);
      });
    };
    const optionsFor = (trigger: HTMLButtonElement): HTMLElement | null => {
      const optionsId = trigger.getAttribute('aria-controls');
      return optionsId ? document.getElementById(optionsId) : null;
    };
    const choose = (trigger: HTMLButtonElement, value: string) => {
      const select = document.getElementById(trigger.dataset.select ?? '') as HTMLSelectElement | null;
      if (!select) return;
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      this.syncConsoleControls();
      close(trigger);
      trigger.focus();
    };
    const selectableOptions = (options: HTMLElement) =>
      Array.from(options.querySelectorAll<HTMLButtonElement>('[role="option"]')).filter((item) => !item.disabled);
    const focusOption = (options: HTMLElement, index: number) => {
      const items = selectableOptions(options);
      items[Math.max(0, Math.min(index, items.length - 1))]?.focus();
    };
    const open = (trigger: HTMLButtonElement, initialOffset = 0) => {
      const options = optionsFor(trigger);
      if (!options) return;
      closeAll(trigger);
      options.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      const selected = selectableOptions(options)
        .findIndex((option) => option.getAttribute('aria-selected') === 'true');
      focusOption(options, selected + initialOffset);
    };

    triggers.forEach((trigger) => {
      const options = optionsFor(trigger);
      if (!options) return;
      trigger.addEventListener('click', () => {
        if (options.hidden) open(trigger);
        else close(trigger);
      });
      trigger.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          open(trigger, event.key === 'ArrowDown' ? 0 : -1);
        }
        if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          open(trigger, event.key === 'Home' ? -Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER);
        }
      });
      options.addEventListener('click', (event) => {
        const option = (event.target as Element | null)?.closest<HTMLButtonElement>('[role="option"]');
        if (option?.dataset.value && !option.disabled) choose(trigger, option.dataset.value);
      });
      options.addEventListener('keydown', (event) => {
        const items = selectableOptions(options);
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          focusOption(options, index + (event.key === 'ArrowDown' ? 1 : -1));
        } else if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          focusOption(options, event.key === 'Home' ? 0 : items.length - 1);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          close(trigger);
          trigger.focus();
        }
      });
    });

    document.addEventListener('click', (event) => {
      const target = event.target as Node;
      triggers.forEach((trigger) => {
        const options = optionsFor(trigger);
        if (options && !options.hidden && !trigger.contains(target) && !options.contains(target)) close(trigger);
      });
    }, listenerOptions);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeAll();
    }, listenerOptions);
  }

  /** Synchronizes the visual console controls with their form-backed values. */
  private syncConsoleControls(): void {
    document.querySelectorAll<HTMLButtonElement>('[data-select]').forEach((control) => {
      const select = document.getElementById(control.dataset.select ?? '') as HTMLSelectElement | null;
      const label = control.querySelector<HTMLElement>('.value-cycle-label');
      if (!select || !label) return;
      label.textContent = select.options[select.selectedIndex]?.textContent?.trim() ?? '';
      control.title = label.textContent;
      const optionsId = control.getAttribute('aria-controls');
      const options = optionsId ? document.getElementById(optionsId) : null;
      options?.querySelectorAll<HTMLButtonElement>('[role="option"]').forEach((option) => {
        option.setAttribute('aria-selected', String(option.dataset.value === select.value));
      });
      if (control.dataset.select === 'recording-mode' && options) {
        const selectedIcon = options.querySelector<SVGElement>(`[role="option"][data-value="${select.value}"] .select-option-icon`);
        const currentIcon = control.querySelector<SVGElement>('.storage-icon');
        if (selectedIcon && currentIcon) {
          const icon = selectedIcon.cloneNode(true) as SVGElement;
          icon.classList.replace('select-option-icon', 'storage-icon');
          currentIcon.replaceWith(icon);
        }
      }
    });

    document.querySelectorAll<HTMLElement>('[data-checkbox]').forEach((control) => {
      const input = document.getElementById(control.dataset.checkbox ?? '') as HTMLInputElement | null;
      if (!input) return;
      control.querySelectorAll<HTMLButtonElement>('[data-value]').forEach((button) => {
        button.setAttribute('aria-pressed', String((button.dataset.value === 'true') === input.checked));
      });
    });

    const settings = this.readSettingsFromForm() as ExtensionSettings;
    const tabResolution = settings.professional.tabResolutionPreset.split('x')[1] ?? '';
    const tabType = settings.professional.tabContentType === 'video' ? 'VIDEO' : 'TEXT';
    const dsp = settings.professional.microphoneEchoCancellation
      && settings.professional.microphoneNoiseSuppression
      && settings.professional.microphoneAutoGainControl
      ? 'DSP ON'
      : !settings.professional.microphoneEchoCancellation
        && !settings.professional.microphoneNoiseSuppression
        && !settings.professional.microphoneAutoGainControl
        ? 'DSP OFF'
        : 'DSP CUSTOM';
    if (this.el.professionalSummary) {
      this.el.professionalSummary.textContent = `CAM ${settings.professional.selfVideoFrameRate}FPS · TAB ${tabType} ${tabResolution}P @${settings.professional.tabMaxFrameRate}FPS · ${dsp}`;
    }
    if (this.el.themeCycle && this.el.theme) {
      // The visible label has to name the theme: an accessible name that
      // disagrees with the text on the control is both confusing and a
      // label-in-name failure.
      const theme = this.el.theme.value;
      if (this.el.themeCycleValue) this.el.themeCycleValue.textContent = theme.toUpperCase();
      this.el.themeCycle.setAttribute('aria-label', `Theme: ${theme}. Click to cycle theme.`);
      this.el.themeCycle.title = `Theme: ${theme}. Click to cycle theme.`;
    }
  }

  /** Wires Connect / Disconnect and keeps the section honest about the grant. */
  private wireDriveControls(): void {
    this.el.driveConnectBtn?.addEventListener('click', () => void this.connectDrive());
    this.el.driveDisconnectBtn?.addEventListener('click', () => void this.disconnectDrive());
  }

  /** Reads the stored grant without prompting, so opening the page never pops a login. */
  private async refreshDriveConnection(): Promise<void> {
    try {
      const res = await sendToBackground({ type: 'GET_DRIVE_CONNECTION' });
      this.driveConnection = res.connection;
      this.setDriveNotice('');
    } catch (error) {
      console.error('[settings] failed to read the Drive connection', error);
      this.driveConnection = { ...this.driveConnection, connected: false, email: null };
      this.setDriveNotice('The extension background is unreachable, so the Drive connection is unknown.', 'error');
    }
    this.renderDriveConnection();
  }

  private async connectDrive(): Promise<void> {
    this.setDriveBusy(true, 'Opening Google sign-in…');
    try {
      const res = await sendToBackground({ type: 'CONNECT_DRIVE' });
      if (!res.ok) {
        this.setDriveNotice(res.error, 'error');
        return;
      }
      this.driveConnection = res.connection;
      this.setDriveNotice('');
      this.setStatus('Google Drive connected');
    } catch (error) {
      this.setDriveNotice(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      this.setDriveBusy(false);
      this.renderDriveConnection();
    }
  }

  private async disconnectDrive(): Promise<void> {
    this.setDriveBusy(true, 'Disconnecting…');
    try {
      const res = await sendToBackground({ type: 'DISCONNECT_DRIVE' });
      // The grant is dropped locally even when revoking at Google failed, so the
      // connection is reported as gone either way — with the error alongside it.
      this.driveConnection = { ...this.driveConnection, connected: false, email: null };
      this.setDriveNotice(res.ok ? '' : res.error, res.ok ? undefined : 'error');
      if (res.ok) this.setStatus('Google Drive disconnected');
    } catch (error) {
      this.setDriveNotice(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      this.setDriveBusy(false);
      this.renderDriveConnection();
    }
  }

  private setDriveBusy(busy: boolean, statusText?: string): void {
    if (this.el.driveConnectBtn) this.el.driveConnectBtn.disabled = busy;
    if (this.el.driveDisconnectBtn) this.el.driveDisconnectBtn.disabled = busy;
    if (busy && statusText && this.el.driveStatus) this.el.driveStatus.textContent = statusText;
  }

  /**
   * Renders the connection and the one warning that matters: Drive selected as
   * the recording default while no account is connected would only fail after a
   * recording, when the upload starts.
   */
  private renderDriveConnection(): void {
    const { connected, email, canChooseAccount } = this.driveConnection;
    if (this.el.driveStatus) {
      this.el.driveStatus.textContent = connected ? (email ?? 'Connected') : 'Not connected';
      this.el.driveStatus.dataset.connected = String(connected);
    }
    if (this.el.driveConnectBtn) {
      this.el.driveConnectBtn.textContent = connected ? 'Switch account' : 'Connect';
      // Offering "Switch account" where the browser decides the account would
      // promise something the sign-in cannot deliver.
      this.el.driveConnectBtn.hidden = connected && !canChooseAccount;
    }
    if (this.el.driveDisconnectBtn) this.el.driveDisconnectBtn.hidden = !connected;

    if (this.driveNoticeIsError()) return;
    if (!connected && this.el.recordingMode?.value === 'drive') {
      this.setDriveNotice(
        'Google Drive is the default recording mode but no account is connected — an upload would ask you to sign in once a recording has already finished.',
        'warning'
      );
    } else if (connected && !canChooseAccount) {
      this.setDriveNotice(
        'Signed in with the Google account of this browser profile. To upload to a different account, use a Chrome profile signed into it.'
      );
    } else {
      this.setDriveNotice('');
    }
  }

  private driveNoticeIsError(): boolean {
    return this.el.driveNotice?.dataset.tone === 'error';
  }

  private setDriveNotice(text: string, tone?: 'error' | 'warning'): void {
    const notice = this.el.driveNotice;
    if (!notice) return;
    notice.textContent = text;
    notice.hidden = !text;
    if (tone) notice.dataset.tone = tone;
    else delete notice.dataset.tone;
  }

  /** Opens or closes the Professional rows without disturbing the settings values. */
  private setProfessionalOpen(open: boolean): void {
    this.el.professionalToggle?.setAttribute('aria-expanded', String(open));
    if (this.el.professionalFields) this.el.professionalFields.hidden = !open;
  }
}
