import { MicPermissionService } from '../MicPermissionService';
import { createRuntimeTab } from '../../platform/chrome/tabs';

jest.mock('../../platform/chrome/tabs', () => ({
  createRuntimeTab: jest.fn().mockResolvedValue(undefined),
}));

type PermState = 'granted' | 'denied' | 'prompt';

function setPermissionState(state: PermState | 'throw' | 'missing') {
  if (state === 'missing') {
    Object.defineProperty(global.navigator, 'permissions', { value: undefined, configurable: true });
    return;
  }
  Object.defineProperty(global.navigator, 'permissions', {
    value: {
      query: jest.fn(async () => {
        if (state === 'throw') throw new Error('query unsupported');
        return { state };
      }),
    },
    configurable: true,
  });
}

function mockGetUserMedia(result: 'grant' | 'reject') {
  const stop = jest.fn();
  (navigator.mediaDevices.getUserMedia as jest.Mock).mockImplementation(async () => {
    if (result === 'reject') throw new Error('NotAllowedError');
    return { getTracks: () => [{ stop }] };
  });
  return { stop };
}

/** Drains the async click/refresh chains (multiple awaited promises). */
async function flush() {
  for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('MicPermissionService', () => {
  let service: MicPermissionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MicPermissionService();
    jest.spyOn(window, 'alert').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('queryMicPermissionState', () => {
    it('returns "unknown" when the Permissions API is unavailable', async () => {
      setPermissionState('missing');
      expect(await service.queryMicPermissionState()).toBe('unknown');
    });

    it('returns "unknown" when the query throws', async () => {
      setPermissionState('throw');
      expect(await service.queryMicPermissionState()).toBe('unknown');
    });

    it('returns the reported permission state', async () => {
      setPermissionState('granted');
      expect(await service.queryMicPermissionState()).toBe('granted');
    });
  });

  describe('ensureReadyForRecording', () => {
    it('short-circuits to ready when mic mode is off (no permission query)', async () => {
      setPermissionState('denied');
      expect(await service.ensureReadyForRecording('off')).toBe(true);
      expect(createRuntimeTab).not.toHaveBeenCalled();
    });

    it('is ready immediately when permission is already granted', async () => {
      setPermissionState('granted');
      expect(await service.ensureReadyForRecording('mixed')).toBe(true);
      expect(createRuntimeTab).not.toHaveBeenCalled();
    });

    it('opens the mic setup tab and fails when permission is denied', async () => {
      setPermissionState('denied');
      expect(await service.ensureReadyForRecording('separate')).toBe(false);
      expect(createRuntimeTab).toHaveBeenCalledWith('micsetup.html');
    });

    it('primes inline and becomes ready when the prompt is grantable', async () => {
      setPermissionState('prompt');
      const { stop } = mockGetUserMedia('grant');
      expect(await service.ensureReadyForRecording('mixed')).toBe(true);
      expect(stop).toHaveBeenCalledTimes(1);
      expect(createRuntimeTab).not.toHaveBeenCalled();
    });

    it('falls back to the setup tab when inline priming is rejected', async () => {
      setPermissionState('prompt');
      mockGetUserMedia('reject');
      expect(await service.ensureReadyForRecording('separate')).toBe(false);
      expect(createRuntimeTab).toHaveBeenCalledWith('micsetup.html');
    });
  });

  describe('a browser that never answers', () => {
    /** Replaces the permission query with one that never settles. */
    function setHangingPermissionQuery() {
      Object.defineProperty(global.navigator, 'permissions', {
        value: { query: jest.fn(() => new Promise(() => {})) },
        configurable: true,
      });
    }

    it('still reports a state when the permission query never settles', async () => {
      // Edge left a click doing nothing at all: the handler was waiting behind
      // a query that never came back.
      setHangingPermissionQuery();
      (navigator.mediaDevices.enumerateDevices as jest.Mock | undefined)?.mockResolvedValue?.([]);

      await expect(service.queryMicPermissionState()).resolves.toBe('unknown');
    });

    it('infers a granted microphone from a device label when the query cannot answer', async () => {
      setHangingPermissionQuery();
      (navigator.mediaDevices.enumerateDevices as jest.Mock).mockResolvedValue([
        { kind: 'audioinput', label: 'MacBook Pro Microphone' },
      ]);

      await expect(service.queryMicPermissionState()).resolves.toBe('granted');
    });

    it('gives up on an inline prompt that never appears, and releases a late stream', async () => {
      const stop = jest.fn();
      let resolveLate: ((stream: unknown) => void) | undefined;
      (navigator.mediaDevices.getUserMedia as jest.Mock).mockImplementation(
        () => new Promise((resolve) => { resolveLate = resolve; })
      );

      const primed = await service.tryPrimeInline();
      expect(primed).toBe(false);

      // The prompt is answered after we stopped waiting: the microphone must
      // not be left open by a popup that has moved on.
      resolveLate?.({ getTracks: () => [{ stop }] });
      await flush();
      expect(stop).toHaveBeenCalled();
    });

  });

  describe('bindButton', () => {
    function makeButton() {
      return document.createElement('button');
    }

    it('renders the granted state as a disabled, enabled-label button', async () => {
      setPermissionState('granted');
      const btn = makeButton();
      const onText = jest.fn();
      service.bindButton(btn, onText);
      await flush();
      await flush();

      expect(btn.textContent).toBe('Microphone Enabled ✓');
      expect(btn.disabled).toBe(true);
      expect(onText).toHaveBeenCalledWith('Microphone Enabled ✓');
    });

    it('renders the blocked label when permission is denied', async () => {
      setPermissionState('denied');
      const btn = makeButton();
      service.bindButton(btn);
      await flush();
      await flush();

      expect(btn.textContent).toBe('Microphone Blocked');
      expect(btn.disabled).toBe(false);
    });

    it('alerts without opening a setup tab when the permission was granted since the label was rendered', async () => {
      // A granted state disables the button, so this path is reached only with a
      // stale label: the user granted access in the setup tab and came back.
      setPermissionState('prompt');
      const btn = makeButton();
      service.bindButton(btn);
      await flush();
      expect(btn.disabled).toBe(false);

      setPermissionState('granted');
      btn.click();
      await flush();
      await flush();

      expect(window.alert).toHaveBeenCalledWith('Microphone is already enabled for this extension.');
      expect(createRuntimeTab).not.toHaveBeenCalled();
      // And the label catches up.
      expect(btn.textContent).toBe('Microphone Enabled ✓');
    });

    it('opens the setup tab when nothing about the permission can be determined', async () => {
      // The guarantee this file exists for: on Edge a click did nothing at all,
      // because both browser calls stayed pending instead of answering.
      Object.defineProperty(global.navigator, 'permissions', {
        value: { query: jest.fn(() => new Promise(() => {})) },
        configurable: true,
      });
      (navigator.mediaDevices.getUserMedia as jest.Mock).mockImplementation(() => new Promise(() => {}));
      (navigator.mediaDevices.enumerateDevices as jest.Mock).mockResolvedValue([]);
      const btn = makeButton();
      // Both bounded waits have to elapse (the query, then the inline prompt),
      // so drive the clock rather than sleeping through two real seconds.
      jest.useFakeTimers();
      try {
        service.bindButton(btn);
        await jest.advanceTimersByTimeAsync(600);

        btn.click();
        await jest.advanceTimersByTimeAsync(2_200);

        expect(createRuntimeTab).toHaveBeenCalledWith('micsetup.html');
      } finally {
        jest.useRealTimers();
      }
    });

    it('opens the setup tab when clicked while denied', async () => {
      setPermissionState('denied');
      const btn = makeButton();
      service.bindButton(btn);
      await flush();

      btn.click();
      await flush();
      await flush();

      expect(createRuntimeTab).toHaveBeenCalledWith('micsetup.html');
    });

    it('reports a friendly error when opening the setup tab throws', async () => {
      setPermissionState('denied');
      (createRuntimeTab as jest.Mock).mockRejectedValueOnce(new Error('no tabs permission'));
      const btn = makeButton();
      service.bindButton(btn);
      await flush();

      btn.click();
      await flush();

      expect(console.error).toHaveBeenCalledWith('[popup] mic enable flow error', expect.any(Error));
      expect(window.alert).toHaveBeenCalledWith('Could not open the microphone setup page. Please try again.');
    });

    it('primes inline and alerts success when clicked from the prompt state', async () => {
      setPermissionState('prompt');
      mockGetUserMedia('grant');
      const btn = makeButton();
      service.bindButton(btn);
      await flush();

      btn.click();
      await flush();

      expect(window.alert).toHaveBeenCalledWith('Microphone enabled for the extension.');
    });
  });
});
