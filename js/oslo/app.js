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
  { t: 0.00, title: 'A hijacked 747 explodes outside the freeport — the distraction', loc: 'crash' },
  { t: 0.15, title: 'Protagonist & Neil slip in through the east rolling door', loc: 'hallway' },
  { t: 0.30, title: 'They spiral in to the vault — the Rotas turnstile is running', loc: 'turnstile' },
  { t: 0.45, title: 'A masked figure bursts backward from the turnstile — the Protagonist doesn\'t know it\'s himself', loc: 'turnstile' },
  { t: 0.60, title: 'The fight at the turnstile — forward grapples inverted; bullets un-fire', loc: 'turnstile' },
  { t: 0.80, title: 'The inverted self backs into the blue turnstile and inverts away', loc: 'turnstile' },
  { t: 1.00, title: 'Neil pulls the Protagonist out — the freeport burns behind them', loc: 'crash' },
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
const elHandle = document.getElementById('handle');
const elFill = document.getElementById('track-fill');
const elEvent = document.getElementById('event-label');
const elTrack = document.getElementById('track');

function currentEvent() {
  let e = EVENTS[0];
  for (const ev of EVENTS) if (t >= ev.t - 0.001) e = ev;
  return e;
}

function setT(v) {
  t = Math.max(T_MIN, Math.min(T_MAX, v));
  const tc = Math.max(0, Math.min(1, t));
  elRed.textContent = fmt(tc * 180);      // 3-minute scene (0:00 → 3:00)
  elBlue.textContent = fmt((1 - tc) * 180);
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
  elTrack.querySelectorAll('.kf-marker').forEach(m => m.remove());
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
function syncSubjFromGlobal() {
  if (!subjKey) return;
  subjT = SUBJ[subjKey].inv() ? 1 - clamp01((t - T_MIN) / (T_MAX - T_MIN)) : clamp01((t - T_MIN) / (T_MAX - T_MIN));
  paintSubj();
}
function trackMove(e) { setT(trackToT(e.clientX)); syncSubjFromGlobal(); }
function trackUp() { window.removeEventListener('pointermove', trackMove); window.removeEventListener('pointerup', trackUp); }
elTrackWrap.addEventListener('pointerdown', (e) => {
  // (drag works even when the press starts on a keyframe/event marker)
  e.preventDefault();
  pause(); setT(trackToT(e.clientX)); syncSubjFromGlobal();
  window.addEventListener('pointermove', trackMove);
  window.addEventListener('pointerup', trackUp);
});

// ---------- Play / pause ----------
const playBtn = document.getElementById('play');
function setPlay(p) { playing = p; playBtn.dataset.playing = p ? '1' : '0'; playBtn.textContent = p ? '❚❚' : '▶'; }
function pause() { setPlay(false); }
playBtn.addEventListener('click', () => {
  if (t >= T_MAX) setT(T_MIN);
  setPlay(!playing);
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
  dirBtn.disabled = !!subjKey;
  if (subjKey && playDir < 0) setPlayDir(1);
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
const SUBJ = {
  tp:     { name: 'TP (PAST)',        map: s => s,     inv: () => false },
  neil:   { name: 'NEIL (PAST)',      map: s => s,     inv: () => false },
  tp2f:   { name: 'TP 2 (FWD)',       map: s => s,     inv: () => false },
  neil2f: { name: 'NEIL 2 (FWD)',     map: s => s,     inv: () => false },
  tp2i:   { name: 'TP 2 (INV)',       map: s => 1 - s, inv: () => true },
  neil2i: { name: 'NEIL 2 (INV)',     map: s => 1 - s, inv: () => true },
};

const subjRow = document.getElementById('subj-row');
const subjTrack = document.getElementById('subj-track');
const subjFill = document.getElementById('subj-fill');
const subjHandle = document.getElementById('subj-handle');
const subjLabel = document.getElementById('subj-label');
const subjDir = document.getElementById('subj-dir');
let subjKey = null, subjT = 0;

function paintSubj() {
  subjHandle.style.left = `${subjT * 100}%`;
  subjFill.style.width = `${subjT * 100}%`;
  const inv = subjKey ? SUBJ[subjKey].inv() : false;
  subjRow.classList.toggle('inv', inv);
  subjDir.textContent = inv ? '◀ inverted · drag right rewinds' : '▶ forward';
}
function setSubjT(v) {
  subjT = clamp01(v);
  paintSubj();
  const mapped = SUBJ[subjKey].map(subjT);
  setT(mapped * (T_MAX - T_MIN) + T_MIN);
  setInvertedTime(SUBJ[subjKey].inv());
}
function enterSubjective(key) {
  if (key === 'god' || !SUBJ[key]) { exitSubjective(); return; }
  subjKey = key;
  subjRow.classList.add('on');
  subjLabel.textContent = `SUBJECTIVE · ${SUBJ[key].name}`;
  subjT = SUBJ[key].inv() ? 1 - clamp01((t - T_MIN) / (T_MAX - T_MIN)) : clamp01((t - T_MIN) / (T_MAX - T_MIN));
  paintSubj();
}
function exitSubjective() {
  subjKey = null;
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
      subjT = Math.min(1, subjT + dt / DURATION);
      setSubjT(subjT);
      if (subjT >= 1) setPlay(false);
    } else {
      setT(t + playDir * dt / DURATION);
      if ((playDir > 0 && t >= T_MAX) || (playDir < 0 && t <= T_MIN)) setPlay(false);
    }
  }
  entities.update(t, dt);
  syncCharTags();
  if (editor.active && playing && editor.selected) editor.focusSelected();
  world.update(t);
  views.update(dt);
  controls.update();
  if (editor) editor.tick();
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
