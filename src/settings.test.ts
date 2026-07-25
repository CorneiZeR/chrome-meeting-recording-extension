import { readFileSync } from 'fs';
import { resolve } from 'path';

import type { ExtensionSettings } from './shared/settings';

const settingsHtml = readFileSync(
  resolve(__dirname, '../static/settings.html'),
  'utf8'
);

describe('settings page', () => {
  const savedSettings: ExtensionSettings = {
    appearance: {
      theme: 'dark',
    },
    basic: {
      recordingMode: 'drive',
      microphoneRecordingMode: 'separate',
      separateCameraCapture: true,
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

  beforeEach(() => {
    jest.resetModules();
    document.open();
    document.write(settingsHtml);
    document.close();
  });

  it('applies stored preset settings and saves updated preset fields', async () => {
    const loadExtensionSettingsFromStorage = jest.fn().mockResolvedValue(savedSettings);
    const saveExtensionSettingsToStorage = jest.fn().mockImplementation(async (value: unknown) => value);
    const resetExtensionSettingsToDefaults = jest.fn().mockResolvedValue(savedSettings);

    jest.doMock('./shared/settings', () => ({
      DEFAULT_EXTENSION_SETTINGS: savedSettings,
      loadExtensionSettingsFromStorage,
      saveExtensionSettingsToStorage,
      resetExtensionSettingsToDefaults,
    }));

    jest.isolateModules(() => {
      require('./settings');
    });
    await Promise.resolve();

    expect((document.getElementById('self-video-resolution-preset') as HTMLSelectElement).value).toBe('1280x720');
    expect((document.getElementById('tab-resolution-preset') as HTMLSelectElement).value).toBe('854x480');
    expect((document.getElementById('theme') as HTMLSelectElement).value).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');

    (document.getElementById('theme') as HTMLSelectElement).value = 'light';
    (document.getElementById('recording-mode') as HTMLSelectElement).value = 'opfs';
    (document.getElementById('mic-mode') as HTMLSelectElement).value = 'mixed';
    (document.getElementById('separate-camera') as HTMLInputElement).checked = false;
    (document.getElementById('self-video-resolution-preset') as HTMLSelectElement).value = '640x360';
    (document.getElementById('tab-resolution-preset') as HTMLSelectElement).value = '1920x1080';
    (document.getElementById('save-settings') as HTMLButtonElement).click();
    await Promise.resolve();

    expect(saveExtensionSettingsToStorage).toHaveBeenCalledWith({
      appearance: {
        theme: 'light',
      },
      basic: {
        recordingMode: 'opfs',
        microphoneRecordingMode: 'mixed',
        separateCameraCapture: false,
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
    jest.doMock('./shared/settings', () => ({
      DEFAULT_EXTENSION_SETTINGS: savedSettings,
      loadExtensionSettingsFromStorage: jest.fn().mockResolvedValue(savedSettings),
      saveExtensionSettingsToStorage: jest.fn().mockResolvedValue(savedSettings),
      resetExtensionSettingsToDefaults: jest.fn().mockResolvedValue(savedSettings),
    }));

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
});
