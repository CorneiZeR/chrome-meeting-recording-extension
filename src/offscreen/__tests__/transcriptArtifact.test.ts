import { buildTranscriptArtifact, buildTranscriptFilenameFrom, TRANSCRIPT_MIME_TYPE } from '../transcriptArtifact';
import type { CompletedRecordingArtifact } from '../engine/RecorderEngineTypes';

async function toText(payload: unknown): Promise<string> {
  const asAny = payload as any;
  if (typeof asAny?.text === 'function') return asAny.text();
  if (typeof asAny?.arrayBuffer === 'function') {
    const ab = await asAny.arrayBuffer();
    return new TextDecoder().decode(ab);
  }
  if (typeof FileReader !== 'undefined' && typeof asAny?.size === 'number' && typeof asAny?.slice === 'function') {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.readAsText(asAny as Blob);
    });
  }
  return String(payload ?? '');
}

function media(stream: CompletedRecordingArtifact['stream'], filename: string): CompletedRecordingArtifact {
  return {
    stream,
    artifact: { filename, file: new Blob(['media']), cleanup: async () => {} },
  };
}

describe('buildTranscriptFilenameFrom', () => {
  it('reuses the media run stamp so both files sort together', () => {
    expect(buildTranscriptFilenameFrom('meet-abc-defg-hij-20260618T143045-recording.webm'))
      .toBe('meet-abc-defg-hij-20260618T143045-transcript.vtt');
  });

  it('derives the same name from any stream suffix', () => {
    expect(buildTranscriptFilenameFrom('meet-abc-20260618T143045-mic.webm'))
      .toBe('meet-abc-20260618T143045-transcript.vtt');
    expect(buildTranscriptFilenameFrom('meet-abc-20260618T143045-self-video.mp4'))
      .toBe('meet-abc-20260618T143045-transcript.vtt');
  });
});

describe('buildTranscriptArtifact', () => {
  it('names the transcript after the tab recording, not whichever artifact came first', () => {
    const artifact = buildTranscriptArtifact('WEBVTT\n', [
      media('mic', 'meet-abc-20260618T143045-mic.webm'),
      media('tab', 'meet-abc-20260618T143045-recording.webm'),
    ]);

    expect(artifact?.stream).toBe('transcript');
    expect(artifact?.artifact.filename).toBe('meet-abc-20260618T143045-transcript.vtt');
    expect(artifact?.artifact.mimeType).toBe(TRANSCRIPT_MIME_TYPE);
  });

  it('falls back to the only artifact present when there is no tab stream', () => {
    const artifact = buildTranscriptArtifact('WEBVTT\n', [media('mic', 'meet-abc-20260618T143045-mic.webm')]);

    expect(artifact?.artifact.filename).toBe('meet-abc-20260618T143045-transcript.vtt');
  });

  it('returns null with no media to name it after', () => {
    expect(buildTranscriptArtifact('WEBVTT\n', [])).toBeNull();
  });

  it('carries the rendered transcript as its blob content', async () => {
    const artifact = buildTranscriptArtifact('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHi\n', [
      media('tab', 'meet-abc-20260618T143045-recording.webm'),
    ]);

    await expect(toText(artifact?.artifact.file)).resolves.toContain('00:00:00.000 --> 00:00:01.000');
  });
});
