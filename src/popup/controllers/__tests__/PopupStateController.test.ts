jest.mock('../../../shared/messages', () => ({
  sendToBackground: jest.fn(),
}));
jest.mock('../../../shared/settings', () => {
  const actual = jest.requireActual('../../../shared/settings');
  return {
    ...actual,
    loadExtensionSettingsFromStorage: jest.fn().mockResolvedValue(actual.DEFAULT_EXTENSION_SETTINGS),
    saveRunConfigAsDefaults: jest.fn().mockResolvedValue(actual.DEFAULT_EXTENSION_SETTINGS),
  };
});

import { PopupStateController } from '../PopupStateController';
import { sendToBackground } from '../../../shared/messages';
import { loadExtensionSettingsFromStorage, saveRunConfigAsDefaults } from '../../../shared/settings';
import type { RecordingStatusView } from '../../../shared/recording';

function makeElements() {
  const storageModeSelect = document.createElement('select');
  ['local', 'drive'].forEach((v) => {
    const o = document.createElement('option');
    o.value = v;
    storageModeSelect.appendChild(o);
  });
  const micModeSelect = document.createElement('select');
  ['off', 'mixed', 'separate'].forEach((v) => {
    const o = document.createElement('option');
    o.value = v;
    micModeSelect.appendChild(o);
  });
  const recordSelfVideoCheckbox = document.createElement('input');
  recordSelfVideoCheckbox.type = 'checkbox';
  const tabContentTypeGroup = document.createElement('div');
  ['screen', 'video'].forEach((v) => {
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'tab-content-type';
    input.value = v;
    input.checked = v === 'screen';
    tabContentTypeGroup.appendChild(input);
  });
  return {
    storageModeSelect,
    micModeSelect,
    recordSelfVideoCheckbox,
    tabContentTypeGroup,
    startBtn: document.createElement('button'),
    stopBtn: document.createElement('button'),
  } as any;
}

function makeController() {
  const el = makeElements();
  const callbacks = { onPhaseChange: jest.fn(), onToast: jest.fn(), onAlert: jest.fn() };
  const controller = new PopupStateController(el, callbacks);
  return { el, callbacks, controller };
}

const idleView = (over: Partial<RecordingStatusView> = {}): RecordingStatusView => ({
  phase: 'idle',
  runConfig: null,
  updatedAt: Date.now(),
  ...over,
});

describe('PopupStateController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (loadExtensionSettingsFromStorage as jest.Mock).mockResolvedValue(
      jest.requireActual('../../../shared/settings').DEFAULT_EXTENSION_SETTINGS
    );
  });

  it('exposes default run configs before any session is applied', () => {
    const { controller } = makeController();
    expect(controller.getActiveRunConfig()).toEqual(
      expect.objectContaining({ storageMode: expect.any(String), micMode: expect.any(String) })
    );
    expect(controller.getIdleDefaultRunConfig()).toEqual(controller.getActiveRunConfig());
  });

  describe('refreshInitialState', () => {
    it('hydrates from the background session on success', async () => {
      const { controller, callbacks } = makeController();
      (sendToBackground as jest.Mock).mockResolvedValue({ session: idleView() });

      await controller.refreshInitialState();

      expect(callbacks.onPhaseChange).toHaveBeenCalledWith('idle', expect.objectContaining({ phase: 'idle' }));
    });

    it('falls back to default config when settings fail to load', async () => {
      const { controller } = makeController();
      (loadExtensionSettingsFromStorage as jest.Mock).mockRejectedValue(new Error('storage error'));
      (sendToBackground as jest.Mock).mockResolvedValue({ session: idleView() });

      await controller.refreshInitialState();

      expect(controller.getIdleDefaultRunConfig()).toEqual(
        expect.objectContaining({ storageMode: expect.any(String), micMode: expect.any(String), recordSelfVideo: expect.any(Boolean) })
      );
    });

    it('renders a local idle view when the background is unreachable', async () => {
      const { controller, callbacks } = makeController();
      (sendToBackground as jest.Mock).mockRejectedValue(new Error('no background'));

      await controller.refreshInitialState();

      expect(callbacks.onPhaseChange).toHaveBeenLastCalledWith('idle', expect.objectContaining({ phase: 'idle', runConfig: null }));
    });
  });

  describe('the pre-start form', () => {
    const changeOn = async (control: HTMLElement) => {
      control.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    };

    it('remembers the camera choice as the next run default', async () => {
      const { el } = makeController();

      el.recordSelfVideoCheckbox.checked = false;
      await changeOn(el.recordSelfVideoCheckbox);

      expect(saveRunConfigAsDefaults).toHaveBeenCalledWith(
        expect.objectContaining({ recordSelfVideo: false })
      );
    });

    it('remembers the storage destination as the next run default', async () => {
      const { el } = makeController();

      el.storageModeSelect.value = 'local';
      await changeOn(el.storageModeSelect);

      expect(saveRunConfigAsDefaults).toHaveBeenCalledWith(
        expect.objectContaining({ storageMode: 'local' })
      );
    });

    it('remembers the microphone mode as the next run default', async () => {
      const { el } = makeController();

      el.micModeSelect.value = 'off';
      await changeOn(el.micModeSelect);

      expect(saveRunConfigAsDefaults).toHaveBeenCalledWith(
        expect.objectContaining({ micMode: 'off' })
      );
    });

    it('remembers the tab content type as the next run default', async () => {
      const { el } = makeController();
      const radios = el.tabContentTypeGroup.querySelectorAll('input');

      radios[0].checked = false;
      radios[1].checked = true;
      await changeOn(radios[1]);

      expect(saveRunConfigAsDefaults).toHaveBeenCalledWith(
        expect.objectContaining({ tabContentType: 'video' })
      );
    });

    it('keeps the choice when the next idle snapshot lands', async () => {
      const { el, controller } = makeController();
      (sendToBackground as jest.Mock).mockResolvedValue({ session: idleView() });
      await controller.refreshInitialState();
      expect(el.recordSelfVideoCheckbox.checked).toBe(true);

      el.recordSelfVideoCheckbox.checked = false;
      el.micModeSelect.value = 'off';
      await changeOn(el.micModeSelect);
      controller.applySession(idleView());

      expect(el.recordSelfVideoCheckbox.checked).toBe(false);
      expect(el.micModeSelect.value).toBe('off');
      expect(controller.getIdleDefaultRunConfig()).toEqual(
        expect.objectContaining({ recordSelfVideo: false, micMode: 'off' })
      );
    });

    it('does not write back the config of a session it only mirrored into the form', async () => {
      const { el, controller } = makeController();
      // Values the mirrored config differs from, so applying it really does
      // dispatch the `change` the styled selectors need.
      el.storageModeSelect.value = 'drive';
      el.micModeSelect.value = 'separate';

      controller.applySession(idleView({
        phase: 'recording',
        runConfig: { storageMode: 'local', micMode: 'off', recordSelfVideo: false, tabContentType: 'video' },
      }));
      await Promise.resolve();

      expect(saveRunConfigAsDefaults).not.toHaveBeenCalled();
    });

    it('survives a failed write without throwing', async () => {
      const { el } = makeController();
      (saveRunConfigAsDefaults as jest.Mock).mockRejectedValueOnce(new Error('storage error'));
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

      el.recordSelfVideoCheckbox.checked = false;
      await changeOn(el.recordSelfVideoCheckbox);

      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('applySession', () => {
    it('toasts the runtime error for a failed phase', () => {
      const { controller, callbacks } = makeController();
      controller.applySession(idleView({ phase: 'failed', error: 'capture lost' }));
      expect(callbacks.onToast).toHaveBeenCalledWith('Recording error: capture lost');
    });

    it('toasts an upload confirmation when an upload summary lands on idle', () => {
      const { controller, callbacks } = makeController();
      controller.applySession(idleView({
        phase: 'idle',
        uploadSummary: { uploaded: [{ stream: 'tab', filename: 'tab.webm' }], localFallbacks: [] },
      }));

      expect(callbacks.onToast).toHaveBeenCalledWith('Uploaded 1 file(s) to Google Drive');
    });

    it('alerts about local fallbacks and de-duplicates a repeated summary', () => {
      const { controller, callbacks } = makeController();
      const summary = {
        uploaded: [],
        localFallbacks: [{ stream: 'tab' as const, filename: 'tab.webm', error: 'AbortError' }],
      };

      controller.applySession(idleView({ phase: 'idle', uploadSummary: summary }));
      controller.applySession(idleView({ phase: 'idle', uploadSummary: summary }));

      expect(callbacks.onAlert).toHaveBeenCalledTimes(1);
    });
  });

});
