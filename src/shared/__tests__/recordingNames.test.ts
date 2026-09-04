import {
  buildRecordingDownloadPath,
  buildRenamedRecordingFilename,
  deriveRecordingFolderName,
  isRecordingFilename,
  parseRecordingFilename,
  slugifyRecordingTitle,
  RECORDINGS_ROOT_FOLDER_NAME,
} from '../recordingNames';

describe('recording names', () => {
  it('creates lowercase dash-separated Unicode-safe slugs', () => {
    expect(slugifyRecordingTitle('  Quarterly Review  ')).toBe('quarterly-review');
    expect(slugifyRecordingTitle('Crème brûlée / 東京')).toBe('creme-brulee-東京');
    expect(slugifyRecordingTitle('Продукт — Demo')).toBe('продукт-demo');
  });

  it('rejects titles without letters or numbers', () => {
    expect(slugifyRecordingTitle(' -- / ')).toBe('');
    expect(() => buildRenamedRecordingFilename(' -- ', 'tab', 'meeting.webm'))
      .toThrow('at least one letter or number');
  });

  it.each([
    ['tab', 'capture.webm', 'quarterly-review-recording.webm'],
    ['mic', 'capture.m4a', 'quarterly-review-mic.m4a'],
    ['self-video', 'capture.mp4', 'quarterly-review-self-video.mp4'],
  ] as const)('preserves the extension for %s artifacts', (stream, current, expected) => {
    expect(buildRenamedRecordingFilename('Quarterly Review', stream, current)).toBe(expected);
  });
});

describe('recording artifact grouping', () => {
  // The names `buildRecordingFilename` actually produces: an optional slug, a
  // second-precision UTC stamp, the stream, the extension.
  const TAB = 'meet-abc-defg-hij-20260618T143045-recording.webm';
  const MIC = 'meet-abc-defg-hij-20260618T143045-mic.m4a';
  const CAMERA = 'meet-abc-defg-hij-20260618T143045-self-video.mp4';
  const TRANSCRIPT = 'meet-abc-defg-hij-20260618T143045-transcript.vtt';

  it('parses every artifact a run produces', () => {
    expect(parseRecordingFilename(TAB)).toEqual({
      slug: 'meet-abc-defg-hij',
      stamp: '20260618T143045',
      stream: 'recording',
      extension: 'webm',
    });
    expect(parseRecordingFilename(TRANSCRIPT)?.stream).toBe('transcript');
    expect(parseRecordingFilename(MIC)?.extension).toBe('m4a');
    // A non-Meet tab is named after its page title, and a run with no context
    // has no slug at all.
    expect(parseRecordingFilename('my-page-title-github-20260618T143045-recording.webm')?.slug)
      .toBe('my-page-title-github');
    expect(parseRecordingFilename('20260618T143045-recording.webm')?.slug).toBe('');
    // Minute precision, as an older version wrote it.
    expect(parseRecordingFilename('google-meet-abc-20260101T0900-recording.webm')?.stamp)
      .toBe('20260101T0900');
  });

  it('recognizes a real artifact name, and nothing else', () => {
    // The whole point: this filter decides which OPFS leftovers get recovered
    // after a crash, so a shape it does not recognize is a lost recording.
    expect(isRecordingFilename(TAB)).toBe(true);
    expect(isRecordingFilename(TRANSCRIPT)).toBe(true);
    expect(isRecordingFilename('tab.webm')).toBe(false);
    expect(isRecordingFilename('meet-abc-20260618T143045-recording')).toBe(false);
    expect(isRecordingFilename('meet-abc-recording.webm')).toBe(false);
  });

  it('files every artifact of one run under the same folder', () => {
    const folders = [TAB, MIC, CAMERA, TRANSCRIPT].map((name) => deriveRecordingFolderName(name));
    expect(new Set(folders).size).toBe(1);
    // The folder names the meeting and the moment it started — not the moment
    // the file happened to be delivered.
    expect(folders[0]).toBe('meet-abc-defg-hij-20260618T143045');
  });

  it('falls back to a folder derived from the name, not from the clock', () => {
    // Deterministic per file: a retry hours later must not move the file to a
    // different folder, and two unrelated leftovers must not share one.
    expect(deriveRecordingFolderName('leftover.webm')).toBe('recording-leftover');
    expect(deriveRecordingFolderName('leftover.webm')).toBe('recording-leftover');
    expect(deriveRecordingFolderName('another leftover!.webm')).toBe('recording-another-leftover');
    expect(deriveRecordingFolderName('leftover.webm'))
      .not.toBe(deriveRecordingFolderName('other-leftover.webm'));
  });

  it('keeps a fallback folder name usable as a path segment', () => {
    // chrome.downloads rejects a path with separators or dot segments in it.
    for (const name of ['../escape.webm', 'a/b/c.webm', '..', '', '   .webm']) {
      const folder = deriveRecordingFolderName(name);
      expect(folder).toMatch(/^recording-[A-Za-z0-9_-]+$/);
      expect(folder.includes('..')).toBe(false);
    }
    expect(deriveRecordingFolderName(`${'x'.repeat(200)}.webm`).length).toBeLessThanOrEqual(70);
  });

  it('builds a download path under the shared root', () => {
    expect(buildRecordingDownloadPath(TAB)).toBe(
      `${RECORDINGS_ROOT_FOLDER_NAME}/meet-abc-defg-hij-20260618T143045/${TAB}`
    );
    // Same root and folder as Drive mode uses, so switching storage mode does
    // not change where a user looks for their recordings.
    expect(RECORDINGS_ROOT_FOLDER_NAME).toBe('Google Meet Records');
  });
});
