/**
 * @file offscreen/transcriptArtifact.ts
 *
 * Wraps a rendered WebVTT transcript as a sealed artifact, so the transcript
 * travels the same local-save and Drive-upload path as the recorded media
 * instead of needing a delivery route of its own.
 */

import type { CompletedRecordingArtifact } from './engine/RecorderEngineTypes';

export const TRANSCRIPT_MIME_TYPE = 'text/vtt';

/**
 * Derives the transcript filename from a media artifact's, so both land in the
 * same Drive folder under the same run stamp and sort next to each other:
 * `meet-abc-defg-hij-20260618T143045-recording.webm`
 * → `meet-abc-defg-hij-20260618T143045-transcript.vtt`
 */
export function buildTranscriptFilenameFrom(mediaFilename: string): string {
  const withoutExtension = mediaFilename.replace(/\.[^.]+$/, '');
  const withoutStreamSuffix = withoutExtension.replace(/-(recording|mic|self-video)$/, '');
  return `${withoutStreamSuffix}-transcript.vtt`;
}

/**
 * Builds the transcript artifact from the sealed media artifacts it accompanies.
 *
 * Returns null when there is no media to name it after — a transcript with no
 * recording has nowhere to be filed, and the caller drops it.
 */
export function buildTranscriptArtifact(
  vtt: string,
  sealed: CompletedRecordingArtifact[],
): CompletedRecordingArtifact | null {
  const source = sealed.find((entry) => entry.stream === 'tab') ?? sealed[0];
  if (!source) return null;

  const filename = buildTranscriptFilenameFrom(source.artifact.filename);
  return {
    stream: 'transcript',
    artifact: {
      filename,
      file: new Blob([vtt], { type: TRANSCRIPT_MIME_TYPE }),
      mimeType: TRANSCRIPT_MIME_TYPE,
      // Held in memory only — unlike a media artifact there is no OPFS file to
      // release, so cleanup has nothing to do.
      cleanup: async () => {},
    },
  };
}
