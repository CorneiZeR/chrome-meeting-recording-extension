import {
  normalizeRecordingHistoryEntry,
  type RecordingHistoryCursor,
  type RecordingHistoryEntry,
  type RecordingHistoryPage,
} from '../shared/recordingHistory';

export type RecordingHistoryMutation = (
  current: RecordingHistoryEntry | undefined,
) => RecordingHistoryEntry | undefined;

export interface RecordingHistoryRepositoryPort {
  listPage(options?: { limit?: number; cursor?: RecordingHistoryCursor }): Promise<RecordingHistoryPage>;
  get(id: string): Promise<RecordingHistoryEntry | undefined>;
  update(id: string, mutate: RecordingHistoryMutation): Promise<RecordingHistoryEntry | undefined>;
}

const DATABASE_NAME = 'recording-history';
const DATABASE_VERSION = 3;
const STORE_NAME = 'recordings';
const CREATED_AT_ID_INDEX = 'createdAtId';
const ACTIVE_CREATED_AT_ID_INDEX = 'activeCreatedAtId';
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

/**
 * Tombstones remain durable so late upload/recovery work cannot recreate a
 * deleted history entry. This storage-only key excludes them from the paged
 * index, keeping list work proportional to visible recordings rather than all
 * historical deletions.
 */
type StoredRecordingHistoryEntry = RecordingHistoryEntry & { activeCreatedAt?: number };

/** IndexedDB adapter. Its update operation is the history module's atomic seam. */
export class RecordingHistoryRepository implements RecordingHistoryRepositoryPort {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory?: IDBFactory) {}

  async listPage(options: { limit?: number; cursor?: RecordingHistoryCursor } = {}): Promise<RecordingHistoryPage> {
    const database = await this.open();
    const limit = Math.max(1, Math.min(MAX_PAGE_SIZE, Math.floor(options.limit ?? DEFAULT_PAGE_SIZE)));
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const index = transaction.objectStore(STORE_NAME).index(ACTIVE_CREATED_AT_ID_INDEX);
      const cursorKey = options.cursor ? [options.cursor.createdAt, options.cursor.id] : undefined;
      const request = index.openCursor(cursorKey ? IDBKeyRange.upperBound(cursorKey, true) : null, 'prev');
      const entries: RecordingHistoryEntry[] = [];
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      request.onerror = () => fail(request.error ?? new Error('Could not read recording history'));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const entry = normalizeRecordingHistoryEntry(cursor.value);
        if (entry && !entry.deletedAt) entries.push(entry);
        if (entries.length > limit) return;
        cursor.continue();
      };
      transaction.oncomplete = () => {
        if (settled) return;
        const hasMore = entries.length > limit;
        const pageEntries = hasMore ? entries.slice(0, limit) : entries;
        const last = pageEntries[pageEntries.length - 1];
        settled = true;
        resolve({
          entries: pageEntries,
          ...(hasMore && last ? { nextCursor: { createdAt: last.createdAt, id: last.id } } : {}),
        });
      };
      transaction.onerror = () => fail(transaction.error ?? new Error('Could not read recording history'));
      transaction.onabort = () => fail(transaction.error ?? new Error('Recording history read aborted'));
    });
  }

  async get(id: string): Promise<RecordingHistoryEntry | undefined> {
    const database = await this.open();
    const raw = await this.request(database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id));
    return normalizeRecordingHistoryEntry(raw);
  }

  async update(id: string, mutate: RecordingHistoryMutation): Promise<RecordingHistoryEntry | undefined> {
    const database = await this.open();
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);
      let result: RecordingHistoryEntry | undefined;
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      request.onerror = () => fail(request.error ?? new Error('Could not read recording history'));
      request.onsuccess = () => {
        try {
          const next = mutate(normalizeRecordingHistoryEntry(request.result));
          if (!next) return;
          if (next.id !== id) throw new Error('Recording history updates cannot change the entry id');
          result = next;
          store.put(toStoredEntry(next));
        } catch (error) {
          try { transaction.abort(); } catch {}
          fail(error);
        }
      };
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      transaction.onerror = () => fail(transaction.error ?? new Error('Could not write recording history'));
      transaction.onabort = () => fail(transaction.error ?? new Error('Recording history write aborted'));
    });
  }

  private open(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    const factory = this.factory ?? globalThis.indexedDB;
    if (!factory) return Promise.reject(new Error('IndexedDB is unavailable in this context'));
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        const store = database.objectStoreNames.contains(STORE_NAME)
          ? request.transaction!.objectStore(STORE_NAME)
          : database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        if (!store.indexNames.contains(CREATED_AT_ID_INDEX)) {
          store.createIndex(CREATED_AT_ID_INDEX, ['createdAt', 'id'], { unique: true });
        }
        const needsVisibilityMigration = !store.indexNames.contains(ACTIVE_CREATED_AT_ID_INDEX);
        if (needsVisibilityMigration) {
          store.createIndex(ACTIVE_CREATED_AT_ID_INDEX, ['activeCreatedAt', 'id'], { unique: true });
          migrateVisibilityKeys(store);
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          if (this.databasePromise === opening) this.databasePromise = null;
        };
        resolve(database);
      };
      request.onerror = () => reject(request.error ?? new Error('Could not open recording history'));
      request.onblocked = () => reject(new Error('Recording history upgrade is blocked by another extension context'));
    });
    this.databasePromise = opening.catch((error) => {
      if (this.databasePromise === opening) this.databasePromise = null;
      throw error;
    });
    return this.databasePromise;
  }

  private request<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });
  }
}

function toStoredEntry(entry: RecordingHistoryEntry): StoredRecordingHistoryEntry {
  const stored: StoredRecordingHistoryEntry = { ...entry };
  if (entry.deletedAt != null) {
    delete stored.activeCreatedAt;
  } else {
    stored.activeCreatedAt = entry.createdAt;
  }
  return stored;
}

/** Adds the active-list index key to v2 rows without changing their public shape. */
function migrateVisibilityKeys(store: IDBObjectStore): void {
  const request = store.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    const entry = normalizeRecordingHistoryEntry(cursor.value);
    if (entry) {
      const stored = toStoredEntry(entry);
      const current = cursor.value as StoredRecordingHistoryEntry;
      if (current.activeCreatedAt !== stored.activeCreatedAt) cursor.update(stored);
    }
    cursor.continue();
  };
}
