/**
 * @file shared/transcript.ts
 *
 * The transcript's wire shape and its WebVTT rendering, shared by the content
 * script that collects captions and the offscreen document that persists them
 * next to the recording.
 */

/** One committed utterance, timestamped with wall-clock epoch milliseconds. */
export type TranscriptCue = {
  /** Epoch ms when the speaker's utterance started. */
  startTime: number;
  /** Epoch ms of the last caption update for that utterance. */
  endTime: number;
  speakerName: string;
  text: string;
};

/** Renders `HH:MM:SS.mmm`, the only timestamp form WebVTT accepts. */
function formatVttTimestamp(offsetMs: number): string {
  const clamped = Math.max(0, Math.round(offsetMs));
  const ms = clamped % 1000;
  const totalSeconds = Math.floor(clamped / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(ms, 3)}`;
}

/**
 * Escapes the three characters that would otherwise be parsed as cue markup.
 * `-->` inside cue text is not escapable, so it is replaced outright: a cue
 * whose text contains it makes the whole file unparseable.
 */
function escapeCueText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/--&gt;/g, '→');
}

/**
 * Renders committed utterances as a WebVTT track.
 *
 * Cue times are relative to `baseTimeMs` — pass the recording's start so the
 * track lines up with the media file a player loads it against. When it is
 * omitted the first cue's start is used, which keeps a standalone transcript
 * readable even if the recording start was never recorded.
 *
 * Returns an empty string when there is nothing to write, so callers can skip
 * persisting a transcript for a call where nobody spoke.
 */
export function buildTranscriptVtt(cues: TranscriptCue[], baseTimeMs?: number): string {
  const usable = cues.filter((cue) => cue.text.trim().length > 0);
  if (usable.length === 0) return '';

  const base = typeof baseTimeMs === 'number' && Number.isFinite(baseTimeMs)
    ? baseTimeMs
    : usable[0].startTime;

  const blocks = usable.map((cue) => {
    const start = formatVttTimestamp(cue.startTime - base);
    // Meet emits the final caption update at the end of an utterance, so start
    // and end can coincide; a zero-length cue is dropped by players.
    const end = formatVttTimestamp(Math.max(cue.endTime, cue.startTime + 1) - base);
    const speaker = cue.speakerName.trim();
    const body = speaker ? `${speaker}: ${cue.text.trim()}` : cue.text.trim();
    return `${start} --> ${end}\n${escapeCueText(body)}`;
  });

  return `WEBVTT\n\n${blocks.join('\n\n')}\n`;
}
