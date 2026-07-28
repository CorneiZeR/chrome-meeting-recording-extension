/**
 * Development-only popup scenarios used by the popup gallery.
 *
 * Each scenario starts from the real `static/popup.html` markup and applies only
 * the state that the production controllers would normally derive from Chrome.
 * Keeping the mutations here means the gallery needs no mocked extension runtime
 * and can render every interesting layout at the same time.
 */

export type PopupStoryGroup = 'Setup' | 'Permissions' | 'Recording' | 'Saving' | 'Library' | 'Overlays';

export type PopupStory = {
  id: string;
  title: string;
  group: PopupStoryGroup;
  description: string;
  /** Minimum iframe height for fixed-position overlays and intentionally tall views. */
  minHeight?: number;
  apply: (doc: Document) => void;
};

export const POPUP_VIEW_IDS = [
  'view-config',
  'view-permission',
  'view-recording',
  'view-finalizing',
  'view-upload',
  'view-recordings',
  'view-recording-detail',
] as const;

function byId<T extends HTMLElement>(doc: Document, id: string): T {
  const value = doc.getElementById(id);
  if (!value) throw new Error(`Popup gallery expected #${id} in static/popup.html`);
  return value as T;
}

function optional<T extends HTMLElement>(doc: Document, id: string): T | null {
  return doc.getElementById(id) as T | null;
}

function setText(doc: Document, id: string, text: string): void {
  byId(doc, id).textContent = text;
}

function showOnly(doc: Document, viewId: typeof POPUP_VIEW_IDS[number]): void {
  for (const id of POPUP_VIEW_IDS) byId(doc, id).hidden = id !== viewId;
  optional(doc, 'session-tabs')?.replaceChildren();
  const status = optional(doc, 'recording-status');
  if (status) status.textContent = '';
}

type HeaderOptions = {
  hidden?: boolean;
  title?: string;
  tone?: 'idle' | 'recording' | 'paused' | 'saved' | 'blocked';
  phaseLabel?: string;
  uploadPercent?: number;
};

function setHeader(doc: Document, options: HeaderOptions = {}): void {
  const header = byId(doc, 'pp-header');
  header.hidden = options.hidden ?? false;
  header.classList.toggle('compact', options.tone != null && options.tone !== 'idle');
  header.classList.toggle('recording-active', options.tone === 'recording');
  header.classList.toggle('recording-paused', options.tone === 'paused');
  header.classList.toggle('recording-saved', options.tone === 'saved');
  header.classList.toggle('permission-blocked', options.tone === 'blocked');
  const brandName = header.querySelector<HTMLElement>('.brand-name');
  if (brandName) brandName.textContent = options.title ?? 'Meet Recorder';

  const phase = byId(doc, 'header-phase');
  phase.hidden = !options.phaseLabel;
  phase.textContent = options.phaseLabel ?? '';
  phase.dataset.tone = options.tone === 'paused' ? 'paused' : options.tone === 'saved' ? 'saved' : 'recording';

  const upload = byId(doc, 'open-upload-navigation');
  upload.hidden = options.uploadPercent == null;
  if (options.uploadPercent != null) {
    const percent = Math.round(options.uploadPercent);
    byId(doc, 'upload-navigation-ring').style.setProperty('--upload-progress', String(percent));
    setText(doc, 'upload-navigation-percent', `${percent}%`);
  }
}

function setPermission(doc: Document, kind: 'mic' | 'camera', state: 'Granted' | 'Needed' | 'Blocked'): void {
  const stateElement = byId(doc, kind === 'mic' ? 'perm-mic-state' : 'perm-camera-state');
  const icon = byId(doc, 'view-permission').querySelector<HTMLElement>(
    kind === 'mic' ? '[data-perm-mic-icon]' : '[data-perm-camera-icon]'
  );
  const granted = state === 'Granted';
  stateElement.textContent = state;
  stateElement.classList.toggle('ready', granted);
  stateElement.classList.toggle('warn', !granted);
  icon?.classList.toggle('ready', granted);
  icon?.classList.toggle('warn', !granted);
}

type RecordingOptions = {
  starting?: boolean;
  paused?: boolean;
  muted?: boolean;
  cameraHidden?: boolean;
  timer?: string;
  warning?: string;
  uploadPercent?: number;
};

function renderRecording(doc: Document, options: RecordingOptions = {}): void {
  showOnly(doc, 'view-recording');
  const paused = options.paused === true;
  setHeader(doc, {
    tone: paused ? 'paused' : 'recording',
    phaseLabel: options.uploadPercent == null ? (paused ? 'PAUSED' : 'REC') : undefined,
    uploadPercent: options.uploadPercent,
  });
  setText(doc, 'rec-label', options.starting ? 'Starting…' : paused ? 'Paused' : 'REC');
  setText(doc, 'rec-timer', options.timer ?? (options.starting ? '0:00' : '12:34'));
  byId(doc, 'rec-banner').classList.toggle('paused', paused);
  byId(doc, 'paused-meta').hidden = !paused;

  const controls = byId(doc, 'view-recording').querySelector<HTMLElement>('.controls');
  if (!controls) throw new Error('Popup gallery expected .controls inside #view-recording');
  controls.classList.toggle('paused', paused);
  const pause = byId<HTMLButtonElement>(doc, 'pause-recording');
  pause.disabled = options.starting === true;
  pause.setAttribute('aria-pressed', String(paused));
  const pauseLabel = pause.querySelector<HTMLElement>('[data-pause-label]');
  if (pauseLabel) pauseLabel.textContent = paused ? 'Resume recording' : 'Pause';
  const stop = byId<HTMLButtonElement>(doc, 'stop-rec');
  stop.disabled = options.starting === true;
  const stopLabel = stop.querySelector<HTMLElement>('[data-stop-label]');
  if (stopLabel) stopLabel.textContent = paused ? 'Finish recording' : 'Finish Recording';

  byId(doc, 'row-mic').hidden = false;
  byId(doc, 'row-camera').hidden = false;
  setText(doc, 'mic-mode-label', 'SEPARATE');
  setText(doc, 'mic-device-label', options.starting ? 'Connecting…' : 'MacBook Pro Microphone');
  setText(doc, 'camera-mode-label', '720P');
  setText(doc, 'camera-device-label', options.starting ? 'Connecting…' : 'FaceTime HD Camera');
  setText(doc, 'tab-source-sub', 'Screen · 1080p');
  setText(doc, 'chip-storage-label', 'Google Drive');
  setText(doc, 'chip-transcript-label', options.starting ? 'Transcript off' : 'Transcript on');
  byId(doc, 'chip-transcript').classList.toggle('off', options.starting === true);

  const mute = byId<HTMLButtonElement>(doc, 'mute-mic');
  mute.classList.toggle('on', !options.muted);
  mute.setAttribute('aria-pressed', String(options.muted === true));
  const muteLabel = mute.querySelector<HTMLElement>('[data-mute-label]');
  if (muteLabel) muteLabel.textContent = options.muted ? 'off' : 'on';
  const camera = byId<HTMLButtonElement>(doc, 'hide-camera');
  camera.classList.toggle('on', !options.cameraHidden);
  camera.setAttribute('aria-pressed', String(options.cameraHidden === true));
  const cameraLabel = camera.querySelector<HTMLElement>('[data-camera-label]');
  if (cameraLabel) cameraLabel.textContent = options.cameraHidden ? 'off' : 'on';

  if (options.warning) setText(doc, 'recording-status', options.warning);
}

type GalleryUploadFile = {
  name: string;
  status: string;
  percent: number;
  complete?: boolean;
};

function renderUploadFiles(doc: Document, files: GalleryUploadFile[]): void {
  const list = byId(doc, 'upload-job-files');
  const fragment = doc.createDocumentFragment();
  for (const file of files) {
    const item = doc.createElement('li');
    item.className = `file-status-${file.complete ? 'uploaded' : 'uploading'}`;
    const main = doc.createElement('div');
    main.className = 'file-main';
    const head = doc.createElement('div');
    head.className = 'file-head';
    const title = doc.createElement('div');
    title.className = 'file-title';
    title.textContent = file.name;
    const status = doc.createElement('div');
    status.className = 'file-sub';
    status.textContent = file.status;
    head.append(title, status);
    const progress = doc.createElement('div');
    progress.className = 'file-progress';
    const fill = doc.createElement('span');
    fill.style.width = `${file.percent}%`;
    progress.appendChild(fill);
    main.append(head, progress);
    item.appendChild(main);
    fragment.appendChild(item);
  }
  list.replaceChildren(fragment);
}

type UploadOptions = {
  percent: number;
  status: 'uploading' | 'completed' | 'failed';
};

function renderUpload(doc: Document, options: UploadOptions): void {
  showOnly(doc, 'view-upload');
  const completed = options.status === 'completed';
  setHeader(doc, { tone: completed ? 'saved' : 'recording' });
  byId(doc, 'upload-progress').hidden = completed;
  byId(doc, 'upload-done').hidden = !completed;
  setText(doc, 'upload-job-label', options.status === 'failed' ? 'Upload incomplete' : 'to Google Drive');
  setText(doc, 'upload-job-pct', `${options.percent}%`);
  setText(doc, 'upload-job-meta', '3 FILES');
  byId(doc, 'upload-bar-fill').style.width = `${options.percent}%`;
  setText(doc, 'upload-job-sub', '3 files · 248 MB · Google Drive');

  if (completed) {
    renderUploadFiles(doc, [
      { name: 'meeting-tab.webm', status: '181 MB', percent: 100, complete: true },
      { name: 'microphone.webm', status: '18 MB', percent: 100, complete: true },
      { name: 'camera.webm', status: '49 MB', percent: 100, complete: true },
    ]);
  } else if (options.status === 'failed') {
    renderUploadFiles(doc, [
      { name: 'meeting-tab.webm', status: '✓ DONE · 181 MB', percent: 100, complete: true },
      { name: 'microphone.webm', status: '12 MB / 18 MB', percent: 68 },
      { name: 'camera.webm', status: 'Waiting to retry', percent: 0 },
    ]);
  } else {
    renderUploadFiles(doc, [
      { name: 'meeting-tab.webm', status: '126 MB / 181 MB', percent: options.percent },
      { name: 'microphone.webm', status: '12 MB / 18 MB', percent: options.percent },
      { name: 'camera.webm', status: '34 MB / 49 MB', percent: options.percent },
    ]);
  }

  byId<HTMLButtonElement>(doc, 'upload-job-cancel').hidden = options.status !== 'uploading';
  byId<HTMLButtonElement>(doc, 'upload-job-open-drive').hidden = !completed;
  byId<HTMLButtonElement>(doc, 'upload-job-new-recording').hidden = false;
  byId<HTMLButtonElement>(doc, 'upload-job-retry').hidden = options.status !== 'failed';
  byId<HTMLButtonElement>(doc, 'upload-job-transcript').hidden = !completed;
}

function renderRecordingRow(doc: Document, title: string, meta: string): HTMLElement {
  const row = doc.createElement('div');
  row.className = 'popup-recording-row';
  row.tabIndex = 0;
  const main = doc.createElement('div');
  const titleElement = doc.createElement('div');
  titleElement.className = 'popup-recording-title';
  titleElement.textContent = title;
  const metaElement = doc.createElement('div');
  metaElement.className = 'popup-recording-meta';
  metaElement.textContent = meta;
  main.append(titleElement, metaElement);
  const open = doc.createElement('span');
  open.className = 'popup-recording-open';
  open.textContent = '↗';
  row.append(main, open);
  return row;
}

function renderRecordings(doc: Document, empty = false): void {
  showOnly(doc, 'view-recordings');
  setHeader(doc, { tone: 'idle', title: 'Recordings' });
  const list = byId(doc, 'popup-recordings-list');
  const emptyMessage = byId(doc, 'popup-recordings-empty');
  list.replaceChildren();
  emptyMessage.hidden = !empty;
  if (empty) return;

  const upload = doc.createElement('div');
  upload.className = 'popup-recording-upload';
  const head = doc.createElement('div');
  head.className = 'popup-recording-upload-head';
  const title = doc.createElement('span');
  title.textContent = 'Weekly product review';
  const status = doc.createElement('span');
  status.textContent = 'UPLOADING 68%';
  head.append(title, status);
  const track = doc.createElement('div');
  track.className = 'popup-recording-upload-track';
  const fill = doc.createElement('span');
  fill.style.width = '68%';
  track.appendChild(fill);
  upload.append(head, track);
  list.append(
    upload,
    renderRecordingRow(doc, 'Customer interview — Alex', 'JUL 25 · 42:18 · 3 FILES'),
    renderRecordingRow(doc, 'Design sync', 'JUL 24 · 28:04 · 2 FILES'),
  );
  const count = byId(doc, 'recordings-count');
  count.hidden = false;
  count.textContent = '12';
}

function renderSavedDetail(doc: Document): void {
  showOnly(doc, 'view-recording-detail');
  setHeader(doc, { hidden: true });
  const content = byId(doc, 'recording-detail-content');
  content.innerHTML = `
    <div class="recording-detail-title-row">
      <h2 class="recording-detail-title" title="Customer interview — Alex">Customer interview — Alex</h2>
      <button class="recording-detail-rename" type="button" aria-label="Rename recording">✎</button>
    </div>
    <p class="recording-detail-meta">JUL 25, 2026 · 42:18 · 3 FILES · 248 MB</p>
    <p class="recording-detail-eyebrow">IN GOOGLE DRIVE</p>
    <div class="recording-detail-files">
      <div class="recording-detail-file"><span class="recording-detail-file-name">meeting-tab.webm</span><span class="recording-detail-file-actions"><span class="recording-detail-file-size">181 MB</span><button class="recording-detail-file-open" type="button">↗</button></span></div>
      <div class="recording-detail-file"><span class="recording-detail-file-name">microphone.webm</span><span class="recording-detail-file-actions"><span class="recording-detail-file-size">18 MB</span><button class="recording-detail-file-open" type="button">↗</button></span></div>
      <div class="recording-detail-file"><span class="recording-detail-file-name">camera.webm</span><span class="recording-detail-file-actions"><span class="recording-detail-file-size">49 MB</span><button class="recording-detail-file-open" type="button">↗</button></span></div>
    </div>
    <button class="recording-detail-transcript" type="button"><span>↓ Transcript</span><span>VTT · 84 KB</span></button>
    <footer class="recording-detail-footer">
      <button class="btn recording-detail-open-drive" type="button">Open in Google Drive</button>
      <button class="btn btn-secondary recording-detail-copy-link" type="button">Copy Drive link</button>
    </footer>`;
}

function renderUploadDetail(doc: Document): void {
  showOnly(doc, 'view-recording-detail');
  setHeader(doc, { hidden: true });
  const content = byId(doc, 'recording-detail-content');
  content.innerHTML = `
    <h2 class="recording-detail-title" style="margin-top:16px">Weekly product review</h2>
    <p class="recording-detail-meta" style="margin-top:4px;margin-bottom:16px">JUL 26, 2026 · UPLOADING</p>
    <div class="recording-detail-upload-progress"><span class="recording-detail-upload-percent">68%</span><span class="recording-detail-upload-label">to Google Drive</span></div>
    <div class="recording-detail-progress"><span style="width:68%"></span></div>
    <p class="recording-detail-eyebrow" style="margin-bottom:12px">3 FILES</p>
    <div class="recording-detail-upload-files">
      <div class="recording-detail-upload-file recording-detail-upload-file--done"><div class="recording-detail-upload-file-head"><span class="recording-detail-upload-file-name">meeting-tab.webm</span><span class="recording-detail-upload-file-status">✓ DONE</span></div><div class="recording-detail-progress" style="height:5px;margin:0"><span style="width:100%"></span></div></div>
      <div class="recording-detail-upload-file"><div class="recording-detail-upload-file-head"><span class="recording-detail-upload-file-name">microphone.webm</span><span class="recording-detail-upload-file-status">12 MB / 18 MB</span></div><div class="recording-detail-progress" style="height:5px;margin:0"><span style="width:68%"></span></div></div>
      <div class="recording-detail-upload-file"><div class="recording-detail-upload-file-head"><span class="recording-detail-upload-file-name">camera.webm</span><span class="recording-detail-upload-file-status">34 MB / 49 MB</span></div><div class="recording-detail-progress" style="height:5px;margin:0"><span style="width:68%"></span></div></div>
    </div>
    <footer class="recording-detail-footer"><button class="btn btn-secondary" type="button">Cancel upload</button></footer>`;
}

function renderFinalizing(doc: Document): void {
  showOnly(doc, 'view-finalizing');
  setHeader(doc, { tone: 'recording', phaseLabel: 'SAVING' });
  setText(doc, 'finalizing-label', 'Finalizing recording');
  setText(doc, 'finalizing-sub', 'Muxing tab, mic & camera');
  byId(doc, 'upload-ring').dataset.mode = 'indeterminate';
  const files = byId(doc, 'finalizing-files');
  files.innerHTML = '<li><span>Meeting tab</span><span class="file-spin"></span></li><li><span>Microphone</span><span class="file-spin"></span></li><li><span>Camera</span><span class="file-spin"></span></li>';
}

function openDevicePicker(doc: Document): void {
  renderRecording(doc, { timer: '12:34' });
  const picker = byId(doc, 'device-picker');
  picker.hidden = false;
  setText(doc, 'device-picker-title', 'MICROPHONE');
  setText(doc, 'device-picker-track', 'Audio track');
  setText(doc, 'device-picker-mode', 'SEPARATE');
  const list = byId(doc, 'device-picker-list');
  list.innerHTML = `
    <button class="device-picker-option" type="button" aria-selected="true"><span class="device-picker-option-label">MacBook Pro Microphone</span><span class="device-picker-check">✓</span></button>
    <button class="device-picker-option" type="button" aria-selected="false"><span class="device-picker-option-label">Studio Display Microphone</span></button>
    <button class="device-picker-option" type="button" aria-selected="false"><span class="device-picker-option-label">AirPods Pro</span></button>`;
}

function openPopupMenu(doc: Document): void {
  renderRecording(doc, { timer: '12:34' });
  const menu = byId(doc, 'popup-menu');
  menu.hidden = false;
  byId(doc, 'open-menu').setAttribute('aria-expanded', 'true');
  byId(doc, 'discard-rec').hidden = false;
  byId(doc, 'open-popup-gallery').hidden = false;
  byId(doc, 'open-diagnostics').hidden = false;
}

export const POPUP_STORIES: PopupStory[] = [
  {
    id: 'setup-default', title: 'Default', group: 'Setup',
    description: 'Idle setup with capture details collapsed.',
    apply: (doc) => { showOnly(doc, 'view-config'); setHeader(doc, { tone: 'idle' }); },
  },
  {
    id: 'setup-expanded', title: 'Camera + mic options', group: 'Setup',
    description: 'Expanded capture controls, separate mic, camera enabled, and a resolution nudge.',
    minHeight: 510,
    apply: (doc) => {
      showOnly(doc, 'view-config'); setHeader(doc, { tone: 'idle' });
      byId(doc, 'capture-details').hidden = false;
      byId(doc, 'toggle-capture-setup').setAttribute('aria-expanded', 'true');
      setText(doc, 'capture-summary-value', 'CAM ON · MIC SEPARATE · SCREEN');
      byId<HTMLInputElement>(doc, 'record-self-video').checked = true;
      byId(doc, 'camera-warning').hidden = false;
      setText(doc, 'camera-warning-text', 'Camera delivering 720p · raise in settings');
    },
  },
  {
    id: 'setup-mic-required', title: 'Microphone required', group: 'Setup',
    description: 'Inline permission CTA and persistent setup warning.',
    apply: (doc) => {
      showOnly(doc, 'view-config'); setHeader(doc, { tone: 'idle' });
      byId(doc, 'enable-mic').hidden = false;
      setText(doc, 'recording-status', 'Microphone access is needed before recording.');
    },
  },
  {
    id: 'permission-request', title: 'Permission request', group: 'Permissions',
    description: 'Mic is ready while camera permission still needs a browser prompt.',
    apply: (doc) => {
      showOnly(doc, 'view-permission'); setHeader(doc, { tone: 'idle' });
      setPermission(doc, 'mic', 'Granted'); setPermission(doc, 'camera', 'Needed');
    },
  },
  {
    id: 'permission-blocked', title: 'Permission blocked', group: 'Permissions',
    description: 'Browser-denied mic and camera with recovery instructions.',
    minHeight: 480,
    apply: (doc) => {
      showOnly(doc, 'view-permission'); setHeader(doc, { tone: 'blocked' });
      byId(doc, 'view-permission').classList.add('permission-blocked');
      setPermission(doc, 'mic', 'Blocked'); setPermission(doc, 'camera', 'Blocked');
      setText(doc, 'permission-title', 'Mic & camera blocked');
      setText(doc, 'permission-detail', 'The browser is denying access on this site.');
      setText(doc, 'permission-copy', 'Click the lock icon in the address bar → allow Microphone and Camera → reload.');
      setText(doc, 'grant-permission', 'Open site settings');
      setText(doc, 'permission-continue', 'Try again');
    },
  },
  {
    id: 'recording-starting', title: 'Starting', group: 'Recording',
    description: 'Capture acquisition in progress with controls temporarily disabled.',
    apply: (doc) => renderRecording(doc, { starting: true }),
  },
  {
    id: 'recording-active', title: 'Active', group: 'Recording',
    description: 'Normal recording with transcript, mic, camera, and delivered resolution.',
    apply: (doc) => renderRecording(doc),
  },
  {
    id: 'recording-paused', title: 'Paused', group: 'Recording',
    description: 'Pause-aware timer, summary metadata, and resume/finish actions.',
    apply: (doc) => renderRecording(doc, { paused: true, timer: '12:34' }),
  },
  {
    id: 'recording-muted', title: 'Muted + background upload', group: 'Recording',
    description: 'Mic muted, camera hidden, warning text, and a concurrent upload shortcut.',
    apply: (doc) => renderRecording(doc, {
      muted: true, cameraHidden: true, uploadPercent: 63,
      warning: 'Microphone is muted · camera is hidden',
    }),
  },
  {
    id: 'finalizing', title: 'Finalizing', group: 'Saving',
    description: 'Indeterminate sealing/muxing state before local delivery or upload handoff.',
    apply: renderFinalizing,
  },
  {
    id: 'upload-progress', title: 'Upload in progress', group: 'Saving',
    description: 'Aggregate and per-file Drive progress with cancel and background actions.',
    minHeight: 500,
    apply: (doc) => renderUpload(doc, { percent: 68, status: 'uploading' }),
  },
  {
    id: 'upload-complete', title: 'Upload complete', group: 'Saving',
    description: 'Saved confirmation, Drive file list, transcript, and next actions.',
    minHeight: 520,
    apply: (doc) => renderUpload(doc, { percent: 100, status: 'completed' }),
  },
  {
    id: 'upload-failed', title: 'Upload incomplete', group: 'Saving',
    description: 'Partial success with a retry path and retained file progress.',
    minHeight: 500,
    apply: (doc) => renderUpload(doc, { percent: 68, status: 'failed' }),
  },
  {
    id: 'recordings-recent', title: 'Recent recordings', group: 'Library',
    description: 'In-flight upload plus recent saved recordings.',
    minHeight: 480,
    apply: (doc) => renderRecordings(doc),
  },
  {
    id: 'recordings-empty', title: 'Empty recordings', group: 'Library',
    description: 'First-run empty state and navigation actions.',
    apply: (doc) => renderRecordings(doc, true),
  },
  {
    id: 'recording-detail', title: 'Saved recording detail', group: 'Library',
    description: 'Drive files, transcript metadata, rename, and open/copy actions.',
    minHeight: 540,
    apply: renderSavedDetail,
  },
  {
    id: 'upload-detail', title: 'Upload detail', group: 'Library',
    description: 'Pushed detail view for an upload that is still running.',
    minHeight: 520,
    apply: renderUploadDetail,
  },
  {
    id: 'device-picker', title: 'Device picker', group: 'Overlays',
    description: 'Recording state with the live microphone picker sheet open.',
    minHeight: 520,
    apply: openDevicePicker,
  },
  {
    id: 'recording-menu', title: 'Recording menu', group: 'Overlays',
    description: 'Active recording with destructive and development menu actions visible.',
    minHeight: 480,
    apply: openPopupMenu,
  },
];

export function applyPopupStory(doc: Document, storyId: string): PopupStory {
  const story = POPUP_STORIES.find((candidate) => candidate.id === storyId);
  if (!story) throw new Error(`Unknown popup story: ${storyId}`);
  story.apply(doc);
  doc.documentElement.dataset.popupStory = story.id;
  return story;
}
