import { DriveFolderResolver } from '../DriveFolderResolver';

function jsonResponse(body: any, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('DriveFolderResolver', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('shares one in-flight folder resolution across concurrent callers', async () => {
    const getToken = jest.fn().mockResolvedValue('token');
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'root-folder' }))
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'recording-folder' }));

    const resolver = new DriveFolderResolver(getToken);
    const hierarchy = {
      rootFolderName: 'Root Folder Concurrent',
      recordingFolderName: 'Recording Concurrent',
    };

    const [first, second] = await Promise.all([
      resolver.resolveUploadParentId(hierarchy),
      resolver.resolveUploadParentId(hierarchy),
    ]);

    expect(first).toBe('recording-folder');
    expect(second).toBe('recording-folder');
    expect(global.fetch).toHaveBeenCalledTimes(4);
  });

  it('evicts a rejected recording-folder cache entry so the next attempt can retry', async () => {
    const getToken = jest.fn().mockResolvedValue('token');
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'root-folder' }] }))
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers(),
        text: async () => JSON.stringify({ error: { message: 'backendError' } }),
      })
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'root-folder' }] }))
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'recording-folder' }));

    const resolver = new DriveFolderResolver(getToken);
    const hierarchy = {
      rootFolderName: 'Root Folder Retry',
      recordingFolderName: 'Recording Retry',
    };

    await expect(resolver.resolveUploadParentId(hierarchy)).rejects.toThrow('backendError');
    await expect(resolver.resolveUploadParentId(hierarchy)).resolves.toBe('recording-folder');
    expect(global.fetch).toHaveBeenCalledTimes(6);
  });

  it('aborts folder setup when its only caller cancels', async () => {
    let requestSignal: AbortSignal | undefined;
    (global.fetch as jest.Mock).mockImplementationOnce((_input: unknown, init?: RequestInit) => {
      requestSignal = init?.signal as AbortSignal | undefined;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () => reject(new DOMException('Upload canceled', 'AbortError')), { once: true });
      });
    });
    const resolver = new DriveFolderResolver(jest.fn().mockResolvedValue('token'));
    const controller = new AbortController();
    const resolving = resolver.resolveUploadParentId({ rootFolderName: 'Cancelable Root' }, controller.signal);

    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    await expect(resolving).rejects.toMatchObject({ name: 'AbortError' });
    expect(requestSignal?.aborted).toBe(true);
  });

  it('does not start folder setup for an already canceled caller', async () => {
    const resolver = new DriveFolderResolver(jest.fn().mockResolvedValue('token'));
    const controller = new AbortController();
    controller.abort();

    await expect(
      resolver.resolveUploadParentId({ rootFolderName: 'Already canceled' }, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('aborts recording-folder setup when its only caller cancels', async () => {
    let requestSignal: AbortSignal | undefined;
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(jsonResponse({ files: [{ id: 'root-folder' }] }))
      .mockImplementationOnce((_input: unknown, init?: RequestInit) => {
        requestSignal = init?.signal as AbortSignal | undefined;
        return new Promise<Response>((_resolve, reject) => {
          requestSignal?.addEventListener('abort', () => reject(new DOMException('Upload canceled', 'AbortError')), { once: true });
        });
      });
    const resolver = new DriveFolderResolver(jest.fn().mockResolvedValue('token'));
    const controller = new AbortController();
    const resolving = resolver.resolveUploadParentId({
      rootFolderName: 'Root with recording',
      recordingFolderName: 'Cancelable recording folder',
    }, controller.signal);

    for (let i = 0; i < 10 && !requestSignal; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(requestSignal).toBeDefined();
    controller.abort();

    await expect(resolving).rejects.toMatchObject({ name: 'AbortError' });
    expect(requestSignal?.aborted).toBe(true);
  });

  it('keeps shared folder setup alive while another caller still needs it', async () => {
    let resolveFetch!: (response: Response) => void;
    let requestSignal: AbortSignal | undefined;
    (global.fetch as jest.Mock).mockImplementationOnce((_input: unknown, init?: RequestInit) => {
      requestSignal = init?.signal as AbortSignal | undefined;
      return new Promise<Response>((resolve) => { resolveFetch = resolve; });
    });
    const resolver = new DriveFolderResolver(jest.fn().mockResolvedValue('token'));
    const canceledCaller = new AbortController();
    const activeCaller = new AbortController();
    const first = resolver.resolveUploadParentId({ rootFolderName: 'Cancelable Root' }, canceledCaller.signal);
    const second = resolver.resolveUploadParentId({ rootFolderName: 'Cancelable Root' }, activeCaller.signal);

    await Promise.resolve();
    await Promise.resolve();
    canceledCaller.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(requestSignal?.aborted).toBe(false);

    resolveFetch(jsonResponse({ files: [{ id: 'root-folder' }] }));
    await expect(second).resolves.toBe('root-folder');
  });
});
