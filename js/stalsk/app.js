import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildWorld } from './world.js';
import { buildEntities } from './entities.js';
import { ViewManager } from './views.js';
import { Editor } from '../editor.js';
import { lerp, clamp01, terrainParams, terrainDefaults } from './config.js';
import { extractObstacles, simulateSquad } from './squads.js';

// Apply saved terrain params (editor P4) BEFORE the world mesh is built from groundHeight.
try { const s = JSON.parse(localStorage.getItem('tenet_scene_edits') || '{}'); if (s && s.terrain) Object.assign(terrainParams, s.terrain); } catch (e) {}

const DURATION = 56;       // seconds for a full 10-minute playthrough
const STORE_KEY = 'tenet_pincer_t';
const SEEN_KEY = 'tenet_pincer_seen';
const T_MIN = -0.12;       // pre-battle prologue (helicopters inbound)
const T_MAX =  1.10;       // aftermath epilogue (Neil returns to turnstile)
const NEIL_EMERGE = 0.40;  // forward/inverted Neil step out of the turnstile here

// Key beats. t in [T_MIN,T_MAX]; t=0→Red 10:00, t=1→detonation.
const EVENTS = [
  { t: -0.10, title: 'Both teams airborne — Red Chinooks descending on main LZ, Blue Team inbound on hypocenter (time-inverted)', loc: 'lz', clip: 'clips/stalsk/01.mp4', clipReverse: 'clips/stalsk/01-rev.mp4' },
  { t: 0.00, title: 'Red Team drops onto the battlefield; inverted Blue Team airlifts out — injured, into the containers (seen in reverse)', loc: 'lz', clip: 'clips/stalsk/02.mp4', clipReverse: 'clips/stalsk/02-rev.mp4' },
  { t: 0.10, title: 'Battle erupts — Red sees fire & ammo running both forward and backward (inverted Blue & Stalsk fire)', loc: 'turnstile', clip: 'clips/stalsk/03.mp4', clipReverse: 'clips/stalsk/03-rev.mp4' },
  { t: 0.18, title: 'Protagonist spots Volkov’s helicopter; the splinter unit (TP & Ives only) breaks for the hypocenter', loc: 'cave', clip: 'clips/stalsk/04.mp4', clipReverse: 'clips/stalsk/04-rev.mp4' },
  { t: 0.28, title: 'They blow a building as a distraction — Red watches it heal bottom-up (Blue’s reversed shot)…', loc: 'building', clip: 'clips/stalsk/05.mp4', clipReverse: 'clips/stalsk/05-rev.mp4' },
  { t: 0.40, title: 'Neil reverts at the turnstile (blue → red) to move forward and save them', loc: 'turnstile', clip: 'clips/stalsk/06.mp4', clipReverse: 'clips/stalsk/06-rev.mp4' },
  { t: 0.50, title: '…then Red destroys it top-down — the double-exploding building (5:00)', loc: 'building', clip: 'clips/stalsk/07.mp4', clipReverse: 'clips/stalsk/07-rev.mp4' },
  { t: 0.54, title: 'TP & Ives run in, missing Neil’s honking car; a tripwire seals the entrance — trapped', loc: 'cave', clip: 'clips/stalsk/08.mp4', clipReverse: 'clips/stalsk/08-rev.mp4' },
  { t: 0.66, title: 'A locked gate; a dead soldier with a blue armband lies beyond it; Volkov holds the Algorithm', loc: 'vault', clip: 'clips/stalsk/09.mp4', clipReverse: 'clips/stalsk/09-rev.mp4' },
  { t: 0.74, title: 'Sator orders the kill — the dead soldier (Neil, his After self) revives & takes the bullet; it reverses into the gun', loc: 'vault', clip: 'clips/stalsk/10.mp4', clipReverse: 'clips/stalsk/10-rev.mp4' },
  { t: 0.82, title: 'The soldier opens the gate; TP & Ives wrest the Algorithm from Volkov, then he flees backward', loc: 'vault', clip: 'clips/stalsk/11.mp4', clipReverse: 'clips/stalsk/11-rev.mp4' },
  { t: 0.90, title: 'Two ropes drop — Neil lifts the pair out as the bomb detonates', loc: 'detonation', clip: 'clips/stalsk/12.mp4', clipReverse: 'clips/stalsk/12-rev.mp4' },
  { t: 1.00, title: 'Detonation — the hypocenter is sealed, the Algorithm hidden from the future', loc: 'detonation', clip: 'clips/stalsk/13.mp4', clipReverse: 'clips/stalsk/13-rev.mp4' },
  { t: 1.05, title: 'Neil walks back to the turnstile — enters, inverts, becomes the After self who locked the gate (story closed)', loc: 'turnstile', clip: 'clips/stalsk/14.mp4', clipReverse: 'clips/stalsk/14-rev.mp4' },
];

// ---------- Scene ----------
const app = document.getElementById('app');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeef1f5);
scene.fog = new THREE.Fog(0xeef1f5, 900, 2600);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 6000);
camera.position.set(120, 480, 560);

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
scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa4b0, 1.05));
const sun = new THREE.DirectionalLight(0xffffff, 1.7);
sun.position.set(160, 260, 120);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera;
sc.near = 10; sc.far = 1800; sc.left = -680; sc.right = 680; sc.top = 680; sc.bottom = -680;
scene.add(sun);

// ---------- Controls ----------
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 18;
controls.maxDistance = 1800;
controls.target.set(170, 0, -40);

// Blender-style navigation: MIDDLE = orbit, wheel = zoom, left freed for selection.
// SHIFT+MIDDLE pans via OrbitControls' OWN built-in shift handling (it swaps a rotate-button
// to pan when shiftKey is held), reading the modifier off the mouse event — so it works
// inside iframes / embedded previews with no keyboard listener needed.
controls.enablePan = true;
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
renderer.domElement.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });  // no middle-click autoscroll

// ---------- Build world + entities ----------
const world = buildWorld(scene);
const entities = buildEntities(scene, world);
const views = new ViewManager(camera, controls, entities.followables);

// ---------- Location labels (CSS2D) ----------
function addLabel(point, text, kind = 'loc', key = null) {
  const el = document.createElement('div');
  el.className = `tag tag-${kind}`;
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
addLabel(world.points.lz, 'MAIN LZ', 'loc', 'lz');
addLabel(world.points.arches, 'ARCHES', 'loc', 'lz');
addLabel(world.points.turnstile, 'TURNSTILE', 'loc', 'turnstile');
addLabel(world.points.entrance, 'BATTLEFIELD ENTRANCE', 'loc', 'turnstile');
addLabel(world.points.building, 'DOUBLE-EXPLODING BLDG (5:00)', 'loc', 'building');
addLabel(world.points.cave, 'TUNNEL ENTRANCE', 'loc', 'cave');
addLabel(world.points.vault, 'ALGORITHM VAULT', 'loc', 'vault');
addLabel(world.points.detonation, 'HYPOCENTER · EXTRACTION', 'loc', 'detonation');

// follow-target tags
function followTag(obj, text, kind, y = 9) {
  const el = document.createElement('div');
  el.className = `tag tag-unit tag-${kind}`;
  el.textContent = text;
  const o = new CSS2DObject(el);
  o.position.set(0, y, 0);
  obj.add(o);
  el._obj2d = o;  // CSS2DRenderer ignores parent.visible — we sync it manually
  return el;
}
// TP & Ives are the splinter unit — label both (TP's tag rides higher so they don't overlap).
const tpTag = followTag(entities.refs.tp, 'PROTAGONIST', 'fwd', 13);
const ivesTag = followTag(entities.refs.ives, 'IVES', 'fwd');
followTag(entities.refs.volkov, 'VOLKOV', 'neutral');
// One Neil, up to three coexisting selves on the field — all just "NEIL", colour
// encodes time-vector. neil = forward (flips blue→red at the turnstile), neil3 =
// his inverted battlefield copy, neilGate = the later self who locks the gate.
const neil1Tag = followTag(entities.refs.neil, 'NEIL', 'inv');
const neil3Tag = followTag(entities.refs.neil3, 'NEIL', 'inv');
followTag(entities.refs.neilGate, 'NEIL', 'inv', 7);

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

// ---------- Event time overrides ----------
// Drag a labelled event marker in EDIT mode to re-time its story beat. Stored as
// { "<origT.toFixed(4)>": newT } keyed by the IMMUTABLE original t (hardcoded in EVENTS)
// so Reset is reliable and the same override applies across reloads / shares.
// Applied BEFORE clip overrides load — clip lookups key by the *current* ev.t.
const EVENT_T_KEY = 'tenet_stalsk_event_t';
function loadEventTimes() {
  try { return JSON.parse(localStorage.getItem(EVENT_T_KEY)) || {}; } catch (e) { return {}; }
}
function saveEventTimes(map) {
  try { localStorage.setItem(EVENT_T_KEY, JSON.stringify(map)); } catch (e) {}
}
for (const ev of EVENTS) ev._origT = ev.t;     // remember the hardcoded default
function applyEventTimes(overrides) {           // mutate ev.t in place; idempotent
  if (!overrides) return;
  for (const ev of EVENTS) {
    const key = ev._origT.toFixed(4);
    if (key in overrides && isFinite(overrides[key])) ev.t = overrides[key];
  }
  EVENTS.sort((a, b) => a.t - b.t);             // currentEvent() picks last ev with t<=now → must be sorted
}
applyEventTimes(loadEventTimes());

// ---------- User-added events ----------
// "+ Add event @ t" in the editor panel creates a new marker. Stored under a stable `id`
// so renames / re-times don't break references and merges with committed clips.json work cleanly.
const ADDED_EVENTS_KEY = 'tenet_stalsk_added_events';
function loadAddedEvents() {
  try { return JSON.parse(localStorage.getItem(ADDED_EVENTS_KEY)) || []; } catch (e) { return []; }
}
function saveAddedEvents(arr) {
  try { localStorage.setItem(ADDED_EVENTS_KEY, JSON.stringify(arr)); } catch (e) {}
}
function snapshotAddedEvents() {
  // Persisted form omits transient fields (_marker, _added) so the file stays diff-friendly.
  return EVENTS.filter(e => e._added).map(e => {
    const o = { id: e.id, t: e.t, title: e.title };
    if (e.loc) o.loc = e.loc;
    return o;
  });
}
for (const aev of loadAddedEvents()) {
  // Empty-string clip fields (vs null) so the "no clip available" checkbox isn't auto-checked.
  const ev = { id: aev.id, t: aev.t, title: aev.title, loc: aev.loc || null, _added: true,
    _origT: aev.t, clip: '', clipReverse: '', clipByView: {} };
  EVENTS.push(ev);
}
EVENTS.sort((a, b) => a.t - b.t);

// Per-event clip-path overrides — editable in edit mode, persisted to localStorage.
// Stored as { "<t.toFixed(3)>": { f: 'forward.mp4', r: 'reverse.mp4' } }.
// Back-compat: old entries were plain strings (forward only) — read transparently.
const CLIP_OVERRIDES_KEY = 'tenet_stalsk_clip_overrides';
const CLIP_JSON_URL = 'clips/stalsk/clips.json';
function loadClipOverrides() {
  try { return JSON.parse(localStorage.getItem(CLIP_OVERRIDES_KEY)) || {}; } catch (e) { return {}; }
}
function saveClipOverrides(map) {
  try { localStorage.setItem(CLIP_OVERRIDES_KEY, JSON.stringify(map)); } catch (e) {}
}
const clipOverrides = {};
// Remember the defaults from the EVENTS literal so Reset can restore them.
// Keyed by a stable identifier (origT for factory events, id for user-added events)
// so EVENTS can be re-sorted and extended without breaking the index correspondence.
const DEFAULT_CLIPS = {};
function defaultKey(ev) { return ev._added ? `id:${ev.id}` : `t:${ev._origT.toFixed(4)}`; }
for (const e of EVENTS) DEFAULT_CLIPS[defaultKey(e)] = {
  // Preserve the exact initial value (null vs '' is meaningful): factory events default to
  // their hardcoded paths or null; added events default to '' so "No clip" is unchecked.
  f: e.clip !== undefined ? e.clip : null,
  r: e.clipReverse !== undefined ? e.clipReverse : null,
  views: e.clipByView ? JSON.parse(JSON.stringify(e.clipByView)) : {},
};
function applyClipOverrides() {
  for (const ev of EVENTS) {
    const key = ev.t.toFixed(3);
    const o = clipOverrides[key];
    const def = DEFAULT_CLIPS[defaultKey(ev)] || { f: null, r: null, views: {} };
    ev.clip        = def.f;
    ev.clipReverse = def.r;
    ev.clipByView  = JSON.parse(JSON.stringify(def.views));
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
  }
}
// Load clip assignments: clips.json (committed base) → localStorage draft on top.
// Async is fine — clips only show on hover, always ready in time.
applyClipOverrides();  // initial pass with hardcoded defaults
fetch(CLIP_JSON_URL)
  .then(r => r.ok ? r.json() : {})
  .catch(() => ({}))
  .then(base => {
    // `__eventTimes` rides along in the committed JSON so teammates inherit re-timed beats
    // together with the clip mappings. Apply first — clip keys depend on ev.t.
    if (base && typeof base.__eventTimes === 'object') {
      applyEventTimes(base.__eventTimes);
      // localStorage draft re-applied LAST so live drafts beat the committed JSON
      // (same precedence the clip overrides use below).
      applyEventTimes(loadEventTimes());
      delete base.__eventTimes;
      refreshEventMarkerPositions();
    }
    // Merge user-added events from the committed JSON. Dedupe by id — local additions
    // win, JSON-only entries get appended so teammates inherit each other's beats.
    if (base && Array.isArray(base.__addedEvents)) {
      const have = new Set(EVENTS.filter(e => e._added).map(e => e.id));
      for (const aev of base.__addedEvents) {
        if (!aev || !aev.id || have.has(aev.id)) continue;
        const ev = { id: aev.id, t: aev.t, title: aev.title, loc: aev.loc || null, _added: true,
          _origT: aev.t, clip: '', clipReverse: '', clipByView: {} };
        EVENTS.push(ev);
        createEventMarker(ev);
      }
      EVENTS.sort((a, b) => a.t - b.t);
      saveAddedEvents(snapshotAddedEvents());
      delete base.__addedEvents;
    }
    const draft = loadClipOverrides();
    // Repopulate: JSON file is the committed base; localStorage overrides for live edits.
    for (const k in clipOverrides) delete clipOverrides[k];
    Object.assign(clipOverrides, base, draft);
    applyClipOverrides();
  });

// Reverse direction = timeline plays backward. Pick the reverse file when available.
function isReverseDir() {
  const b = document.getElementById('dir-toggle');
  return b && b.dataset.dir === '-1';
}
// Current camera POV: 'god' (default), or a character key like 'protagonist', 'neilFwd', etc.
function currentView() {
  const active = document.querySelector('#view-panel .ctrl-item.active');
  return active ? active.dataset.value : 'god';
}
// pickClipPath returns:
//   string  → path to play
//   null    → explicit "no clip available" (caller shows placeholder)
//   ''      → nothing set (silently do nothing)
function pickClipPath(ev) {
  const dir = isReverseDir() ? 'r' : 'f';
  const view = currentView();
  if (view !== 'god' && ev.clipByView && ev.clipByView[view]) {
    const vc = ev.clipByView[view];
    if (dir in vc) return vc[dir];
  }
  const godPath = dir === 'r' ? ev.clipReverse : ev.clip;
  if (godPath === null) return null;
  if (godPath) return godPath;
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
const ceNone     = document.getElementById('ce-none');
const ceSave     = document.getElementById('ce-save');
const ceReset    = document.getElementById('ce-reset');
const ceNoneAll  = document.getElementById('ce-none-all');
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
const ceTitleInput = document.getElementById('ce-title-input');
const ceDelete     = document.getElementById('ce-delete');
function openClipEditor(ev) {
  ceEditingEv = ev;
  ceTitle.textContent = ev.title;
  // User-added events get an editable title field + a Delete button (toggled via .ce-added).
  ceBox.classList.toggle('ce-added', !!ev._added);
  if (ev._added) ceTitleInput.value = ev.title;
  ceViewSel.value = currentView();
  const { f, r, isNone } = inputsForView(ev, ceViewSel.value);
  ceInputF.value = f; ceInputR.value = r;
  ceNone.checked = isNone;
  syncNoneState();
  ceBox.classList.add('on');
  setTimeout(() => {
    // Default-focus the title for added events so the user can rename right away.
    if (ev._added) { ceTitleInput.focus(); ceTitleInput.select(); }
    else { (isNone ? ceNone : ceInputF).focus(); if (!isNone) ceInputF.select(); }
  }, 0);
}
function closeClipEditor() {
  ceBox.classList.remove('on');
  ceBox.classList.remove('ce-added');
  ceEditingEv = null;
}
function commitClipEditor() {
  if (!ceEditingEv) return;
  const key = ceEditingEv.t.toFixed(3);
  const view = ceViewSel.value;
  const cur = clipOverrides[key];
  const base = (typeof cur === 'string') ? { f: cur } : (cur && typeof cur === 'object' ? cur : {});
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
  // Title edit (only for user-added events) — update the live record + marker tooltip + persist.
  if (ceEditingEv._added) {
    const newTitle = (ceTitleInput.value || '').trim() || ceEditingEv.title || 'Untitled event';
    if (newTitle !== ceEditingEv.title) {
      ceEditingEv.title = newTitle;
      if (ceEditingEv._marker) ceEditingEv._marker.title = newTitle;
      saveAddedEvents(snapshotAddedEvents());
      if (currentEvent() === ceEditingEv) elEvent.textContent = newTitle;
    }
  }
  closeClipEditor();
}
function resetClipEditor() {
  if (!ceEditingEv) return;
  const key = ceEditingEv.t.toFixed(3);
  const view = ceViewSel.value;
  const cur = clipOverrides[key];
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
ceViewSel.addEventListener('change', () => {
  if (!ceEditingEv) return;
  const { f, r, isNone } = inputsForView(ceEditingEv, ceViewSel.value);
  ceInputF.value = f; ceInputR.value = r;
  ceNone.checked = isNone;
  syncNoneState();
});
ceNone.addEventListener('change', syncNoneState);
eventBox.addEventListener('click', () => { if (isEditMode()) openClipEditor(currentEvent()); });
function syncEditClass() { document.body.classList.toggle('editing', isEditMode()); }
editBtnEl && editBtnEl.addEventListener('click', () => setTimeout(syncEditClass, 0));
syncEditClass();
// Mark this entire event as no-clip across every POV in one click.
function noClipAllPOVs() {
  if (!ceEditingEv) return;
  const key = ceEditingEv.t.toFixed(3);
  clipOverrides[key] = { f: null, r: null };
  saveClipOverrides(clipOverrides);
  applyClipOverrides();
  closeClipEditor();
}

// Delete the currently-open user-added event. Factory events are not deletable
// here (the button is hidden via .ce-added CSS).
function deleteAddedEvent() {
  if (!ceEditingEv || !ceEditingEv._added) return;
  if (!confirm(`Delete event "${ceEditingEv.title}"? This can't be undone.`)) return;
  const ev = ceEditingEv;
  const key = ev.t.toFixed(3);
  if (ev._marker) ev._marker.remove();
  const i = EVENTS.indexOf(ev);
  if (i >= 0) EVENTS.splice(i, 1);
  delete DEFAULT_CLIPS[defaultKey(ev)];
  if (clipOverrides[key]) { delete clipOverrides[key]; saveClipOverrides(clipOverrides); }
  saveAddedEvents(snapshotAddedEvents());
  closeClipEditor();
  // currentEvent() now picks the previous beat — refresh the header label.
  elEvent.textContent = currentEvent().title;
}

// Add a new event marker at time t0 — invoked from the editor panel's "+ Add event @ t".
// Opens the clip editor right away so the user can name it / set its clip path.
function addEventAtT(t0) {
  const id = 'u' + Date.now().toString(36) + Math.floor(Math.random() * 1e3).toString(36);
  const ev = {
    id, t: Math.max(T_MIN, Math.min(T_MAX, t0)),
    title: 'New event', loc: null,
    _added: true, _origT: t0,
    clip: '', clipReverse: '', clipByView: {},   // empty (not null) → "No clip" checkbox starts unchecked
  };
  EVENTS.push(ev);
  EVENTS.sort((a, b) => a.t - b.t);
  DEFAULT_CLIPS[defaultKey(ev)] = { f: '', r: '', views: {} };
  saveAddedEvents(snapshotAddedEvents());
  createEventMarker(ev);
  openClipEditor(ev);
}

// Export all clip assignments as a downloadable JSON file.
// Save the file as clips/stalsk/clips.json and commit it — everyone gets your clips.
function exportClipsJSON() {
  // Bundle event-time overrides under `__eventTimes` AND user-added events under
  // `__addedEvents` so teammates inherit re-timed beats + new markers together
  // with the clip mappings (clip keys are derived from ev.t).
  const evTimes = loadEventTimes();
  const added = snapshotAddedEvents();
  const meta = {};
  if (Object.keys(evTimes).length) meta.__eventTimes = evTimes;
  if (added.length) meta.__addedEvents = added;
  const payload = Object.keys(meta).length
    ? Object.assign(meta, clipOverrides)
    : clipOverrides;
  const data = JSON.stringify(payload, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'clips-stalsk.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

ceSave.addEventListener('click', commitClipEditor);
ceReset.addEventListener('click', resetClipEditor);
ceNoneAll.addEventListener('click', noClipAllPOVs);
ceX.addEventListener('click', closeClipEditor);
ceDelete.addEventListener('click', deleteAddedEvent);
document.getElementById('ce-export').addEventListener('click', exportClipsJSON);
[ceInputF, ceInputR, ceTitleInput].forEach(inp => inp.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') commitClipEditor();
  else if (e.key === 'Escape') closeClipEditor();
}));

function setT(v, fromPlay = false) {
  t = Math.max(T_MIN, Math.min(T_MAX, v));
  const tc = Math.max(0, Math.min(1, t));  // clamped for clock display
  elRed.textContent = fmt((1 - tc) * 600);
  elBlue.textContent = fmt(tc * 600);
  const pct = (t - T_MIN) / (T_MAX - T_MIN) * 100;
  elHandle.style.left = `${pct}%`;
  elFill.style.width = `${pct}%`;
  const ev = currentEvent();
  elEvent.textContent = ev.title;
  localStorage.setItem(STORE_KEY, t.toFixed(4));
  refreshNeilMenu();
}

// event markers on the track. In EDIT mode, drag a marker left / right to re-time
// its story beat (the clip override that was keyed by the old t is migrated to the new t).
let _evDragMoved = false;   // shared flag: suppresses the click that follows a drag pointerup
let editActorName = null;   // hoisted: createEventMarker reads it to honour kf-vs-event visibility
function createEventMarker(ev) {
  const m = document.createElement('button');
  m.className = 'marker ev-marker' + (ev._added ? ' ev-added' : '');
  m.style.left = `${(ev.t - T_MIN) / (T_MAX - T_MIN) * 100}%`;
  m.title = ev.title;
  ev._marker = m;   // back-reference for refreshEventMarkerPositions()
  m.addEventListener('click', (e) => {
    e.stopPropagation();
    if (_evDragMoved) { _evDragMoved = false; return; }
    setT(ev.t); pause();
    if (ev.loc) goLocation(ev.loc);
    if (isEditMode()) openClipEditor(ev);   // added events have no event-title chip → click marker to edit
  });
  m.addEventListener('pointerdown', (e) => {
    if (!editor.active) return;
    e.stopPropagation();
    pause();
    let moved = false;
    const startX = e.clientX;
    const oldKey = ev.t.toFixed(3);   // pre-drag clip-override key, captured for migration
    const onMove = (mv) => {
      if (!moved && Math.abs(mv.clientX - startX) > 4) { moved = true; document.body.style.cursor = 'ew-resize'; }
      if (!moved) return;
      const newT = Math.max(T_MIN, Math.min(T_MAX, trackToT(mv.clientX)));
      ev.t = newT;
      m.style.left = `${(newT - T_MIN) / (T_MAX - T_MIN) * 100}%`;
      m.title = `${ev.title} @ t=${newT.toFixed(3)}`;
      setT(newT);
    };
    const onUp = () => {
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!moved) return;
      _evDragMoved = true;
      // Persist the new t — user-added events save the WHOLE record; factory events
      // save only the t delta keyed by _origT.
      if (ev._added) saveAddedEvents(snapshotAddedEvents());
      else {
        const evTimes = loadEventTimes();
        evTimes[ev._origT.toFixed(4)] = ev.t;
        saveEventTimes(evTimes);
      }
      // Migrate the clip-override entry so the event's clip mapping follows it.
      const newKey = ev.t.toFixed(3);
      if (oldKey !== newKey && clipOverrides[oldKey]) {
        clipOverrides[newKey] = clipOverrides[oldKey];
        delete clipOverrides[oldKey];
        saveClipOverrides(clipOverrides);
        applyClipOverrides();
      }
      // currentEvent() picks the LAST ev with t <= now — needs sorted order.
      EVENTS.sort((a, b) => a.t - b.t);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
  // While selecting an actor, kf-markers replace event markers (event markers hidden via display:none).
  // Honour that visibility state when a freshly-added event is wired up mid-session.
  if (editActorName) m.style.display = 'none';
  elTrack.appendChild(m);
}
for (const ev of EVENTS) createEventMarker(ev);
// Re-position every event marker from its current ev.t (used after a bulk t change,
// e.g. after the async clips.json fetch applies a `__eventTimes` block).
function refreshEventMarkerPositions() {
  for (const ev of EVENTS) {
    if (ev._marker) ev._marker.style.left = `${(ev.t - T_MIN) / (T_MAX - T_MIN) * 100}%`;
  }
}

// While editing a CHARACTER, swap the timeline beats for that actor's keyframes —
// click one to jump exactly to that keyframe; drag left/right to re-time it.
// editActorName is hoisted above createEventMarker; only `_kfDragMoved` lives here.
let _kfDragMoved = false;   // suppresses the click that follows a drag pointerup
function refreshTimelineMarkers(actorName) {
  editActorName = actorName;
  elTrack.querySelectorAll('.kf-marker').forEach(m => m.remove());
  const showEvents = !actorName;
  elTrack.querySelectorAll('.ev-marker').forEach(m => { m.style.display = showEvents ? '' : 'none'; });
  if (!actorName) return;
  const frames = (entities.edit.tracks[actorName] || []);
  for (const f of frames) {
    if (f.t < T_MIN || f.t > T_MAX) continue;
    const left = `${(f.t - T_MIN) / (T_MAX - T_MIN) * 100}%`;
    // Position marker — only on keys that carry a position; sits on the track.
    let posMarker = null, rotMarker = null;
    if (f.p) {
      posMarker = document.createElement('button');
      posMarker.className = 'marker kf-marker';
      posMarker.style.left = left;
      posMarker.title = `position keyframe @ t=${f.t.toFixed(3)}`;
      elTrack.appendChild(posMarker);
    }
    // Rotation marker — only on keys that carry a rotation (ry); shown ABOVE the track.
    if (f.ry !== undefined) {
      rotMarker = document.createElement('button');
      rotMarker.className = 'marker kf-marker kf-rot-marker';
      rotMarker.style.left = left;
      rotMarker.title = `rotation keyframe @ t=${f.t.toFixed(3)} · ry=${f.ry.toFixed(3)}`;
      elTrack.appendChild(rotMarker);
    }
    // Wire click + drag onto whichever marker(s) exist for this frame.
    for (const m of [posMarker, rotMarker].filter(Boolean)) {
      m.addEventListener('click', (e) => {
        e.stopPropagation();
        if (_kfDragMoved) { _kfDragMoved = false; return; }
        seekTo(f.t);
      });
      // Drag to re-time: slide the diamond, mutate f.t, update the 3D scene live.
      m.addEventListener('pointerdown', (e) => {
        if (!editor.active) return;
        e.stopPropagation();
        pause();
        let moved = false;
        const startX = e.clientX;
        editor.beginKfDrag(actorName);
        const onMove = (ev) => {
          if (!moved && Math.abs(ev.clientX - startX) > 4) { moved = true; document.body.style.cursor = 'ew-resize'; }
          if (!moved) return;
          const newT = Math.max(T_MIN, Math.min(T_MAX, trackToT(ev.clientX)));
          f.t = newT;
          entities.edit.tracks[actorName].sort((a, b) => a.t - b.t);
          const newLeft = `${(newT - T_MIN) / (T_MAX - T_MIN) * 100}%`;
          if (posMarker) { posMarker.style.left = newLeft; posMarker.title = `position keyframe @ t=${newT.toFixed(3)}`; }
          if (rotMarker) { rotMarker.style.left = newLeft; rotMarker.title = `rotation keyframe @ t=${newT.toFixed(3)} · ry=${f.ry.toFixed(3)}`; }
          setT(newT, false);
        };
        const onUp = () => {
          document.body.style.cursor = '';
          if (moved) { _kfDragMoved = true; editor.endKfDrag(actorName); }
          else editor.cancelKfDrag();
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
    }
  }
}

// ---------- Scrubbing ----------
// Drag only while the button is held; release anywhere ends it. Window-level move
// means vertical position is irrelevant (only X is read) and the cursor never turns
// into the no-drop symbol. Grab starts anywhere in the (taller) track row.
const elTrackWrap = elTrack.parentElement;
function trackToT(clientX) {
  const r = elTrack.getBoundingClientRect();
  return ((clientX - r.left) / r.width) * (T_MAX - T_MIN) + T_MIN;
}
// Times to snap to while Shift-dragging: the selected actor's keyframes (else event beats).
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
  if (isNeil(subjKey)) {
    // Scrubbing the MASTER timeline keeps the CURRENT self (no flipping between the
    // coexisting Neils). Map global t back into this phase only; it clamps at the
    // edges of the self's existence, so the view just stops in place there, and
    // dragging back reverses the same self. The self only changes via the subjective track.
    const p = _neilPhase || neilPhaseAt(subjT);
    const frac = clamp01((t - p.ta) / (p.tb - p.ta));
    subjT = Math.min(p.a + frac * (p.b - p.a), p.b - 1e-4);
    paintSubj();   // deliberately NOT applyNeilCamera — the self stays fixed
  } else {
    subjT = invSearch(subjKey, t);
    paintSubj();
  }
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
  if (subjKey) { if (subjT >= 1) setSubjT(0); }            // following: subjective track drives playback
  else if (playDir > 0 && t >= T_MAX) setT(T_MIN);          // god view, forward: rewind to start
  else if (playDir < 0 && t <= T_MIN) setT(T_MAX);          // god view, reverse: jump to end
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
// → forward · ← reverse. While following a character the master clock is driven
// by that character's subjective time, so the toggle is disabled.
let playDir = 1;
const dirBtn = document.getElementById('dir-toggle');
function setPlayDir(d) {
  playDir = d;
  dirBtn.dataset.dir = String(d);
  dirBtn.textContent = d > 0 ? '→' : '←';
  // God-view reverse does NOT swap the timeline colours — the axis is fixed
  // (left = past, right = future). The arrow alone shows the play direction.
}
dirBtn.addEventListener('click', () => { setPlayDir(playDir > 0 ? -1 : 1); });
function syncDirAvailability() {
  // disabled (and reset to forward) while following — subjective time takes over
  dirBtn.disabled = !!subjKey;
  if (subjKey && playDir < 0) setPlayDir(1);
}

// ---------- View / Location expandable panels ----------
const godFraming = { pos: new THREE.Vector3(120, 560, 700), target: new THREE.Vector3(170, 0, -40) };
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
  // Neil's forward/inverted battlefield selves don't exist until they emerge from
  // the turnstile — ignore clicks while their menu item is greyed out.
  if ((key === 'neilFwd' || key === 'neilBwd') && t < NEIL_EMERGE) return;
  _setViewUI(key);
  if (key === 'god') { views.goGod(godFraming); exitSubjective(); }
  else { views.follow(key); enterSubjective(key); }
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

// ---------- X-ray toggle (fade the surface to see underground) ----------
const xrayBtn = document.getElementById('xray');
xrayBtn.addEventListener('click', () => {
  const on = xrayBtn.dataset.on !== '1';
  xrayBtn.dataset.on = on ? '1' : '0';
  xrayBtn.classList.toggle('active', on);
  world.setXray(on);
  entities.setXray(on);   // also let characters render through the faded floor
});

// ---------- Inverted-time indicator ----------
const invBadge = document.getElementById('inv-badge');
const timelineEl = document.getElementById('timeline');
// Light the "time inverted" marker whenever the master clock is running backward.
function setInvertedTime(on) {
  invBadge.classList.toggle('on', on);
  timelineEl.classList.toggle('inverted', on);
}

// ---------- Grey out Neil-FWD / Neil-BWD until they emerge from the turnstile ----------
const neilFwdItem = viewPanel.querySelector('[data-value="neilFwd"]');
const neilBwdItem = viewPanel.querySelector('[data-value="neilBwd"]');
let _neilEmerged = null;
function refreshNeilMenu() {
  const emerged = t >= NEIL_EMERGE;
  if (emerged === _neilEmerged) return;
  _neilEmerged = emerged;
  neilFwdItem.classList.toggle('disabled', !emerged);
  neilBwdItem.classList.toggle('disabled', !emerged);
  neilFwdItem.title = neilBwdItem.title = emerged ? '' : 'Appears once Neil steps out of the turnstile (00:06 mark)';
}

// ---------- Subjective timeline (shown while following a character) ----------
// God view drives the GLOBAL clock. Following a character adds a second track —
// that character's SUBJECTIVE time. If the character is inverted, dragging the
// subjective track right runs the global clock backward.
const SUBJ = {
  red:         { name: 'RED TEAM',    map: s => s,     inv: () => false },
  ives:        { name: 'IVES',        map: s => s,     inv: () => false },
  protagonist: { name: 'PROTAGONIST', map: s => s,     inv: () => false },
  blue:        { name: 'BLUE TEAM',   map: s => 1 - s, inv: () => true },
};

// Neil is ONE continuous subjective experience, not three. The three Neil views are
// just entry points into the same track; the camera hands off between his selves as
// the subjective phase advances. Each phase maps a slice of subjective s to global t.
const neilSelves = {
  bwd:  { obj: entities.refs.neil3,    offset: new THREE.Vector3(-70, 55, 95) },
  foot: { obj: entities.refs.neil,     offset: new THREE.Vector3(-46, 42, 64) }, // the person (rides the car mid-phase)
  gate: { obj: entities.refs.neilGate, offset: new THREE.Vector3(24, 16, 30) },
};
const NEIL_PHASES = [
  { a: 0.00, b: 0.20, ta: 0.94, tb: 0.40, self: 'bwd',  inv: true,  view: 'neilBwd'   }, // off the Blue heli → turnstile
  { a: 0.20, b: 0.55, ta: 0.40, tb: 1.10, self: 'foot', inv: false, view: 'neilFwd'   }, // exit → drive (riding) → walk back
  { a: 0.55, b: 1.00, ta: 1.10, tb: 0.00, self: 'gate', inv: true,  view: 'neilAfter' }, // run to vault → bullet → lie to the start
];
const NEIL_ENTRY = { neilBwd: 0.00, neilFwd: 0.20, neilAfter: 0.55 };
const isNeil = (key) => key === 'neilFwd' || key === 'neilBwd' || key === 'neilAfter';
function neilPhaseAt(s) { for (const p of NEIL_PHASES) if (s < p.b) return p; return NEIL_PHASES[NEIL_PHASES.length - 1]; }
function neilMapT(s) { const p = neilPhaseAt(s); return lerp(p.ta, p.tb, clamp01((s - p.a) / (p.b - p.a))); }

function subjMapT(key, s) { return isNeil(key) ? neilMapT(s) : SUBJ[key].map(s); }
function subjInv(key, s)  { return isNeil(key) ? neilPhaseAt(s).inv : SUBJ[key].inv(s); }
function subjName(key)    { return isNeil(key) ? 'NEIL' : SUBJ[key].name; }

const subjRow = document.getElementById('subj-row');
const subjTrack = document.getElementById('subj-track');
const subjFill = document.getElementById('subj-fill');
const subjHandle = document.getElementById('subj-handle');
const subjLabel = document.getElementById('subj-label');
const subjDir = document.getElementById('subj-dir');
let subjKey = null, subjT = 0, _neilSelfObj = null, _neilPhase = null;

// Hand the follow camera to whichever Neil self owns the current subjective moment,
// and keep the View dropdown labelled with that self.
function applyNeilCamera() {
  if (!isNeil(subjKey)) return;
  const p = neilPhaseAt(subjT);
  _neilPhase = p;
  const sel = neilSelves[p.self];
  if (sel.obj !== _neilSelfObj) {
    _neilSelfObj = sel.obj;
    views.followObject(sel);
    _setViewUI(p.view);   // View dropdown follows the self now on camera
  }
}
function invSearch(key, gt) {        // nearest subjective s whose map(s) ≈ global t
  let best = 0, bd = Infinity;
  for (let i = 0; i <= 200; i++) { const s = i / 200, d = Math.abs(subjMapT(key, s) - gt); if (d < bd) { bd = d; best = s; } }
  return best;
}
function paintSubj() {
  subjHandle.style.left = `${subjT * 100}%`;
  subjFill.style.width = `${subjT * 100}%`;
  const inv = subjKey ? subjInv(subjKey, subjT) : false;
  subjRow.classList.toggle('inv', inv);
  subjDir.textContent = inv ? '◀ inverted · drag right rewinds' : '▶ forward';
}
function setSubjT(v) {
  subjT = clamp01(v);
  paintSubj();
  setT(subjMapT(subjKey, subjT));
  setInvertedTime(subjInv(subjKey, subjT));
  applyNeilCamera();
}
function enterSubjective(key) {
  if (key === 'god' || (!SUBJ[key] && !isNeil(key))) { exitSubjective(); return; }
  subjKey = key;
  subjRow.classList.add('on');
  subjLabel.textContent = `SUBJECTIVE · ${subjName(key)}`;
  if (isNeil(key)) {
    // views.follow(key) already snapped onto this entry self — record it so the
    // first setSubjT doesn't re-trigger a handoff and undo that framing.
    _neilPhase = neilPhaseAt(NEIL_ENTRY[key]);
    _neilSelfObj = neilSelves[_neilPhase.self].obj;
    setSubjT(NEIL_ENTRY[key]);
  } else { subjT = invSearch(key, t); paintSubj(); }
}
function exitSubjective() {
  subjKey = null; _neilSelfObj = null; _neilPhase = null;
  subjRow.classList.remove('on', 'inv');
  setInvertedTime(false);
}
function subjToT(clientX) { const r = subjTrack.getBoundingClientRect(); return (clientX - r.left) / r.width; }
function subjMove(e) { setSubjT(subjToT(e.clientX)); }
function subjUp() { window.removeEventListener('pointermove', subjMove); window.removeEventListener('pointerup', subjUp); }
subjTrack.addEventListener('pointerdown', (e) => {
  if (!subjKey) return;
  e.preventDefault();
  pause(); setSubjT(subjToT(e.clientX));
  window.addEventListener('pointermove', subjMove);
  window.addEventListener('pointerup', subjUp);
});

// ---------- Intro ----------
// Close + SEEN check are handled by the inline script in stalsk.html (runs before module loads).
document.getElementById('help').addEventListener('click', () => document.getElementById('intro').style.display = '');

// ---------- Scene editor (P1 landmarks + P2 character keyframes) ----------
const editor = new Editor({
  scene, camera, renderer, controls,
  editables: [...world.landmarks.editables, ...entities.edit.actors.map(a => a.obj)],
  actorsApi: entities.edit,
  getTime: () => t,
  onSelectionChange: (actorName) => refreshTimelineMarkers(actorName),
  onKfChange: () => setT(t),   // re-evaluate 3D scene after a kf value is edited via inputs
  onAddEvent: (t0) => addEventAtT(t0),
  terrainParams, terrainDefaults, rebuildTerrain: () => world.rebuildTerrain(),
  onEnter: (on) => { if (on) { pause(); selectView('god'); } },   // static scene + orbit camera while editing
});
const editBtn = document.getElementById('edit-btn');
editor.editBtn = editBtn;
editBtn.addEventListener('click', () => editor.toggle());

// ---------- Squad paths: bake at load (after editor overrides → live building positions) ----------
// Deterministic, so moving a building / leader route and reloading re-derives fresh team paths.
let squadObstacles = [];
try {
  squadObstacles = extractObstacles(scene, THREE);
  for (const team of ['red', 'blue']) {
    const cfg = entities.squads[team];
    const lead = entities.edit.tracks[team + '-lead'];   // live leader keyframes (post editor overrides)
    if (lead && lead.length) cfg.route = lead.map(f => ({ t: f.t, x: f.p.x, z: f.p.z }));
    entities.setSquadTracks(team, simulateSquad(cfg, squadObstacles));
  }
} catch (err) { console.warn('squad path bake failed — falling back to straight-line movement', err); }

// ---------- Arrow keys: jump to prev/next marker ----------
// Normally the 14 event beats; while a character is selected in the editor, that
// actor's keyframes instead (matching whatever the timeline is showing).
function markerTimes() {
  const src = (editActorName && entities.edit.tracks[editActorName])
    ? entities.edit.tracks[editActorName].map(f => f.t)
    : EVENTS.map(e => e.t);
  return [...new Set(src)].filter(x => x >= T_MIN && x <= T_MAX).sort((a, b) => a - b);
}
function seekTo(target) {
  setT(target); pause(); syncSubjFromGlobal();
  // When editing a character, follow the camera to where that actor is at this t.
  if (editor.active && editActorName) { entities.update(t, 0.016); editor.focusSelected(); }
}
function jumpMarker(dir) {
  const times = markerTimes();
  if (!times.length) return;
  const eps = 1e-4;
  const target = dir > 0
    ? times.find(x => x > t + eps)
    : [...times].reverse().find(x => x < t - eps);
  if (target === undefined) return;        // already at the first/last marker
  seekTo(target);
}
const T_STEP = 0.004;   // smallest scrub step
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

// Recolour Neil-1's tag to match his current time-state (blue ↔ red).
function syncNeilTag() {
  const fwd = entities.flags.neil1Forward;
  neil1Tag.className = `tag tag-unit tag-${fwd ? 'fwd' : 'inv'}`;
  // CSS2DRenderer ignores parent Group.visible — sync the CSS2DObjects explicitly
  if (neil1Tag._obj2d) neil1Tag._obj2d.visible = entities.refs.neil.visible;
  if (neil3Tag._obj2d) neil3Tag._obj2d.visible = entities.refs.neil3.visible;
  // TP & Ives hide inside the Chinook until they disembark — sync their tags too.
  if (tpTag._obj2d) tpTag._obj2d.visible = entities.refs.tp.visible;
  if (ivesTag._obj2d) ivesTag._obj2d.visible = entities.refs.ives.visible;
}

// ---------- Loop ----------
setT(t);
setPlay(false);
let last = performance.now();
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (playing) {
    if (subjKey) {
      subjT = Math.min(1, subjT + dt / DURATION);
      setSubjT(subjT);
      if (subjT >= 1) setPlay(false);
    } else {
      setT(t + playDir * dt / DURATION, true);
      if ((playDir > 0 && t >= T_MAX) || (playDir < 0 && t <= T_MIN)) setPlay(false);
    }
  }
  entities.update(t, dt);
  // While editing, Play still drives the master clock in god view — keep the camera
  // tracking the selected object so you can watch an actor move along its keyframes.
  if (editor.active && playing && editor.selected) editor.focusSelected();
  syncNeilTag();
  world.update(t);
  views.update(dt);
  controls.update();
  editor.tick();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
// Paint one synchronous frame so the scene is visible even before RAF resumes
entities.update(t, 0.016);
syncNeilTag();
world.update(t);
controls.update();
renderer.render(scene, camera);
labelRenderer.render(scene, camera);
requestAnimationFrame(animate);
// keep the first frame correct if the tab was hidden at load
document.addEventListener('visibilitychange', () => { last = performance.now(); });
