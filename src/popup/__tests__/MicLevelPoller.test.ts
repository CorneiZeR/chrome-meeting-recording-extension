import { MicLevelPoller, litBarCountForLevel, renderMicLevelBars } from '../MicLevelPoller';
import { sendToBackground } from '../../shared/messages';

jest.mock('../../shared/messages', () => ({ sendToBackground: jest.fn() }));

const mockSendToBackground = sendToBackground as jest.MockedFunction<typeof sendToBackground>;

const makeBars = () => Array.from({ length: 7 }, () => document.createElement('span'));

describe('MicLevelPoller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('maps a 0..1 level to the seven meter bars', () => {
    expect(litBarCountForLevel(0)).toBe(0);
    expect(litBarCountForLevel(0.01)).toBe(1);
    expect(litBarCountForLevel(0.5)).toBe(4);
    expect(litBarCountForLevel(1)).toBe(7);
    expect(litBarCountForLevel(2)).toBe(7);
  });

  it('renders lit classes from a level value', () => {
    const bars = makeBars();

    renderMicLevelBars(bars, 3 / 7);

    expect(bars.map((bar) => bar.classList.contains('lit'))).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('polls GET_MIC_LEVEL at 100ms and clears bars after stop', async () => {
    jest.useFakeTimers();
    const bars = makeBars();
    mockSendToBackground.mockResolvedValue({ level: 1 } as never);

    const poller = new MicLevelPoller(bars);
    poller.start();
    await Promise.resolve();

    expect(mockSendToBackground).toHaveBeenCalledWith({ type: 'GET_MIC_LEVEL' });
    expect(bars.every((bar) => bar.classList.contains('lit'))).toBe(true);

    await jest.advanceTimersByTimeAsync(100);
    expect(mockSendToBackground).toHaveBeenCalledTimes(2);

    poller.stop();
    expect(bars.some((bar) => bar.classList.contains('lit'))).toBe(false);
    await jest.advanceTimersByTimeAsync(300);
    expect(mockSendToBackground).toHaveBeenCalledTimes(2);
  });
});
