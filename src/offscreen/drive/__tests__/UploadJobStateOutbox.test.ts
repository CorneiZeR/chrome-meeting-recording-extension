import { UploadJobStateOutbox, type UploadJobStateStorageArea } from '../UploadJobStateOutbox';

function fakeArea() {
  const data: Record<string, unknown> = {};
  const area: UploadJobStateStorageArea & { data: Record<string, unknown> } = {
    data,
    getAll: async () => ({ ...data }),
    set: async (items) => { Object.assign(data, items); },
    remove: async (key) => { delete data[key]; },
  };
  return area;
}

const terminalJob = {
  id: 'job-1',
  historyId: 'recording:1',
  label: 'Meeting',
  status: 'completed' as const,
  progress: 1,
  files: [{ stream: 'tab' as const, filename: 'tab.webm', status: 'uploaded' as const }],
  startedAt: 1,
  finishedAt: 2,
};

describe('UploadJobStateOutbox', () => {
  it('persists a terminal job until the background acknowledges it', async () => {
    const area = fakeArea();
    const outbox = new UploadJobStateOutbox(area);

    await outbox.put(terminalJob);
    expect(await outbox.list()).toEqual([terminalJob]);

    await outbox.remove('job-1');
    expect(await outbox.list()).toEqual([]);
  });
});
