/**
 * @file content/captionBuffer.ts
 *
 * Grace-timer buffer that accumulates live caption text per speaker and commits
 * finalized utterances after a silence window elapses.
 */

import { TIMEOUTS } from '../shared/timeouts';
import type { TranscriptCue } from '../shared/transcript';

type Chunk = {
  startTime: number;
  endTime: number;
  speaker: string;
  text: string;
};

type OpenChunk = Chunk & { timer: number };

/** Normalizes raw caption text for change-detection deduplication. */
export function normalizeCaptionText(pre: string): string {
  return pre
    .toLowerCase()
    .replace(/[.,?!'"\u2019]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Manages per-speaker grace timers that commit buffered caption text to the
 * final transcript after speech pauses.
 */
export class CaptionBuffer {
  private readonly prior = new Map<string, OpenChunk>();
  private readonly lastSeen = new Map<string, string>();
  /**
   * Committed utterances kept structurally rather than pre-rendered: the same
   * data has to reach both the human-readable download and the WebVTT track
   * saved next to the recording, and re-parsing formatted lines to recover the
   * timestamps would be lossy.
   */
  private readonly cues: TranscriptCue[] = [];

  /** Returns a newline-joined transcript of all committed utterances. */
  getTranscriptText(): string {
    this.flushOpenChunks();
    return this.cues
      .map((cue) => `[${new Date(cue.startTime).toISOString()}] [${new Date(cue.endTime).toISOString()}] ${cue.speakerName} : ${cue.text}`.trim())
      .join('\n');
  }

  /** Returns committed utterances with their epoch-ms timings, for WebVTT rendering. */
  getTranscriptCues(): TranscriptCue[] {
    this.flushOpenChunks();
    return this.cues.map((cue) => ({ ...cue }));
  }

  /** Clears all buffered and committed transcript state. */
  reset() {
    this.prior.forEach((v) => clearTimeout(v.timer));
    this.prior.clear();
    this.lastSeen.clear();
    this.cues.length = 0;
  }

  /**
   * Receives new caption text for a speaker. Deduplicates via normalization,
   * then restarts the speaker's grace timer on any change.
   */
  handleCaption(speakerKey: string, speakerName: string, rawText: string): boolean {
    const text = rawText.trim();
    if (!text) return false;

    const norm = normalizeCaptionText(text);
    const prev = this.lastSeen.get(speakerKey);
    if (prev === norm) return false;

    this.lastSeen.set(speakerKey, norm);
    const now = Date.now();
    const existing = this.prior.get(speakerKey);

    if (!existing) {
      const timer = window.setTimeout(() => this.commit(speakerKey), TIMEOUTS.CAPTION_GRACE_MS);
      this.prior.set(speakerKey, { startTime: now, endTime: now, speaker: speakerName, text, timer });
      return true;
    }

    existing.endTime = now;
    existing.text = text;
    existing.speaker = speakerName;
    clearTimeout(existing.timer);
    existing.timer = window.setTimeout(() => this.commit(speakerKey), TIMEOUTS.CAPTION_GRACE_MS);
    return true;
  }

  private commit(key: string) {
    const entry = this.prior.get(key);
    if (!entry) return;
    this.cues.push({
      startTime: entry.startTime,
      endTime: entry.endTime,
      speakerName: entry.speaker,
      text: entry.text,
    });
    clearTimeout(entry.timer);
    this.prior.delete(key);
  }

  private flushOpenChunks() {
    for (const k of Array.from(this.prior.keys())) this.commit(k);
  }
}
