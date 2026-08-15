import {
  resumePendingDriveUploads,
  type ResumePendingUploadsDeps,
} from '../resumePendingUploads';
import type { PendingUpload, PendingUploadStore } from '../PendingUploadStore';

function fakeStore(initial: PendingUpload[]) {
  const data = new Map<string, PendingUpload>();
  for (const e of initial) data.set(e.opfsFilename, e);
  return {
    list: jest.fn(async () => [...data.values()]),
    remove: jest.fn(async (name: string) => { data.delete(name); }),
    put: jest.fn(async () => {}),
  } as unknown as PendingUploadStore & { list: jest.Mock; remove: jest.Mock; put: jest.Mock };
}

const entry = (name: string): PendingUpload => ({
  opfsFilename: name,
  filename: name,
  stream: 'tab',
  recordingFolderName: 'folder',
});

const blob = (size: number) => ({ size } as Blob);

function makeDeps(over: Partial<ResumePendingUploadsDeps> = {}): ResumePendingUploadsDeps {
  return {
    store: fakeStore([]),
    log: jest.fn(),
    warn: jest.fn(),
    openOpfsFile: jest.fn(async () => blob(100)),
    removeOpfsFile: jest.fn(async () => {}),
    fixDuration: jest.fn(async (raw) => raw),
    uploadFile: jest.fn(async () => {}),
    ...over,
  };
}

describe('resumePendingDriveUploads', () => {
  it('does nothing when there are no pending uploads', async () => {
    const deps = makeDeps({ store: fakeStore([]) });
    await resumePendingDriveUploads(deps);
    expect(deps.uploadFile).not.toHaveBeenCalled();
    expect(deps.log).not.toHaveBeenCalled();
  });

  it('re-fixes, uploads fresh, then clears the marker and the OPFS file', async () => {
    const store = fakeStore([entry('a.webm')]);
    const deps = makeDeps({ store });

    await resumePendingDriveUploads(deps);

    expect(deps.fixDuration).toHaveBeenCalledTimes(1);
    expect(deps.uploadFile).toHaveBeenCalledTimes(1);
    expect(store.remove).toHaveBeenCalledWith('a.webm');
    expect(deps.removeOpfsFile).toHaveBeenCalledWith('a.webm');
  });

  it('drops a marker whose OPFS file is gone, without uploading', async () => {
    const store = fakeStore([entry('a.webm')]);
    const deps = makeDeps({ store, openOpfsFile: jest.fn(async () => null) });

    await resumePendingDriveUploads(deps);

    expect(deps.uploadFile).not.toHaveBeenCalled();
    expect(store.remove).toHaveBeenCalledWith('a.webm');
    expect(deps.removeOpfsFile).not.toHaveBeenCalled();
  });

  it('drops a marker whose OPFS file is empty', async () => {
    const store = fakeStore([entry('a.webm')]);
    const deps = makeDeps({ store, openOpfsFile: jest.fn(async () => blob(0)) });

    await resumePendingDriveUploads(deps);

    expect(deps.uploadFile).not.toHaveBeenCalled();
    expect(store.remove).toHaveBeenCalledWith('a.webm');
  });

  it('leaves the marker and the OPFS file in place when the upload fails', async () => {
    const store = fakeStore([entry('a.webm')]);
    const deps = makeDeps({
      store,
      uploadFile: jest.fn(async () => { throw new Error('network down'); }),
    });

    await resumePendingDriveUploads(deps);

    expect(store.remove).not.toHaveBeenCalled();
    expect(deps.removeOpfsFile).not.toHaveBeenCalled();
    expect(deps.warn).toHaveBeenCalled();
  });

  it('processes each pending entry independently (one failure does not block the rest)', async () => {
    const store = fakeStore([entry('a.webm'), entry('b.webm')]);
    let calls = 0;
    const deps = makeDeps({
      store,
      uploadFile: jest.fn(async () => {
        calls += 1;
        if (calls === 1) throw new Error('first fails');
      }),
    });

    await resumePendingDriveUploads(deps);

    expect(deps.uploadFile).toHaveBeenCalledTimes(2);
    expect(store.remove).toHaveBeenCalledWith('b.webm');
    expect(store.remove).not.toHaveBeenCalledWith('a.webm');
  });

  it('replays a recovered job with its original recording identity and Drive file metadata', async () => {
    const owned: PendingUpload = {
      ...entry('a.webm'),
      historyId: 'recording:1',
      jobId: 'job-1',
    };
    const reportJob = jest.fn();
    const deps = makeDeps({
      store: fakeStore([owned]),
      uploadFile: jest.fn(async () => ({
        id: 'drive-1',
        webViewLink: 'https://drive.example/file/1',
        driveFolderId: 'folder-1',
        driveFolderName: 'folder',
        folderWebViewLink: 'https://drive.example/folder/1',
      })),
      reportJob,
    });

    await resumePendingDriveUploads(deps);

    expect(reportJob).toHaveBeenNthCalledWith(1, expect.objectContaining({
      id: 'job-1', historyId: 'recording:1', status: 'uploading',
    }));
    expect(reportJob).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'job-1', historyId: 'recording:1', status: 'completed',
      driveFolderId: 'folder-1', driveFolderName: 'folder',
      folderWebViewLink: 'https://drive.example/folder/1', namingStatus: 'pending',
      files: [expect.objectContaining({ stream: 'tab', status: 'uploaded', driveFileId: 'drive-1' })],
    }));
  });

  it('reports a retained failed recovery as retry-pending, not as a local fallback', async () => {
    const owned: PendingUpload = {
      ...entry('a.webm'),
      historyId: 'recording:1',
      jobId: 'job-1',
    };
    const reportJob = jest.fn();
    const deps = makeDeps({
      store: fakeStore([owned]),
      uploadFile: jest.fn(async () => { throw new Error('network down'); }),
      reportJob,
    });

    await resumePendingDriveUploads(deps);

    expect(reportJob).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'job-1', status: 'failed', recoveryPending: true,
      files: [expect.objectContaining({ status: 'retry-pending', error: 'Error: network down' })],
    }));
    expect((deps.store as any).remove).not.toHaveBeenCalled();
  });
});
