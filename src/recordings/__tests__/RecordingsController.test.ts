import { sendToBackground } from '../../shared/messages';
import type { RecordingHistoryEntry } from '../../shared/recordingHistory';
import { RecordingsController } from '../RecordingsController';
import type { RecordingsView } from '../RecordingsView';

jest.mock('../../shared/messages', () => ({ sendToBackground: jest.fn() }));

const send = sendToBackground as jest.MockedFunction<typeof sendToBackground>;

function entry(id: string, createdAt = 1): RecordingHistoryEntry {
  return {
    id,
    name: `Recording ${id}`,
    createdAt,
    storageMode: 'local',
    status: 'complete',
    files: [{ id: `${id}:tab`, stream: 'tab', filename: `${id}.webm`, destination: 'local', status: 'available' }],
  };
}

function makeView() {
  return {
    render: jest.fn(),
    showError: jest.fn(),
  } as unknown as RecordingsView;
}

describe('RecordingsController', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads history in bounded pages and only appends an explicitly requested next page', async () => {
    const view = makeView();
    const controller = new RecordingsController(view);
    send
      .mockResolvedValueOnce({ ok: true, entries: [entry('new', 2)], nextCursor: { createdAt: 2, id: 'new' } } as any)
      .mockResolvedValueOnce({ ok: true, entries: [entry('old', 1)] } as any);

    await controller.init();
    expect(send).toHaveBeenLastCalledWith({ type: 'LIST_RECORDING_HISTORY' });
    expect((view.render as jest.Mock)).toHaveBeenLastCalledWith([entry('new', 2)], true);

    await controller.loadMore();

    expect(send).toHaveBeenLastCalledWith({ type: 'LIST_RECORDING_HISTORY', cursor: { createdAt: 2, id: 'new' } });
    expect((view.render as jest.Mock)).toHaveBeenLastCalledWith([entry('new', 2), entry('old', 1)], false);
  });

  it('updates loaded cards after a rename without re-reading the full history', async () => {
    const view = makeView();
    const controller = new RecordingsController(view);
    send
      .mockResolvedValueOnce({ ok: true, entries: [entry('one')] } as any)
      .mockResolvedValueOnce({ ok: true, entry: { ...entry('one'), name: 'Standup' } } as any);

    await controller.init();
    await controller.rename('one', 'Standup');

    expect(send).toHaveBeenCalledTimes(2);
    expect((view.render as jest.Mock)).toHaveBeenLastCalledWith([{ ...entry('one'), name: 'Standup' }], false);
  });
});
