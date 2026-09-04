import {
  configurePerfRuntime,
  getPerfSettingsSnapshot,
  resetPerfFlags,
  PERF_SETTINGS_STORAGE_KEY,
} from '../perf';

type StorageListener = (
  changes: Record<string, { newValue?: unknown }>,
  areaName: string
) => void;

describe('configurePerfRuntime', () => {
  let listeners: StorageListener[];
  let stored: Record<string, unknown>;

  beforeEach(() => {
    resetPerfFlags();
    listeners = [];
    stored = {};
    (globalThis as any).chrome = {
      storage: {
        onChanged: {
          addListener: jest.fn((listener: StorageListener) => { listeners.push(listener); }),
          removeListener: jest.fn(),
        },
        local: {
          get: jest.fn(async (keys: unknown) => {
            const names = typeof keys === 'string' ? [keys] : (keys as string[]);
            return Object.fromEntries(names.map((name) => [name, stored[name]]));
          }),
          set: jest.fn(async (values: Record<string, unknown>) => { Object.assign(stored, values); }),
        },
      },
    };
  });

  afterEach(() => {
    resetPerfFlags();
    delete (globalThis as any).chrome;
  });

  it('applies the stored settings and keeps watching for later changes', async () => {
    stored[PERF_SETTINGS_STORAGE_KEY] = { adaptiveSelfVideoProfile: false };
    const onSettingsChanged = jest.fn();

    const settings = await configurePerfRuntime({ source: 'background', onSettingsChanged });

    expect(settings.adaptiveSelfVideoProfile).toBe(false);
    expect(getPerfSettingsSnapshot().adaptiveSelfVideoProfile).toBe(false);

    listeners[0]({ [PERF_SETTINGS_STORAGE_KEY]: { newValue: { adaptiveSelfVideoProfile: true } } }, 'local');
    expect(getPerfSettingsSnapshot().adaptiveSelfVideoProfile).toBe(true);
    expect(onSettingsChanged).toHaveBeenCalledTimes(2);
  });

  it('keeps a change that lands while the first read is still in flight', async () => {
    // The service worker reads these flags once per recording start, so a write
    // lost during startup mis-configures the whole run. Installing the watch
    // after the read is what used to drop it.
    stored[PERF_SETTINGS_STORAGE_KEY] = { adaptiveSelfVideoProfile: true };
    (globalThis as any).chrome.storage.local.get = jest.fn(async (keys: unknown) => {
      const names = typeof keys === 'string' ? [keys] : (keys as string[]);
      // Whatever is watching is installed by now: fire the change mid-read.
      listeners.forEach((listener) =>
        listener({ [PERF_SETTINGS_STORAGE_KEY]: { newValue: { adaptiveSelfVideoProfile: false } } }, 'local')
      );
      return Object.fromEntries(names.map((name) => [name, stored[name]]));
    });

    const settings = await configurePerfRuntime({ source: 'background' });

    expect(settings.adaptiveSelfVideoProfile).toBe(false);
    expect(getPerfSettingsSnapshot().adaptiveSelfVideoProfile).toBe(false);
  });
});
