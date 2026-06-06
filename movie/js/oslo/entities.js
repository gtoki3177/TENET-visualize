import * as THREE from 'three';
import { COL, POS } from './config.js';

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

  // ── Keyframes aligned to new room geometry ──
  // Red corridor center x ≈ 8 (+x side)
  // Blue corridor center x ≈ -8 (-x side)
  // Corridors run z=75 (south/loading) to z=5 (north/vault entrance)
  // Vault z ≈ -20, turnstile z ≈ -25
  // Crash hole z ≈ 85

  const redX = 8;   // red corridor center
  const blueX = -8; // blue corridor center

  const tpFwdFrames = [
    { t: 0.15, p: up(redX, 0, 82) },    // Crash hole entry (Red side)
    { t: 0.25, p: up(redX, 0, 40) },    // Red corridor midpoint
    { t: 0.35, p: up(redX, 0, -15) },   // Red side of vault
    { t: 0.45, p: up(redX, 0, -15) },   // Discovers turnstile, fights tpInv
    { t: 0.55, p: up(redX, 0, 10) },    // Pushed out to corridor fighting
    { t: 0.65, p: up(redX, 0, 55) },    // Near loading bay fighting
    { t: 0.70, p: up(redX, 0, 82) },    // Fight ends at crash hole
  ];

  const neilFwdFrames = [
    { t: 0.15, p: up(redX - 4, 0, 82) },  // Crash hole (Red side, behind TP)
    { t: 0.25, p: up(redX - 3, 0, 40) },  // Red corridor
    { t: 0.35, p: up(redX - 3, 0, -15) }, // Red vault
    { t: 0.45, p: up(blueX, 0, -15) },    // Crosses to Blue vault!
    { t: 0.55, p: up(blueX, 0, 30) },     // Chasing tpRev in blue corridor
    { t: 0.65, p: up(blueX, 0, 70) },     // At loading bay
    { t: 0.70, p: up(5, 0, 85) },         // Meets up with TP outside
  ];

  // TP_INV plays backwards visually.
  const tpInvFrames = [
    { t: 0.45, p: up(8, 0, -25) },    // Bursting backward out of Red Turnstile
    { t: 0.55, p: up(redX, 0, -10) }, // Fights TP near vault entrance
    { t: 0.60, p: up(redX, 0, 30) },  // Fights TP in corridor
    { t: 0.65, p: up(redX, 0, 82) },  // Sucked out through crash hole
  ];

  const tpRevFrames = [
    { t: 0.45, p: up(-8, 0, -25) },   // Pops out of Blue cylinder (Forward now!)
    { t: 0.50, p: up(blueX, 0, 20) }, // Runs out blue corridor
    { t: 0.60, p: up(blueX, 0, 65) }, // Runs to loading bay
    { t: 0.65, p: up(-5, 0, 90) },    // Escapes through crash area
  ];

  const neilInvFrames = [
    { t: 0.75, p: up(blueX, 0, 90) },   // Out of ambulance to Blue crash hole
    { t: 0.85, p: up(blueX, 0, 40) },   // Blue corridor
    { t: 0.95, p: up(blueX, 0, -15) },  // Blue vault
    { t: 1.05, p: up(-8, 0, -25) },     // Into Blue turnstile
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
