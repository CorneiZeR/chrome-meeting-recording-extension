import {
  buildDefaultRunConfigFromSettings,
  buildRecorderRuntimeSettingsSnapshot,
  DEFAULT_EXTENSION_SETTINGS,
  getSelfVideoProfileSettings,
  getTabOutputSettings,
  normalizeRecorderRuntimeSettingsSnapshot,
  normalizeExtensionSettings,
  resolveTabVideoBitrate,
  TAB_SCREEN_QUALITY_FACTOR,
  TAB_VIDEO_QUALITY_FACTOR,
  saveRunConfigAsDefaults,
} from '..';

describe('saveRunConfigAsDefaults', () => {
  const STORAGE_KEY = 'extensionSettings';
  let store: Record<string, unknown>;

  beforeEach(() => {
    store = {};
    (globalThis as any).chrome = {
      storage: {
        local: {
          get: jest.fn(async (keys: unknown) => {
            const names = typeof keys === 'string' ? [keys] : (keys as string[]);
            return Object.fromEntries(names.map((name) => [name, store[name]]));
          }),
          set: jest.fn(async (values: Record<string, unknown>) => {
            Object.assign(store, values);
          }),
        },
      },
    };
  });

  afterEach(() => {
    delete (globalThis as any).chrome;
  });

  it('writes every run-config field back as its persisted default', async () => {
    const saved = await saveRunConfigAsDefaults({
      storageMode: 'local',
      micMode: 'off',
      recordSelfVideo: false,
      tabContentType: 'video',
    });

    // 'local' is the runtime name for the persisted 'opfs' recording mode.
    expect(saved.basic.recordingMode).toBe('opfs');
    expect(saved.basic.microphoneRecordingMode).toBe('off');
    expect(saved.basic.separateCameraCapture).toBe(false);
    expect(saved.professional.tabContentType).toBe('video');
    expect((store[STORAGE_KEY] as any).basic.recordingMode).toBe('opfs');
  });

  it('round-trips through the popup default it feeds', async () => {
    const config = {
      storageMode: 'local' as const,
      micMode: 'mixed' as const,
      recordSelfVideo: false,
      tabContentType: 'video' as const,
    };

    expect(buildDefaultRunConfigFromSettings(await saveRunConfigAsDefaults(config))).toEqual(config);
  });

  it('re-applies its fields on top of a change written between the read and the write', async () => {
    store[STORAGE_KEY] = {
      basic: { autoEnableCaptions: true },
      professional: { selfVideoFrameRate: 24 },
    };
    // Stand in for the settings page persisting an unrelated field mid-flight:
    // the first read returns the old record, the next one the newer record.
    let reads = 0;
    (globalThis as any).chrome.storage.local.get = jest.fn(async (keys: unknown) => {
      const names = typeof keys === 'string' ? [keys] : (keys as string[]);
      reads += 1;
      if (reads === 2) {
        store[STORAGE_KEY] = {
          ...(store[STORAGE_KEY] as any),
          basic: { ...(store[STORAGE_KEY] as any).basic, autoEnableCaptions: false },
        };
      }
      return Object.fromEntries(names.map((name) => [name, store[name]]));
    });

    const saved = await saveRunConfigAsDefaults({
      storageMode: 'local',
      micMode: 'off',
      recordSelfVideo: false,
    });

    expect(saved.basic.separateCameraCapture).toBe(false);
    // The concurrent writer's field survives instead of being blasted back to
    // the value read before it landed.
    expect(saved.basic.autoEnableCaptions).toBe(false);
  });

  it('leaves settings the run config does not cover untouched', async () => {
    store[STORAGE_KEY] = {
      basic: { selfVideoResolutionPreset: '1280x720', autoEnableCaptions: false },
      professional: { selfVideoFrameRate: 30, tabContentType: 'video' },
    };

    const saved = await saveRunConfigAsDefaults({
      storageMode: 'drive',
      micMode: 'separate',
      recordSelfVideo: true,
    });

    expect(saved.basic.selfVideoResolutionPreset).toBe('1280x720');
    expect(saved.basic.autoEnableCaptions).toBe(false);
    expect(saved.professional.selfVideoFrameRate).toBe(30);
    // An absent per-recording override must not reset the stored tab default.
    expect(saved.professional.tabContentType).toBe('video');
  });
});

describe('settings', () => {
  it('migrates anonymous diagnostics as default-on while preserving an explicit opt-out', () => {
    expect(normalizeExtensionSettings({}).privacy.anonymousDiagnostics).toBe(true);
    expect(normalizeExtensionSettings({ privacy: { anonymousDiagnostics: false } }).privacy.anonymousDiagnostics).toBe(false);
  });

  it('turns Meet captions on by default while preserving an explicit opt-out', () => {
    // Without captions Meet produces no text at all, so the useful default is on;
    // a user who does not want their Meet UI touched must be able to say so.
    expect(DEFAULT_EXTENSION_SETTINGS.basic.autoEnableCaptions).toBe(true);
    expect(normalizeExtensionSettings({}).basic.autoEnableCaptions).toBe(true);
    expect(normalizeExtensionSettings({ basic: { autoEnableCaptions: false } }).basic.autoEnableCaptions).toBe(false);
    expect(normalizeExtensionSettings({ basic: { autoEnableCaptions: 'yes' } }).basic.autoEnableCaptions).toBe(true);
  });

  it('defaults to the system theme and accepts only supported preferences', () => {
    expect(DEFAULT_EXTENSION_SETTINGS.appearance.theme).toBe('system');
    expect(normalizeExtensionSettings({}).appearance.theme).toBe('system');
    expect(normalizeExtensionSettings({ appearance: { theme: 'dark' } }).appearance.theme).toBe('dark');
    expect(normalizeExtensionSettings({ appearance: { theme: 'sepia' } }).appearance.theme).toBe('system');
  });

  it('uses preset-based defaults for camera and tab resolution', () => {
    expect(DEFAULT_EXTENSION_SETTINGS.basic.selfVideoResolutionPreset).toBe('1920x1080');
    expect(DEFAULT_EXTENSION_SETTINGS.professional.tabResolutionPreset).toBe('1920x1080');
    expect(getSelfVideoProfileSettings(DEFAULT_EXTENSION_SETTINGS)).toEqual(
      expect.objectContaining({
        width: 1920,
        height: 1080,
      })
    );
    expect(getTabOutputSettings(DEFAULT_EXTENSION_SETTINGS)).toEqual(
      expect.objectContaining({
        maxWidth: 1920,
        maxHeight: 1080,
      })
    );
  });

  it('accepts the new preset fields directly', () => {
    const settings = normalizeExtensionSettings({
      basic: {
        selfVideoResolutionPreset: '1280x720',
      },
      professional: {
        tabResolutionPreset: '854x480',
      },
    });

    expect(settings.basic.selfVideoResolutionPreset).toBe('1280x720');
    expect(settings.professional.tabResolutionPreset).toBe('854x480');
    expect(getSelfVideoProfileSettings(settings)).toEqual(
      expect.objectContaining({
        width: 1280,
        height: 720,
      })
    );
    expect(getTabOutputSettings(settings)).toEqual(
      expect.objectContaining({
        maxWidth: 854,
        maxHeight: 480,
      })
    );
  });

  it('defaults recording containers to WebM and normalizes each independent format', () => {
    const defaults = normalizeExtensionSettings({});
    expect(defaults.basic).toEqual(expect.objectContaining({
      tabRecordingFormat: 'webm',
      cameraRecordingFormat: 'webm',
      microphoneRecordingFormat: 'webm',
    }));

    const selected = normalizeExtensionSettings({
      basic: { tabRecordingFormat: 'mp4', cameraRecordingFormat: 'mp4', microphoneRecordingFormat: 'm4a' },
    });
    expect(selected.basic).toEqual(expect.objectContaining({
      tabRecordingFormat: 'mp4',
      cameraRecordingFormat: 'mp4',
      microphoneRecordingFormat: 'm4a',
    }));

    const invalid = normalizeExtensionSettings({
      basic: { tabRecordingFormat: 'avi', cameraRecordingFormat: 'mov', microphoneRecordingFormat: 'mp3' },
    });
    expect(invalid.basic).toEqual(expect.objectContaining({
      tabRecordingFormat: 'webm',
      cameraRecordingFormat: 'webm',
      microphoneRecordingFormat: 'webm',
    }));
  });

  it('migrates legacy camera width and height formats to the matching preset', () => {
    const settings = normalizeExtensionSettings({
      basic: {
        selfVideoWidthFormat: 720,
        selfVideoHeightFormat: 720,
      },
    });

    expect(settings.basic.selfVideoResolutionPreset).toBe('1280x720');
  });

  it('falls back to the legacy camera width format preset when the old pair was not exact', () => {
    const settings = normalizeExtensionSettings({
      basic: {
        selfVideoWidthFormat: 480,
        selfVideoHeightFormat: 360,
      },
    });

    expect(settings.basic.selfVideoResolutionPreset).toBe('854x480');
  });

  it('migrates legacy tab max size to the nearest supported preset within bounds', () => {
    const settings = normalizeExtensionSettings({
      professional: {
        tabMaxWidth: 1600,
        tabMaxHeight: 900,
      },
    });

    expect(settings.professional.tabResolutionPreset).toBe('1280x720');
  });

  it('defaults legacy tab sizes smaller than every preset back to 1080p', () => {
    const settings = normalizeExtensionSettings({
      professional: {
        tabMaxWidth: 500,
        tabMaxHeight: 300,
      },
    });

    expect(settings.professional.tabResolutionPreset).toBe('1920x1080');
  });

  it('passes the tab content type through to tab output settings', () => {
    // There is no user-facing bitrate knob; the offscreen derives the bitrate from
    // this content type's factor and the delivered dimensions, capped at the
    // internal MAX_TAB_VIDEO_BITRATE ceiling.
    expect(getTabOutputSettings(DEFAULT_EXTENSION_SETTINGS).contentType).toBe('screen');
    const settings = normalizeExtensionSettings({ professional: { tabContentType: 'video' } });
    expect(getTabOutputSettings(settings).contentType).toBe('video');
  });

  it('resolveTabVideoBitrate scales with a quality factor and clamps to floor/ceiling', () => {
    // Screen factor at 1080p30: ~1.49 Mbps — matches historical target.
    expect(resolveTabVideoBitrate(1920, 1080, 30, TAB_SCREEN_QUALITY_FACTOR)).toBe(
      Math.round(1920 * 1080 * 30 * TAB_SCREEN_QUALITY_FACTOR)
    );
    // 360p30 with screen factor falls below the 250 kbps floor → clamped.
    expect(resolveTabVideoBitrate(640, 360, 30, TAB_SCREEN_QUALITY_FACTOR)).toBe(250_000);
    // Video factor at 1080p30: ~4.97 Mbps.
    expect(resolveTabVideoBitrate(1920, 1080, 30, TAB_VIDEO_QUALITY_FACTOR)).toBe(
      Math.round(1920 * 1080 * 30 * TAB_VIDEO_QUALITY_FACTOR)
    );
    // Ceiling parameter clamps when the estimate exceeds it.
    expect(resolveTabVideoBitrate(1920, 1080, 30, TAB_VIDEO_QUALITY_FACTOR, 3_000_000)).toBe(3_000_000);
  });

  it('defaults tabContentType to screen and normalizes video correctly', () => {
    expect(normalizeExtensionSettings({}).professional.tabContentType).toBe('screen');
    const video = normalizeExtensionSettings({ professional: { tabContentType: 'video' } });
    expect(video.professional.tabContentType).toBe('video');
    const invalid = normalizeExtensionSettings({ professional: { tabContentType: 'animation' } });
    expect(invalid.professional.tabContentType).toBe('screen');
  });

  it('carries the persisted tab content type into the popup default run config', () => {
    // The popup pre-selects this default, then may override it per-recording.
    expect(buildDefaultRunConfigFromSettings(DEFAULT_EXTENSION_SETTINGS).tabContentType).toBe('screen');
    const video = normalizeExtensionSettings({ professional: { tabContentType: 'video' } });
    expect(buildDefaultRunConfigFromSettings(video).tabContentType).toBe('video');
  });

  it('drops a legacy persisted tabVideoBitrate (the ceiling is now internal-only)', () => {
    const settings = normalizeExtensionSettings({ professional: { tabVideoBitrate: 1_500_000 } });
    expect((settings.professional as Record<string, unknown>).tabVideoBitrate).toBeUndefined();
  });

  it('drops legacy persisted self-video bitrate settings (the envelope is now internal-only)', () => {
    const settings = normalizeExtensionSettings({
      professional: {
        selfVideoBitrate: 6_000_000,
        selfVideoMinAdaptiveBitrate: 6_000_000,
      },
    });

    expect((settings.professional as Record<string, unknown>).selfVideoBitrate).toBeUndefined();
    expect((settings.professional as Record<string, unknown>).selfVideoMinAdaptiveBitrate).toBeUndefined();
  });

  it('builds a recorder runtime snapshot from the normalized capture settings', () => {
    const settings = normalizeExtensionSettings({
      basic: {
        selfVideoResolutionPreset: '1280x720',
      },
      professional: {
        selfVideoFrameRate: 24,
        tabResolutionPreset: '640x360',
        tabMaxFrameRate: 20,
        microphoneEchoCancellation: false,
        microphoneNoiseSuppression: true,
        microphoneAutoGainControl: false,
        chunkDefaultTimesliceMs: 1500,
        chunkExtendedTimesliceMs: 4500,
      },
    });

    expect(buildRecorderRuntimeSettingsSnapshot(settings)).toEqual({
      tab: {
        output: { maxWidth: 640, maxHeight: 360, maxFrameRate: 20, format: 'webm', contentType: 'screen' },
      },
      selfVideo: {
        profile: {
          width: 1280,
          height: 720,
          frameRate: 24,
          format: 'webm',
          aspectRatio: 1280 / 720,
          // Camera bitrate envelope is now internal (constants), not user-set.
          defaultBitsPerSecond: 3_000_000,
          minAdaptiveBitsPerSecond: 1_000_000,
          autoResolution: true,
        },
      },
      microphone: {
        echoCancellation: false,
        noiseSuppression: true,
        autoGainControl: false,
        format: 'webm',
      },
      chunking: {
        defaultTimesliceMs: 1500,
        extendedTimesliceMs: 4500,
      },
    });
  });

  it('defaults selfVideoUseAutoResolution on and carries it into the snapshot profile', () => {
    expect(normalizeExtensionSettings({}).basic.selfVideoUseAutoResolution).toBe(true);

    const off = normalizeExtensionSettings({ basic: { selfVideoUseAutoResolution: false } });
    expect(off.basic.selfVideoUseAutoResolution).toBe(false);
    expect(buildRecorderRuntimeSettingsSnapshot(off).selfVideo.profile.autoResolution).toBe(false);
  });

  it('defaults a snapshot profile missing autoResolution to false on validation', () => {
    const snapshot = buildRecorderRuntimeSettingsSnapshot(normalizeExtensionSettings({}));
    const legacy = { ...snapshot, selfVideo: { profile: { ...snapshot.selfVideo.profile } } };
    delete (legacy.selfVideo.profile as any).autoResolution;

    expect(normalizeRecorderRuntimeSettingsSnapshot(legacy)?.selfVideo.profile.autoResolution).toBe(false);
  });

  it('accepts only valid recorder runtime snapshots without applying silent defaults', () => {
    const snapshot = buildRecorderRuntimeSettingsSnapshot(
      normalizeExtensionSettings({
        professional: {
          tabResolutionPreset: '640x360',
        },
      })
    );

    expect(normalizeRecorderRuntimeSettingsSnapshot(snapshot)).toEqual(snapshot);
    expect(
      normalizeRecorderRuntimeSettingsSnapshot({
        ...snapshot,
        tab: {
          output: {
            ...snapshot.tab.output,
            maxFrameRate: 'fast',
          },
        },
      })
    ).toBeNull();
  });
});
