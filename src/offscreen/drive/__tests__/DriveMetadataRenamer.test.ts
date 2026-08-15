import { DriveRenameError, renameDriveResources } from '../DriveMetadataRenamer';

const response = (status: number, body: unknown = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  json: async () => body,
  text: async () => JSON.stringify(body),
}) as Response;

describe('DriveMetadataRenamer', () => {
  const getToken = jest.fn(async () => 'token');

  beforeEach(() => {
    getToken.mockClear();
    global.fetch = jest.fn();
  });

  it('reads current metadata and patches requested names in order', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(response(200, { id: 'file', name: 'old.webm' }))
      .mockResolvedValueOnce(response(200, { id: 'folder', name: 'old-folder' }))
      .mockResolvedValueOnce(response(200, { id: 'file', name: 'new.webm' }))
      .mockResolvedValueOnce(response(200, { id: 'folder', name: 'new-folder' }));

    await expect(renameDriveResources(getToken, [
      { id: 'file', name: 'new.webm' },
      { id: 'folder', name: 'new-folder' },
    ])).resolves.toEqual([
      { id: 'file', name: 'new.webm' },
      { id: 'folder', name: 'new-folder' },
    ]);

    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls[2][1]).toMatchObject({ method: 'PATCH', body: JSON.stringify({ name: 'new.webm' }) });
    expect(calls[3][1]).toMatchObject({ method: 'PATCH', body: JSON.stringify({ name: 'new-folder' }) });
    expect(calls[0][0]).toBe('https://www.googleapis.com/drive/v3/files/file?supportsAllDrives=true&fields=id,name');
  });

  it('skips metadata updates for resources that already have the requested name', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(response(200, { name: 'same.webm' }));

    await expect(renameDriveResources(getToken, [{ id: 'file', name: 'same.webm' }]))
      .resolves.toEqual([{ id: 'file', name: 'same.webm' }]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('refreshes an expired token for metadata reads', async () => {
    const refreshableToken = jest.fn(async (options?: { refresh?: boolean }) => options?.refresh ? 'fresh' : 'stale');
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(response(401, { error: { message: 'expired' } }))
      .mockResolvedValueOnce(response(200, { name: 'same.webm' }));

    await renameDriveResources(refreshableToken, [{ id: 'file', name: 'same.webm' }]);

    expect(refreshableToken).toHaveBeenNthCalledWith(1, undefined);
    expect(refreshableToken).toHaveBeenNthCalledWith(2, { refresh: true });
    expect((global.fetch as jest.Mock).mock.calls[1][1].headers.Authorization).toBe('Bearer fresh');
  });

  it('rolls back earlier changes when a later patch fails', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(response(200, { name: 'one-old.webm' }))
      .mockResolvedValueOnce(response(200, { name: 'two-old.webm' }))
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(500, { error: { message: 'broken' } }))
      .mockResolvedValueOnce(response(200));

    await expect(renameDriveResources(getToken, [
      { id: 'one', name: 'one-new.webm' },
      { id: 'two', name: 'two-new.webm' },
    ])).rejects.toMatchObject({
      rollbackIncomplete: false,
      currentResources: [
        { id: 'one', name: 'one-old.webm' },
        { id: 'two', name: 'two-old.webm' },
      ],
    } satisfies Partial<DriveRenameError>);

    expect((global.fetch as jest.Mock).mock.calls[4][1].body)
      .toBe(JSON.stringify({ name: 'one-old.webm' }));
  });

  it('reports observed names when rollback is incomplete', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(response(200, { name: 'one-old.webm' }))
      .mockResolvedValueOnce(response(200, { name: 'two-old.webm' }))
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(500, { error: { message: 'patch failed' } }))
      .mockResolvedValueOnce(response(500, { error: { message: 'rollback failed' } }))
      .mockResolvedValueOnce(response(200, { name: 'one-new.webm' }))
      .mockResolvedValueOnce(response(200, { name: 'two-old.webm' }));

    await expect(renameDriveResources(getToken, [
      { id: 'one', name: 'one-new.webm' },
      { id: 'two', name: 'two-new.webm' },
    ])).rejects.toMatchObject({
      rollbackIncomplete: true,
      currentResources: [
        { id: 'one', name: 'one-new.webm' },
        { id: 'two', name: 'two-old.webm' },
      ],
    } satisfies Partial<DriveRenameError>);
  });
});
