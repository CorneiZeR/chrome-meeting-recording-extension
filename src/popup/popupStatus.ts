/**
 * @file popup/popupStatus.ts
 *
 * Pure text-formatting helpers for recording duration and upload summaries.
 */

import type { UploadSummary } from '../shared/recording';

/** Formats a recorded-duration in ms as `M:SS` (or `H:MM:SS` past an hour). */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor((ms || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`;
  return `${minutes}:${ss}`;
}

/** Builds the post-upload alert when some files fell back to local downloads. */
export function formatUploadFallbackMessage(summary: UploadSummary): string | null {
  if (!summary.localFallbacks.length) return null;

  const uploaded = summary.uploaded.map((entry) => entry.filename).join('\n') || '(none)';
  const fallback = summary.localFallbacks
    .map((entry) => `${entry.filename}${entry.error ? `\n  ${entry.error}` : ''}`)
    .join('\n\n');

  return (
    'Drive upload completed with local fallback for some files.\n\n' +
    `Uploaded to Drive:\n${uploaded}\n\n` +
    `Saved locally instead:\n${fallback}`
  );
}
