import type { RecordingHistoryEntry } from '../shared/recordingHistory';

export interface RecordingHistoryRepositoryPort {
  list(): Promise<RecordingHistoryEntry[]>;
  get(id: string): Promise<RecordingHistoryEntry | undefined>;
  put(entry: RecordingHistoryEntry): Promise<void>;
  rename(id: string, name: string): Promise<RecordingHistoryEntry | undefined>;
  remove(id: string): Promise<boolean>;
}

const DATABASE_NAME = 'recording-history';
const STORE_NAME = 'recordings';
const CREATED_AT_INDEX = 'createdAt';

export class RecordingHistoryRepository implements RecordingHistoryRepositoryPort {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory?: IDBFactory) {}

  async list(): Promise<RecordingHistoryEntry[]> {
    const database = await this.open();
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).index(CREATED_AT_INDEX).openCursor(null, 'prev');
      const entries: RecordingHistoryEntry[] = [];
      request.onerror = () => reject(request.error ?? new Error('Could not read recording history'));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        entries.push(cursor.value as RecordingHistoryEntry);
        cursor.continue();
      };
      transaction.oncomplete = () => resolve(entries);
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not read recording history'));
    });
  }

  async get(id: string): Promise<RecordingHistoryEntry | undefined> {
    const database = await this.open();
    return await this.request(database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id));
  }

  async put(entry: RecordingHistoryEntry): Promise<void> {
    const database = await this.open();
    await this.write(database, (store) => store.put(entry));
  }

  async rename(id: string, name: string): Promise<RecordingHistoryEntry | undefined> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Recording name cannot be blank');
    const entry = await this.get(id);
    if (!entry) return undefined;
    const renamed = { ...entry, name: trimmed, userNamed: true as const };
    await this.put(renamed);
    return renamed;
  }

  async remove(id: string): Promise<boolean> {
    if (!await this.get(id)) return false;
    const database = await this.open();
    await this.write(database, (store) => store.delete(id));
    return true;
  }

  private open(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const factory = this.factory ?? globalThis.indexedDB;
      if (!factory) {
        reject(new Error('IndexedDB is unavailable in this context'));
        return;
      }
      const request = factory.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex(CREATED_AT_INDEX, CREATED_AT_INDEX, { unique: false });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not open recording history'));
    });
    return this.databasePromise;
  }

  private request<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
    });
  }

  private write(database: IDBDatabase, operation: (store: IDBObjectStore) => IDBRequest): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      operation(transaction.objectStore(STORE_NAME));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not write recording history'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Recording history write aborted'));
    });
  }
}
