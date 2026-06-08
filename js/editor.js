import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

// Per-scene namespacing: each scene page loads its own editor.js module instance, so these
// module-level keys are independent per scene. A `namespace` (e.g. 'oslo') is appended so
// Stalsk and Oslo edits don't collide in localStorage (both have actors named tp/neil).
const STORE_BASE = 'tenet_scene_edits';
const SLOTS_BASE = 'tenet_scene_slots';
let STORE_KEY = STORE_BASE;
let SLOTS_KEY = SLOTS_BASE;
const round = (v) => Math.round(v * 1000) / 1000;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const TPARAMS = [
  { cat: 'Hill',  k: 'hillR', min: 60, max: 220, step: 5, label: 'radius' },
  { cat: 'Hill',  k: 'hillH', min: 20, max: 90, step: 2, label: 'height' },
  { cat: 'Apron', k: 'apronHalfW', min: 40, max: 150, step: 5, label: 'width' },
  { cat: 'Apron', k: 'apronLen', min: 150, max: 460, step: 10, label: 'length' },
  { cat: 'Basin', k: 'basinR', min: 30, max: 90, step: 2, label: 'radius' },
  { cat: 'Basin', k: 'basinDepth', min: 2, max: 18, step: 1, label: 'wall depth' },
  { cat: 'Basin', k: 'basinFunnel', min: 0, max: 22, step: 1, label: 'funnel depth' },
  { cat: 'Berm',  k: 'bermH', min: 0, max: 80, step: 2, label: 'height' },
  { cat: 'Berm',  k: 'bermCenterZ', min: 40, max: 220, step: 5, label: 'centre Z' },
];
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    if (d.objects || d.tracks || d.visibility || d.terrain)
      return { objects: d.objects || {}, tracks: d.tracks || {}, visibility: d.visibility || {}, terrain: d.terrain };
    return { objects: d, tracks: {}, visibility: {} };   // migrate old flat {editId:{p,r,s}} format
  } catch { return { objects: {}, tracks: {}, visibility: {} }; }
}
function save(d) { localStorage.setItem(STORE_KEY, JSON.stringify(d)); }

// Editor: select a LANDMARK (gizmo → transform override) or a CHARACTER (gizmo at the
// current clock t → a keyframe on that actor's track). Persists to localStorage, applied
// on load. Export/Import JSON, Reset, Ctrl/Cmd+Z undo, orbit recentres on selection.
export class Editor {
  constructor({ scene, camera, renderer, controls, editables, actorsApi, getTime, onEnter, onSelectionChange, onSeek, terrainParams, terrainDefaults, rebuildTerrain, namespace }) {
    if (namespace) { STORE_KEY = STORE_BASE + '_' + namespace; SLOTS_KEY = SLOTS_BASE + '_' + namespace; }
    this.scene = scene; this.camera = camera; this.renderer = renderer;
    this.controls = controls; this.editables = editables;
    this.actorsApi = actorsApi || null; this.getTime = getTime || (() => 0);
    this.onEnter = onEnter; this.onSelectionChange = onSelectionChange; this.onSeek = onSeek || null;
    this.terrainParams = terrainParams || null; this.terrainDefaults = terrainDefaults || {}; this.rebuildTerrain = rebuildTerrain || null;
    this.active = false; this.selected = null;
    this.store = load();
    this.undoStack = [];
    this._wp = new THREE.Vector3();
    this._recenter = null;          // active smooth-recenter tween (selection change)
    this._gizmoMode = 'translate';  // current gizmo mode (translate/rotate/scale)
    this._suppressUndo = false;                 // true mid-scrub (one undo per drag, not per step)
    this._hovered = null; this.hoverHelper = null;
    this._hover = (e) => this.hover(e);
    this._terrainOpen = false;                  // the TERRAIN section is global + collapsed by default
    this.byId = new Map(editables.map(o => [o.userData.editId, o]));

    // base transforms for landmarks (for reset)
    this.bases = new Map();
    for (const o of editables) if (!this.isActor(o))
      this.bases.set(o, { p: o.position.toArray(), r: [o.rotation.x, o.rotation.y, o.rotation.z], s: o.scale.toArray() });

    this.applyAll();

    const tc = new TransformControls(camera, renderer.domElement);
    tc.setSize(0.85);
    tc.addEventListener('dragging-changed', (e) => this.onDrag(e.value));
    tc.addEventListener('objectChange', () => { if (this.selected && !this.isActor(this.selected)) this.recordSelected(); });
    tc.visible = false; tc.enabled = false;
    scene.add(tc);
    this.tc = tc;

    this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2();
    this._pick = (e) => this.pick(e);
    this._key = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
        e.preventDefault(); this.undo();
      }
    };

    this.buildPanel();
  }

  isActor(o) { return !!(o && o.userData.editKind === 'actor'); }
  notifySelection() { if (this.onSelectionChange) this.onSelectionChange(this.isActor(this.selected) ? this.selected.userData.trackName : null); }

  applyAll() {
    for (const o of this.editables) {
      if (this.isActor(o)) continue;
      const e = this.store.objects[o.userData.editId], base = this.bases.get(o);
      o.position.fromArray((e && e.p) || base.p);
      o.rotation.set(...((e && e.r) || base.r));
      o.scale.fromArray((e && e.s) || base.s);
    }
    if (this.actorsApi) {
      for (const name in this.store.tracks) this.actorsApi.applyTrack(name, this.store.tracks[name]);
      for (const name in this.store.visibility) this.actorsApi.applyVis(name, this.store.visibility[name]);
    }
    if (this.terrainParams) { this.applyTerrain(); if (this.rebuildTerrain) this.rebuildTerrain(); }
  }
  applyTerrain() {
    Object.assign(this.terrainParams, this.terrainDefaults);
    if (this.store.terrain) Object.assign(this.terrainParams, this.store.terrain);
  }
  serializeTerrain() {
    const out = {};
    for (const k in this.terrainParams) if (this.terrainParams[k] !== this.terrainDefaults[k]) out[k] = this.terrainParams[k];
    return Object.keys(out).length ? out : null;
  }
  setTerrainParam(k, v) {
    if (!isFinite(v)) return;
    this.pushTerrainUndo();
    this.terrainParams[k] = v;
    const ser = this.serializeTerrain();
    if (ser) this.store.terrain = ser; else delete this.store.terrain;
    save(this.store);
    if (this.rebuildTerrain) this.rebuildTerrain();
  }
  resetTerrain() {
    this.pushTerrainUndo();
    delete this.store.terrain;
    this.applyTerrain(); save(this.store);
    if (this.rebuildTerrain) this.rebuildTerrain();
    this.buildTerrainUI();
  }
  pushTerrainUndo() { if (this._suppressUndo) return; this.undoStack.push({ type: 'terrain', data: this.store.terrain ? { ...this.store.terrain } : undefined }); this._trim(); }

  setActive(on) {
    this.active = on;
    this.tc.enabled = on;
    document.body.classList.toggle('editing', on);
    this.panel.classList.toggle('on', on);
    this.editBtn && this.editBtn.classList.toggle('active', on);
    if (on) {
      this.renderer.domElement.addEventListener('pointerdown', this._pick, true);
      this.renderer.domElement.addEventListener('pointermove', this._hover);
      window.addEventListener('keydown', this._key);
    } else {
      this.renderer.domElement.removeEventListener('pointerdown', this._pick, true);
      this.renderer.domElement.removeEventListener('pointermove', this._hover);
      window.removeEventListener('keydown', this._key);
      this.setHover(null);
      this.deselect();
    }
    if (this.onEnter) this.onEnter(on);
  }
  toggle() { this.setActive(!this.active); }

  // Hover highlight: a yellow box around the editable under the cursor.
  hover(e) {
    if (this.tc.dragging || this.tc.axis) { this.setHover(null); return; }
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hits = this.ray.intersectObjects(this.editables, true);
    let o = null;
    if (hits.length) { o = hits[0].object; while (o && o.userData.editId === undefined) o = o.parent; }
    this.setHover(o);
  }
  setHover(o) {
    if (o === this._hovered) return;
    this._hovered = o;
    if (this.hoverHelper) { this.scene.remove(this.hoverHelper); this.hoverHelper.geometry.dispose(); this.hoverHelper = null; }
    if (o && o !== this.selected) {
      this.hoverHelper = new THREE.BoxHelper(o, 0xffcc00);
      this.hoverHelper.material.depthTest = false;
      this.scene.add(this.hoverHelper);
    }
    this.renderer.domElement.style.cursor = (o && o !== this.selected) ? 'pointer' : '';
  }
  beginScrub() { if (this._suppressUndo) return; this.pushEditsUndo(); this._suppressUndo = true; }
  endScrub() { this._suppressUndo = false; this.buildVisUI(); this.buildTerrainUI(); }
  attachScrub(input, step) {
    let sx, sy, sv, scrubbing = false, pid = null;
    input.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      sx = e.clientX; sy = e.clientY; sv = parseFloat(input.value) || 0; scrubbing = false; pid = e.pointerId;
    });
    input.addEventListener('pointermove', (e) => {
      if (pid === null) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!scrubbing) {
        if (Math.abs(dx) + Math.abs(dy) < 4) return;
        scrubbing = true; this.beginScrub(); try { input.setPointerCapture(pid); } catch (err) {}
        document.body.style.cursor = 'ew-resize'; input.blur();
      }
      const min = input.min !== '' ? parseFloat(input.min) : -Infinity;
      const max = input.max !== '' ? parseFloat(input.max) : Infinity;
      let v = sv + Math.round((dx - dy) / 4) * step;     // drag right/up = bigger; ~4px per step
      v = Math.max(min, Math.min(max, Math.round(v / step) * step));
      v = Math.round(v * 1000) / 1000;
      if (String(v) !== input.value) { input.value = v; input.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    const end = () => {
      if (pid === null) return;
      if (scrubbing) { this.endScrub(); document.body.style.cursor = ''; try { input.releasePointerCapture(pid); } catch (err) {} }
      pid = null; scrubbing = false;
    };
    input.addEventListener('pointerup', end);
    input.addEventListener('pointercancel', end);
  }

  // refresh per-frame readout while editing (clock t / keyframe-here may change on scrub)
  tick(dt = 0.016) {
    if (!this.active) return;
    if (this._recenter) {
      const rc = this._recenter;
      rc.t = Math.min(1, rc.t + dt / rc.dur);
      const k = easeInOut(rc.t);
      this.camera.position.lerpVectors(rc.fromP, rc.toP, k);
      this.controls.target.lerpVectors(rc.fromT, rc.toT, k);
      this.controls.update();
      if (rc.t >= 1) this._recenter = null;
    }
    if (this.isActor(this.selected)) this.refreshActorInfo();
    if (this.hoverHelper) this.hoverHelper.update();
  }

  pick(e) {
    if (e.button !== 0) return;   // only LEFT selects; middle/right are camera orbit/pan
    if (this.tc.axis) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hits = this.ray.intersectObjects(this.editables, true);
    if (!hits.length) return;
    let o = hits[0].object;
    while (o && o.userData.editId === undefined) o = o.parent;
    if (o) this.select(o);
  }
  selectById(id) { const o = this.byId.get(id); if (o) this.select(o); }

  // Re-centre the orbit on the selected object's current world position.
  focusSelected() {
    const o = this.selected; if (!o) return;
    this._recenter = null;          // instant focus cancels any in-flight smooth recenter
    o.getWorldPosition(this._wp);
    this.camera.position.add(this._wp.clone().sub(this.controls.target));
    this.controls.target.copy(this._wp);
    this.controls.update();
  }
  // Smooth version of focusSelected — eases the orbit centre onto the selection's world
  // position while preserving the camera-to-target offset (same angle/distance, just re-centred).
  focusSelectedSmooth(dur = 0.35) {
    const o = this.selected; if (!o) { this._recenter = null; return; }
    o.getWorldPosition(this._wp);
    const fromT = this.controls.target.clone();
    const toT = this._wp.clone();
    const fromP = this.camera.position.clone();
    const toP = fromP.clone().add(toT.clone().sub(fromT));
    this._recenter = { fromT, toT, fromP, toP, t: 0, dur };
  }
  select(o, recenter = true) {
    this.setHover(null);
    this.selected = o; this.tc.attach(o); this.tc.visible = true;
    if (recenter) this.focusSelectedSmooth();
    this.updatePanel(); this.notifySelection();
  }
  deselect() { this.selected = null; this.tc.detach(); this.tc.visible = false; this.updatePanel(); this.notifySelection(); }

  // ---- gizmo drag lifecycle ----
  onDrag(dragging) {
    this.controls.enabled = !dragging;
    const o = this.selected; if (!o) return;
    if (dragging) {
      if (this.isActor(o)) { this.actorsApi.freeze.add(o.userData.trackName); this.pushTrackUndo(o); }
      else this.pushObjUndo(o);
    } else if (this.isActor(o)) {
      this.commitActor(o);
    }
  }
  commitActor(o) {
    const name = o.userData.trackName, t = this.getTime();
    // Rotate-mode drags also record rotation.y onto the keyframe; translate/scale leave it alone.
    const ry = this._gizmoMode === 'rotate' ? o.rotation.y : undefined;
    this.actorsApi.setKeyframe(name, t, o.position, ry);
    this.actorsApi.freeze.delete(name);
    this.store.tracks[name] = this.actorsApi.serializeTrack(name);
    save(this.store); this.updatePanel(); this.notifySelection();
  }
  recordSelected() {       // landmark transform → override
    const o = this.selected; if (!o || this.isActor(o)) return;
    this.store.objects[o.userData.editId] = {
      p: o.position.toArray().map(round),
      r: [o.rotation.x, o.rotation.y, o.rotation.z].map(round),
      s: o.scale.toArray().map(round),
    };
    save(this.store); this.updateReadout();
  }
  setMode(m) { this.tc.setMode(m); this._gizmoMode = m; }

  deleteKeyframe() {
    const o = this.selected; if (!o || !this.isActor(o)) return;
    const name = o.userData.trackName;
    this.pushTrackUndo(o);
    if (this.actorsApi.deleteKeyframe(name, this.getTime())) {
      this.store.tracks[name] = this.actorsApi.serializeTrack(name); save(this.store);
    } else { this.undoStack.pop(); }
    this.updatePanel(); this.notifySelection();
  }

  resetSelected() {
    const o = this.selected; if (!o) return;
    if (this.isActor(o)) {
      const name = o.userData.trackName;
      this.pushEditsUndo();                 // covers both track + visibility
      this.actorsApi.resetTrack(name); delete this.store.tracks[name];
      this.actorsApi.resetVis(name); delete this.store.visibility[name];
    } else {
      this.pushObjUndo(o);
      const b = this.bases.get(o);
      o.position.fromArray(b.p); o.rotation.set(...b.r); o.scale.fromArray(b.s);
      delete this.store.objects[o.userData.editId];
    }
    save(this.store); this.updatePanel(); this.notifySelection();
  }
  resetAll() {
    this.pushEditsUndo();
    this.store = { objects: {}, tracks: {}, visibility: {} }; save(this.store);
    if (this.actorsApi) for (const name in this.actorsApi.tracks) { this.actorsApi.resetTrack(name); this.actorsApi.resetVis(name); }
    this.applyAll(); this.updatePanel(); this.notifySelection();
  }
  exportJSON() { return JSON.stringify(this.store, null, 2); }
  importJSON(str) {
    try {
      const d = JSON.parse(str); this.pushEditsUndo();
      this.store = { objects: (d && d.objects) || {}, tracks: (d && d.tracks) || {}, visibility: (d && d.visibility) || {} };
      if (d && d.terrain) this.store.terrain = d.terrain;
      if (this.actorsApi) for (const name in this.actorsApi.tracks) { this.actorsApi.resetTrack(name); this.actorsApi.resetVis(name); }
      save(this.store); this.applyAll(); this.updatePanel(); this.buildTerrainUI(); return true;
    } catch { return false; }
  }

  // ---- named save slots + file I/O (P5) ----
  loadSlots() { try { return JSON.parse(localStorage.getItem(SLOTS_KEY)) || {}; } catch { return {}; } }
  saveSlots(s) { localStorage.setItem(SLOTS_KEY, JSON.stringify(s)); }
  saveSlot(name) {
    name = (name || '').trim(); if (!name) return;
    const slots = this.loadSlots();
    slots[name] = JSON.parse(JSON.stringify(this.store));
    this.saveSlots(slots); this.refreshSlots(name);
  }
  loadSlot(name) {
    const slots = this.loadSlots(); const d = slots[name]; if (!d) return;
    this.pushEditsUndo();
    this.store = { objects: d.objects || {}, tracks: d.tracks || {}, visibility: d.visibility || {} };
    if (d.terrain) this.store.terrain = d.terrain;
    if (this.actorsApi) for (const n in this.actorsApi.tracks) { this.actorsApi.resetTrack(n); this.actorsApi.resetVis(n); }
    save(this.store); this.applyAll(); this.updatePanel(); this.buildTerrainUI();
  }
  deleteSlot(name) { if (!name) return; const s = this.loadSlots(); delete s[name]; this.saveSlots(s); this.refreshSlots(); }
  refreshSlots(selected) {
    const sel = this.panel.querySelector('#ed-slotpick'); if (!sel) return;
    const names = Object.keys(this.loadSlots());
    sel.innerHTML = '<option value="">— saved —</option>' + names.map(n => `<option${n === selected ? ' selected' : ''}>${n}</option>`).join('');
  }
  downloadJSON() {
    const blob = new Blob([this.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'stalsk12-scene.json';
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  }
  uploadJSON(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { this.importJSON(reader.result); this.buildTerrainUI(); };
    reader.readAsText(file);
  }

  // ---- visibility windows (P3) ----
  setVisibility(name, intervals) {
    this.pushVisUndo(name);
    this.actorsApi.setVisibility(name, intervals);
    this.store.visibility[name] = intervals ? intervals.map(iv => [round(iv[0]), round(iv[1])]) : null;
    save(this.store);
    if (!this._suppressUndo) this.buildVisUI();   // don't rebuild the inputs mid-scrub
  }
  addVisInterval() {
    const o = this.selected; if (!this.isActor(o)) return;
    const name = o.userData.trackName;
    const cur = (this.actorsApi.vis[name] || []).map(iv => [...iv]);
    const t0 = round(this.getTime());
    cur.push([t0, Math.min(round(t0 + 0.1), 1.10)]);
    this.setVisibility(name, cur);
  }
  removeVisInterval(i) {
    const o = this.selected; if (!this.isActor(o)) return;
    const name = o.userData.trackName;
    const cur = (this.actorsApi.vis[name] || []).map(iv => [...iv]);
    cur.splice(i, 1);
    this.setVisibility(name, cur);
  }
  toggleAlways() {
    const o = this.selected; if (!this.isActor(o)) return;
    const name = o.userData.trackName;
    if (this.actorsApi.vis[name]) this.setVisibility(name, null);
    else this.setVisibility(name, [[round(this.getTime()), 1.10]]);
  }
  commitVis() {
    const o = this.selected; if (!this.isActor(o)) return;
    const name = o.userData.trackName;
    if (!this.actorsApi.vis[name]) return;
    const rows = {};
    this.panel.querySelectorAll('#ed-vis .ed-vin').forEach(inp => {
      const i = +inp.dataset.i, k = +inp.dataset.k;
      (rows[i] = rows[i] || [])[k] = parseFloat(inp.value);
    });
    const intervals = Object.keys(rows).map(Number).sort((a, b) => a - b)
      .map(i => rows[i]).filter(iv => iv.length === 2 && isFinite(iv[0]) && isFinite(iv[1]));
    this.setVisibility(name, intervals);
  }
  pushVisUndo(name) {
    if (this._suppressUndo) return;
    const api = this.actorsApi;
    const data = api.serializeVisTrack ? api.serializeVisTrack(name)
               : (api.vis[name] ? api.vis[name].map(iv => [...iv]) : null);
    this.undoStack.push({ type: 'vis', name, dirtyBefore: name in this.store.visibility, data });
    this._trim();
  }

  // ---- undo (Ctrl/Cmd+Z) ----
  pushObjUndo(o) {
    const id = o.userData.editId;
    this.undoStack.push({ type: 'obj', obj: o, hadOverride: id in this.store.objects,
      t: { p: o.position.toArray(), r: [o.rotation.x, o.rotation.y, o.rotation.z], s: o.scale.toArray() } });
    this._trim();
  }
  pushTrackUndo(o) {
    const name = o.userData.trackName;
    this.undoStack.push({ type: 'track', name, dirtyBefore: name in this.store.tracks, data: this.actorsApi.serializeTrack(name) });
    this._trim();
  }
  pushEditsUndo() { this.undoStack.push({ type: 'store', store: JSON.parse(JSON.stringify(this.store)) }); this._trim(); }
  _trim() { if (this.undoStack.length > 120) this.undoStack.shift(); }
  undo() {
    const e = this.undoStack.pop(); if (!e) return;
    if (e.type === 'obj') {
      e.obj.position.fromArray(e.t.p); e.obj.rotation.set(...e.t.r); e.obj.scale.fromArray(e.t.s);
      if (e.hadOverride) this.store.objects[e.obj.userData.editId] = { p: e.t.p.map(round), r: e.t.r.map(round), s: e.t.s.map(round) };
      else delete this.store.objects[e.obj.userData.editId];
      save(this.store); this.select(e.obj, false);
    } else if (e.type === 'track') {
      this.actorsApi.applyTrack(e.name, e.data);
      if (e.dirtyBefore) this.store.tracks[e.name] = e.data; else delete this.store.tracks[e.name];
      save(this.store);
    } else if (e.type === 'vis') {
      this.actorsApi.applyVis(e.name, e.data);
      if (e.dirtyBefore) this.store.visibility[e.name] = e.data; else delete this.store.visibility[e.name];
      save(this.store);
    } else if (e.type === 'terrain') {
      if (e.data) this.store.terrain = e.data; else delete this.store.terrain;
      this.applyTerrain(); save(this.store);
      if (this.rebuildTerrain) this.rebuildTerrain();
      this.buildTerrainUI();
    } else if (e.type === 'store') {
      this.store = e.store; save(this.store);
      if (this.actorsApi) for (const name in this.actorsApi.tracks) { this.actorsApi.resetTrack(name); this.actorsApi.resetVis(name); }
      this.applyAll(); this.buildTerrainUI();
    }
    this.updatePanel(); this.notifySelection();
  }

  // ---- panel ----
  buildPanel() {
    const actorOpts = (this.actorsApi ? this.actorsApi.actors : [])
      .map(a => `<option value="${a.id}">${a.label}</option>`).join('');
    const wrap = document.createElement('div');
    wrap.className = 'editor-panel';
    wrap.innerHTML = `
      <div class="ed-head"><span>SCENE EDITOR · P3</span><button class="ed-x" data-act="close">✕</button></div>
      <select class="ed-pick" id="ed-pick"><option value="">— pick a character —</option>${actorOpts}</select>
      <div class="ed-sel" id="ed-sel">— click an object —</div>
      <div class="ed-modes">
        <button data-mode="translate" class="on">Move</button>
        <button data-mode="rotate">Rotate</button>
        <button data-mode="scale">Scale</button>
      </div>
      <div class="ed-read" id="ed-read"></div>
      <div class="ed-actor" id="ed-actor">
        <div class="ed-kf" id="ed-kf"></div>
        <button data-act="delkey" id="ed-delkey">Delete keyframe @ t</button>
        <div class="ed-vis" id="ed-vis"></div>
      </div>
      <div class="ed-row">
        <button data-act="reset">Reset object</button>
        <button data-act="deselect">Deselect</button>
      </div>
      <div class="ed-terrain" id="ed-terrain"></div>
      <div class="ed-row">
        <button data-act="export">Export</button>
        <button data-act="import">Import</button>
        <button data-act="resetall">Reset all</button>
      </div>
      <textarea class="ed-json" id="ed-json" spellcheck="false" placeholder="JSON of all edits — Export to read, paste + Import to load"></textarea>
      <div class="ed-saves">
        <div class="ed-tlabel">SAVES</div>
        <div class="ed-row"><input class="ed-slot" id="ed-slotname" placeholder="slot name" spellcheck="false"><button data-act="slotsave">Save</button></div>
        <div class="ed-row"><select class="ed-slot" id="ed-slotpick"></select><button data-act="slotload">Load</button><button data-act="slotdel">Del</button></div>
        <div class="ed-row"><button data-act="download">⤓ .json</button><button data-act="upload">⤒ .json</button></div>
      </div>
      <input type="file" id="ed-file" accept="application/json,.json" style="display:none">
      <div class="ed-help">
        <b>Landmarks</b> click → gizmo (Move/Rotate/Scale). <b>Characters</b> scrub the time, drag = keyframe;
        Show/Hide-from-t keys the appear/disappear. Numbers <b>drag to scrub</b>. <b>←/→</b> step ·
        <b>Shift+←/→</b> jump keyframe. <b>Ctrl+Z</b> undo. Auto-saves.
      </div>`;
    document.body.appendChild(wrap);
    this.panel = wrap;

    wrap.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
      this.setMode(b.dataset.mode);
      wrap.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === b));
    }));
    wrap.querySelector('#ed-pick').addEventListener('change', (e) => { if (e.target.value) this.selectById(e.target.value); });
    const ta = wrap.querySelector('#ed-json');
    wrap.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
      switch (b.dataset.act) {
        case 'close': this.setActive(false); break;
        case 'reset': this.resetSelected(); break;
        case 'deselect': this.deselect(); break;
        case 'delkey': this.deleteKeyframe(); break;
        case 'export': ta.value = this.exportJSON(); ta.select(); break;
        case 'import': ta.value = this.importJSON(ta.value) ? '✓ applied' : '✗ invalid JSON'; break;
        case 'resetall': if (confirm('Reset ALL scene edits?')) this.resetAll(); break;
        case 'slotsave': { const n = wrap.querySelector('#ed-slotname'); this.saveSlot(n.value); n.value = ''; break; }
        case 'slotload': this.loadSlot(wrap.querySelector('#ed-slotpick').value); break;
        case 'slotdel': this.deleteSlot(wrap.querySelector('#ed-slotpick').value); break;
        case 'download': this.downloadJSON(); break;
        case 'upload': wrap.querySelector('#ed-file').click(); break;
      }
    }));
    wrap.querySelector('#ed-file').addEventListener('change', (e) => { this.uploadJSON(e.target.files[0]); e.target.value = ''; });
    this.updatePanel();
    this.buildTerrainUI();
    this.refreshSlots();
  }
  updatePanel() {
    const o = this.selected;
    this.panel.querySelector('#ed-sel').textContent = o ? o.userData.editId : '— click an object —';
    this.panel.querySelector('#ed-pick').value = (o && this.isActor(o)) ? o.userData.editId : '';
    this.panel.querySelector('#ed-actor').style.display = this.isActor(o) ? 'block' : 'none';
    this.updateReadout();
    this.refreshActorInfo();
    this.buildVisUI();
  }
  buildVisUI() {
    const host = this.panel.querySelector('#ed-vis'), o = this.selected;
    if (!this.isActor(o) || !this.actorsApi) { host.innerHTML = ''; return; }
    const name = o.userData.trackName;
    if (this.actorsApi.visMode === 'keys') { this.buildVisKeysUI(host, name); return; }
    const iv = this.actorsApi.vis[name];
    let html = `<div class="ed-vlabel">Visible (t)${iv ? '' : ': <b>always</b>'}</div>`;
    if (iv) iv.forEach((seg, i) => {
      html += `<div class="ed-vrow"><input class="ed-vin" data-i="${i}" data-k="0" value="${seg[0]}"><span>–</span>` +
              `<input class="ed-vin" data-i="${i}" data-k="1" value="${seg[1]}"><button class="ed-vdel" data-i="${i}" title="remove">✕</button></div>`;
    });
    html += `<div class="ed-vbtns"><button data-vact="add">+ window</button><button data-vact="always">${iv ? 'always' : 'add window'}</button></div>`;
    host.innerHTML = html;
    host.querySelectorAll('.ed-vin').forEach(inp => {
      inp.addEventListener('change', () => this.commitVis());
      this.attachScrub(inp, 0.01);
    });
    host.querySelectorAll('.ed-vdel').forEach(b => b.addEventListener('click', () => this.removeVisInterval(+b.dataset.i)));
    const addB = host.querySelector('[data-vact="add"]'); if (addB) addB.addEventListener('click', () => this.addVisInterval());
    const alwB = host.querySelector('[data-vact="always"]'); if (alwB) alwB.addEventListener('click', () => this.toggleAlways());
  }
  // visibility as on/off step keyframes (visMode === 'keys')
  buildVisKeysUI(host, name) {
    const api = this.actorsApi, keys = api.visKeyList(name), t = this.getTime();
    const here = api.hasVisKey(name, t), fmt = (x) => (Math.round(x * 1000) / 1000).toString();
    let html = `<div class="ed-vlabel">Visibility · ${keys.length} key${keys.length === 1 ? '' : 's'} · now <b id="ed-vnow">${api.visAt(name, t) ? 'shown' : 'hidden'}</b></div>`;
    if (keys.length) html += '<div class="ed-vkeys">' + keys.map(k =>
      `<span class="ed-vchip ${k.on ? 'on' : 'off'}" data-t="${k.t}" title="click to seek">${fmt(k.t)} · ${k.on ? 'show' : 'hide'}</span>`).join('') + '</div>';
    html += `<div class="ed-vbtns">` +
      `<button data-vk="show">👁 Show from t</button>` +
      `<button data-vk="hide">⦸ Hide from t</button>` +
      `<button data-vk="del" id="ed-vkdel"${here ? '' : ' disabled'}>✕ key@t</button></div>`;
    host.innerHTML = html;
    host.querySelectorAll('.ed-vchip').forEach(c => c.addEventListener('click', () => { if (this.onSeek) this.onSeek(parseFloat(c.dataset.t)); }));
    host.querySelector('[data-vk="show"]').addEventListener('click', () => this.visSetHere(true));
    host.querySelector('[data-vk="hide"]').addEventListener('click', () => this.visSetHere(false));
    const db = host.querySelector('[data-vk="del"]'); if (db) db.addEventListener('click', () => this.visDeleteHere());
  }
  visSetHere(on) {
    const o = this.selected; if (!this.isActor(o)) return;
    const name = o.userData.trackName;
    this.pushVisUndo(name);
    this.actorsApi.setVisKey(name, round(this.getTime()), on);
    this.store.visibility[name] = this.actorsApi.serializeVisTrack(name);
    save(this.store); this.buildVisUI(); this.notifySelection();
  }
  visDeleteHere() {
    const o = this.selected; if (!this.isActor(o)) return;
    const name = o.userData.trackName;
    this.pushVisUndo(name);
    if (this.actorsApi.deleteVisKey(name, this.getTime())) {
      const ser = this.actorsApi.serializeVisTrack(name);
      if (ser.length) this.store.visibility[name] = ser; else delete this.store.visibility[name];
      save(this.store); this.buildVisUI(); this.notifySelection();
    } else this.undoStack.pop();
  }
  buildTerrainUI() {
    const host = this.panel.querySelector('#ed-terrain');
    if (!host) return;
    if (!this.terrainParams) { host.innerHTML = ''; return; }
    const open = this._terrainOpen;
    let html = `<div class="ed-tlabel ed-thead" data-tact="toggle">${open ? '▾' : '▸'} TERRAIN · whole scene</div>`;
    if (open) {
      let lastCat = null;
      for (const p of TPARAMS) {
        if (p.cat !== lastCat) { html += `<div class="ed-tcat">${p.cat}</div>`; lastCat = p.cat; }
        html += `<div class="ed-trow"><label>${p.label}</label>` +
          `<input class="ed-tin" type="number" data-k="${p.k}" min="${p.min}" max="${p.max}" step="${p.step}" value="${this.terrainParams[p.k]}"></div>`;
      }
      html += `<button class="ed-tbtn" data-tact="reset">Reset terrain</button>`;
    }
    host.innerHTML = html;
    const hd = host.querySelector('[data-tact="toggle"]');
    if (hd) hd.addEventListener('click', () => { this._terrainOpen = !this._terrainOpen; this.buildTerrainUI(); });
    if (open) {
      host.querySelectorAll('.ed-tin').forEach(inp => {
        inp.addEventListener('change', () => this.setTerrainParam(inp.dataset.k, parseFloat(inp.value)));
        this.attachScrub(inp, parseFloat(inp.step) || 1);
      });
      const rb = host.querySelector('[data-tact="reset"]'); if (rb) rb.addEventListener('click', () => this.resetTerrain());
    }
  }
  updateReadout() {
    const el = this.panel.querySelector('#ed-read'), o = this.selected;
    if (!o) { el.textContent = ''; return; }
    const f = (v) => v.toFixed(1);
    el.innerHTML = `pos&nbsp; ${f(o.position.x)}, ${f(o.position.y)}, ${f(o.position.z)}` +
      (this.isActor(o) ? '' : `<br>rotY ${f(o.rotation.y)} &nbsp;·&nbsp; scale ${f(o.scale.x)}, ${f(o.scale.y)}, ${f(o.scale.z)}`);
  }
  refreshActorInfo() {
    const o = this.selected; if (!this.isActor(o) || !this.actorsApi) return;
    const name = o.userData.trackName, t = this.getTime();
    const here = this.actorsApi.hasKeyframe(name, t);
    this.panel.querySelector('#ed-kf').innerHTML =
      `track <b>${name}</b> · ${this.actorsApi.count(name)} keys<br>clock t = ${t.toFixed(3)} · ${here ? 'keyframe HERE' : 'no keyframe here'}`;
    const del = this.panel.querySelector('#ed-delkey');
    del.disabled = !here; del.style.opacity = here ? 1 : 0.4;
    if (this.actorsApi.visMode === 'keys') {
      const vnow = this.panel.querySelector('#ed-vnow');
      if (vnow) vnow.textContent = this.actorsApi.visAt(name, t) ? 'shown' : 'hidden';
      const vdel = this.panel.querySelector('#ed-vkdel');
      if (vdel) vdel.disabled = !this.actorsApi.hasVisKey(name, t);
    }
  }
}
