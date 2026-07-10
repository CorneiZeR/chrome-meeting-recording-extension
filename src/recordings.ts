import { RecordingsController } from './recordings/RecordingsController';
import { RecordingsView } from './recordings/RecordingsView';

const get = (id: string) => document.getElementById(id);
const list = get('recordings-list');
const empty = get('recordings-empty');
const error = get('recordings-error');
if (list && empty && error) {
  let controller: RecordingsController;
  const view = new RecordingsView(list, empty, error, {
    rename: (id, name) => void controller.rename(id, name),
    remove: (id) => void controller.remove(id),
    openLocal: (recordingId, fileId) => void controller.openLocal(recordingId, fileId),
  });
  controller = new RecordingsController(view);
  void controller.init().catch((cause) => view.showError(cause instanceof Error ? cause.message : String(cause)));
}
