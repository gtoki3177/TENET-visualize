import * as THREE from 'three';
import { COL, POS, DOORS } from './config.js';

function kf(frames, t, out) {
  if (t <= frames[0].t) return out.copy(frames[0].p);
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i], b = frames[i + 1];
    if (t <= b.t) return out.lerpVectors(a.p, b.p, (t - a.t) / (b.t - a.t));
  }
  return out.copy(frames[frames.length - 1].p);
}
const up = (x, y, z) => new THREE.Vector3(x, y, z);

function makeUnit(color, scale = 1, prone = false) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05 });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(2.2 * scale, 6.5 * scale, 4), mat);
  cone.castShadow = true;
  if (prone) { cone.rotation.z = Math.PI / 2; cone.position.y = 1.6 * scale; }
  else { cone.rotation.x = Math.PI; cone.position.y = 3.3 * scale; }
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.8 * scale, 4 * scale, 20),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.3;
  g.add(cone, ring);
  g.userData.mat = mat; g.userData.ring = ring.material;
  return g;
}

function makeStretcher() {
  const g = new THREE.Group();
  const bed = new THREE.Mesh(new THREE.BoxGeometry(4, 0.5, 9), new THREE.MeshStandardMaterial({ color: 0xcccccc }));
  bed.position.y = 2;
  const kat = makeUnit(COL.inverted, 0.9, true); // Blue, prone
  kat.position.y = 2;
  g.add(bed, kat);
  return g;
}

export function buildEntities(scene, world) {
  const root = new THREE.Group();
  scene.add(root);

  // Characters
  const tpFwd = makeUnit(COL.forward, 1.15); root.add(tpFwd);
  const neilFwd = makeUnit(COL.forward, 1.15); root.add(neilFwd);
  const tpInv = makeUnit(COL.inverted, 1.15); root.add(tpInv);
  const tpRev = makeUnit(COL.forward, 1.15); root.add(tpRev);
  const neilInv = makeUnit(COL.inverted, 1.15); root.add(neilInv);
  const stretcher = makeStretcher(); root.add(stretcher);
  const tpInv2 = makeUnit(COL.inverted, 1.15); root.add(tpInv2);

  // ── Keyframes threaded through the hexagon doors (shared geometry: DOORS) ──
  // Each colour has a straight run out its own side: cylinder → inner bottom door →
  // middle SE/SW door → outer SE/SW rolling door → outside.
  const D = DOORS;
  const P = (pt, dz = 0) => up(pt.x, 0, pt.z + dz);
  const out = (pt) => up(pt.x * 1.32, 0, pt.z * 1.28);  // staging just outside a rolling door

  // Protagonist (Forward, red): in the SE rolling door → red cylinder → fight.
  const tpFwdFrames = [
    { t: 0.08, p: out(D.rollE) },
    { t: 0.16, p: P(D.rollE) },
    { t: 0.26, p: P(D.midSE) },
    { t: 0.34, p: P(D.innE) },
    { t: 0.46, p: P(D.redCyl, 2) },                       // at the red turnstile — fight
    { t: 0.58, p: up(D.redCyl.x + 5, 0, D.redCyl.z + 8) },
    { t: 0.70, p: P(D.innE) },
  ];

  // Neil (Forward, red): in the SW rolling door → blue side.
  const neilFwdFrames = [
    { t: 0.14, p: out(D.rollW) },
    { t: 0.22, p: P(D.rollW) },
    { t: 0.32, p: P(D.midSW) },
    { t: 0.42, p: P(D.innW) },
    { t: 0.54, p: P(D.blueCyl, 2) },
    { t: 0.70, p: P(D.blueCyl, 2) },
  ];

  // TP — Inverted self (blue suit), plays backwards: bursts from the red cylinder, back out SE.
  const tpInvFrames = [
    { t: 0.40, p: P(D.redCyl) },
    { t: 0.48, p: P(D.innE) },
    { t: 0.55, p: P(D.midSE) },
    { t: 0.62, p: P(D.rollE) },
    { t: 0.66, p: out(D.rollE) },
  ];

  // TP — Reverted (red again): pops out of the blue cylinder, runs out the SW.
  const tpRevFrames = [
    { t: 0.45, p: P(D.blueCyl) },
    { t: 0.52, p: P(D.innW) },
    { t: 0.58, p: P(D.midSW) },
    { t: 0.64, p: P(D.rollW) },
    { t: 0.66, p: out(D.rollW) },
  ];

  // Neil — Inverted (stretcher): wheeled in from the SW to the blue cylinder.
  const neilInvFrames = [
    { t: 0.75, p: out(D.rollW) },
    { t: 0.83, p: P(D.rollW) },
    { t: 0.92, p: P(D.midSW) },
    { t: 1.00, p: P(D.innW) },
    { t: 1.05, p: P(D.blueCyl) },
  ];

  const followables = {
    tpFwd:   { obj: tpFwd,   offset: up(20, 30, 30),  name: 'TP (Forward)' },
    tpInv:   { obj: tpInv,   offset: up(-25, 30, -35), name: 'TP (Inverted)' },
    tpRev:   { obj: tpRev,   offset: up(-20, 30, 30),  name: 'TP (Reverted)' },
    neilFwd: { obj: neilFwd, offset: up(15, 30, 25),   name: 'Neil (Forward)' },
    neilInv: { obj: neilInv, offset: up(-15, 30, -25),  name: 'Neil (Inverted)' },
  };

  const editActors = [
    { obj: tpFwd,   id: 'char:tpFwd',   name: 'tpFwd',   label: 'TP FWD (Red)' },
    { obj: neilFwd, id: 'char:neilFwd', name: 'neilFwd', label: 'Neil FWD (Red)' },
    { obj: tpInv,   id: 'char:tpInv',   name: 'tpInv',   label: 'TP INV (Blue suit)' },
    { obj: tpRev,   id: 'char:tpRev',   name: 'tpRev',   label: 'TP REV (Red, runs)' },
    { obj: neilInv, id: 'char:neilInv', name: 'neilInv', label: 'Neil INV (Stretcher)' },
  ];
  for (const a of editActors) { a.obj.userData.editId = a.id; a.obj.userData.editKind = 'actor'; a.obj.userData.trackName = a.name; }

  const editTracks = { tpFwd: tpFwdFrames, neilFwd: neilFwdFrames, tpInv: tpInvFrames, tpRev: tpRevFrames, neilInv: neilInvFrames };
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const serTrack = (frames) => frames.map(f => [r3(f.t), r3(f.p.x), r3(f.p.y), r3(f.p.z)]);
  const baseTracks = {};
  for (const k in editTracks) baseTracks[k] = serTrack(editTracks[k]);

  const FREEZE = new Set();
  const edit = {
    freeze: FREEZE, actors: editActors, tracks: editTracks, baseTracks, vis: {}, baseVis: {},
    setVisibility(name, intervals) {},
    applyVis(name, data) {},
    resetVis(name) {},
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
    if (!FREEZE.has('tpFwd')) kf(tpFwdFrames, t, tpFwd.position);
    if (!FREEZE.has('neilFwd')) kf(neilFwdFrames, t, neilFwd.position);
    if (!FREEZE.has('tpInv')) kf(tpInvFrames, t, tpInv.position);
    if (!FREEZE.has('tpRev')) kf(tpRevFrames, t, tpRev.position);
    if (!FREEZE.has('neilInv')) kf(neilInvFrames, t, neilInv.position);

    tpInv.visible = t >= 0.40 && t <= 0.65;
    tpRev.visible = t >= 0.45 && t <= 0.65;
    neilInv.visible = t >= 0.75;
    stretcher.visible = t >= 0.75;
    tpInv2.visible = t >= 0.75;

    stretcher.position.copy(neilInv.position);
    stretcher.position.z -= 6;
    stretcher.position.x -= 2;
    tpInv2.position.copy(neilInv.position);
    tpInv2.position.x += 6;
    tpInv2.position.z -= 4;
  }

  function setXray(on) {
    [tpFwd, neilFwd, tpInv, tpRev, neilInv, stretcher, tpInv2].forEach(g => {
      g.traverse(o => {
        if (!o.isMesh) return;
        o.renderOrder = on ? 6 : 0;
        if (o.material) o.material.depthTest = !on;
      });
    });
  }

  return { root, followables, update, setXray, refs: { tpFwd, neilFwd, tpInv, tpRev }, edit };
}
