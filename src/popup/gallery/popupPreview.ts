/** Boots one real popup document with a deterministic development fixture. */

import { createPopupController } from '../popupBootstrap';
import { wirePopupShell } from '../popupShell';
import { popupStory } from './popupStories';

function installPreviewStyles(doc: Document): void {
  if (doc.getElementById('popup-gallery-preview-styles')) return;
  const stylesheet = doc.createElement('link');
  stylesheet.id = 'popup-gallery-preview-styles';
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'styles/popup/gallery-preview.css';
  doc.head.appendChild(stylesheet);
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
    shell.applyPreview(story.shell);
  } catch (error) {
    const message = doc.createElement('pre');
    message.className = 'gallery-preview-error';
    message.textContent = error instanceof Error ? error.message : String(error);
    doc.body.replaceChildren(message);
  } finally {
    doc.documentElement.dataset.popupPreviewReady = 'true';
  }
}
