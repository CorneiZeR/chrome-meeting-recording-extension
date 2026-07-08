/**
 * @file popup/MicLevelPoller.ts
 *
 * Popup-owned microphone level polling for the recording view. The popup is
 * disposable, so polling lives here and stops as soon as the view hides or the
 * popup closes.
 */

import { sendToBackground } from '../shared/messages';

const MIC_LEVEL_POLL_MS = 100;
const METER_BAR_COUNT = 7;

export function litBarCountForLevel(level: number): number {
  if (!Number.isFinite(level) || level <= 0) return 0;
  return Math.max(0, Math.min(METER_BAR_COUNT, Math.ceil(Math.min(1, level) * METER_BAR_COUNT)));
}

export function renderMicLevelBars(bars: readonly HTMLElement[], level: number): void {
  const litCount = litBarCountForLevel(level);
  bars.forEach((bar, index) => {
    bar.classList.toggle('lit', index < litCount);
  });
}

export class MicLevelPoller {
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly bars: readonly HTMLElement[]) {}

  start(): void {
    if (!this.bars.length || this.interval != null) return;
    void this.poll();
    this.interval = setInterval(() => void this.poll(), MIC_LEVEL_POLL_MS);
  }

  stop(): void {
    if (this.interval != null) {
      clearInterval(this.interval);
      this.interval = null;
    }
    renderMicLevelBars(this.bars, 0);
  }

  private async poll(): Promise<void> {
    try {
      const response = await sendToBackground({ type: 'GET_MIC_LEVEL' });
      renderMicLevelBars(this.bars, response.level);
    } catch {
      renderMicLevelBars(this.bars, 0);
    }
  }
}
