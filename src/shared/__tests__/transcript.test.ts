import { buildTranscriptVtt, type TranscriptCue } from '../transcript';

const BASE = Date.parse('2026-08-25T09:00:00.000Z');

function cue(overrides: Partial<TranscriptCue> = {}): TranscriptCue {
  return {
    startTime: BASE + 3_120,
    endTime: BASE + 6_480,
    speakerName: 'Иван Петров',
    text: 'Привет всем',
    ...overrides,
  };
}

describe('buildTranscriptVtt', () => {
  it('renders cue times relative to the capture start', () => {
    const vtt = buildTranscriptVtt([cue()], BASE);

    expect(vtt).toBe('WEBVTT\n\n00:00:03.120 --> 00:00:06.480\nИван Петров: Привет всем\n');
  });

  it('pads hours, minutes and milliseconds for a long meeting', () => {
    const vtt = buildTranscriptVtt(
      [cue({ startTime: BASE + 3_723_045, endTime: BASE + 3_725_000 })],
      BASE,
    );

    expect(vtt).toContain('01:02:03.045 --> 01:02:05.000');
  });

  it('falls back to the first cue when no capture start is known', () => {
    const vtt = buildTranscriptVtt([cue()]);

    expect(vtt).toContain('00:00:00.000 -->');
  });

  it('returns an empty string when nobody spoke, so no file is written', () => {
    expect(buildTranscriptVtt([])).toBe('');
    expect(buildTranscriptVtt([cue({ text: '   ' })])).toBe('');
  });

  it('escapes markup characters and neutralizes a cue-splitting arrow in the text', () => {
    const vtt = buildTranscriptVtt(
      [cue({ speakerName: 'A & B', text: 'use <b> and --> carefully' })],
      BASE,
    );

    expect(vtt).toContain('A &amp; B: use &lt;b&gt; and → carefully');
    // Exactly one timing line: the arrow in the text must not open a second cue.
    expect(vtt.match(/-->/g)).toHaveLength(1);
  });

  it('never emits a zero-length cue, which players drop', () => {
    const vtt = buildTranscriptVtt([cue({ startTime: BASE + 1_000, endTime: BASE + 1_000 })], BASE);

    expect(vtt).toContain('00:00:01.000 --> 00:00:01.001');
  });

  it('clamps a cue that predates the capture start instead of emitting a negative time', () => {
    const vtt = buildTranscriptVtt([cue({ startTime: BASE - 5_000, endTime: BASE - 1_000 })], BASE);

    expect(vtt).toContain('00:00:00.000 --> 00:00:00.000');
    expect(vtt).not.toContain('-00:');
  });

  it('keeps the transcript readable when Meet reports no speaker name', () => {
    const vtt = buildTranscriptVtt([cue({ speakerName: ' ' })], BASE);

    expect(vtt).toContain('\nПривет всем\n');
  });
});
