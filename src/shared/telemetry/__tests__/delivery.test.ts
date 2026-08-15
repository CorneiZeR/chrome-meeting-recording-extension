import { TelemetryDelivery } from '../delivery';
import type { TelemetryBatchV1 } from '../contracts';

const batch = { batchId: 'batch' } as TelemetryBatchV1;

describe('telemetry delivery classification', () => {
  const endpoint = 'https://telemetry.example.com/api/telemetry/batches';
  let store: { enqueue: jest.Mock; listOutbox: jest.Mock; removeBatch: jest.Mock };
  beforeEach(() => {
    store = { enqueue: jest.fn().mockResolvedValue(true), listOutbox: jest.fn().mockResolvedValue([batch]), removeBatch: jest.fn().mockResolvedValue(undefined) };
    (chrome.alarms.create as jest.Mock).mockClear();
    (chrome.alarms.clear as jest.Mock).mockClear();
  });

  it.each([202, 400, 401, 413, 422])('evicts an accepted or permanent %s response', async (status) => {
    global.fetch = jest.fn().mockResolvedValue({ status } as Response);
    await new TelemetryDelivery(store as any, endpoint).deliver();
    expect(store.removeBatch).toHaveBeenCalledWith('batch');
  });

  it.each([429, 500, 503])('retains and schedules retry for %s', async (status) => {
    global.fetch = jest.fn().mockResolvedValue({ status } as Response);
    await new TelemetryDelivery(store as any, endpoint).deliver();
    expect(store.removeBatch).not.toHaveBeenCalled();
    expect(chrome.alarms.create).toHaveBeenCalledWith('anonymous-telemetry-retry', { delayInMinutes: 5 });
  });
});
