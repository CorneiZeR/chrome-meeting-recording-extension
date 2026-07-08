/**
 * @file offscreen/MicLevelMonitor.ts
 *
 * Read-only microphone level observer for the popup meter. It never feeds a
 * destination or a MediaRecorder; it only samples the live mic stream through an
 * AnalyserNode when the popup asks for a level.
 */

export class MicLevelMonitor {
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private buffer: Uint8Array<ArrayBuffer> | null = null;

  start(stream: MediaStream): void {
    this.stop();
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) return;

    let pendingCtx: AudioContext | null = null;
    try {
      const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
      if (typeof AC !== 'function') return;

      const ctx = new AC();
      pendingCtx = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.72;

      const source = ctx.createMediaStreamSource(new MediaStream(audioTracks));
      source.connect(analyser);

      this.ctx = ctx;
      this.source = source;
      this.analyser = analyser;
      this.buffer = new Uint8Array(analyser.fftSize) as Uint8Array<ArrayBuffer>;
      pendingCtx = null;
      void ctx.resume?.().catch(() => {});
    } catch {
      try {
        pendingCtx?.close();
      } catch {}
      this.stop();
    }
  }

  level(): number {
    const analyser = this.analyser;
    const buffer = this.buffer;
    if (!analyser || !buffer) return 0;

    try {
      analyser.getByteTimeDomainData(buffer);
    } catch {
      return 0;
    }

    let sumSquares = 0;
    let peak = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      const sample = (buffer[i] - 128) / 128;
      const abs = Math.abs(sample);
      sumSquares += sample * sample;
      if (abs > peak) peak = abs;
    }

    const rms = Math.sqrt(sumSquares / buffer.length);
    return Math.max(0, Math.min(1, Math.max(rms * 2.5, peak)));
  }

  stop(): void {
    try {
      this.source?.disconnect();
    } catch {}
    this.source = null;
    this.analyser = null;
    this.buffer = null;

    try {
      this.ctx?.close();
    } catch {}
    this.ctx = null;
  }
}
