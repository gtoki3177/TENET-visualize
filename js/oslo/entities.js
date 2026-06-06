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

  // ── Choreography (3-min clock; t 0→1 = 0:00→3:00) ──────────────────────
  // Beats: Neil 2 (red+blue) out of the turnstile first → red Neil 2 inner→mid→top-junction
  // door & waits; blue Neil 2 retreats middle-left → TP+Neil in via the middle RIGHT door →
  // inner room, TP grabs the gun → turnstile spins → red+blue TP 2 appear → TP fights blue
  // TP 2, Neil chases red TP 2 (flees west); blue Neil 2 leaves via the middle right door.
  // The future selves (TP 2 / Neil 2) retreat to the far ambulance by 3:00.
  const D = DOORS;
  const P = (pt, dz = 0, dx = 0) => up(pt.x + dx, 0, pt.z + dz);
  const out = (pt) => up(pt.x * 1.25, 0, pt.z - 14);
  const AMB = up(-35, 0, D.rollE.z - 34);          // far NW ambulance (retreat point)
  const CONN_OUT = up(D.connTop.x, 0, D.connTop.z - 12);

  // Past TP — in via middle-right door, into the inner room, grabs the gun, fights blue TP 2.
  const tpFrames = [
    { t: 0.24, p: out(D.rollE) }, { t: 0.31, p: P(D.rollE) }, { t: 0.39, p: P(D.midR) },
    { t: 0.47, p: P(D.innE) }, { t: 0.55, p: P(D.redCyl, 7) },   // in the room — grabs the gun
    { t: 0.68, p: up(-1, 0, D.blueCyl.z + 6) },                  // turns to fight blue TP 2
    { t: 0.82, p: up(-6, 0, D.blueCyl.z + 3) }, { t: 1.00, p: P(D.innW) },
  ];
  // Past Neil — in with TP, then chases the fleeing red TP 2 out to the west.
  const neilFrames = [
    { t: 0.26, p: out(D.rollE) }, { t: 0.33, p: P(D.rollE) }, { t: 0.41, p: P(D.midR) },
    { t: 0.49, p: P(D.innE) }, { t: 0.58, p: P(D.redCyl, 9) },
    { t: 0.74, p: P(D.innW) }, { t: 0.86, p: P(D.midL) }, { t: 1.00, p: out(D.rollW) },
  ];
  // Future forward Neil (red) — out of the turnstile, inner→mid→top-junction door, waits, then ambulance.
  const neil2fFrames = [
    { t: 0.06, p: P(D.redCyl) }, { t: 0.16, p: P(D.innE) }, { t: 0.26, p: P(D.midR) },
    { t: 0.37, p: P(D.connTop, 4) }, { t: 0.45, p: CONN_OUT }, { t: 0.86, p: CONN_OUT },
    { t: 1.00, p: AMB },
  ];
  // Future inverted Neil (blue) — appears at the turnstile, retreats middle-left, later out via the middle right door.
  const neil2iFrames = [
    { t: 0.06, p: P(D.blueCyl) }, { t: 0.18, p: P(D.innW) }, { t: 0.30, p: P(D.midL) },
    { t: 0.66, p: P(D.midL) }, { t: 0.78, p: P(D.midR) }, { t: 0.88, p: out(D.rollE) },
    { t: 1.00, p: AMB },
  ];
  // Future forward TP (red) — appears as the turnstile returns (~0.62), flees WEST, to the ambulance.
  const tp2fFrames = [
    { t: 0.62, p: P(D.redCyl) }, { t: 0.71, p: P(D.innW) }, { t: 0.81, p: P(D.midL) },
    { t: 0.90, p: out(D.rollW) }, { t: 1.00, p: AMB },
  ];
  // Future inverted TP (blue) — appears at ~0.62, grapples past-TP, then retreats to the ambulance.
  const tp2iFrames = [
    { t: 0.62, p: P(D.blueCyl) }, { t: 0.72, p: up(-2, 0, D.blueCyl.z + 6) },
    { t: 0.84, p: up(-7, 0, D.blueCyl.z + 2) }, { t: 0.92, p: P(D.midL) }, { t: 1.00, p: AMB },
  ];

  // Appearance windows (before/after → hidden).
  const VIS = {
    tp: [0.24, 9], neil: [0.26, 9],
    neil2f: [0.06, 9], neil2i: [0.06, 9],
    tp2f: [0.62, 9], tp2i: [0.62, 9],
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

  const editTracks = { tp: tpFrames, neil: neilFrames, tp2f: tp2fFrames, neil2f: neil2fFrames, tp2i: tp2iFrames, neil2i: neil2iFrames };
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const serTrack = (frames) => frames.map(f => [r3(f.t), r3(f.p.x), r3(f.p.y), r3(f.p.z)]);
  const baseTracks = {};
  for (const k in editTracks) baseTracks[k] = serTrack(editTracks[k]);

  const FREEZE = new Set();
  const edit = {
    freeze: FREEZE, actors: editActors, tracks: editTracks, baseTracks, vis: {}, baseVis: {},
    setVisibility() {}, applyVis() {}, resetVis() {},
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
  };

  function update(t, dt) {
    for (const a of editActors) {
      if (!FREEZE.has(a.name)) kf(editTracks[a.name], t, a.obj.position);
      const v = VIS[a.name];
      a.obj.visible = !v || (t >= v[0] && t <= v[1]);
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
