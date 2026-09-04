jest.mock('../../platform/chrome/downloads', () => ({
  downloadFile: jest.fn().mockResolvedValue(1),
  awaitDownloadSettled: jest.fn().mockResolvedValue('complete'),
}));
jest.mock('../../platform/chrome/runtime', () => ({
  pokeRuntime: jest.fn(),
}));
jest.mock('../../shared/messages', () => ({
  broadcastToPopup: jest.fn().mockResolvedValue(undefined),
}));

import {
  isFreshRecordingStart,
  registerSaveHandler,
  startKeepAlive,
  stopKeepAlive,
} from '../sessionLifecycle';
import { awaitDownloadSettled, downloadFile } from '../../platform/chrome/downloads';
import { pokeRuntime } from '../../platform/chrome/runtime';
import { broadcastToPopup } from '../../shared/messages';

async function flushMicrotasks() {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe('registerSaveHandler', () => {
  let offscreen: any;
  let L: { log: jest.Mock; warn: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    (awaitDownloadSettled as jest.Mock).mockResolvedValue('complete');
    offscreen = { onSaveRequested: undefined, revokeBlobUrl: jest.fn() };
    L = { log: jest.fn(), warn: jest.fn() };
    registerSaveHandler(offscreen, L);
  });

  it('downloads the file, broadcasts success, then cleans up OPFS once the download completes', async () => {
    offscreen.onSaveRequested({ filename: 'meet-abc-20260618T143045-recording.webm', blobUrl: 'blob:1', opfsFilename: 'meet-abc-20260618T143045-recording.webm' });
    await flushMicrotasks();

    // The download goes into this run's own folder under the shared root; the
    // popup broadcast and the history row keep the bare filename.
    expect(downloadFile).toHaveBeenCalledWith({
      url: 'blob:1',
      filename: 'Google Meet Records/meet-abc-20260618T143045/meet-abc-20260618T143045-recording.webm',
      saveAs: false,
    });
    expect(broadcastToPopup).toHaveBeenCalledWith({ type: 'RECORDING_SAVED', filename: 'meet-abc-20260618T143045-recording.webm' });
    // Cleanup is gated on the real download completion, not a blind timer.
    expect(awaitDownloadSettled).toHaveBeenCalledWith(1);
    expect(offscreen.revokeBlobUrl).toHaveBeenCalledWith('blob:1', 'meet-abc-20260618T143045-recording.webm');
  });

  it('keeps the OPFS file (revokes URL only) when the download is interrupted', async () => {
    (awaitDownloadSettled as jest.Mock).mockResolvedValueOnce('interrupted');

    offscreen.onSaveRequested({ filename: 'meet-abc-20260618T143045-recording.webm', blobUrl: 'blob:1', opfsFilename: 'meet-abc-20260618T143045-recording.webm' });
    await flushMicrotasks();

    expect(offscreen.revokeBlobUrl).toHaveBeenCalledWith('blob:1');
    expect(offscreen.revokeBlobUrl).not.toHaveBeenCalledWith('blob:1', 'meet-abc-20260618T143045-recording.webm');
  });

  it('leaves the URL and OPFS file untouched when the download never settles', async () => {
    (awaitDownloadSettled as jest.Mock).mockResolvedValueOnce('timeout');

    offscreen.onSaveRequested({ filename: 'meet-abc-20260618T143045-recording.webm', blobUrl: 'blob:1', opfsFilename: 'meet-abc-20260618T143045-recording.webm' });
    await flushMicrotasks();

    expect(offscreen.revokeBlobUrl).not.toHaveBeenCalled();
  });

  it('broadcasts a save error and keeps the OPFS file when the download never starts', async () => {
    (downloadFile as jest.Mock).mockRejectedValueOnce(new Error('Download blocked'));

    offscreen.onSaveRequested({ filename: 'meet-abc-20260618T143045-recording.webm', blobUrl: 'blob:1', opfsFilename: 'meet-abc-20260618T143045-recording.webm' });
    await flushMicrotasks();

    expect(L.warn).toHaveBeenCalledWith('downloads.download error:', 'Download blocked');
    expect(broadcastToPopup).toHaveBeenCalledWith({
      type: 'RECORDING_SAVE_ERROR',
      filename: 'meet-abc-20260618T143045-recording.webm',
      error: 'Download blocked',
    });
    // No download to wait on; free the URL but preserve the OPFS source for recovery.
    expect(awaitDownloadSettled).not.toHaveBeenCalled();
    expect(offscreen.revokeBlobUrl).toHaveBeenCalledWith('blob:1');
  });

  it('stringifies a non-Error download rejection', async () => {
    (downloadFile as jest.Mock).mockRejectedValueOnce('plain failure');

    offscreen.onSaveRequested({ filename: 'meet-abc-20260618T143045-recording.webm', blobUrl: 'blob:1' });
    await flushMicrotasks();

    expect(L.warn).toHaveBeenCalledWith('downloads.download error:', 'plain failure');
    expect(broadcastToPopup).toHaveBeenCalledWith({
      type: 'RECORDING_SAVE_ERROR',
      filename: 'meet-abc-20260618T143045-recording.webm',
      error: 'plain failure',
    });
  });

  it('synthesizes a fallback filename when none is provided', async () => {
    offscreen.onSaveRequested({ filename: '   ', blobUrl: 'blob:1' });
    await flushMicrotasks();

    const downloadArg = (downloadFile as jest.Mock).mock.calls[0][0];
    // The synthesized name is still filed under the shared root and a folder of
    // its own, so a nameless save cannot land loose in Downloads either.
    expect(downloadArg.filename).toMatch(
      /^Google Meet Records\/google-meet-\d{8}T\d{4}\/google-meet-\d{8}T\d{4}-recording\.webm$/
    );
  });

  it('does nothing when no blobUrl is present', async () => {
    offscreen.onSaveRequested({ filename: 'meet-abc-20260618T143045-recording.webm', blobUrl: '' });
    await flushMicrotasks();

    expect(downloadFile).not.toHaveBeenCalled();
  });

  it('creates the history row before starting a download that can settle immediately', async () => {
    let releaseHistory!: () => void;
    const history = {
      createPending: jest.fn(() => new Promise<void>((resolve) => { releaseHistory = resolve; })),
      localSaveSettled: jest.fn().mockResolvedValue(undefined),
    };
    registerSaveHandler(offscreen, L, history);

    offscreen.onSaveRequested({ historyId: 'recording:1', stream: 'tab', filename: 'meet-abc-20260618T143045-recording.webm', blobUrl: 'blob:1' });
    await Promise.resolve();
    expect(history.createPending).toHaveBeenCalledWith(
      'recording:1',
      [{ id: 'recording:1:tab', stream: 'tab', filename: 'meet-abc-20260618T143045-recording.webm' }],
      'local',
    );
    expect(downloadFile).not.toHaveBeenCalled();

    releaseHistory();
    await flushMicrotasks();

    expect(downloadFile).toHaveBeenCalledTimes(1);
    expect(history.localSaveSettled).toHaveBeenCalledWith('recording:1', 'tab', 1, 'complete');
  });
});

describe('isFreshRecordingStart', () => {
  it('is true when entering a busy phase from a non-busy one (a new recording begins)', () => {
    expect(isFreshRecordingStart('idle', 'starting')).toBe(true);
    expect(isFreshRecordingStart('failed', 'starting')).toBe(true);
  });

  it('is false for busy-to-busy transitions within a run', () => {
    expect(isFreshRecordingStart('starting', 'recording')).toBe(false);
    expect(isFreshRecordingStart('recording', 'stopping')).toBe(false);
  });

  it('is false when a run finishes (busy to idle) — diagnostics persist until the next start', () => {
    expect(isFreshRecordingStart('stopping', 'idle')).toBe(false);
    expect(isFreshRecordingStart('recording', 'idle')).toBe(false);
  });

  it('is false for idle-to-idle', () => {
    expect(isFreshRecordingStart('idle', 'idle')).toBe(false);
  });
});

describe('keep-alive loop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    stopKeepAlive();
    jest.useRealTimers();
  });

  it('pokes the runtime on an interval and is idempotent', () => {
    startKeepAlive();
    startKeepAlive(); // second call must not add a second interval

    jest.advanceTimersByTime(20_000);
    expect(pokeRuntime).toHaveBeenCalledTimes(1);
  });

  it('stops poking after stopKeepAlive', () => {
    startKeepAlive();
    jest.advanceTimersByTime(20_000);
    stopKeepAlive();
    jest.advanceTimersByTime(60_000);
    expect(pokeRuntime).toHaveBeenCalledTimes(1);
  });
});
