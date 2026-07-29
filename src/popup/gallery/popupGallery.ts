/** Development-only browser page that renders real popup-controller fixtures. */

import { POPUP_STORIES, type PopupStory, type PopupStoryGroup } from './popupStories';

type Preview = {
  story: PopupStory;
  card: HTMLElement;
  frame: HTMLIFrameElement;
  observer?: ResizeObserver;
  mutationObserver?: MutationObserver;
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

let selectedGroup: PopupStoryGroup | 'All' = 'All';
let previews: Preview[] = [];

function selectedStoryId(): string | null {
  return new URLSearchParams(location.search).get('story');
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
  // A popup sizes itself to its content. Do not give individual stories a
  // gallery-only floor: fixed overlays (such as the device picker) anchor to
  // the iframe viewport and would otherwise be visually detached from the
  // popup they cover.
  preview.frame.style.height = `${contentHeight}px`;
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
  // This is the actual popup document and bundle, not copied markup. Its query
  // selects the deterministic preview adapter before any live Chrome calls run.
  frame.src = `popup.html?popupPreview=${encodeURIComponent(story.id)}`;
  canvas.appendChild(frame);
  card.append(header, canvas);
  gallery.appendChild(card);

  const preview: Preview = { story, card, frame };
  frame.addEventListener('load', () => {
    const doc = frame.contentDocument;
    if (!doc) return;
    applyPreviewPreferences(preview);
    preview.observer = new ResizeObserver(() => resizePreview(preview));
    preview.observer.observe(doc.body);
    // `popup.ts` loads the preview adapter dynamically. Observe its render so a
    // tall state (detail, picker, or expanded setup) resizes even if it appears
    // just after the iframe's initial load event.
    preview.mutationObserver = new MutationObserver(() => resizePreview(preview));
    preview.mutationObserver.observe(doc.body, { childList: true, subtree: true, characterData: true, attributes: true });
    doc.fonts?.ready.then(() => resizePreview(preview));
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

setStatus('Loading real popup previews…');
render();
