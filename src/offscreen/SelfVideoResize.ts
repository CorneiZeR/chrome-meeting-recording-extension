/**
 * @file offscreen/SelfVideoResize.ts
 *
 * Forces the encoded self-video (camera) resolution to match the user's
 * selected preset, even when another consumer — most importantly the live
 * Google Meet call — already holds the same physical camera open at a higher
 * resolution.
 *
 * Why this exists: when a camera device is shared, Chrome reports the *requested*
 * downscaled size through `MediaStreamTrack.getSettings()` and the
 * `HTMLVideoElement` display size, but the frames actually delivered to a
 * `MediaRecorder` are the shared source's native ("coded") size. The VP8 encoder
 * then records at the coded size, so `selfVideoResolutionPreset` silently has no
 * effect on the saved file (e.g. a 640x360 preset records 1280x720 while Meet
 * holds the camera at 720p). `crop-and-scale` only affects the display rect, not
 * the encoded buffer.
 *
 * The fix: read one frame's `codedWidth`/`codedHeight` and, when it differs from
 * the target, route the camera through
 * `MediaStreamTrackProcessor -> OffscreenCanvas -> MediaStreamTrackGenerator`,
 * downscaling each frame to the target. `drawImage(VideoFrame, …)` honors the
 * frame's display/visible-rect, so aspect ratio (the camera's own crop-and-scale)
 * is preserved. When no resize is needed, frames pass through a generated track
 * without re-rasterization; that stable track permits live source replacement.
 * Platforms without insertable streams retain the direct fallback.
 */

import { logPerf } from '../shared/perf';

export type EnforcedSelfVideoStream = {
  /** The stable stream to hand to MediaRecorder. */
  stream: MediaStream;
  /** Stops the frame pump and output track. No-op on the direct fallback. Idempotent. */
  stop: () => void;
  /** True when a resize transform was inserted. */
  resized: boolean;
  /** True when MediaRecorder receives a generated (stable, replaceable) track. */
  generated?: boolean;
  /** Replaces the camera feeding the generated track without replacing that output track. */
  replaceSource?: (track: MediaStreamTrack) => Promise<void>;
  /**
   * Hides/shows the encoded camera (black frames) without tearing the track down.
   * Blacks out at the layer that is actually defined for the active path: `enabled
   * = false` on the camera track when recording it directly, or a black-frame fill
   * inside the resize pump when rerouted through insertable streams (where the
   * effect of `enabled` is unspecified — mediacapture-transform defines no
   * disabled-track behavior for MediaStreamTrackProcessor).
   */
  setMuted: (muted: boolean) => void;
  /**
   * Halts/resumes per-frame work in the resize pump while the recording is paused
   * (skips the drawImage + VideoFrame allocation + write — the expensive part).
   * No-op on the direct path, where the paused MediaRecorder already stops the
   * encoder and there is no pump to idle. See RecorderEngine.setPaused.
   */
  setPaused: (paused: boolean) => void;
  /**
   * The dimensions MediaRecorder will actually encode, when known: the target
   * when a resize was inserted, or the probed native coded size when recording
   * the camera directly. Used to size the bitrate, because `getSettings()`
   * under-reports the encoded size under camera contention. Undefined when the
   * coded size couldn't be probed (e.g. no insertable streams).
   */
  encodedSize?: { width: number; height: number };
};

type Size = { width: number; height: number };

/** Max time to wait for the camera's first frame during coded-size detection. */
const DETECT_TIMEOUT_MS = 2_000;

/** True when this context exposes the insertable-streams APIs needed to resize. */
function hasInsertableStreams(): boolean {
  const g = globalThis as any;
  return (
    typeof g.MediaStreamTrackProcessor === 'function' &&
    typeof g.MediaStreamTrackGenerator === 'function' &&
    typeof g.OffscreenCanvas === 'function' &&
    typeof g.VideoFrame === 'function'
  );
}

/**
 * Reads one frame from a short-lived clone of the track to learn the true coded
 * buffer size (the size the encoder would use). The clone is always stopped, so
 * the original capture track is untouched and free to be recorded directly.
 */
async function detectCodedSize(track: MediaStreamTrack): Promise<Size | null> {
  const g = globalThis as any;
  const probe = track.clone();
  let reader: any = null;
  try {
    const processor = new g.MediaStreamTrackProcessor({ track: probe });
    reader = processor.readable.getReader();
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), DETECT_TIMEOUT_MS)
    );
    const first = await Promise.race([reader.read(), timeout]);
    if (!first || first.done || !first.value) return null;
    const frame = first.value;
    const size = { width: frame.codedWidth as number, height: frame.codedHeight as number };
    frame.close();
    return size.width > 0 && size.height > 0 ? size : null;
  } catch {
    return null;
  } finally {
    if (reader) try { await reader.cancel(); } catch {}
    try { probe.stop(); } catch {}
  }
}

/** Builds one stable output track whose camera source can be replaced live. */
function buildGeneratedTrack(
  track: MediaStreamTrack,
  target?: Size,
): {
  track: MediaStreamTrack;
  stop: () => void;
  setMuted: (muted: boolean) => void;
  setPaused: (paused: boolean) => void;
  replaceSource: (track: MediaStreamTrack) => Promise<void>;
} {
  const g = globalThis as any;
  const generator = new g.MediaStreamTrackGenerator({ kind: 'video' });
  try { (generator as any).contentHint = 'motion'; } catch {}
  const writer = generator.writable.getWriter();

  let stopped = false;
  let muted = false;
  let paused = false;
  let generation = 0;
  let reader: any = null;
  let currentSource = track;
  let pumpPromise: Promise<void> = Promise.resolve();
  let canvas: any = null;
  let context: any = null;

  const frameSize = (frame: any): Size => ({
    width: target?.width ?? frame.displayWidth ?? frame.codedWidth,
    height: target?.height ?? frame.displayHeight ?? frame.codedHeight,
  });

  const renderFrame = (frame: any): any => {
    // With neither resizing nor muting, forward the VideoFrame directly. This
    // keeps the auto-resolution bridge cheap while retaining a stable generator.
    if (!target && !muted) return frame;
    const size = frameSize(frame);
    if (!canvas || canvas.width !== size.width || canvas.height !== size.height) {
      canvas = new g.OffscreenCanvas(size.width, size.height);
      context = canvas.getContext('2d', { alpha: false, desynchronized: true });
    }
    if (muted) {
      context.fillStyle = '#000';
      context.fillRect(0, 0, size.width, size.height);
    } else {
      context.drawImage(frame, 0, 0, size.width, size.height);
    }
    return new g.VideoFrame(canvas, {
      timestamp: frame.timestamp,
      ...(frame.duration == null ? {} : { duration: frame.duration }),
    });
  };

  const pump = async (source: MediaStreamTrack, ownGeneration: number) => {
    const processor = new g.MediaStreamTrackProcessor({ track: source });
    const ownReader = processor.readable.getReader();
    reader = ownReader;
    try {
      for (;;) {
        const { value: frame, done } = await ownReader.read();
        if (done) break;
        if (stopped || ownGeneration !== generation) { frame.close(); break; }
        // Paused: drain the source frame (so the processor doesn't back up) but
        // skip the expensive resize work and write nothing — the MediaRecorder is
        // paused, so it would discard these frames anyway.
        if (paused) { frame.close(); continue; }
        try {
          const output = renderFrame(frame);
          await writer.write(output);
          output.close();
          if (output !== frame) frame.close();
        } catch {
          try { frame.close(); } catch {}
          if (stopped) break;
        }
      }
    } catch {
      /* source track ended or pipeline torn down */
    } finally {
      if (reader === ownReader) reader = null;
    }
  };

  const startPump = (source: MediaStreamTrack) => {
    pumpPromise = pump(source, generation);
  };
  startPump(track);

  const replaceSource = async (next: MediaStreamTrack) => {
    if (stopped) {
      try { next.stop(); } catch {}
      throw new Error('Camera bridge is stopped');
    }
    const previous = currentSource;
    generation += 1;
    try { await reader?.cancel(); } catch {}
    await pumpPromise.catch(() => {});
    currentSource = next;
    startPump(next);
    try { previous.stop(); } catch {}
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    generation += 1;
    try { void reader?.cancel(); } catch {}
    try { currentSource.stop(); } catch {}
    try { void writer.close(); } catch {}
    try { (generator as any).stop?.(); } catch {}
  };

  return {
    track: generator,
    stop,
    setMuted: (next: boolean) => { muted = next; },
    setPaused: (next: boolean) => { paused = next; },
    replaceSource,
  };
}

/**
 * Returns a stable stream whose source can be replaced while MediaRecorder runs.
 * Frames are resized only when the camera's coded size differs from `target`.
 * Falls back to the original stream when insertable streams are unavailable.
 */
export async function enforceSelfVideoResolution(
  source: MediaStream,
  target: Size,
  log: (...a: any[]) => void,
  options: { auto?: boolean } = {}
): Promise<EnforcedSelfVideoStream> {
  const noop: EnforcedSelfVideoStream = {
    stream: source,
    stop: () => {},
    resized: false,
    // No resize transform: MediaRecorder records the camera track directly, so
    // `enabled = false` → black frames is the well-defined MediaStreamTrack
    // contract here (unlike the resized insertable-streams path).
    setMuted: (muted: boolean) => {
      for (const t of source.getVideoTracks()) { try { t.enabled = !muted; } catch {} }
    },
    // Direct recording: the paused MediaRecorder already stops the encoder, and
    // there is no resize pump to idle, so pausing needs no extra actuation here.
    setPaused: () => {},
  };
  const track = source.getVideoTracks()[0];
  if (!track) return noop;

  // Auto resolution still uses a pass-through generator so its source can change
  // without changing MediaRecorder's track set. Frames are not re-rasterized.
  if (options.auto) {
    log('self-video: preferring auto resolution; using switchable pass-through');
    const codedAuto = hasInsertableStreams() ? await detectCodedSize(track) : null;
    if (!hasInsertableStreams()) return { ...noop, encodedSize: codedAuto ?? undefined };
    const generated = buildGeneratedTrack(track);
    return {
      stream: new MediaStream([generated.track]),
      stop: generated.stop,
      resized: false,
      generated: true,
      replaceSource: generated.replaceSource,
      setMuted: generated.setMuted,
      setPaused: generated.setPaused,
      encodedSize: codedAuto ?? undefined,
    };
  }

  if (target.width <= 0 || target.height <= 0 || !hasInsertableStreams()) {
    return noop;
  }

  const coded = await detectCodedSize(track);
  if (!coded) {
    const generated = buildGeneratedTrack(track, target);
    return {
      stream: new MediaStream([generated.track]),
      stop: generated.stop,
      resized: true,
      generated: true,
      replaceSource: generated.replaceSource,
      setMuted: generated.setMuted,
      setPaused: generated.setPaused,
      encodedSize: target,
    };
  }

  if (coded.width === target.width && coded.height === target.height) {
    logPerf(log, 'recorder', 'self_video_resolution_enforced', {
      stream: 'self-video',
      targetWidth: target.width,
      targetHeight: target.height,
      codedWidth: coded.width,
      codedHeight: coded.height,
      resized: false,
    });
    const generated = buildGeneratedTrack(track);
    return {
      stream: new MediaStream([generated.track]),
      stop: generated.stop,
      resized: false,
      generated: true,
      replaceSource: generated.replaceSource,
      setMuted: generated.setMuted,
      setPaused: generated.setPaused,
      encodedSize: coded,
    };
  }

  const { track: resizedTrack, stop, setMuted, setPaused, replaceSource } = buildGeneratedTrack(track, target);
  logPerf(log, 'recorder', 'self_video_resolution_enforced', {
    stream: 'self-video',
    targetWidth: target.width,
    targetHeight: target.height,
    codedWidth: coded.width,
    codedHeight: coded.height,
    resized: true,
  });
  // The resize forces the encoded buffer to the target size.
  return { stream: new MediaStream([resizedTrack]), stop, resized: true, generated: true, replaceSource, setMuted, setPaused, encodedSize: { width: target.width, height: target.height } };
}
