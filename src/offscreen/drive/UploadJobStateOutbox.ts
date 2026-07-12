import {
  getAllLocalStorageValues,
  removeLocalStorageValues,
  setLocalStorageValues,
} from '../../platform/chrome/storage';
import { normalizeUploadJobs, type UploadJob } from '../../shared/recording';

const TERMINAL_UPLOAD_STATE_PREFIX = 'terminalUploadState:';

export interface UploadJobStateStorageArea {
  getAll(): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Durable terminal-state outbox. Entries leave only after background acknowledgement. */
export class UploadJobStateOutbox {
  constructor(private readonly area: UploadJobStateStorageArea) {}

  async put(job: UploadJob): Promise<void> {
    if (job.status === 'uploading') throw new Error('Only terminal upload jobs belong in the outbox');
    await this.area.set({ [TERMINAL_UPLOAD_STATE_PREFIX + job.id]: job });
  }

  async remove(jobId: string): Promise<void> {
    await this.area.remove(TERMINAL_UPLOAD_STATE_PREFIX + jobId);
  }

  async list(): Promise<UploadJob[]> {
    const all = await this.area.getAll();
    const jobs: UploadJob[] = [];
    for (const [key, value] of Object.entries(all)) {
      if (!key.startsWith(TERMINAL_UPLOAD_STATE_PREFIX)) continue;
      const job = normalizeUploadJobs([value])?.[0];
      if (job && job.status !== 'uploading') jobs.push(job);
    }
    return jobs;
  }
}

export function createChromeUploadJobStateOutbox(): UploadJobStateOutbox {
  return new UploadJobStateOutbox({
    getAll: () => getAllLocalStorageValues(),
    set: (items) => setLocalStorageValues(items),
    remove: (key) => removeLocalStorageValues(key),
  });
}
