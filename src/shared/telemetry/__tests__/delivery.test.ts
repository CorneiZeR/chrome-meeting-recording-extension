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

describe('telemetry delivery without a configured endpoint', () => {
  let store: { enqueue: jest.Mock; listOutbox: jest.Mock; removeBatch: jest.Mock };
  beforeEach(() => {
    store = { enqueue: jest.fn().mockResolvedValue(true), listOutbox: jest.fn().mockResolvedValue([batch]), removeBatch: jest.fn().mockResolvedValue(undefined) };
    global.fetch = jest.fn();
    (chrome.alarms.create as jest.Mock).mockClear();
  });

  // A build may ship with no endpoint at all — packaging this from a fork needs
  // no Worker of its own. Diagnostics then have nowhere to go, and must not
  // queue up waiting for one either.
  it.each(['', 'not-a-url', 'http://telemetry.example.com/api/telemetry/batches'])(
    'sends and stores nothing with endpoint %p',
    async (endpoint) => {
      const delivery = new TelemetryDelivery(store as any, endpoint);

      await delivery.enqueue(batch);
      await delivery.deliver();

      expect(store.enqueue).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
      expect(chrome.alarms.create).not.toHaveBeenCalled();
    }
  );
});
