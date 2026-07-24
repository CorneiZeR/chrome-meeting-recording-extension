/**
 * @file offscreen/RecorderAudio.ts
 *
 * Audio-specific helpers used by `RecorderEngine` for microphone mixing and
 * local playback restoration.
 */

import { describeMediaError } from './RecorderSupport';

type RecorderAudioDeps = {
  log: (...a: any[]) => void;
  warn: (...a: any[]) => void;
};

/**
 * Routes replaceable microphone captures into one stable Web Audio destination
 * track. MediaRecorder owns the destination track, so changing the source does
 * not change its track set or split the recorded file.
 */
export class SwitchableAudioInput {
  private ctx: AudioContext | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private sourceStream: MediaStream | null = null;

  async create(stream: MediaStream): Promise<MediaStream> {
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ctx = new AC();
    this.ctx = ctx;
    await ctx.resume().catch(() => {});
    this.destination = ctx.createMediaStreamDestination();
    await this.replaceSource(stream);
    return this.destination.stream;
  }

  async replaceSource(stream: MediaStream): Promise<void> {
    const ctx = this.ctx;
    const destination = this.destination;
    if (!ctx || !destination || !stream.getAudioTracks().length) {
      throw new Error('Switchable microphone bridge is unavailable');
    }

    const next = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
    next.connect(destination);
    const previousNode = this.source;
    const previousStream = this.sourceStream;
    this.source = next;
    this.sourceStream = stream;
    try { previousNode?.disconnect(); } catch {}
    try { previousStream?.getTracks().forEach((track) => track.stop()); } catch {}
  }

  suspend(): void { try { void this.ctx?.suspend?.(); } catch {} }
  resume(): void { try { void this.ctx?.resume?.(); } catch {} }

  stop(): void {
    try { this.source?.disconnect(); } catch {}
    try { this.sourceStream?.getTracks().forEach((track) => track.stop()); } catch {}
    try { this.ctx?.close(); } catch {}
    this.source = null;
    this.sourceStream = null;
    this.destination = null;
    this.ctx = null;
  }
}

export class MixedAudioMixer {
  private ctx: AudioContext | null = null;
  private sources: MediaStreamAudioSourceNode[] = [];

  /** Creates a mixer that can combine tab and microphone audio into one stream. */
  constructor(private readonly deps: RecorderAudioDeps) {}

  /** Returns a new stream containing the original tab video plus mixed audio tracks. */
  async create(tabStream: MediaStream, micStream: MediaStream): Promise<MediaStream> {
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ctx = new AC();
    this.ctx = ctx;

    await ctx.resume().catch(() => {});
    const destination = ctx.createMediaStreamDestination();

    const connectStream = (stream: MediaStream) => {
      if (!stream.getAudioTracks().length) return;
      const source = ctx.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
      source.connect(destination);
      this.sources.push(source);
    };

    connectStream(tabStream);
    connectStream(micStream);

    const mixedTracks = [
      ...tabStream.getVideoTracks(),
      ...destination.stream.getAudioTracks(),
    ];
    this.deps.log('Created mixed tab+microphone recording stream');
    return new MediaStream(mixedTracks);
  }

  /**
   * Suspends the mixing AudioContext while the recording is paused so the mixer
   * stops doing audio work; the paused tab MediaRecorder discards its output
   * anyway. Best-effort and idempotent — never throws into the pause path.
   */
  suspend() {
    try { void this.ctx?.suspend?.(); } catch {}
  }

  /** Resumes the mixing AudioContext when the recording resumes. See {@link suspend}. */
  resume() {
    try { void this.ctx?.resume?.(); } catch {}
  }

  /** Disconnects audio graph nodes and closes the underlying AudioContext. */
  stop() {
    for (const source of this.sources) {
      try {
        source.disconnect();
      } catch {}
    }
    this.sources = [];

    try {
      this.ctx?.close();
    } catch {}
    this.ctx = null;
  }
}

export class AudioPlaybackBridge {
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  /** Creates a helper that replays captured tab audio locally when Chrome suppresses it. */
  constructor(private readonly deps: RecorderAudioDeps) {}

  /** Connects a captured audio track back to the speaker output. */
  async start(track: MediaStreamTrack): Promise<void> {
    try {
      const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      const ctx = new AC();
      this.ctx = ctx;

      await ctx.resume().catch(() => {});
      const src = ctx.createMediaStreamSource(new MediaStream([track]));
      this.source = src;

      src.connect(ctx.destination);
      this.deps.log('Re-routed captured tab audio back to speakers');
    } catch (error) {
      this.deps.warn('Audio playback bridge failed (non-fatal)', describeMediaError(error));
      this.stop();
    }
  }

  /** Disconnects the playback bridge and closes the AudioContext. */
  stop() {
    try {
      this.source?.disconnect();
    } catch {}
    this.source = null;

    try {
      this.ctx?.close();
    } catch {}
    this.ctx = null;
  }
}
