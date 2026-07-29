/** Boots one real popup document with a deterministic development fixture. */

import { createPopupController } from '../popupBootstrap';
import { wirePopupShell } from '../popupShell';
import { popupStory } from './popupStories';

const BLOCKED_PREVIEW_ACTION_SELECTOR = [
  '#save', '#enable-mic', '#start-rec', '#grant-permission', '#permission-continue',
  '#pause-recording', '#stop-rec', '#discard-rec', '#mute-mic', '#hide-camera',
  '#mic-device-trigger', '#camera-device-trigger', '#upload-job-open-drive',
  '#upload-job-retry', '#upload-job-cancel', '#upload-job-new-recording',
  '#upload-job-transcript', '#new-recording', '#see-all-recordings',
  '#recording-detail-back', '#recording-detail-copy', '#recording-detail-rename',
  '#recording-detail-delete', '#recording-detail-diagnostics', '#recording-detail-settings',
  '#popup-menu [role="menuitem"]', '.recording-detail-file-open',
  '.recording-detail-open-drive', '.recording-detail-copy-link', '.recording-detail-transcript',
  '.session-tab-close',
].join(', ');

function installPreviewStyles(doc: Document): void {
  if (doc.getElementById('popup-gallery-preview-styles')) return;
  const stylesheet = doc.createElement('link');
  stylesheet.id = 'popup-gallery-preview-styles';
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'styles/popup/gallery-preview.css';
  doc.head.appendChild(stylesheet);
}

/** Allows local visual controls while fencing off anything that could leave the preview. */
function guardPreviewActions(doc: Document): void {
  doc.querySelectorAll<HTMLElement>(BLOCKED_PREVIEW_ACTION_SELECTOR).forEach((element) => {
    element.dataset.previewActionBlocked = 'true';
  });
  const block = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    if (!target?.closest(BLOCKED_PREVIEW_ACTION_SELECTOR)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  // Capture phase runs before production event handlers, including any future
  // handler added to a popup action after the gallery was introduced.
  doc.addEventListener('click', block, true);
  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') block(event);
  }, true);
}

/**
 * The iframe loads `popup.html` and this adapter injects only the fixture data.
 * It deliberately does not initialise PopupController's live Chrome listeners.
 */
export function renderPopupPreview(storyId: string, doc: Document = document): void {
  try {
    const story = popupStory(storyId);
    if (!story) throw new Error(`Unknown popup story: ${storyId}`);
    doc.documentElement.dataset.popupPreview = 'true';
    doc.documentElement.dataset.popupStory = story.id;
    installPreviewStyles(doc);
    const shell = wirePopupShell(doc);
    const controller = createPopupController(doc);
    controller.renderPreview(story.preview);
    controller.wirePreviewInteractions();
    shell.applyPreview(story.shell);
    guardPreviewActions(doc);
  } catch (error) {
    const message = doc.createElement('pre');
    message.className = 'gallery-preview-error';
    message.textContent = error instanceof Error ? error.message : String(error);
    doc.body.replaceChildren(message);
  } finally {
    doc.documentElement.dataset.popupPreviewReady = 'true';
  }
}
