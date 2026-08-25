/**
 * @file platform/chrome/downloads.ts
 *
 * Promise-based wrapper around `chrome.downloads.download`.
 */

export function downloadFile(options: chrome.downloads.DownloadOptions): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    chrome.downloads.download(options, (downloadId) => {
      const error = chrome.runtime.lastError?.message;
      if (error) return reject(new Error(error));
      resolve(downloadId);
    });
  });
}

/**
 * How long to wait for Chrome to report the file as opened before revealing it
 * in the file manager instead. Long enough for the OS to launch an application,
 * short enough that a fallback still feels like a response to the click.
 */
const OPEN_CONFIRM_MS = 1_200;

/** Reads the `opened` flag, which predates the bundled `chrome.downloads` types. */
function wasOpened(item: chrome.downloads.DownloadItem | undefined): boolean {
  return (item as (chrome.downloads.DownloadItem & { opened?: boolean }) | undefined)?.opened === true;
}

function searchDownload(downloadId: number): Promise<chrome.downloads.DownloadItem | undefined> {
  return new Promise((resolve, reject) => {
    chrome.downloads.search({ id: downloadId }, (items) => {
      const error = chrome.runtime.lastError?.message;
      if (error) return reject(new Error(error));
      resolve(items?.[0]);
    });
  });
}

/**
 * Opens a downloaded file, falling back to revealing it in the file manager.
 *
 * `chrome.downloads.open()` is a **silent no-op** when the OS has no application
 * registered for the file type — routine for `.webm` and `.vtt` — and it reports
 * nothing back: no exception, no `runtime.lastError`. A click would then look
 * broken while every layer claimed success. So the open is confirmed against the
 * item's `opened` flag, and an unconfirmed one reveals the file in its folder,
 * which needs no extra permission and always does something visible.
 */
export function openDownloadedFile(downloadId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    void (async () => {
      let item: chrome.downloads.DownloadItem | undefined;
      try {
        item = await searchDownload(downloadId);
      } catch (cause) {
        return reject(cause instanceof Error ? cause : new Error(String(cause)));
      }
      if (!item || item.exists === false) {
        return reject(new Error('This local file is no longer available'));
      }
      if (wasOpened(item)) {
        // Already opened once, so Chrome will not report it again; asking is enough.
        try {
          chrome.downloads.open(downloadId);
        } catch { /* fall through to reveal */ }
        return resolve();
      }

      try {
        chrome.downloads.open(downloadId);
      } catch {
        revealDownloadedFile(downloadId);
        return resolve();
      }

      setTimeout(() => {
        void searchDownload(downloadId)
          .then((confirmed) => {
            if (!wasOpened(confirmed)) revealDownloadedFile(downloadId);
            resolve();
          })
          .catch(() => {
            revealDownloadedFile(downloadId);
            resolve();
          });
      }, OPEN_CONFIRM_MS);
    })();
  });
}

/** Shows a downloaded file in its folder. Needs only the `downloads` permission. */
export function revealDownloadedFile(downloadId: number): void {
  try {
    chrome.downloads.show(downloadId);
  } catch { /* nothing else to try */ }
}

export type DownloadSettledResult = 'complete' | 'interrupted' | 'timeout';

/**
 * Resolves when a download reaches a terminal state ('complete' or 'interrupted'),
 * or 'timeout' if no terminal event arrives within `timeoutMs`.
 *
 * Event-driven on `chrome.downloads.onChanged` (the download event wakes a
 * suspended MV3 worker), so callers can react to the *actual* completion instead
 * of a blind timer that a sleeping worker would silently drop. An up-front
 * `search` also covers the race where the download already finished before the
 * listener was attached.
 */
export function awaitDownloadSettled(
  downloadId: number,
  timeoutMs = 10 * 60_000
): Promise<DownloadSettledResult> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (result: DownloadSettledResult) => {
      if (done) return;
      done = true;
      try { chrome.downloads.onChanged.removeListener(onChanged); } catch { /* not attached */ }
      clearTimeout(timer);
      resolve(result);
    };
    const onChanged = (delta: chrome.downloads.DownloadDelta) => {
      if (delta.id !== downloadId) return;
      const state = delta.state?.current;
      if (state === 'complete') finish('complete');
      else if (state === 'interrupted') finish('interrupted');
    };
    chrome.downloads.onChanged.addListener(onChanged);
    const timer = setTimeout(() => finish('timeout'), timeoutMs);
    // Cover the race where the download settled before the listener attached.
    try {
      chrome.downloads.search({ id: downloadId }, (items) => {
        void chrome.runtime.lastError; // ignore; the listener/timeout still cover us
        const state = items?.[0]?.state;
        if (state === 'complete') finish('complete');
        else if (state === 'interrupted') finish('interrupted');
      });
    } catch { /* search unavailable; rely on the listener + timeout */ }
  });
}
