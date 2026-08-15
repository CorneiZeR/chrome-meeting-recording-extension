import { getTelemetryEndpoint, isValidTelemetryEndpoint } from './config';
import type { TelemetryBatchV1 } from './contracts';
import { TelemetryStore } from './store';

export const TELEMETRY_RETRY_ALARM = 'anonymous-telemetry-retry';
const BACKOFF_MINUTES = [5, 15, 60] as const;

export class TelemetryDelivery {
  private retryIndex = 0;
  private delivering = false;

  constructor(private readonly store: TelemetryStore, private readonly endpoint = getTelemetryEndpoint()) {}

  async enqueue(batch: TelemetryBatchV1): Promise<void> {
    if (!isValidTelemetryEndpoint(this.endpoint)) return;
    if (await this.store.enqueue(batch)) await this.deliver();
  }

  async deliver(): Promise<void> {
    if (this.delivering || !isValidTelemetryEndpoint(this.endpoint)) return;
    this.delivering = true;
    try {
      for (const batch of await this.store.listOutbox()) {
        let response: Response;
        try {
          response = await fetch(this.endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(batch),
          });
        } catch {
          await this.scheduleRetry(); return;
        }
        if (response.status === 202 || (response.status >= 400 && response.status < 500 && response.status !== 429)) {
          await this.store.removeBatch(batch.batchId);
          this.retryIndex = 0;
          continue;
        }
        await this.scheduleRetry(); return;
      }
      await chrome.alarms?.clear?.(TELEMETRY_RETRY_ALARM);
    } finally {
      this.delivering = false;
    }
  }

  private async scheduleRetry(): Promise<void> {
    const delayInMinutes = BACKOFF_MINUTES[Math.min(this.retryIndex, BACKOFF_MINUTES.length - 1)];
    this.retryIndex = Math.min(this.retryIndex + 1, BACKOFF_MINUTES.length - 1);
    await chrome.alarms?.create?.(TELEMETRY_RETRY_ALARM, { delayInMinutes });
  }
}
