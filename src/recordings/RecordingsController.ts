import { sendToBackground } from '../shared/messages';
import type { RecordingHistoryEntry } from '../shared/recordingHistory';
import { RecordingsView } from './RecordingsView';

export class RecordingsController {
  private entries: RecordingHistoryEntry[] = [];
  constructor(private readonly view: RecordingsView) {}

  async init() { await this.refresh(); }

  async rename(id: string, name: string) {
    try {
      const response = await sendToBackground({ type: 'RENAME_RECORDING_HISTORY', id, name });
      if (!response.ok) throw new Error(response.error);
      await this.refresh();
    } catch (error) { this.view.showError(error instanceof Error ? error.message : String(error)); }
  }

  async remove(id: string) {
    if (!confirm('Remove this item from recording history? Files will not be deleted.')) return;
    try {
      const response = await sendToBackground({ type: 'REMOVE_RECORDING_HISTORY', id });
      if (!response.ok) throw new Error(response.error);
      await this.refresh();
    } catch (error) { this.view.showError(error instanceof Error ? error.message : String(error)); }
  }

  async openLocal(recordingId: string, fileId: string) {
    try {
      const response = await sendToBackground({ type: 'OPEN_RECORDING_HISTORY_FILE', recordingId, fileId });
      if (!response.ok) throw new Error(response.error);
    } catch (error) { this.view.showError(error instanceof Error ? error.message : String(error)); }
  }

  private async refresh() {
    const response = await sendToBackground({ type: 'LIST_RECORDING_HISTORY' });
    if (!response.ok) throw new Error(response.error);
    this.entries = response.entries;
    this.view.showError();
    this.view.render(this.entries);
  }
}
