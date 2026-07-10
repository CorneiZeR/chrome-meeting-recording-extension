import type { RecordingHistoryEntry } from '../shared/recordingHistory';

export type RecordingsViewCallbacks = {
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  openLocal: (recordingId: string, fileId: string) => void;
};

export class RecordingsView {
  constructor(
    private readonly list: HTMLElement,
    private readonly empty: HTMLElement,
    private readonly error: HTMLElement,
    private readonly callbacks: RecordingsViewCallbacks,
  ) {}

  render(entries: RecordingHistoryEntry[]) {
    this.list.replaceChildren();
    this.empty.hidden = entries.length > 0;
    const fragment = document.createDocumentFragment();
    for (const entry of entries) fragment.appendChild(this.card(entry));
    this.list.appendChild(fragment);
  }

  showError(message = '') { this.error.textContent = message; this.error.hidden = !message; }

  private card(entry: RecordingHistoryEntry): HTMLElement {
    const card = document.createElement('article');
    card.className = 'recording-card';
    card.dataset.recordingId = entry.id;
    const top = document.createElement('div'); top.className = 'recording-top';
    const name = document.createElement('input');
    name.className = 'recording-name'; name.value = entry.name; name.setAttribute('aria-label', 'Recording name');
    const commit = () => this.callbacks.rename(entry.id, name.value);
    name.addEventListener('blur', commit);
    name.addEventListener('keydown', (event) => { if (event.key === 'Enter') { name.blur(); } });
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'delete-recording'; remove.textContent = 'Delete history';
    remove.addEventListener('click', () => this.callbacks.remove(entry.id));
    top.append(name, remove);
    const meta = document.createElement('p'); meta.className = 'recording-meta';
    meta.textContent = `${new Date(entry.createdAt).toLocaleString()} · ${entry.status}`;
    const files = document.createElement('ul'); files.className = 'recording-files';
    for (const file of entry.files) {
      const item = document.createElement('li');
      const label = document.createElement('span'); label.textContent = `${file.stream}: ${file.filename}`;
      item.appendChild(label);
      if (file.destination === 'drive' && file.webViewLink) {
        const link = document.createElement('a'); link.href = file.webViewLink; link.target = '_blank'; link.rel = 'noreferrer'; link.textContent = 'Open Drive'; item.appendChild(link);
      } else if (file.downloadId && file.status === 'available') {
        const open = document.createElement('button'); open.type = 'button'; open.textContent = 'Open local';
        open.addEventListener('click', () => this.callbacks.openLocal(entry.id, file.id)); item.appendChild(open);
      } else {
        const status = document.createElement('span'); status.className = 'file-status'; status.textContent = file.error || file.status; item.appendChild(status);
      }
      files.appendChild(item);
    }
    card.append(top, meta, files);
    return card;
  }
}
