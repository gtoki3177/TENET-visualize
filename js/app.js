import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildWorld } from './world.js';
import { buildEntities } from './entities.js';
import { ViewManager } from './views.js';
import { Editor } from './editor.js';
import { lerp, clamp01, terrainParams, terrainDefaults } from './config.js';

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
  { t: -0.10, title: 'Both teams airborne — Red Chinooks descending on main LZ, Blue Team inbound on hypocenter (time-inverted)', loc: 'lz' },
  { t: 0.00, title: 'Red Team drops onto the battlefield; inverted Blue Team airlifts out — injured, into the containers (seen in reverse)', loc: 'lz' },
  { t: 0.10, title: 'Battle erupts — Red sees fire & ammo running both forward and backward (inverted Blue & Stalsk fire)', loc: 'turnstile' },
  { t: 0.18, title: 'Protagonist spots Volkov’s helicopter; the splinter unit (TP & Ives only) breaks for the hypocenter', loc: 'cave' },
  { t: 0.28, title: 'They blow a building as a distraction — Red watches it heal bottom-up (Blue’s reversed shot)…', loc: 'building' },
  { t: 0.40, title: 'Neil reverts at the turnstile (blue → red) to move forward and save them', loc: 'turnstile' },
  { t: 0.50, title: '…then Red destroys it top-down — the double-exploding building (5:00)', loc: 'building' },
  { t: 0.54, title: 'TP & Ives run in, missing Neil’s honking car; a tripwire seals the entrance — trapped', loc: 'cave' },
  { t: 0.66, title: 'A locked gate; a dead soldier with a blue armband lies beyond it; Volkov holds the Algorithm', loc: 'vault' },
  { t: 0.74, title: 'Sator orders the kill — the dead soldier (Neil, his After self) revives & takes the bullet; it reverses into the gun', loc: 'vault' },
  { t: 0.82, title: 'The soldier opens the gate; TP & Ives wrest the Algorithm from Volkov, then he flees backward', loc: 'vault' },
  { t: 0.90, title: 'Two ropes drop — Neil lifts the pair out as the bomb detonates', loc: 'detonation' },
  { t: 1.00, title: 'Detonation — the hypocenter is sealed, the Algorithm hidden from the future', loc: 'detonation' },
  { t: 1.05, title: 'Neil walks back to the turnstile — enters, inverts, becomes the After self who locked the gate (story closed)', loc: 'turnstile' },
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

// Blender-style navigation: MIDDLE = orbit, SHIFT+MIDDLE = pan, wheel = zoom; left button
// freed for selection. Pan lets the view leave the god-orbit centre / a followed character.
controls.enablePan = true;
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: THREE.MOUSE.PAN };
// Shift switches the middle button to PAN. Set it on Shift keydown/keyup (BEFORE any click,
// so OrbitControls reads the right value at pointerdown regardless of listener order).
// Attach to this window AND the top/parent window so it fires whether the scene iframe or
// the index shell has keyboard focus.
const _setMid = (pan) => { controls.mouseButtons.MIDDLE = pan ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE; };
const _onShift = (e) => { if (e.key === 'Shift') _setMid(e.type === 'keydown'); };
const _wins = new Set([window]);
try { if (window.top) _wins.add(window.top); } catch (_) {}
try { if (window.parent) _wins.add(window.parent); } catch (_) {}
for (const w of _wins) { w.addEventListener('keydown', _onShift); w.addEventListener('keyup', _onShift); }
renderer.domElement.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });

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

// event markers on the track
for (const ev of EVENTS) {
  const m = document.createElement('button');
  m.className = 'marker ev-marker';
  m.style.left = `${(ev.t - T_MIN) / (T_MAX - T_MIN) * 100}%`;
  m.title = ev.title;
  m.addEventListener('click', (e) => { e.stopPropagation(); setT(ev.t); pause(); if (ev.loc) goLocation(ev.loc); });
  elTrack.appendChild(m);
}

// While editing a CHARACTER, swap the timeline beats for that actor's keyframes —
// click one to jump exactly to that keyframe (to inspect / re-drag it).
let editActorName = null;   // the actor whose keyframes the timeline currently shows
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

// ---------- Scrubbing ----------
// Drag only while the button is held; release anywhere ends it. Window-level move
// means vertical position is irrelevant (only X is read) and the cursor never turns
// into the no-drop symbol. Grab starts anywhere in the (taller) track row.
const elTrackWrap = elTrack.parentElement;
function trackToT(clientX) {
  const r = elTrack.getBoundingClientRect();
  return ((clientX - r.left) / r.width) * (T_MAX - T_MIN) + T_MIN;
}
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
function trackMove(e) { setT(trackToT(e.clientX)); syncSubjFromGlobal(); }
function trackUp() { window.removeEventListener('pointermove', trackMove); window.removeEventListener('pointerup', trackUp); }
elTrackWrap.addEventListener('pointerdown', (e) => {
  if (e.target.classList.contains('marker')) return;   // let the diamond markers handle their own clicks
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
  if (subjKey) { if (subjT >= 1) setSubjT(0); }            // following: subjective track drives playback
  else if (playDir > 0 && t >= T_MAX) setT(T_MIN);          // god view, forward: rewind to start
  else if (playDir < 0 && t <= T_MIN) setT(T_MAX);          // god view, reverse: jump to end
  setPlay(!playing);
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

// ---------- Intro (auto-shown on first visit only; reopen via the "i" button) ----------
const intro = document.getElementById('intro');
if (localStorage.getItem(SEEN_KEY)) intro.classList.add('hidden');
document.getElementById('intro-close').addEventListener('click', () => {
  intro.classList.add('hidden');
  localStorage.setItem(SEEN_KEY, '1');
});
document.getElementById('help').addEventListener('click', () => intro.classList.remove('hidden'));

// ---------- Scene editor (P1 landmarks + P2 character keyframes) ----------
const editor = new Editor({
  scene, camera, renderer, controls,
  editables: [...world.landmarks.editables, ...entities.edit.actors.map(a => a.obj)],
  actorsApi: entities.edit,
  getTime: () => t,
  onSelectionChange: (actorName) => refreshTimelineMarkers(actorName),
  terrainParams, terrainDefaults, rebuildTerrain: () => world.rebuildTerrain(),
  onEnter: (on) => { if (on) { pause(); selectView('god'); } },   // static scene + orbit camera while editing
});
const editBtn = document.getElementById('edit-btn');
editor.editBtn = editBtn;
editBtn.addEventListener('click', () => editor.toggle());

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
addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  e.preventDefault();
  jumpMarker(e.key === 'ArrowRight' ? 1 : -1);
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
