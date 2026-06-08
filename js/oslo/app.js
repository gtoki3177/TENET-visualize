import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildWorld } from './world.js';
import { buildEntities } from './entities.js';
import { ViewManager } from './views.js';
import { Editor } from '../editor.js';
import { POS, clamp01, lerp } from './config.js';

const DURATION = 48;       // seconds for a full playthrough
const STORE_KEY = 'tenet_oslo_t';
const SEEN_KEY = 'tenet_oslo_seen';
const T_MIN = -0.08;
const T_MAX =  1.05;

// 7 key beats
const EVENTS = [
  { t: 0.00, title: 'A hijacked 747 explodes outside the freeport — the distraction', loc: 'crash', clip: 'clips/oslo/01.mp4', clipReverse: 'clips/oslo/01-rev.mp4' },
  { t: 0.15, title: 'Protagonist & Neil slip in through the east rolling door', loc: 'hallway', clip: 'clips/oslo/02.mp4', clipReverse: 'clips/oslo/02-rev.mp4' },
  { t: 0.30, title: 'They spiral in to the vault — the Rotas turnstile is running', loc: 'turnstile', clip: 'clips/oslo/03.mp4', clipReverse: 'clips/oslo/03-rev.mp4' },
  { t: 0.45, title: 'A masked figure bursts backward from the turnstile — the Protagonist doesn\'t know it\'s himself', loc: 'turnstile', clip: 'clips/oslo/04.mp4', clipReverse: 'clips/oslo/04-rev.mp4' },
  { t: 0.60, title: 'The fight at the turnstile — forward grapples inverted; bullets un-fire', loc: 'turnstile', clip: 'clips/oslo/05.mp4', clipReverse: 'clips/oslo/05-rev.mp4' },
  { t: 0.80, title: 'The inverted self backs into the blue turnstile and inverts away', loc: 'turnstile', clip: 'clips/oslo/06.mp4', clipReverse: 'clips/oslo/06-rev.mp4' },
  { t: 1.00, title: 'Neil pulls the Protagonist out — the freeport burns behind them', loc: 'crash', clip: 'clips/oslo/07.mp4', clipReverse: 'clips/oslo/07-rev.mp4' },
];

// ---------- Scene ----------
const app = document.getElementById('app');
const scene = new THREE.Scene();
// Overcast sky background
scene.background = new THREE.Color(0x8a9aae);
scene.fog = new THREE.Fog(0x8a9aae, 350, 900);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 3000);
camera.position.set(70, 85, 95);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
app.appendChild(labelRenderer.domElement);

// ---------- Lights ----------
scene.add(new THREE.HemisphereLight(0xd0d8e0, 0x6a7480, 1.0));
const sun = new THREE.DirectionalLight(0xfff8ee, 1.3);
sun.position.set(100, 200, 80);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.near = 10; sc.far = 900;
sc.left = -250; sc.right = 250; sc.top = 250; sc.bottom = -250;
scene.add(sun);

// Ambient interior light
const interior = new THREE.PointLight(0xffeedd, 0.7, 300);
interior.position.set(0, 18, 30);
scene.add(interior);

// ---------- Controls ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 15;
controls.maxDistance = 700;
controls.target.set(0, 8, -5);
// Blender-style navigation: MIDDLE = orbit, wheel = zoom, left freed for selection.
// SHIFT+MIDDLE pans via OrbitControls' OWN built-in shift handling (it swaps a rotate-button
// to pan when shiftKey is held), which reads the modifier off the mouse event — so it works
// inside iframes / embedded previews with no keyboard listener needed.
controls.enablePan = true;
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
renderer.domElement.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });  // no middle-click autoscroll

// ---------- Build world + entities ----------
const world = buildWorld(scene);
const entities = buildEntities(scene, world);
const views = new ViewManager(camera, controls, entities.followables);

// ---------- Location labels (CSS2D) ----------
function addLabel(point, text, key = null) {
  const el = document.createElement('div');
  el.className = 'tag tag-loc';
  el.innerHTML = `<span class="dot"></span><span class="txt">${text}</span>`;
  if (key) {
    el.style.pointerEvents = 'auto';
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => goLocation(key));
  }
  const obj = new CSS2DObject(el);
  obj.position.copy(point);
  scene.add(obj);
  return obj;
}
addLabel(world.points.crash, 'CRASH SITE', 'crash');
addLabel(world.points.gateEast, 'ROLLING DOOR (E)', 'hallway');
addLabel(world.points.gateWest, 'ROLLING DOOR (W)', null);
addLabel(world.points.partition, 'PARTITION WALL', null);
addLabel(world.points.turnstile, 'ROTAS TURNSTILE', 'turnstile');

// Character tags
function followTag(obj, text, kind, y = 9) {
  const el = document.createElement('div');
  el.className = `tag tag-unit tag-${kind}`;
  el.textContent = text;
  const o = new CSS2DObject(el);
  o.position.set(0, y, 0);
  obj.add(o);
  el._obj2d = o;   // CSS2DRenderer ignores parent.visible — synced manually below
  return el;
}
const charTags = [
  [followTag(entities.refs.tp,     'TP', 'fwd'),      entities.refs.tp],
  [followTag(entities.refs.neil,   'Neil', 'fwd'),    entities.refs.neil],
  [followTag(entities.refs.tp2f,   'TP 2', 'fwd'),    entities.refs.tp2f],
  [followTag(entities.refs.neil2f, 'Neil 2', 'fwd'),  entities.refs.neil2f],
  [followTag(entities.refs.tp2i,   'TP 2', 'inv'),    entities.refs.tp2i],
  [followTag(entities.refs.neil2i, 'Neil 2', 'inv'),  entities.refs.neil2i],
];
function syncCharTags() {
  for (const [tag, obj] of charTags) if (tag._obj2d) tag._obj2d.visible = obj.visible;
}

// ---------- Timeline state ----------
let t = parseFloat(localStorage.getItem(STORE_KEY));
if (!isFinite(t)) t = 0;
let playing = false;

const fmt = (sec) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

const elRed = document.getElementById('clock-red');
const elBlue = document.getElementById('clock-blue');
const elClockT = document.getElementById('clock-t');
const elHandle = document.getElementById('handle');
const elFill = document.getElementById('track-fill');
const elEvent = document.getElementById('event-label');
const elTrack = document.getElementById('track');

function currentEvent() {
  let e = EVENTS[0];
  for (const ev of EVENTS) if (t >= ev.t - 0.001) e = ev;
  return e;
}

// ---------- Clip preview (hover the event title to see the movie clip) ----------
const clipOverlay = document.getElementById('clip-overlay');
const clipVideo   = document.getElementById('clip-video');
const clipCap     = document.getElementById('clip-cap');
let clipHideTimer = null;

// Per-event clip-path overrides — editable in edit mode, persisted to localStorage.
// Stored as { "<t.toFixed(3)>": { f: 'forward.mp4', r: 'reverse.mp4' } }.
// Back-compat: old entries were plain strings (forward only) — read transparently.
const CLIP_OVERRIDES_KEY = 'tenet_oslo_clip_overrides';
function loadClipOverrides() {
  try { return JSON.parse(localStorage.getItem(CLIP_OVERRIDES_KEY)) || {}; } catch (e) { return {}; }
}
function saveClipOverrides(map) {
  try { localStorage.setItem(CLIP_OVERRIDES_KEY, JSON.stringify(map)); } catch (e) {}
}
const clipOverrides = loadClipOverrides();
// Remember the defaults from the EVENTS literal so Reset can restore them.
const DEFAULT_CLIPS = EVENTS.map(e => ({
  f: e.clip, r: e.clipReverse,
  views: e.clipByView ? JSON.parse(JSON.stringify(e.clipByView)) : {}
}));
function applyClipOverrides() {
  EVENTS.forEach((ev, i) => {
    const key = ev.t.toFixed(3);
    const o = clipOverrides[key];
    // Start from defaults, then layer the override on top.
    ev.clip        = DEFAULT_CLIPS[i].f;
    ev.clipReverse = DEFAULT_CLIPS[i].r;
    ev.clipByView  = JSON.parse(JSON.stringify(DEFAULT_CLIPS[i].views));
    if (typeof o === 'string') { ev.clip = o; }
    else if (o && typeof o === 'object') {
      if ('f' in o) ev.clip = o.f || null;
      if ('r' in o) ev.clipReverse = o.r || null;
      if (o.views && typeof o.views === 'object') {
        for (const v in o.views) {
          ev.clipByView[v] = Object.assign({}, ev.clipByView[v], o.views[v]);
        }
      }
    }
  });
}
applyClipOverrides();

// Reverse direction = timeline plays backward. Pick the reverse file when available.
function isReverseDir() {
  const b = document.getElementById('dir-toggle');
  return b && b.dataset.dir === '-1';
}
// Current camera POV: 'god' (default), or a character key like 'tp', 'neil', etc.
function currentView() {
  const active = document.querySelector('#view-panel .ctrl-item.active');
  return active ? active.dataset.value : 'god';
}
// pickClipPath returns:
//   string  → path to play
//   null    → explicit "no clip available" (caller shows placeholder)
//   ''      → nothing set (silently do nothing)
//
// A POV-specific value of null is "explicit no-clip" and disables the god fallback.
// A POV-specific value of undefined/missing falls back to the god default.
function pickClipPath(ev) {
  const dir = isReverseDir() ? 'r' : 'f';
  const view = currentView();
  if (view !== 'god' && ev.clipByView && ev.clipByView[view]) {
    const vc = ev.clipByView[view];
    if (dir in vc) return vc[dir];     // string OR null (explicit) — don't fall back to god
  }
  const godPath = dir === 'r' ? ev.clipReverse : ev.clip;
  if (godPath === null) return null;
  if (godPath) return godPath;
  // Fallback: reverse direction with no reverse file → try forward
  if (dir === 'r' && ev.clip) return ev.clip;
  return '';
}

function showClip(ev) {
  const path = pickClipPath(ev);
  // No clip set ('' fall-back chain exhausted) OR explicit no-clip (null) → silently do nothing
  if (!path) return;
  clearTimeout(clipHideTimer);
  const abs = new URL(path, location.href).href;
  if (clipVideo.src !== abs) { clipVideo.src = path; clipVideo.currentTime = 0; }
  clipCap.textContent = ev.title;
  clipOverlay.classList.add('on');
  clipVideo.muted = false;
  clipVideo.play().catch(() => {
    clipVideo.muted = true;
    clipVideo.play().catch(() => {});
  });
}
function hideClip() {
  clipHideTimer = setTimeout(() => {
    clipOverlay.classList.remove('on');
    clipVideo.pause();
  }, 80);
}
const eventBox = elEvent.closest('.event');
eventBox.addEventListener('mouseenter', () => showClip(currentEvent()));
eventBox.addEventListener('mouseleave', hideClip);

// ---------- Clip-path editor (open by clicking the event title while in edit mode) ----------
const editBtnEl  = document.getElementById('edit-btn');
const ceBox      = document.getElementById('clip-edit');
const ceTitle    = document.getElementById('ce-title');
const ceViewSel  = document.getElementById('ce-view');
const ceInputF   = document.getElementById('ce-input-f');
const ceInputR   = document.getElementById('ce-input-r');
const ceNone     = document.getElementById('ce-none');     // "No clip available" checkbox
const ceSave     = document.getElementById('ce-save');
const ceReset    = document.getElementById('ce-reset');
const ceNoneAll  = document.getElementById('ce-none-all'); // "No clip for any POV" button
const ceX        = document.getElementById('ce-x');
let ceEditingEv  = null;

// Populate the view-picker dropdown from the existing view-panel buttons,
// so adding/removing views in the panel automatically updates the editor.
function populateViewSelect() {
  const opts = [['god', 'God (default)']];
  document.querySelectorAll('#view-panel .ctrl-item').forEach(btn => {
    const v = btn.dataset.value;
    if (!v || v === 'god') return;
    const label = btn.querySelector('.ctrl-name')?.textContent || v;
    opts.push([v, label]);
  });
  ceViewSel.innerHTML = opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
}
populateViewSelect();

// Get the current input values for whichever view is selected in the picker.
// Read the current stored values for a given POV. Returns { f, r, isNone }
// where isNone is true if the POV is explicitly disabled (stored as null).
function inputsForView(ev, view) {
  if (view === 'god') {
    const isNone = ev.clip === null && ev.clipReverse === null;
    return { f: ev.clip || '', r: ev.clipReverse || '', isNone };
  }
  const v = (ev.clipByView && ev.clipByView[view]) || {};
  const isNone = ('f' in v && v.f === null) && ('r' in v && v.r === null);
  return { f: v.f || '', r: v.r || '', isNone };
}

function syncNoneState() {
  const on = ceNone.checked;
  ceInputF.disabled = on;
  ceInputR.disabled = on;
  if (on) { ceInputF.value = ''; ceInputR.value = ''; }
}

function isEditMode() { return editBtnEl && editBtnEl.classList.contains('active'); }
function openClipEditor(ev) {
  ceEditingEv = ev;
  ceTitle.textContent = ev.title;
  ceViewSel.value = currentView();   // default to whatever POV is active
  const { f, r, isNone } = inputsForView(ev, ceViewSel.value);
  ceInputF.value = f; ceInputR.value = r;
  ceNone.checked = isNone;
  syncNoneState();
  ceBox.classList.add('on');
  setTimeout(() => { (isNone ? ceNone : ceInputF).focus(); if (!isNone) ceInputF.select(); }, 0);
}
function closeClipEditor() {
  ceBox.classList.remove('on');
  ceEditingEv = null;
}
function commitClipEditor() {
  if (!ceEditingEv) return;
  const key = ceEditingEv.t.toFixed(3);
  const view = ceViewSel.value;
  const cur = clipOverrides[key];
  // Normalise existing override into object shape before merging
  const base = (typeof cur === 'string') ? { f: cur } : (cur && typeof cur === 'object' ? cur : {});
  // "No clip" checkbox → store explicit null. Otherwise store the trimmed strings.
  const f = ceNone.checked ? null : ceInputF.value.trim();
  const r = ceNone.checked ? null : ceInputR.value.trim();
  if (view === 'god') {
    base.f = f; base.r = r;
  } else {
    base.views = base.views || {};
    base.views[view] = { f, r };
  }
  clipOverrides[key] = base;
  saveClipOverrides(clipOverrides);
  applyClipOverrides();
  closeClipEditor();
}
function resetClipEditor() {
  if (!ceEditingEv) return;
  const key = ceEditingEv.t.toFixed(3);
  const view = ceViewSel.value;
  const cur = clipOverrides[key];
  // Reset only the currently-shown view, not the whole entry.
  if (cur && typeof cur === 'object') {
    if (view === 'god') { delete cur.f; delete cur.r; }
    else if (cur.views) { delete cur.views[view]; }
    if (!cur.f && cur.f !== null && !cur.r && cur.r !== null && (!cur.views || Object.keys(cur.views).length === 0)) {
      delete clipOverrides[key];
    }
  } else {
    delete clipOverrides[key];
  }
  saveClipOverrides(clipOverrides);
  applyClipOverrides();
  const { f, r, isNone } = inputsForView(ceEditingEv, view);
  ceInputF.value = f; ceInputR.value = r;
  ceNone.checked = isNone;
  syncNoneState();
}
// Switching view in the dropdown re-loads inputs for that view
ceViewSel.addEventListener('change', () => {
  if (!ceEditingEv) return;
  const { f, r, isNone } = inputsForView(ceEditingEv, ceViewSel.value);
  ceInputF.value = f; ceInputR.value = r;
  ceNone.checked = isNone;
  syncNoneState();
});
ceNone.addEventListener('change', syncNoneState);
// Click on the title (in edit mode) opens the editor
eventBox.addEventListener('click', () => { if (isEditMode()) openClipEditor(currentEvent()); });
// Reflect edit-mode state in <body> so CSS shows the orange clickable hint
function syncEditClass() { document.body.classList.toggle('editing', isEditMode()); }
editBtnEl && editBtnEl.addEventListener('click', () => setTimeout(syncEditClass, 0));
syncEditClass();
// Mark this entire event as no-clip across every POV in one click.
// Sets god to {f: null, r: null} with no view-specific entries — every POV
// falls back to god and pickClipPath returns null, so hover does nothing.
function noClipAllPOVs() {
  if (!ceEditingEv) return;
  const key = ceEditingEv.t.toFixed(3);
  clipOverrides[key] = { f: null, r: null };
  saveClipOverrides(clipOverrides);
  applyClipOverrides();
  closeClipEditor();
}

// Editor buttons
ceSave.addEventListener('click', commitClipEditor);
ceReset.addEventListener('click', resetClipEditor);
ceNoneAll.addEventListener('click', noClipAllPOVs);
ceX.addEventListener('click', closeClipEditor);
[ceInputF, ceInputR].forEach(inp => inp.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') commitClipEditor();
  else if (e.key === 'Escape') closeClipEditor();
}));

function setT(v) {
  t = Math.max(T_MIN, Math.min(T_MAX, v));
  const tc = Math.max(0, Math.min(1, t));
  elRed.textContent = fmt(tc * 180);      // 3-minute scene (0:00 → 3:00)
  elBlue.textContent = fmt((1 - tc) * 180);
  elClockT.textContent = t.toFixed(3);
  const pct = (t - T_MIN) / (T_MAX - T_MIN) * 100;
  elHandle.style.left = `${pct}%`;
  elFill.style.width = `${pct}%`;
  const ev = currentEvent();
  elEvent.textContent = ev.title;
  localStorage.setItem(STORE_KEY, t.toFixed(4));
}

// Event markers on the track
for (const ev of EVENTS) {
  const m = document.createElement('button');
  m.className = 'marker ev-marker';
  m.style.left = `${(ev.t - T_MIN) / (T_MAX - T_MIN) * 100}%`;
  m.title = ev.title;
  m.addEventListener('click', (e) => { e.stopPropagation(); setT(ev.t); pause(); if (ev.loc) goLocation(ev.loc); });
  elTrack.appendChild(m);
}

let editActorName = null;
function refreshTimelineMarkers(actorName) {
  editActorName = actorName;
  elTrack.querySelectorAll('.kf-marker, .vis-marker').forEach(m => m.remove());
  const showEvents = !actorName;
  elTrack.querySelectorAll('.ev-marker').forEach(m => { m.style.display = showEvents ? '' : 'none'; });
  if (!actorName) return;
  const frames = (entities.edit.tracks[actorName] || []);
  for (const f of frames) {
    if (f.t < T_MIN || f.t > T_MAX) continue;
    const m = document.createElement('button');
    m.className = 'marker kf-marker';
    m.style.left = `${(f.t - T_MIN) / (T_MAX - T_MIN) * 100}%`;
    m.title = `keyframe @ t=${f.t.toFixed(3)}`;
    m.addEventListener('click', (e) => { e.stopPropagation(); seekTo(f.t); });
    elTrack.appendChild(m);
  }
  // visibility keyframes (appear/disappear) — a second row of round markers below the track
  const vk = entities.edit.visMode === 'keys' ? (entities.edit.visKeyList(actorName) || []) : [];
  for (const k of vk) {
    if (k.t < T_MIN || k.t > T_MAX) continue;
    const m = document.createElement('button');
    m.className = 'marker vis-marker ' + (k.on ? 'on' : 'off');
    m.style.left = `${(k.t - T_MIN) / (T_MAX - T_MIN) * 100}%`;
    m.title = `visibility: ${k.on ? 'show' : 'hide'} from t=${k.t.toFixed(3)}`;
    m.addEventListener('click', (e) => { e.stopPropagation(); seekTo(k.t); });
    elTrack.appendChild(m);
  }
}

function seekTo(target) {
  setT(target); pause(); syncSubjFromGlobal();
  if (editor.active && editActorName) { entities.update(t, 0.016); editor.focusSelected(); }
}

// ---------- Scrubbing ----------
const elTrackWrap = elTrack.parentElement;
function trackToT(clientX) {
  const r = elTrack.getBoundingClientRect();
  return ((clientX - r.left) / r.width) * (T_MAX - T_MIN) + T_MIN;
}
// Times to snap to while Shift-dragging: the selected actor's position + visibility keyframes
// (else the event beats).
function snapTimes() {
  if (editActorName) {
    const pos = (entities.edit.tracks[editActorName] || []).map(f => f.t);
    const vis = entities.edit.visMode === 'keys' ? (entities.edit.visKeyList(editActorName) || []).map(k => k.t) : [];
    const all = pos.concat(vis);
    if (all.length) return all;
  }
  return EVENTS.map(e => e.t);
}
function snapT(tt) {
  const times = snapTimes(); if (!times.length) return tt;
  let best = times[0];
  for (const x of times) if (Math.abs(x - tt) < Math.abs(best - tt)) best = x;
  // Catch radius = a quarter of the spacing to the nearest neighbour key (half the old
  // nearest-wins zone), so it only snaps when the cursor is fairly close to a keyframe.
  let gap = Infinity;
  for (const x of times) if (x !== best) gap = Math.min(gap, Math.abs(x - best));
  const radius = isFinite(gap) ? gap * 0.25 : 0.04;
  return Math.abs(tt - best) <= radius ? best : tt;
}
const scrubT = (e) => { const tt = trackToT(e.clientX); return e.shiftKey ? snapT(tt) : tt; };
function syncSubjFromGlobal() {
  if (!subjKey) return;
  subjT = globalToSubj(subjKey, t);
  paintSubj();
}
function trackMove(e) { setT(scrubT(e)); syncSubjFromGlobal(); }
function trackUp() { window.removeEventListener('pointermove', trackMove); window.removeEventListener('pointerup', trackUp); }
elTrackWrap.addEventListener('pointerdown', (e) => {
  // (drag works even when the press starts on a keyframe/event marker; Shift snaps to keyframes)
  e.preventDefault();
  pause(); setT(scrubT(e)); syncSubjFromGlobal();
  window.addEventListener('pointermove', trackMove);
  window.addEventListener('pointerup', trackUp);
});

// ---------- Play / pause ----------
const playBtn = document.getElementById('play');
function setPlay(p) { playing = p; playBtn.dataset.playing = p ? '1' : '0'; playBtn.textContent = p ? '❚❚' : '▶'; }
function pause() { setPlay(false); }
function togglePlay() {
  if (subjKey) {
    if (playDir > 0 && subjT >= 1) setSubjT(0, true);
    else if (playDir < 0 && subjT <= 0) setSubjT(1, true);
  } else {
    if (playDir > 0 && t >= T_MAX) setT(T_MIN);
    else if (playDir < 0 && t <= T_MIN) setT(T_MAX);
  }
  setPlay(!playing);
}
playBtn.addEventListener('click', togglePlay);
// Spacebar toggles play/pause (ignored while typing in the editor's fields)
addEventListener('keydown', (e) => {
  if (e.code !== 'Space' && e.key !== ' ') return;
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) return;
  e.preventDefault();   // no page scroll / native button re-trigger
  togglePlay();
});

// ---------- Playback direction (god view only) ----------
let playDir = 1;
const dirBtn = document.getElementById('dir-toggle');
function setPlayDir(d) {
  playDir = d;
  dirBtn.dataset.dir = String(d);
  dirBtn.textContent = d > 0 ? '→' : '←';
}
dirBtn.addEventListener('click', () => { setPlayDir(playDir > 0 ? -1 : 1); });
function syncDirAvailability() {
  dirBtn.disabled = false;
}

// ---------- View / Location panels ----------
const godFraming = { pos: new THREE.Vector3(70, 85, 95), target: new THREE.Vector3(0, 8, -5) };
const viewPanel = document.getElementById('view-panel');
const viewSelectedEl = document.getElementById('view-selected');
const locPanel = document.getElementById('loc-panel');

function _setViewUI(key) {
  const item = viewPanel.querySelector(`[data-value="${key}"]`);
  if (item) {
    viewSelectedEl.textContent = item.querySelector('.ctrl-name').textContent;
    viewPanel.querySelectorAll('.ctrl-item').forEach(i => i.classList.toggle('active', i === item));
  }
  viewPanel.classList.remove('open');
}
function selectView(key) {
  _setViewUI(key);
  if (key === 'god') { views.goGod(godFraming); exitSubjective(); }
  else { views.followSmooth(key); enterSubjective(key); }
  syncDirAvailability();
}
function goLocation(key) {
  exitSubjective();
  const loc = world.locations[key];
  if (loc) views.goLocation(loc);
  _setViewUI('god');
  locPanel.classList.remove('open');
  syncDirAvailability();
}

document.getElementById('view-header').addEventListener('click', (e) => {
  e.stopPropagation();
  viewPanel.classList.toggle('open');
  locPanel.classList.remove('open');
});
viewPanel.querySelectorAll('.ctrl-item').forEach(btn => {
  btn.addEventListener('click', (e) => { e.stopPropagation(); selectView(btn.dataset.value); });
});
document.getElementById('loc-header').addEventListener('click', (e) => {
  e.stopPropagation();
  locPanel.classList.toggle('open');
  viewPanel.classList.remove('open');
});
locPanel.querySelectorAll('.ctrl-item').forEach(btn => {
  btn.addEventListener('click', (e) => { e.stopPropagation(); goLocation(btn.dataset.value); });
});
document.addEventListener('click', () => {
  viewPanel.classList.remove('open');
  locPanel.classList.remove('open');
});

// ---------- X-ray ----------
const xrayBtn = document.getElementById('xray');
xrayBtn.addEventListener('click', () => {
  const on = xrayBtn.dataset.on !== '1';
  xrayBtn.dataset.on = on ? '1' : '0';
  xrayBtn.classList.toggle('active', on);
  world.setXray(on);
  entities.setXray(on);
});

// ---------- Inverted-time indicator ----------
const invBadge = document.getElementById('inv-badge');
const timelineEl = document.getElementById('timeline');
function setInvertedTime(on) {
  invBadge.classList.toggle('on', on);
  timelineEl.classList.toggle('inverted', on);
}

// ---------- Subjective timeline ----------
// Simple entries: tMin/tMax = raw scene-time bounds; FWD: subjT=0→tMin, INV: subjT=0→tMax.
// Phase entries: continuous multi-phase arcs (like Neil in Stalsk).
//   phases: [{a,b,ta,tb,inv,self}, ...] where [a,b] is the subjT slice and [ta,tb] the t range.

// TP 2: INV phase enters at t=0.736, hits turnstile at t=0.313, then FWD to t=0.714.
const _tp2InvDur  = 0.736 - 0.313;
const _tp2FwdDur  = 0.714 - 0.313;
const _tp2Total   = _tp2InvDur + _tp2FwdDur;
const TP2_MID     = _tp2InvDur / _tp2Total;
const TP2_PHASES  = [
  { a: 0,       b: TP2_MID, ta: 0.736, tb: 0.313, inv: true,  self: 'tp2i' },
  { a: TP2_MID, b: 1,       ta: 0.313, tb: 0.714, inv: false, self: 'tp2f' },
];

// Neil 2: INV phase enters at t=0.376, hits turnstile at t=0.024, then FWD to t=0.846.
const _n2InvDur  = 0.376 - 0.024;
const _n2FwdDur  = 0.846 - 0.024;
const _n2Total   = _n2InvDur + _n2FwdDur;
const NEIL2_MID  = _n2InvDur / _n2Total;
const NEIL2_PHASES = [
  { a: 0,        b: NEIL2_MID, ta: 0.376, tb: 0.024, inv: true,  self: 'neil2i' },
  { a: NEIL2_MID, b: 1,        ta: 0.024, tb: 0.846, inv: false, self: 'neil2f' },
];

const SUBJ = {
  tp:    { name: 'TP (PAST)',   tMin: T_MIN, tMax: T_MAX, inv: () => false },
  neil:  { name: 'NEIL (PAST)', tMin: T_MIN, tMax: T_MAX, inv: () => false },
  tp2:   { name: 'TP 2',        phases: TP2_PHASES },
  neil2: { name: 'NEIL 2',      phases: NEIL2_PHASES },
};

function subjPhaseAt(key, s) {
  const phases = SUBJ[key].phases;
  if (!phases) return null;
  return phases.find(p => s <= p.b) || phases[phases.length - 1];
}
function subjToGlobal(key, s) {
  const p = subjPhaseAt(key, s);
  if (p) { const frac = p.b === p.a ? 0 : (s - p.a) / (p.b - p.a); return p.ta + frac * (p.tb - p.ta); }
  const { tMin, tMax, inv } = SUBJ[key];
  return inv() ? tMax - s * (tMax - tMin) : tMin + s * (tMax - tMin);
}
function globalToSubj(key, rawT) {
  const phases = SUBJ[key].phases;
  if (phases) {
    for (const p of phases) {
      const lo = Math.min(p.ta, p.tb), hi = Math.max(p.ta, p.tb);
      if (rawT >= lo - 1e-6 && rawT <= hi + 1e-6) {
        const frac = p.tb === p.ta ? 0 : (rawT - p.ta) / (p.tb - p.ta);
        return clamp01(p.a + frac * (p.b - p.a));
      }
    }
    return rawT < Math.min(phases[0].ta, phases[0].tb) ? 0 : 1;
  }
  const { tMin, tMax, inv } = SUBJ[key];
  const frac = (rawT - tMin) / (tMax - tMin);
  return inv() ? 1 - clamp01(frac) : clamp01(frac);
}

const subjRow = document.getElementById('subj-row');
const subjTrack = document.getElementById('subj-track');
const subjFill = document.getElementById('subj-fill');
const subjHandle = document.getElementById('subj-handle');
const subjLabel = document.getElementById('subj-label');
const subjDir = document.getElementById('subj-dir');
let subjKey = null, subjT = 0, _subjPhase = null, _pendingSnap = null;

function paintSubj() {
  subjHandle.style.left = `${subjT * 100}%`;
  subjFill.style.width = `${subjT * 100}%`;
  const p = _subjPhase || subjPhaseAt(subjKey, subjT);
  const inv = p ? p.inv : (subjKey ? SUBJ[subjKey].inv() : false);
  subjRow.classList.toggle('inv', inv);
  subjDir.textContent = inv ? '◀ inverted · drag right rewinds' : '▶ forward';
}
const SUBJ_HYST = 0.02;   // after a seam switch, ignore re-crossings until subjT leaves this zone
let _phaseLock = null;    // subjT recorded at the last phase switch (debounce anchor)
function setSubjT(v, _unused = false) {
  const prevPhase = _subjPhase;
  subjT = clamp01(v);

  const cfg = SUBJ[subjKey];
  if (cfg && cfg.phases) {
    const phases = cfg.phases;
    const natural = phases.find(p => subjT <= p.b) || phases[phases.length - 1];
    // Switch AT the seam — snappy in both drag directions. A debounce LOCK (not a band) then
    // suppresses jitter re-crossings until subjT travels clear of the seam zone, so red/blue
    // can't strobe. Travelling well past the seam re-arms it, so the return cut is snappy too.
    if (_phaseLock !== null && Math.abs(subjT - _phaseLock) > SUBJ_HYST) _phaseLock = null;
    if (!_subjPhase) {
      _subjPhase = natural;          // initialise; first real crossing stays snappy (no lock yet)
    } else if (natural !== _subjPhase && _phaseLock === null) {
      _subjPhase = natural;
      _phaseLock = subjT;
    }
  }

  paintSubj();

  // t is ALWAYS the continuous natural mapping. It folds cleanly at the seam (bottoms at the
  // shared frame, never a dead zone, never sends both selves out of view) regardless of which
  // phase the debounce is currently holding for display.
  setT(subjToGlobal(subjKey, subjT));
  if (cfg && cfg.phases) {
    setInvertedTime(_subjPhase ? _subjPhase.inv : false);
    if (_subjPhase !== prevPhase) _pendingSnap = { key: _subjPhase.self, preserve: true };
  } else {
    setInvertedTime(cfg.inv());
  }
}
function enterSubjective(key) {
  if (key === 'god' || !SUBJ[key]) { exitSubjective(); return; }
  subjKey = key;
  subjRow.classList.add('on');
  subjLabel.textContent = `SUBJECTIVE · ${SUBJ[key].name}`;
  subjT = globalToSubj(key, t);
  _subjPhase = subjPhaseAt(key, subjT);
  _phaseLock = null;
  if (_subjPhase) _pendingSnap = { key: _subjPhase.self, preserve: false };
  paintSubj();
}
function exitSubjective() {
  subjKey = null;
  _pendingSnap = null;
  _phaseLock = null;
  subjRow.classList.remove('on', 'inv');
  setInvertedTime(false);
}
// Rect captured at drag-start: the subj-dir label changes width when the phase flips (INV↔FWD),
// which would resize this flex track mid-drag and shift the cursor→fraction mapping. Pinning the
// rect for the whole drag keeps the handle glued to the cursor across the seam.
let _subjRect = null;
function subjToT(clientX) { const r = _subjRect || subjTrack.getBoundingClientRect(); return (clientX - r.left) / r.width; }
function subjMove(e) { setSubjT(subjToT(e.clientX)); }
function subjUp() { _subjRect = null; window.removeEventListener('pointermove', subjMove); window.removeEventListener('pointerup', subjUp); }
subjTrack.addEventListener('pointerdown', (e) => {
  if (!subjKey) return;
  e.preventDefault();
  _subjRect = subjTrack.getBoundingClientRect();
  pause(); setSubjT(subjToT(e.clientX));
  window.addEventListener('pointermove', subjMove);
  window.addEventListener('pointerup', subjUp);
});

// ---------- Intro ----------
const intro = document.getElementById('intro');
if (localStorage.getItem(SEEN_KEY)) intro.classList.add('hidden');
document.getElementById('intro-close').addEventListener('click', () => {
  intro.classList.add('hidden');
  localStorage.setItem(SEEN_KEY, '1');
});
document.getElementById('help').addEventListener('click', () => intro.classList.remove('hidden'));

// ---------- Scene editor (Landmarks) ----------
const editor = new Editor({
  scene, camera, renderer, controls,
  namespace: 'oslo',   // isolate Oslo's saved edits from Stalsk (shared localStorage origin)
  editables: [...world.landmarks.editables, ...entities.edit.actors.map(a => a.obj)],
  actorsApi: entities.edit,
  getTime: () => t,
  onSelectionChange: (actorName) => refreshTimelineMarkers(actorName),
  onSeek: (target) => seekTo(target),
  onEnter: (on) => { if (on) { pause(); selectView('god'); } },
});
const editBtn = document.getElementById('edit-btn');
if (editBtn) {
  editor.editBtn = editBtn;
  editBtn.addEventListener('click', () => editor.toggle());
}

// ---------- Arrow keys: jump between event beats ----------
function markerTimes() {
  const src = (editActorName && entities.edit.tracks[editActorName])
    ? entities.edit.tracks[editActorName].map(f => f.t)
    : EVENTS.map(e => e.t);
  return [...new Set(src)].filter(x => x >= T_MIN && x <= T_MAX).sort((a, b) => a - b);
}

function jumpMarker(dir) {
  const times = markerTimes();
  const eps = 1e-4;
  const target = dir > 0
    ? times.find(x => x > t + eps)
    : [...times].reverse().find(x => x < t - eps);
  if (target === undefined) return;
  seekTo(target);
}
const T_STEP = 0.005;   // smallest scrub step (~1s at the 3-min clock)
addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  e.preventDefault();
  const dir = e.key === 'ArrowRight' ? 1 : -1;
  if (e.shiftKey) jumpMarker(dir);          // Shift+←/→ : jump to prev/next keyframe (or beat)
  else seekTo(t + dir * T_STEP);            // ←/→ : step by the smallest time unit
});

// ---------- Resize ----------
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
});

// ---------- Loop ----------
setT(t);
setPlay(false);
let last = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (playing) {
    if (subjKey) {
      subjT = Math.min(1, Math.max(0, subjT + playDir * dt / DURATION));
      setSubjT(subjT, true);
      if (playDir > 0 && subjT >= 1) setPlay(false);
      if (playDir < 0 && subjT <= 0) setPlay(false);
    } else {
      setT(t + playDir * dt / DURATION);
      if ((playDir > 0 && t >= T_MAX) || (playDir < 0 && t <= T_MIN)) setPlay(false);
    }
  }
  entities.update(t, dt);
  syncCharTags();
  if (editor.active && playing && editor.selected) editor.focusSelected();
  world.update(t);
  if (_pendingSnap) { views.followSmooth(_pendingSnap.key, _pendingSnap.preserve); _pendingSnap = null; }
  views.update(dt);
  controls.update();
  if (editor) editor.tick(dt);
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
// Paint one synchronous frame
entities.update(t, 0.016);
syncCharTags();
world.update(t);
controls.update();
renderer.render(scene, camera);
labelRenderer.render(scene, camera);
requestAnimationFrame(animate);
document.addEventListener('visibilitychange', () => { last = performance.now(); });
