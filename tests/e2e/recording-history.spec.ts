import { expect, test } from '@playwright/test';
import {
  closeHarness,
  launchExtensionHarness,
  sendRuntimeMessage,
} from './helpers/extensionHarness';

const HISTORY_DATABASE = 'recording-history';
const HISTORY_STORE = 'recordings';

test.describe('recording history (integration)', () => {
  test('migrates legacy rows and keeps deletion tombstones outside paged history scans', async ({}, testInfo) => {
    const harness = await launchExtensionHarness(testInfo.outputPath.bind(testInfo));
    try {
      await harness.controlPage.evaluate(async () => {
        const active = {
          id: 'active-recording',
          name: 'Active recording',
          createdAt: 20,
          storageMode: 'local',
          status: 'complete',
          files: [{
            id: 'active-recording:tab',
            stream: 'tab',
            filename: 'active-recording.webm',
            destination: 'local',
            status: 'available',
          }],
        };
        const deleted = {
          ...active,
          id: 'deleted-recording',
          name: 'Deleted recording',
          createdAt: 30,
          files: [{ ...active.files[0], id: 'deleted-recording:tab', filename: 'deleted-recording.webm' }],
          deletedAt: 40,
        };
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('recording-history', 2);
          request.onupgradeneeded = () => {
            const store = request.result.createObjectStore('recordings', { keyPath: 'id' });
            store.createIndex('createdAtId', ['createdAt', 'id'], { unique: true });
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction('recordings', 'readwrite');
          transaction.objectStore('recordings').put(active);
          transaction.objectStore('recordings').put(deleted);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        });
        database.close();
      });

      const page = await sendRuntimeMessage<{ ok: boolean; entries: Array<{ id: string }> }>(
        harness.controlPage,
        { type: 'LIST_RECORDING_HISTORY' }
      );
      expect(page).toEqual(expect.objectContaining({
        ok: true,
        entries: [expect.objectContaining({ id: 'active-recording' })],
      }));

      const indexState = await harness.controlPage.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('recording-history');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const transaction = database.transaction('recordings', 'readonly');
        const store = transaction.objectStore('recordings');
        const index = store.index('activeCreatedAtId');
        const activeCount = await new Promise<number>((resolve, reject) => {
          const request = index.count();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        database.close();
        return { activeCount };
      });
      expect(indexState.activeCount).toBe(1);
    } finally {
      await closeHarness(harness);
    }
  });
});
