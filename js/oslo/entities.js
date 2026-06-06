import * as THREE from 'three';
import { COL, DOORS } from './config.js';

function kf(frames, t, out) {
  if (t <= frames[0].t) return out.copy(frames[0].p);
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i], b = frames[i + 1];
    if (t <= b.t) return out.lerpVectors(a.p, b.p, (t - a.t) / (b.t - a.t));
  }
  return out.copy(frames[frames.length - 1].p);
}
const up = (x, y, z) => new THREE.Vector3(x, y, z);

// Resolve a boolean visibility keyframe track at time t. Empty ⇒ visible. A key {t,on} sets
// the state from t onward (step-hold); BEFORE the first key the state is the inverse of that
// first key, so a lone key reads as "appears at t" (on) / "disappears at t" (off).
function visAt(keys, t) {
  if (!keys || keys.length === 0) return true;
  if (t < keys[0].t) return !keys[0].on;
  let on = keys[0].on;
  for (let i = 0; i < keys.length; i++) { if (keys[i].t <= t) on = keys[i].on; else break; }
  return on;
}

function makeUnit(color, scale = 1) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05 });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(2.2 * scale, 6.5 * scale, 4), mat);
  cone.castShadow = true;
  cone.rotation.x = Math.PI; cone.position.y = 3.3 * scale;
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.8 * scale, 4 * scale, 20),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3;
  g.add(cone, ring);
  g.userData.mat = mat; g.userData.ring = ring.material;
  return g;
}

export function buildEntities(scene, world) {
  const root = new THREE.Group();
  scene.add(root);

  // THREE groups of TP + Neil in this scene:
  //   PAST            — the first break-in (forward time, RED): "TP" / "Neil"
  //   FUTURE forward  — (RED):  "TP 2" / "Neil 2"
  //   FUTURE inverted — (BLUE): "TP 2" / "Neil 2"
  // Colour = time direction (red forward, blue inverted); "2" = the future selves.
  const tp     = makeUnit(COL.forward, 1.15); root.add(tp);
  const neil   = makeUnit(COL.forward, 1.0);  root.add(neil);
  const tp2f   = makeUnit(COL.forward, 1.15); root.add(tp2f);
  const neil2f = makeUnit(COL.forward, 1.0);  root.add(neil2f);
  const tp2i   = makeUnit(COL.inverted, 1.15); root.add(tp2i);
  const neil2i = makeUnit(COL.inverted, 1.0);  root.add(neil2i);

  // ── Choreography BAKED from the editor (2026-06-07). Each row is [t, x, y, z]; edit
  // further in EDIT mode and re-bake. Visibility keys are baked further down (BAKED_VIS). ──
  const mkF = (arr) => arr.map(([t, x, y, z]) => ({ t, p: up(x, y, z) }));
  const BAKED = {
    tp: [[0,89.16,0,18.52],[0.024,38.196,0,-14.013],[0.117,37.946,0,-13.741],[0.134,28.924,0,-8.91],[0.174,27.624,0,0.618],[0.199,12.838,0,14.007],[0.223,-4.484,0,13.84],[0.237,-4.237,0,14.022],[0.294,-6.273,0,-16.337],[0.34,-5.782,0,-13.103],[0.348,-3.185,0,-17.784],[0.364,-3.65,0,-17.322],[0.415,-3.114,0,-1.273],[0.427,-3.126,0,-1.569],[0.431,-3.114,0,-1.273],[0.437,-3.894,0,-2.945],[0.442,-7.443,0,1.998],[0.463,-7.443,0,15.474],[0.504,-4.953,0,15.782],[0.513,4.617,0,15.783],[0.527,4.241,0,16.247],[0.532,2.431,0,16.918],[0.549,2.33,0,15.38],[0.558,7.797,0,16.402],[0.588,27.329,0,2.704],[0.62,13.953,0,13.329],[0.631,21.105,0,7.553],[0.649,32.494,0,-7.345],[0.664,27.499,0,-9.146],[0.694,60.639,0,-14.269],[0.719,67.77,0,-16.426],[0.736,34.707,0,-24.212]],
    neil: [[0,89.16,0,24.52],[0.024,40.648,0,-4.967],[0.117,40.506,0,-5.099],[0.134,29.84,0,-1.779],[0.174,32.886,0,-1.745],[0.204,17.253,0,10.995],[0.223,4.135,0,14.518],[0.237,4.389,0,14.537],[0.294,6.314,0,-16.516],[0.333,6.464,0,-16.507],[0.342,4.544,0,-15.2],[0.359,3.813,0,10.172],[0.363,4.095,0,15.429],[0.372,-8.456,0,14.274],[0.386,-25.907,0,3.739],[0.391,-30.362,0,-1.281],[0.405,-18.859,0,-38.492],[0.413,-16.942,0,-46.031]],
    tp2f: [[0,8,0,-28],[0.314,7.699,0,-28.018],[0.334,7.699,0,-28.018],[0.339,11.267,0,-16.169],[0.359,2.544,0,16.441],[0.371,-14.92,0,14.666],[0.387,-31.052,0,-1.587],[0.406,-15.672,0,-46.274],[0.417,-6.889,0,-46.084],[0.449,-6.18,0,-45.938],[0.479,16.444,0,-45.928],[0.516,29.101,0,-5.246],[0.53,41.768,0,-8.99],[0.583,24.06,0,-67.565],[0.687,94.215,0,-151.634],[0.7,94.215,0,-151.634],[0.714,100.414,0,-163.14]],
    neil2f: [[0,7.571,0,-28],[0.045,7.804,0,-26.299],[0.078,4.375,0,14.881],[0.088,14.55,0,13.648],[0.099,30.454,0,-1.362],[0.126,10.105,0,-59.878],[0.161,8.937,0,-60.319],[0.171,4.113,0,-58.549],[0.7,4.113,0,-58.549],[0.831,116.92,0,-140.464],[0.846,109.789,0,-153.522]],
    tp2i: [[0,-8,0,-28],[0.314,-7.849,0,-27.991],[0.334,-7.698,0,-27.982],[0.34,-5.98,0,-17.456],[0.348,-6.718,0,-17.757],[0.366,-8.74,0,-17.108],[0.415,-10.052,0,-1.308],[0.428,-10.041,0,-1.549],[0.437,-3.897,0,3.759],[0.441,-1.829,0,2.112],[0.463,-1.829,0,15.709],[0.504,1.288,0,15.709],[0.527,0.49,0,15.686],[0.534,4.413,0,13.056],[0.549,8.021,0,15.726],[0.558,11.422,0,13.883],[0.589,32.291,0,-2.181],[0.62,19.82,0,7.845],[0.631,25.274,0,3.482],[0.649,26.797,0,-6.715],[0.664,27.257,0,-4.532],[0.694,54.187,0,-12.173],[0.719,61.651,0,-14.953],[0.736,31.886,0,-31.889]],
    neil2i: [[0,-7.854,0,-28],[0.046,-7.783,0,-27.911],[0.12,-4.031,0,14.593],[0.135,-16.87,0,11.657],[0.161,-30.594,0,-1.853],[0.193,-15.268,0,-45.172],[0.233,17.312,0,-45.769],[0.293,29.741,0,-6.78],[0.308,41.382,0,-9.779],[0.351,26.162,0,-62.592],[0.376,50.652,0,-68.937]],
  };

  const followables = {
    tp:     { obj: tp,     offset: up(22, 32, 36),   name: 'TP (past)' },
    neil:   { obj: neil,   offset: up(16, 30, 30),   name: 'Neil (past)' },
    tp2f:   { obj: tp2f,   offset: up(22, 32, 36),   name: 'TP 2 (future · fwd)' },
    neil2f: { obj: neil2f, offset: up(16, 30, 30),   name: 'Neil 2 (future · fwd)' },
    tp2i:   { obj: tp2i,   offset: up(-22, 32, -36), name: 'TP 2 (future · inv)' },
    neil2i: { obj: neil2i, offset: up(-16, 30, -30), name: 'Neil 2 (future · inv)' },
  };

  const editActors = [
    { obj: tp,     id: 'char:tp',     name: 'tp',     label: 'TP (past)' },
    { obj: neil,   id: 'char:neil',   name: 'neil',   label: 'Neil (past)' },
    { obj: tp2f,   id: 'char:tp2f',   name: 'tp2f',   label: 'TP 2 — fwd (red)' },
    { obj: neil2f, id: 'char:neil2f', name: 'neil2f', label: 'Neil 2 — fwd (red)' },
    { obj: tp2i,   id: 'char:tp2i',   name: 'tp2i',   label: 'TP 2 — inv (blue)' },
    { obj: neil2i, id: 'char:neil2i', name: 'neil2i', label: 'Neil 2 — inv (blue)' },
  ];
  for (const a of editActors) { a.obj.userData.editId = a.id; a.obj.userData.editKind = 'actor'; a.obj.userData.trackName = a.name; }

  const editTracks = { tp: mkF(BAKED.tp), neil: mkF(BAKED.neil), tp2f: mkF(BAKED.tp2f), neil2f: mkF(BAKED.neil2f), tp2i: mkF(BAKED.tp2i), neil2i: mkF(BAKED.neil2i) };
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const serTrack = (frames) => frames.map(f => [r3(f.t), r3(f.p.x), r3(f.p.y), r3(f.p.z)]);
  const baseTracks = {};
  for (const k in editTracks) baseTracks[k] = serTrack(editTracks[k]);

  // Visibility keyframe tracks (boolean step keys). Empty ⇒ always visible. Baked below.
  const BAKED_VIS = { tp2f: [[0.313,1],[0.714,0]], tp2i: [[0.313,1]], neil2f: [[0.024,1],[0.846,0]], neil2i: [[0.024,1]] };
  const baseVisTracks = {}; for (const a of editActors) baseVisTracks[a.name] = (BAKED_VIS[a.name] || []).map(([t, on]) => [t, on]);
  const visTracks = {}; for (const k in baseVisTracks) visTracks[k] = baseVisTracks[k].map(([t, on]) => ({ t, on: !!on }));
  const serVis = (keys) => keys.map(k => [r3(k.t), k.on ? 1 : 0]);

  const FREEZE = new Set();
  const edit = {
    freeze: FREEZE, visMode: 'keys', actors: editActors, tracks: editTracks, baseTracks,
    vis: visTracks, visTracks,
    setVisibility() {},   // legacy interval API no-op
    // ── position keyframes ──
    count(name) { const f = editTracks[name]; return f ? f.length : 0; },
    hasKeyframe(name, t, eps = 0.004) { const f = editTracks[name]; return !!f && f.some(k => Math.abs(k.t - t) < eps); },
    setKeyframe(name, t, pos, eps = 0.004) {
      const f = editTracks[name]; if (!f) return;
      const i = f.findIndex(k => Math.abs(k.t - t) < eps);
      if (i >= 0) f[i].p.copy(pos);
      else { const nf = { t, p: pos.clone() }; const j = f.findIndex(k => k.t > t); if (j < 0) f.push(nf); else f.splice(j, 0, nf); }
    },
    deleteKeyframe(name, t, eps = 0.004) {
      const f = editTracks[name]; if (!f || f.length <= 1) return false;
      const i = f.findIndex(k => Math.abs(k.t - t) < eps);
      if (i >= 0) { f.splice(i, 1); return true; } return false;
    },
    serializeTrack(name) { return serTrack(editTracks[name]); },
    serialize() { const o = {}; for (const k in editTracks) o[k] = serTrack(editTracks[k]); return o; },
    applyTrack(name, data) {
      const f = editTracks[name]; if (!f || !Array.isArray(data)) return;
      f.length = 0; for (const [t, x, y, z] of data) f.push({ t, p: new THREE.Vector3(x, y, z) });
    },
    resetTrack(name) { this.applyTrack(name, baseTracks[name]); },
    // ── visibility keyframes (appear/disappear) ──
    visAt(name, t) { return visAt(visTracks[name], t); },
    visKeyList(name) { return visTracks[name] || []; },
    countVis(name) { const f = visTracks[name]; return f ? f.length : 0; },
    hasVisKey(name, t, eps = 0.004) { const f = visTracks[name]; return !!f && f.some(k => Math.abs(k.t - t) < eps); },
    setVisKey(name, t, on, eps = 0.004) {
      const f = visTracks[name]; if (!f) return;
      const i = f.findIndex(k => Math.abs(k.t - t) < eps);
      if (i >= 0) f[i].on = on;
      else { const nf = { t, on }; const j = f.findIndex(k => k.t > t); if (j < 0) f.push(nf); else f.splice(j, 0, nf); }
    },
    toggleVisKey(name, t, eps = 0.004) { this.setVisKey(name, t, !visAt(visTracks[name], t - 1e-5), eps); },
    deleteVisKey(name, t, eps = 0.004) {
      const f = visTracks[name]; if (!f) return false;
      const i = f.findIndex(k => Math.abs(k.t - t) < eps);
      if (i >= 0) { f.splice(i, 1); return true; } return false;
    },
    serializeVisTrack(name) { return serVis(visTracks[name] || []); },
    serializeVis() { const o = {}; for (const k in visTracks) if (visTracks[k].length) o[k] = serVis(visTracks[k]); return o; },
    applyVis(name, data) {
      const f = visTracks[name]; if (!f) return;
      f.length = 0;
      if (Array.isArray(data)) for (const [t, on] of data) f.push({ t, on: !!on });
    },
    resetVis(name) { this.applyVis(name, baseVisTracks[name]); },
  };

  function update(t, dt) {
    for (const a of editActors) {
      if (!FREEZE.has(a.name)) kf(editTracks[a.name], t, a.obj.position);
      a.obj.visible = visAt(visTracks[a.name], t);
    }
  }

  function setXray(on) {
    [tp, neil, tp2f, neil2f, tp2i, neil2i].forEach(g => g.traverse(o => {
      if (!o.isMesh) return;
      o.renderOrder = on ? 6 : 0;
      if (o.material) o.material.depthTest = !on;
    }));
  }

  return { root, followables, update, setXray, refs: { tp, neil, tp2f, neil2f, tp2i, neil2i }, edit };
}
