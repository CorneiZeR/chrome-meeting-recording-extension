import { readFileSync } from 'fs';
import { resolve } from 'path';

import type { ExtensionSettings } from './shared/settings';

const sendToBackground = jest.fn();
jest.mock('./shared/messages', () => ({ sendToBackground: (...args: unknown[]) => sendToBackground(...args) }));

const settingsHtml = readFileSync(
  resolve(__dirname, '../static/settings.html'),
  'utf8'
);

describe('settings page', () => {
  const savedSettings: ExtensionSettings = {
    privacy: {
      anonymousDiagnostics: true,
    },
    appearance: {
      theme: 'dark',
    },
    basic: {
      recordingMode: 'drive',
      microphoneRecordingMode: 'separate',
      separateCameraCapture: true,
      autoEnableCaptions: true,
      tabRecordingFormat: 'webm',
      cameraRecordingFormat: 'webm',
      microphoneRecordingFormat: 'webm',
      selfVideoResolutionPreset: '1280x720',
      selfVideoUseAutoResolution: true,
    },
    professional: {
      selfVideoFrameRate: 30,
      tabContentType: 'screen' as const,
      tabResolutionPreset: '854x480',
      tabMaxFrameRate: 24,
      microphoneEchoCancellation: true,
      microphoneNoiseSuppression: true,
      microphoneAutoGainControl: true,
      chunkDefaultTimesliceMs: 2000,
      chunkExtendedTimesliceMs: 4000,
    },
  };

  function mockSettingsModule(overrides: Record<string, unknown>) {
    const actual = jest.requireActual('./shared/settings');
    jest.doMock('./shared/settings', () => ({
      DEFAULT_EXTENSION_SETTINGS: savedSettings,
      EXTENSION_SETTINGS_STORAGE_KEY: actual.EXTENSION_SETTINGS_STORAGE_KEY,
      normalizeExtensionSettings: actual.normalizeExtensionSettings,
      ...overrides,
    }));
  }

  /** Autosave chains its writes, so settling one takes a few microtasks. */
  async function flushWrites() {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  }

  /** Autosave writes on `change`; the page has no Save button to click any more. */
  function editControl(id: string, apply: (control: HTMLInputElement & HTMLSelectElement) => void) {
    const control = document.getElementById(id) as HTMLInputElement & HTMLSelectElement;
    apply(control);
    control.dispatchEvent(new Event('change', { bubbles: true }));
  }

  beforeEach(() => {
    jest.resetModules();
    sendToBackground.mockReset().mockImplementation(async (msg: { type: string }) => {
      if (msg.type === 'GET_DRIVE_CONNECTION') return { connection: { connected: false, email: null, canChooseAccount: true } };
      if (msg.type === 'CONNECT_DRIVE') return { ok: true, connection: { connected: true, email: 'me@example.com', canChooseAccount: true } };
      if (msg.type === 'DISCONNECT_DRIVE') return { ok: true };
      throw new Error(`Unexpected message ${msg.type}`);
    });
    (MediaRecorder.isTypeSupported as jest.Mock).mockReset().mockReturnValue(true);
    document.open();
    document.write(settingsHtml);
    document.close();
  });

  it('applies stored preset settings and saves updated preset fields', async () => {
    const loadExtensionSettingsFromStorage = jest.fn().mockResolvedValue(savedSettings);
    const saveExtensionSettingsToStorage = jest.fn().mockImplementation(async (value: unknown) => value);
    const resetExtensionSettingsToDefaults = jest.fn().mockResolvedValue(savedSettings);

    mockSettingsModule({
      loadExtensionSettingsFromStorage,
      saveExtensionSettingsToStorage,
      resetExtensionSettingsToDefaults,
    });

    jest.isolateModules(() => {
      require('./settings');
    });
    await Promise.resolve();

    expect((document.getElementById('self-video-resolution-preset') as HTMLSelectElement).value).toBe('1280x720');
    expect((document.getElementById('tab-resolution-preset') as HTMLSelectElement).value).toBe('854x480');
    expect((document.getElementById('theme') as HTMLSelectElement).value).toBe('dark');
    expect((document.getElementById('anonymous-diagnostics') as HTMLInputElement).checked).toBe(true);
    expect(document.documentElement.dataset.theme).toBe('dark');

    (document.getElementById('theme') as HTMLSelectElement).value = 'light';
    (document.getElementById('anonymous-diagnostics') as HTMLInputElement).checked = false;
    (document.getElementById('recording-mode') as HTMLSelectElement).value = 'opfs';
    (document.getElementById('mic-mode') as HTMLSelectElement).value = 'mixed';
    (document.getElementById('separate-camera') as HTMLInputElement).checked = false;
    (document.getElementById('tab-recording-format') as HTMLSelectElement).value = 'webm';
    (document.getElementById('camera-recording-format') as HTMLSelectElement).value = 'webm';
    (document.getElementById('microphone-recording-format') as HTMLSelectElement).value = 'webm';
    (document.getElementById('self-video-resolution-preset') as HTMLSelectElement).value = '640x360';
    editControl('tab-resolution-preset', (control) => { control.value = '1920x1080'; });
    // A pending write says so, so nothing can mistake it for a settled one.
    expect(document.getElementById('status')?.textContent).toBe('Saving…');
    await flushWrites();

    expect(saveExtensionSettingsToStorage).toHaveBeenLastCalledWith({
      privacy: {
        anonymousDiagnostics: false,
      },
      appearance: {
        theme: 'light',
      },
      basic: {
        recordingMode: 'opfs',
        microphoneRecordingMode: 'mixed',
        separateCameraCapture: false,
        autoEnableCaptions: true,
        tabRecordingFormat: 'webm',
        cameraRecordingFormat: 'webm',
        microphoneRecordingFormat: 'webm',
        selfVideoResolutionPreset: '640x360',
        selfVideoUseAutoResolution: true,
      },
      professional: {
        selfVideoFrameRate: 30,
        tabContentType: 'screen',
        tabResolutionPreset: '1920x1080',
        tabMaxFrameRate: 24,
        microphoneEchoCancellation: true,
        microphoneNoiseSuppression: true,
        microphoneAutoGainControl: true,
        chunkDefaultTimesliceMs: 2000,
        chunkExtendedTimesliceMs: 4000,
      },
    });
    expect(document.getElementById('status')?.textContent).toBe('Saved');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('keeps the console controls synchronized and collapses Professional parameters', async () => {
    mockSettingsModule({
      loadExtensionSettingsFromStorage: jest.fn().mockResolvedValue(savedSettings),
      saveExtensionSettingsToStorage: jest.fn().mockResolvedValue(savedSettings),
      resetExtensionSettingsToDefaults: jest.fn().mockResolvedValue(savedSettings),
    });

    jest.isolateModules(() => {
      require('./settings');
    });
    await Promise.resolve();

    const storage = document.querySelector<HTMLButtonElement>('[data-select="recording-mode"]')!;
    const storageLabel = storage.querySelector('.value-cycle-label');
    expect(storageLabel?.textContent).toBe('Google Drive');

    storage.click();
    expect(storage.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById('recording-mode-options')?.hidden).toBe(false);
    expect((document.getElementById('recording-mode') as HTMLSelectElement).value).toBe('drive');

    (document.querySelector('[data-select="recording-mode"]') as HTMLButtonElement).focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(storage.getAttribute('aria-expanded')).toBe('false');

    storage.click();
    (document.querySelector('#recording-mode-options [data-value="opfs"]') as HTMLButtonElement).click();
    expect((document.getElementById('recording-mode') as HTMLSelectElement).value).toBe('opfs');
    expect(storageLabel?.textContent).toBe('OPFS (Local Disk)');
    expect(storage.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('#recording-mode-options [data-value="opfs"]')?.getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector('#recording-mode-options [data-value="drive"]')?.getAttribute('aria-selected')).toBe('false');

    const separateCamera = document.querySelector<HTMLButtonElement>('[data-checkbox="separate-camera"] [data-value="false"]')!;
    separateCamera.click();
    expect((document.getElementById('separate-camera') as HTMLInputElement).checked).toBe(false);
    expect(separateCamera.getAttribute('aria-pressed')).toBe('true');

    const professionalToggle = document.getElementById('professional-toggle') as HTMLButtonElement;
    const professionalFields = document.getElementById('professional-fields') as HTMLElement;
    professionalToggle.click();
    expect(professionalToggle.getAttribute('aria-expanded')).toBe('false');
    expect(professionalFields.hidden).toBe(true);
  });

  it('disables unavailable formats in both selectors and rejects a stale saved choice', async () => {
    (MediaRecorder.isTypeSupported as jest.Mock).mockReturnValue(false);
    const staleSettings: ExtensionSettings = {
      ...savedSettings,
      basic: { ...savedSettings.basic, microphoneRecordingFormat: 'm4a' },
    };
    const saveExtensionSettingsToStorage = jest.fn().mockResolvedValue(staleSettings);
    mockSettingsModule({
      loadExtensionSettingsFromStorage: jest.fn().mockResolvedValue(staleSettings),
      saveExtensionSettingsToStorage,
      resetExtensionSettingsToDefaults: jest.fn().mockResolvedValue(savedSettings),
    });

    jest.isolateModules(() => {
      require('./settings');
    });
    await Promise.resolve();

    const m4aNative = document.querySelector<HTMLSelectElement>('#microphone-recording-format option[value="m4a"]')!;
    const m4aCustom = document.querySelector<HTMLButtonElement>('#microphone-recording-format-options [data-value="m4a"]')!;
    expect(m4aNative.disabled).toBe(true);
    expect(m4aCustom.disabled).toBe(true);
    expect(m4aCustom.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById('microphone-recording-format-note')?.hidden).toBe(false);

    const trigger = document.getElementById('microphone-recording-format-trigger') as HTMLButtonElement;
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(document.querySelector('#microphone-recording-format-options [data-value="webm"]'));

    editControl('microphone-recording-format', (control) => { control.value = 'm4a'; });
    await flushWrites();
    expect(saveExtensionSettingsToStorage).not.toHaveBeenCalled();
    expect(document.getElementById('status')?.textContent).toMatch(/M4A microphone format is unavailable/);
  });

  describe('mirroring changes written elsewhere', () => {
    function storageListener(): ((changes: Record<string, unknown>, area: string) => void) | undefined {
      const add = (chrome.storage.onChanged.addListener as jest.Mock).mock.calls;
      return add.length ? add[add.length - 1][0] : undefined;
    }

    async function renderPage(overrides: Record<string, unknown> = {}) {
      mockSettingsModule({
        loadExtensionSettingsFromStorage: jest.fn().mockResolvedValue(savedSettings),
        saveExtensionSettingsToStorage: jest.fn().mockResolvedValue(savedSettings),
        resetExtensionSettingsToDefaults: jest.fn().mockResolvedValue(savedSettings),
        ...overrides,
      });
      jest.isolateModules(() => {
        require('./settings');
      });
      await flushWrites();
    }

    it('applies a change another surface wrote', async () => {
      await renderPage();

      storageListener()?.(
        { extensionSettings: { newValue: { ...savedSettings, professional: { ...savedSettings.professional, selfVideoFrameRate: 15 } } } },
        'local'
      );

      expect((document.getElementById('self-video-frame-rate') as HTMLInputElement).value).toBe('15');
    });

    it('does not overwrite a number field that is still being typed in', async () => {
      await renderPage();
      const field = document.getElementById('self-video-frame-rate') as HTMLInputElement;
      document.body.appendChild(field);
      field.focus();
      field.value = '4';
      field.dispatchEvent(new Event('input', { bubbles: true }));

      // The popup persists a run-config default while the value is half-typed.
      storageListener()?.(
        { extensionSettings: { newValue: { ...savedSettings, basic: { ...savedSettings.basic, separateCameraCapture: false } } } },
        'local'
      );

      expect(field.value).toBe('4');
    });
  });

  describe('the Google Drive section', () => {
    async function renderPage() {
      mockSettingsModule({
        loadExtensionSettingsFromStorage: jest.fn().mockResolvedValue(savedSettings),
        saveExtensionSettingsToStorage: jest.fn().mockResolvedValue(savedSettings),
        resetExtensionSettingsToDefaults: jest.fn().mockResolvedValue(savedSettings),
      });
      jest.isolateModules(() => {
        require('./settings');
      });
      // Settings load, then the connection read that follows it.
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    }

    it('reads the connection without prompting and warns that Drive mode cannot upload yet', async () => {
      await renderPage();

      expect(sendToBackground).toHaveBeenCalledWith({ type: 'GET_DRIVE_CONNECTION' });
      expect(sendToBackground).not.toHaveBeenCalledWith({ type: 'CONNECT_DRIVE' });
      expect(document.getElementById('drive-status')?.textContent).toBe('Not connected');
      expect((document.getElementById('drive-disconnect') as HTMLButtonElement).hidden).toBe(true);
      // savedSettings records Drive as the default recording mode.
      const notice = document.getElementById('drive-notice')!;
      expect(notice.hidden).toBe(false);
      expect(notice.textContent).toMatch(/no account is connected/);
    });

    it('connects on demand and then names the account', async () => {
      await renderPage();

      (document.getElementById('drive-connect') as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(sendToBackground).toHaveBeenCalledWith({ type: 'CONNECT_DRIVE' });
      expect(document.getElementById('drive-status')?.textContent).toBe('me@example.com');
      expect((document.getElementById('drive-connect') as HTMLButtonElement).textContent).toBe('Switch account');
      expect((document.getElementById('drive-disconnect') as HTMLButtonElement).hidden).toBe(false);
      expect(document.getElementById('drive-notice')?.hidden).toBe(true);
    });

    it('surfaces a failed connection instead of claiming one', async () => {
      await renderPage();
      sendToBackground.mockResolvedValueOnce({ ok: false, error: 'The user did not approve access.' });

      (document.getElementById('drive-connect') as HTMLButtonElement).click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(document.getElementById('drive-status')?.textContent).toBe('Not connected');
      expect(document.getElementById('drive-notice')?.textContent).toBe('The user did not approve access.');
      expect(document.getElementById('drive-notice')?.dataset.tone).toBe('error');
    });
  });
});
