/** Popup chrome that surrounds controller-owned views (menu and setup controls). */

import { createRuntimeTab } from '../platform/chrome/tabs';
import { isDevBuild } from '../shared/build';
import type { PopupPreviewShellState } from './popupPreviewState';

const byId = <T extends HTMLElement>(doc: Document, id: string): T | null =>
  doc.getElementById(id) as T | null;

export type PopupShell = {
  applyPreview(state?: PopupPreviewShellState): void;
};

/** Wires production shell interactions and exposes only semantic preview controls. */
export function wirePopupShell(doc: Document = document): PopupShell {
  const menuButton = byId<HTMLButtonElement>(doc, 'open-menu');
  const menu = byId<HTMLElement>(doc, 'popup-menu');
  const setMenuOpen = (open: boolean) => {
    if (!menuButton || !menu) return;
    menu.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
  };
  if (menuButton && menu) {
    menuButton.addEventListener('click', () => setMenuOpen(menu.hidden));
    doc.addEventListener('click', (event) => {
      if (!menu.hidden && !menu.contains(event.target as Node) && !menuButton.contains(event.target as Node)) setMenuOpen(false);
    });
    menu.addEventListener('click', () => setMenuOpen(false));
    doc.addEventListener('keydown', (event) => { if (event.key === 'Escape') setMenuOpen(false); });
  }

  const popupGalleryButton = byId<HTMLButtonElement>(doc, 'open-popup-gallery');
  if (popupGalleryButton && isDevBuild()) {
    popupGalleryButton.hidden = false;
    popupGalleryButton.addEventListener('click', () => void createRuntimeTab('popup-gallery.html'));
  }

  /** Accessible custom select surfaces keep native controls as their data source. */
  const wireSelect = (selectId: string, triggerId: string, optionsId: string): void => {
    const select = byId<HTMLSelectElement>(doc, selectId);
    const trigger = byId<HTMLButtonElement>(doc, triggerId);
    const options = byId<HTMLElement>(doc, optionsId);
    if (!select || !trigger || !options) return;
    const close = () => {
      options.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    };
    const sync = () => {
      const option = select.selectedOptions[0];
      const label = trigger.querySelector<HTMLElement>('[data-select-label]');
      if (label) label.textContent = option?.textContent ?? '';
      else trigger.textContent = option?.textContent ?? '';
      if (selectId === 'storage-mode') {
        const selectedIcon = options.querySelector<SVGElement>(`[role="option"][data-value="${select.value}"] svg`);
        const currentIcon = trigger.querySelector<SVGElement>('svg');
        if (selectedIcon && currentIcon) {
          const icon = selectedIcon.cloneNode(true) as SVGElement;
          icon.classList.add('select-storage-icon');
          currentIcon.replaceWith(icon);
        }
      }
      options.querySelectorAll<HTMLButtonElement>('[role="option"]').forEach((item) => {
        item.setAttribute('aria-selected', String(item.dataset.value === select.value));
      });
    };
    trigger.addEventListener('click', () => {
      const willOpen = options.hidden;
      doc.querySelectorAll<HTMLElement>('.select-options').forEach((other) => {
        if (other === options) return;
        other.hidden = true;
        doc.querySelector<HTMLButtonElement>(`[aria-controls="${other.id}"]`)?.setAttribute('aria-expanded', 'false');
      });
      options.hidden = !willOpen;
      trigger.setAttribute('aria-expanded', String(willOpen));
    });
    options.addEventListener('click', (event) => {
      const option = (event.target as HTMLElement).closest<HTMLButtonElement>('[role="option"]');
      if (!option?.dataset.value) return;
      select.value = option.dataset.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      sync();
      close();
      trigger.focus();
    });
    select.addEventListener('change', sync);
    doc.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
    doc.addEventListener('click', (event) => {
      if (!options.hidden && !options.contains(event.target as Node) && !trigger.contains(event.target as Node)) close();
    });
    sync();
  };

  wireSelect('storage-mode', 'storage-mode-trigger', 'storage-mode-options');
  wireSelect('mic-mode', 'mic-mode-trigger', 'mic-mode-options');

  const captureToggle = byId<HTMLButtonElement>(doc, 'toggle-capture-setup');
  const captureDetails = byId<HTMLElement>(doc, 'capture-details');
  const captureSummary = byId<HTMLElement>(doc, 'capture-summary-value');
  const syncCaptureSummary = () => {
    const mic = byId<HTMLSelectElement>(doc, 'mic-mode')?.value ?? 'separate';
    const cameraOn = byId<HTMLInputElement>(doc, 'record-self-video')?.checked ?? false;
    if (captureSummary) captureSummary.textContent = `CAM ${cameraOn ? 'ON' : 'OFF'} · MIC ${mic.toUpperCase()} · 720P`;
  };
  const setCaptureDetailsExpanded = (expanded: boolean) => {
    if (!captureToggle || !captureDetails) return;
    captureToggle.setAttribute('aria-expanded', String(expanded));
    captureDetails.hidden = !expanded;
  };
  if (captureToggle && captureDetails) {
    captureToggle.addEventListener('click', () => setCaptureDetailsExpanded(captureToggle.getAttribute('aria-expanded') !== 'true'));
    ['mic-mode', 'record-self-video'].forEach((id) => byId<HTMLInputElement | HTMLSelectElement>(doc, id)?.addEventListener('change', syncCaptureSummary));
    doc.querySelectorAll<HTMLInputElement>('input[name="tab-content-type"]').forEach((input) => input.addEventListener('change', syncCaptureSummary));
    syncCaptureSummary();
  }

  return {
    applyPreview(state) {
      if (!state) return;
      if (state.menuOpen != null) setMenuOpen(state.menuOpen);
      if (state.captureDetailsExpanded != null) setCaptureDetailsExpanded(state.captureDetailsExpanded);
    },
  };
}
