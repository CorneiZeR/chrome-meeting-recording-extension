/** Development-only browser page that renders every popup layout scenario. */

import { applyPopupStory, POPUP_STORIES, type PopupStory, type PopupStoryGroup } from './popupStories';

type Preview = {
  story: PopupStory;
  card: HTMLElement;
  frame: HTMLIFrameElement;
  observer?: ResizeObserver;
};

function shellElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Popup gallery shell is missing #${id}`);
  return element as T;
}

const gallery = shellElement('popup-gallery');
const status = shellElement('gallery-status');
const search = shellElement<HTMLInputElement>('gallery-search');
const themeSelect = shellElement<HTMLSelectElement>('gallery-theme');
const widthSelect = shellElement<HTMLSelectElement>('gallery-width');
const boundsToggle = shellElement<HTMLInputElement>('gallery-bounds');
const motionToggle = shellElement<HTMLInputElement>('gallery-motion');
const groupNav = shellElement('gallery-groups');
const count = shellElement('gallery-count');

let popupSource = '';
let selectedGroup: PopupStoryGroup | 'All' = 'All';
let previews: Preview[] = [];

function selectedStoryId(): string | null {
  return new URLSearchParams(location.search).get('story');
}

function buildPopupSource(markup: string): string {
  const parsed = new DOMParser().parseFromString(markup, 'text/html');
  parsed.querySelectorAll('script').forEach((script) => script.remove());
  const base = parsed.createElement('base');
  base.href = new URL('./', location.href).href;
  parsed.head.prepend(base);
  const previewStyles = parsed.createElement('link');
  previewStyles.rel = 'stylesheet';
  previewStyles.href = 'styles/popup/gallery-preview.css';
  parsed.head.appendChild(previewStyles);
  parsed.title = 'Popup preview';
  return `<!doctype html>${parsed.documentElement.outerHTML}`;
}

function setStatus(message: string, tone: 'normal' | 'error' = 'normal'): void {
  status.textContent = message;
  status.dataset.tone = tone;
  status.hidden = message.length === 0;
}

function setTheme(doc: Document): void {
  const theme = themeSelect.value;
  const resolved = theme === 'system'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  doc.documentElement.dataset.theme = resolved;
  doc.documentElement.style.colorScheme = resolved;
}

function applyPreviewPreferences(preview: Preview): void {
  const doc = preview.frame.contentDocument;
  if (!doc) return;
  setTheme(doc);
  doc.documentElement.style.setProperty('--gallery-preview-width', `${widthSelect.value}px`);
  doc.body.classList.toggle('gallery-show-bounds', boundsToggle.checked);
  doc.body.classList.toggle('gallery-pause-motion', !motionToggle.checked);
  preview.frame.style.width = `${widthSelect.value}px`;
  resizePreview(preview);
}

function resizePreview(preview: Preview): void {
  const doc = preview.frame.contentDocument;
  if (!doc) return;
  const contentHeight = Math.ceil(Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight));
  preview.frame.style.height = `${Math.max(preview.story.minHeight ?? 0, contentHeight)}px`;
}

function wirePreviewControls(doc: Document, preview: Preview): void {
  const toggle = (buttonId: string, panelId: string): void => {
    const button = doc.getElementById(buttonId);
    const panel = doc.getElementById(panelId);
    button?.addEventListener('click', () => {
      if (!panel) return;
      const opening = panel.hidden;
      panel.hidden = !opening;
      button.setAttribute('aria-expanded', String(opening));
      resizePreview(preview);
    });
  };
  toggle('open-menu', 'popup-menu');
  toggle('recording-detail-menu-button', 'recording-detail-menu');
  toggle('storage-mode-trigger', 'storage-mode-options');
  toggle('mic-mode-trigger', 'mic-mode-options');

  const captureToggle = doc.getElementById('toggle-capture-setup');
  const captureDetails = doc.getElementById('capture-details');
  captureToggle?.addEventListener('click', () => {
    if (!captureDetails) return;
    const opening = captureDetails.hidden;
    captureDetails.hidden = !opening;
    captureToggle.setAttribute('aria-expanded', String(opening));
    resizePreview(preview);
  });
  doc.querySelectorAll<HTMLElement>('.switch').forEach((control) => {
    control.addEventListener('click', () => {
      const next = !control.classList.contains('on');
      control.classList.toggle('on', next);
      control.setAttribute('aria-pressed', String(!next));
    });
  });
  doc.querySelectorAll<HTMLElement>('[data-device-picker-dismiss], #device-picker-close').forEach((control) => {
    control.addEventListener('click', () => {
      const picker = doc.getElementById('device-picker');
      if (picker) picker.hidden = true;
    });
  });
}

function makeCard(story: PopupStory): Preview {
  const card = document.createElement('article');
  card.className = 'story-card';
  card.dataset.story = story.id;
  card.dataset.group = story.group;

  const header = document.createElement('header');
  header.className = 'story-header';
  const copy = document.createElement('div');
  copy.className = 'story-copy';
  const eyebrow = document.createElement('div');
  eyebrow.className = 'story-eyebrow';
  eyebrow.textContent = story.group;
  const title = document.createElement('h2');
  title.textContent = story.title;
  const description = document.createElement('p');
  description.textContent = story.description;
  copy.append(eyebrow, title, description);
  const focus = document.createElement('a');
  focus.className = 'story-focus';
  focus.href = `?story=${encodeURIComponent(story.id)}`;
  focus.target = '_blank';
  focus.rel = 'noreferrer';
  focus.textContent = 'Focus';
  focus.setAttribute('aria-label', `Open ${story.title} in a focused gallery`);
  header.append(copy, focus);

  const canvas = document.createElement('div');
  canvas.className = 'story-canvas';
  const frame = document.createElement('iframe');
  frame.className = 'story-frame';
  frame.title = `${story.group}: ${story.title}`;
  frame.loading = 'eager';
  frame.srcdoc = popupSource;
  canvas.appendChild(frame);
  card.append(header, canvas);
  gallery.appendChild(card);

  const preview: Preview = { story, card, frame };
  frame.addEventListener('load', () => {
    const doc = frame.contentDocument;
    if (!doc) return;
    try {
      applyPopupStory(doc, story.id);
      wirePreviewControls(doc, preview);
      applyPreviewPreferences(preview);
      preview.observer = new ResizeObserver(() => resizePreview(preview));
      preview.observer.observe(doc.body);
      doc.fonts?.ready.then(() => resizePreview(preview));
    } catch (error) {
      card.dataset.error = 'true';
      const message = doc.createElement('pre');
      message.className = 'gallery-preview-error';
      message.textContent = error instanceof Error ? error.message : String(error);
      doc.body.replaceChildren(message);
      resizePreview(preview);
    }
  }, { once: true });
  return preview;
}

function buildGroupNavigation(stories: PopupStory[]): void {
  const groups: Array<PopupStoryGroup | 'All'> = ['All'];
  for (const story of stories) if (!groups.includes(story.group)) groups.push(story.group);
  groupNav.replaceChildren();
  for (const group of groups) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'group-filter';
    button.textContent = group;
    button.dataset.group = group;
    button.setAttribute('aria-pressed', String(group === selectedGroup));
    button.addEventListener('click', () => {
      selectedGroup = group;
      groupNav.querySelectorAll<HTMLButtonElement>('.group-filter').forEach((candidate) => {
        candidate.setAttribute('aria-pressed', String(candidate === button));
      });
      filterStories();
    });
    groupNav.appendChild(button);
  }
}

function filterStories(): void {
  const query = search.value.trim().toLocaleLowerCase();
  let visible = 0;
  for (const preview of previews) {
    const matchesGroup = selectedGroup === 'All' || preview.story.group === selectedGroup;
    const haystack = `${preview.story.title} ${preview.story.group} ${preview.story.description}`.toLocaleLowerCase();
    const matchesSearch = !query || haystack.includes(query);
    preview.card.hidden = !(matchesGroup && matchesSearch);
    if (!preview.card.hidden) visible += 1;
  }
  count.textContent = `${visible} of ${previews.length} states`;
}

function render(): void {
  const focusedId = selectedStoryId();
  const selected = focusedId ? POPUP_STORIES.filter((story) => story.id === focusedId) : POPUP_STORIES;
  if (focusedId && selected.length === 0) {
    setStatus(`Unknown popup state “${focusedId}”.`, 'error');
    return;
  }
  document.body.classList.toggle('focused-gallery', focusedId != null);
  const allLink = document.getElementById('gallery-all-link');
  if (allLink) allLink.hidden = focusedId == null;
  buildGroupNavigation(selected);
  previews = selected.map(makeCard);
  filterStories();
  setStatus('');
}

search.addEventListener('input', filterStories);
themeSelect.addEventListener('change', () => {
  document.documentElement.dataset.theme = themeSelect.value === 'system'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : themeSelect.value;
  previews.forEach(applyPreviewPreferences);
});
widthSelect.addEventListener('change', () => previews.forEach(applyPreviewPreferences));
boundsToggle.addEventListener('change', () => previews.forEach(applyPreviewPreferences));
motionToggle.addEventListener('change', () => previews.forEach(applyPreviewPreferences));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (themeSelect.value === 'system') themeSelect.dispatchEvent(new Event('change'));
});

setStatus('Loading the real popup markup…');
fetch('popup.html', { cache: 'no-store' })
  .then((response) => {
    if (!response.ok) throw new Error(`Could not load popup.html (${response.status})`);
    return response.text();
  })
  .then((markup) => {
    popupSource = buildPopupSource(markup);
    render();
  })
  .catch((error) => {
    setStatus(
      `${error instanceof Error ? error.message : String(error)} Run “npm run popup:gallery” and open the printed local URL.`,
      'error',
    );
  });
