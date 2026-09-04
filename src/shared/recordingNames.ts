import type { RecordingStream } from './recordingTypes';

/**
 * The folder every recording is filed under, in Google Drive and in the local
 * downloads directory alike. One name for both so a user who switches storage
 * mode finds the same structure either way.
 */
export const RECORDINGS_ROOT_FOLDER_NAME = 'Google Meet Records';

/**
 * A recording artifact's filename, as produced by `buildRecordingFilename`:
 * an optional context slug, the UTC run stamp, the stream, the extension.
 *
 * The stamp is `YYYYMMDDTHHMMSS`; four-to-six time digits are accepted so a
 * minute-precision name written by an older version still groups correctly.
 */
const RECORDING_ARTIFACT_RE =
  /^(?:(.+)-)?(\d{8}T\d{4,6})-(recording|mic|self-video|transcript)\.([A-Za-z0-9]+)$/;

export type ParsedRecordingFilename = {
  /** The meeting or page slug, empty when the run had none. */
  slug: string;
  /** The run stamp shared by every artifact of one recording. */
  stamp: string;
  stream: 'recording' | 'mic' | 'self-video' | 'transcript';
  extension: string;
};

/** Parses a recording artifact filename, or returns null when it is not one. */
export function parseRecordingFilename(filename: string): ParsedRecordingFilename | null {
  const match = RECORDING_ARTIFACT_RE.exec(filename);
  if (!match) return null;
  return {
    slug: match[1] ?? '',
    stamp: match[2],
    stream: match[3] as ParsedRecordingFilename['stream'],
    extension: match[4],
  };
}

/** True when a name looks like a recording artifact this extension produced. */
export function isRecordingFilename(filename: string): boolean {
  return parseRecordingFilename(filename) !== null;
}

/** Reduces a filename to a folder-safe stem: no separators, no dots, bounded. */
function toFolderSafeStem(filename: string): string {
  const stem = filename.replace(/\.[^.]*$/, '');
  const safe = stem
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return safe || 'unnamed';
}

/**
 * The per-recording folder name shared by every artifact of one run —
 * `<slug>-<stamp>`, which carries the meeting id and the moment it started.
 *
 * Every artifact of a run is named from the same slug and stamp, so deriving
 * the folder from any one of them yields the same answer without threading a
 * folder name through the recorder, the finalizer and the upload queue.
 *
 * A name that is not a recording artifact (an OPFS leftover from another
 * version, say) is filed under its own name instead. That is deliberately
 * derived from the filename and not from the clock: a wall-clock fallback gave
 * the *same* folder to unrelated leftovers handled in one second, and a
 * *different* folder to the same file when a retry ran later. Two artifacts of
 * one unparseable run do land apart — being unparseable is exactly not knowing
 * that they belong together.
 */
export function deriveRecordingFolderName(filename: string): string {
  const parsed = parseRecordingFilename(filename);
  if (parsed) return parsed.slug ? `${parsed.slug}-${parsed.stamp}` : parsed.stamp;
  return `recording-${toFolderSafeStem(filename)}`;
}

/**
 * The download path for one artifact: the shared root, the run's own folder,
 * then the file. `chrome.downloads` treats this as relative to the user's
 * downloads directory and creates the folders, which is what separates one
 * meeting's files from the next instead of pouring them all into Downloads.
 */
export function buildRecordingDownloadPath(filename: string): string {
  return `${RECORDINGS_ROOT_FOLDER_NAME}/${deriveRecordingFolderName(filename)}/${filename}`;
}

const STREAM_FILENAME_SUFFIX: Record<RecordingStream, string> = {
  tab: 'recording',
  mic: 'mic',
  'self-video': 'self-video',
  transcript: 'transcript',
};

/** Turns a user-visible recording title into a lowercase, Unicode-safe Drive name. */
export function slugifyRecordingTitle(title: string): string {
  return title
    .trim()
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\p{M}+/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

/** Builds one renamed artifact filename while preserving its resolved file extension. */
export function buildRenamedRecordingFilename(
  title: string,
  stream: RecordingStream,
  currentFilename: string,
): string {
  const slug = slugifyRecordingTitle(title);
  if (!slug) throw new Error('Recording name must contain at least one letter or number');
  const dot = currentFilename.lastIndexOf('.');
  const extension = dot >= 0 && dot < currentFilename.length - 1
    ? currentFilename.slice(dot + 1)
    : '';
  if (!extension) throw new Error(`Recording file has no extension: ${currentFilename}`);
  return `${slug}-${STREAM_FILENAME_SUFFIX[stream]}.${extension}`;
}
