import * as THREE from 'three';
import { COL, POS, HEX, RINGS } from './config.js';

// ── Helpers ──────────────────────────────────────────────
function edged(mesh, color = COL.edge, opacity = 0.45) {
  const e = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity })
  );
  e.position.copy(mesh.position);
  e.rotation.copy(mesh.rotation);
  e.scale.copy(mesh.scale);
  const g = new THREE.Group();
  g.add(mesh, e);
  return g;
}

function track(mat, arr) { arr.push(mat); return mat; }

// Corner list (THREE.Vector2 where .x = world x, .y = world z).
const V2 = ([x, z]) => new THREE.Vector2(x, z);
function edgeInfo(corners, i) {
  const a = corners[i], b = corners[(i + 1) % corners.length];
  const dx = b.x - a.x, dz = b.y - a.y;
  const len = Math.hypot(dx, dz);
  return { a, b, len, ang: Math.atan2(dz, dx), dirx: dx / len, dirz: dz / len };
}
// Point on edge i at fraction f (0..1).
function pointOnEdge(corners, i, f) {
  const { a, dirx, dirz, len } = edgeInfo(corners, i);
  return new THREE.Vector2(a.x + dirx * f * len, a.y + dirz * f * len);
}

// ── Main build ───────────────────────────────────────────
export function buildLandmarks(root) {
  const editables = [];
  const tag = (o, id) => { o.userData.editId = id; o.userData.editLabel = id; editables.push(o); return o; };
  const surfaceMats = [];
  const glassPanels = [];

  // ── Material Library ───────────────────────────────────
  const extWallMat   = track(new THREE.MeshStandardMaterial({ color: COL.concrete,    roughness: 0.92 }), surfaceMats);
  const midWallMat   = track(new THREE.MeshStandardMaterial({ color: COL.wallInner,   roughness: 0.88 }), surfaceMats);
  const innWallMat   = track(new THREE.MeshStandardMaterial({ color: COL.wall,        roughness: 0.85 }), surfaceMats);
  const partMat      = track(new THREE.MeshStandardMaterial({ color: COL.concreteDark, roughness: 0.8 }), surfaceMats);
  const floorOutMat  = track(new THREE.MeshStandardMaterial({ color: COL.floor,       roughness: 0.7,  metalness: 0.05, side: THREE.DoubleSide }), surfaceMats);
  const floorMidMat  = track(new THREE.MeshStandardMaterial({ color: 0x8a9098,        roughness: 0.6,  metalness: 0.05, side: THREE.DoubleSide }), surfaceMats);
  const floorInMat   = track(new THREE.MeshStandardMaterial({ color: 0x676c72,        roughness: 0.45, metalness: 0.1,  side: THREE.DoubleSide }), surfaceMats);
  const metalMat     = track(new THREE.MeshStandardMaterial({ color: COL.metal,       roughness: 0.5, metalness: 0.35 }), surfaceMats);
  const metalDarkMat = track(new THREE.MeshStandardMaterial({ color: COL.metalDark,   roughness: 0.6, metalness: 0.4 }), surfaceMats);
  const boxMat       = track(new THREE.MeshStandardMaterial({ color: COL.crate,       roughness: 0.88 }), surfaceMats);
  const boxLightMat  = track(new THREE.MeshStandardMaterial({ color: COL.crateLight,  roughness: 0.85 }), surfaceMats);
  const shutterMat   = track(new THREE.MeshStandardMaterial({ color: 0x6b7178,        roughness: 0.6, metalness: 0.45 }), surfaceMats);
  const shutterRail  = track(new THREE.MeshStandardMaterial({ color: COL.metalDark,   roughness: 0.55, metalness: 0.5 }), surfaceMats);
  const scorchMat    = track(new THREE.MeshStandardMaterial({ color: 0x2a2420,        roughness: 0.95 }), surfaceMats);

  // The three concentric rings (shared geometry from config; Vector2 x/z).
  const innerC = RINGS.inner.map(V2);
  const midC   = RINGS.mid.map(V2);
  const outerC = RINGS.outer.map(V2);

  // ── Hexagonal wall ring builder ──
  // openings: { [edgeIndex]: [ {at, w}, ... ] } — leaves doorway gaps on that edge.
  // skip: Set of edge indices to omit entirely (e.g. the middle ring's merged top edge).
  function buildRing(group, corners, h, wt, mat, openings = {}, skip = null) {
    for (let i = 0; i < corners.length; i++) {
      if (skip && skip.has(i)) continue;
      const { a, len, ang, dirx, dirz } = edgeInfo(corners, i);
      // doorway intervals (fraction 0..1), sorted
      const doors = (openings[i] || [])
        .map(d => { const half = (d.w / 2) / len; return [Math.max(0, d.at - half), Math.min(1, d.at + half)]; })
        .sort((p, q) => p[0] - q[0]);
      // wall segments = the complement of the doorways within [0,1]
      const segs = [];
      let cur = 0;
      for (const [s0, s1] of doors) { if (s0 > cur) segs.push([cur, s0]); cur = Math.max(cur, s1); }
      if (cur < 1) segs.push([cur, 1]);
      for (const [f0, f1] of segs) {
        const sl = (f1 - f0) * len;
        if (sl <= 0.05) continue;
        const fc = (f0 + f1) / 2;
        const w = new THREE.Mesh(new THREE.BoxGeometry(sl, h, wt), mat);
        w.position.set(a.x + dirx * fc * len, h / 2, a.y + dirz * fc * len);
        w.rotation.y = -ang;
        w.castShadow = true; w.receiveShadow = true;
        group.add(w);
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(w.geometry),
          new THREE.LineBasicMaterial({ color: COL.edge, transparent: true, opacity: 0.3 }));
        e.position.copy(w.position); e.rotation.copy(w.rotation);
        group.add(e);
      }
    }
  }

  // ── Hexagonal floor slab (ShapeGeometry laid flat in XZ) ──
  function hexFloor(corners, mat, y) {
    const sh = new THREE.Shape();
    corners.forEach((c, i) => i ? sh.lineTo(c.x, -c.y) : sh.moveTo(c.x, -c.y));
    sh.closePath();
    const g = new THREE.ShapeGeometry(sh);
    g.rotateX(-Math.PI / 2);   // XY shape → XZ floor (world z = c.y)
    const m = new THREE.Mesh(g, mat);
    m.position.y = y; m.receiveShadow = true;
    return m;
  }

  // ============================================================
  //  A. FLOORS (larger rings sit lower so each annulus shows through)
  // ============================================================
  root.add(hexFloor(outerC, floorOutMat, 0.02));
  root.add(hexFloor(midC,   floorMidMat, 0.06));
  root.add(hexFloor(innerC, floorInMat,  0.10));

  // Red / blue side pads under the cylinders
  const padGeo = new THREE.CircleGeometry(9, 28);
  const redPad = new THREE.Mesh(padGeo, track(new THREE.MeshStandardMaterial({ color: COL.floorRed, roughness: 0.5, side: THREE.DoubleSide }), surfaceMats));
  redPad.rotation.x = -Math.PI / 2; redPad.position.set(HEX.cylX, 0.13, HEX.cylZ);
  root.add(redPad);
  const bluePad = new THREE.Mesh(padGeo, track(new THREE.MeshStandardMaterial({ color: COL.floorBlue, roughness: 0.5, side: THREE.DoubleSide }), surfaceMats));
  bluePad.rotation.x = -Math.PI / 2; bluePad.position.set(-HEX.cylX, 0.13, HEX.cylZ);
  root.add(bluePad);

  // ============================================================
  //  B. THE THREE HEX WALL RINGS (no ceiling / roof)
  // ============================================================
  // OUTER ring — big outer layer; two rolling doors on the NORTH edge → outside.
  const outerGroup = new THREE.Group();
  tag(outerGroup, 'outer_ring');
  root.add(outerGroup);
  buildRing(outerGroup, outerC, HEX.wallH, 2.5, extWallMat, HEX.outerDoors);

  // MIDDLE ring — transition layer; doors on the SE & SW lower-diagonals. Its TOP edge
  // is dropped: the merged top corners sit on the outer top edge (see config MERGE), so
  // the middle's 2/3 edges run straight up to the outer top wall.
  const midGroup = new THREE.Group();
  tag(midGroup, 'middle_ring');
  root.add(midGroup);
  buildRing(midGroup, midC, HEX.wallH - 2, 1.8, midWallMat, HEX.midDoors, new Set([0]));

  // INNER ring — turnstile room; two doors on the SOUTH edge (flank the partition).
  const innerGroup = new THREE.Group();
  tag(innerGroup, 'inner_ring');
  root.add(innerGroup);
  buildRing(innerGroup, innerC, HEX.wallH - 2, 2.0, innWallMat, HEX.innerDoors);

  // ============================================================
  //  C. CENTRAL PARTITION (splits red / blue bays; runs N-S, south half only)
  // ============================================================
  const partGroup = new THREE.Group();
  root.add(partGroup);
  const partLen = HEX.partS - HEX.partN;          // from between cylinders to the south edge
  const partCz = (HEX.partN + HEX.partS) / 2;
  const partH = HEX.wallH - 4;
  const partWall = new THREE.Mesh(new THREE.BoxGeometry(0.8, partH, partLen), partMat);
  partWall.position.set(0, partH / 2, partCz);
  partWall.castShadow = true;
  tag(partWall, 'partition');
  partGroup.add(partWall);
  // glazed upper strip — the "proving window"
  const partGlass = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, partLen - 3),
    track(new THREE.MeshStandardMaterial({ color: COL.glass, roughness: 0.05, transparent: true, opacity: 0.28, side: THREE.DoubleSide }), surfaceMats));
  partGlass.position.set(0, partH - 2, partCz);
  tag(partGlass, 'partition_glass');
  partGroup.add(partGlass);
  glassPanels.push(partGlass);

  // ============================================================
  //  D. ROLLING DOORS (outer NORTH edge, two sides)
  // ============================================================
  // Steel shutter that exactly fills an outer-ring opening (slats flush with the gap, so
  // nothing overlaps the wall → no z-fighting). Partially raised: a gap at the bottom.
  function rollingDoor(edge, door, id) {
    const { ang } = edgeInfo(outerC, edge);
    const p = pointOnEdge(outerC, edge, door.at);
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.y);
    g.rotation.y = -ang;
    const w = door.w - 0.4, openH = 4.5, slatN = 9;
    const totalH = HEX.wallH - openH - 1, slatH = totalH / slatN;
    for (let i = 0; i < slatN; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(w, slatH * 0.9, 1.4), shutterMat);
      slat.position.set(0, openH + slatH / 2 + i * slatH, 0);
      slat.castShadow = true; g.add(slat);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.8, 1.6), shutterRail);
    bar.position.set(0, openH, 0); g.add(bar);
    tag(g, id); root.add(g);
    return g;
  }
  const rollWest = rollingDoor(0, HEX.outerDoors[0][0], 'rolling_door_west');  // NORTH, west side
  const rollEast = rollingDoor(0, HEX.outerDoors[0][1], 'rolling_door_east');  // NORTH, east side

  // ============================================================
  //  E. THE ROTAS TURNSTILE MACHINE (two cylinders + frame)
  // ============================================================
  const turnstileGroup = new THREE.Group();
  root.add(turnstileGroup);
  const cylR = 5.5, cylH = 13;
  const cz = HEX.cylZ;

  const redCylMat = track(new THREE.MeshStandardMaterial({ color: 0xc52010, roughness: 0.25, metalness: 0.2 }), surfaceMats);
  const redCyl = edged(new THREE.Mesh(new THREE.CylinderGeometry(cylR, cylR, cylH, 32), redCylMat), 0x800000, 0.35);
  redCyl.position.set(HEX.cylX, cylH / 2, cz);
  tag(redCyl, 'turnstile_red');
  turnstileGroup.add(redCyl);

  const blueCylMat = track(new THREE.MeshStandardMaterial({ color: 0x0870dd, roughness: 0.25, metalness: 0.2 }), surfaceMats);
  const blueCyl = edged(new THREE.Mesh(new THREE.CylinderGeometry(cylR, cylR, cylH, 32), blueCylMat), 0x003399, 0.35);
  blueCyl.position.set(-HEX.cylX, cylH / 2, cz);
  tag(blueCyl, 'turnstile_blue');
  turnstileGroup.add(blueCyl);

  for (const x of [HEX.cylX, -HEX.cylX]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(cylR + 1.2, 0.5, 8, 28), metalDarkMat);
    ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.6, cz);
    turnstileGroup.add(ring);
    for (const pz of [cz + 4.5, cz - 4.5]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, cylH + 3, 0.8), metalDarkMat);
      post.position.set(x, (cylH + 3) / 2, pz); post.castShadow = true;
      turnstileGroup.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 11), metalMat);
    beam.position.set(x, cylH + 2.5, cz);
    turnstileGroup.add(beam);
  }

  const redGlow = new THREE.PointLight(0xff2200, 0.6, 22);
  redGlow.position.set(HEX.cylX, cylH / 2, cz); turnstileGroup.add(redGlow);
  const blueGlow = new THREE.PointLight(0x0055ff, 0.6, 22);
  blueGlow.position.set(-HEX.cylX, cylH / 2, cz); turnstileGroup.add(blueGlow);

  // ============================================================
  //  F. PROPS — crates in the transition & outer layers
  // ============================================================
  const propsGroup = new THREE.Group();
  root.add(propsGroup);
  const makeCrate = (x, z, w, h, d, mat) => {
    const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || boxMat);
    c.position.set(x, h / 2 + 0.12, z); c.castShadow = true;
    c.rotation.y = (x * 0.013 + z * 0.017);
    propsGroup.add(c);
  };
  makeCrate(28, -2, 6, 6, 6, boxMat);        // transition, east
  makeCrate(-28, -2, 5, 7, 5, boxLightMat);  // transition, west
  makeCrate(46, 18, 9, 8, 7, boxMat);        // outer layer
  makeCrate(-48, 14, 8, 6, 8, boxLightMat);
  makeCrate(34, 40, 6, 9, 6, boxMat);
  makeCrate(-36, 44, 7, 5, 6, boxLightMat);
  makeCrate(0, 52, 10, 7, 8, boxMat);

  // ============================================================
  //  G. 747 CRASH SITE & AMBULANCE (south, outside the compound)
  // ============================================================
  const planeGroup = new THREE.Group();
  tag(planeGroup, '747_crash');
  planeGroup.position.set(POS.plane.x, 0, POS.plane.z);
  planeGroup.rotation.y = Math.PI / 2;   // nose points SOUTH (+z), punching in through the north rolling door
  root.add(planeGroup);

  const fuselageMat = track(new THREE.MeshStandardMaterial({ color: COL.plane, roughness: 0.6 }), surfaceMats);
  const fuselageGeo = new THREE.CylinderGeometry(10, 10, 55, 24); fuselageGeo.rotateZ(Math.PI / 2);
  const fuselage = new THREE.Mesh(fuselageGeo, fuselageMat);
  fuselage.position.set(-5, 10, -10); fuselage.rotation.y = -0.25; fuselage.castShadow = true; planeGroup.add(fuselage);

  const noseGeo = new THREE.ConeGeometry(10, 18, 24); noseGeo.rotateZ(-Math.PI / 2);
  const nose = new THREE.Mesh(noseGeo, fuselageMat);
  nose.position.set(-30, 10, -6); nose.rotation.y = -0.25; nose.castShadow = true; planeGroup.add(nose);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(35, 1, 8), fuselageMat);
  wing.position.set(15, 1.5, 10); wing.rotation.y = 0.4; wing.rotation.z = 0.15; planeGroup.add(wing);

  const engineGeo = new THREE.CylinderGeometry(3.5, 3.5, 10, 16); engineGeo.rotateZ(Math.PI / 2);
  const engineMat = track(new THREE.MeshStandardMaterial({ color: COL.planeEngine, roughness: 0.7 }), surfaceMats);
  const engine1 = new THREE.Mesh(engineGeo, engineMat); engine1.position.set(10, 5, 15); engine1.rotation.y = 0.3; planeGroup.add(engine1);
  const engine2 = new THREE.Mesh(engineGeo, engineMat); engine2.position.set(20, 4, -5); engine2.rotation.y = -0.2; engine2.rotation.z = 0.1; planeGroup.add(engine2);

  let s = 7; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 12; i++) {
    const size = 1 + rnd() * 3;
    const deb = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.6, size * 0.8), rnd() > 0.5 ? fuselageMat : scorchMat);
    deb.position.set((rnd() - 0.5) * 50, size * 0.3, (rnd() - 0.5) * 40);
    deb.rotation.set(rnd() * 0.3, rnd() * Math.PI, rnd() * 0.3);
    planeGroup.add(deb);
  }
  const createFireBlob = (x, y, z, sz) => {
    const bGroup = new THREE.Group(); bGroup.position.set(x, y, z);
    const colors = [0xe62915, 0xff8c00, 0xffd700];
    for (let i = 0; i < 4; i++) {
      const geo = new THREE.IcosahedronGeometry(sz * (0.5 + rnd() * 0.8), 0);
      const mat = new THREE.MeshStandardMaterial({ color: colors[Math.floor(rnd() * colors.length)], roughness: 0.8, flatShading: true });
      const m = new THREE.Mesh(geo, track(mat, surfaceMats));
      m.position.set((rnd() - 0.5) * sz, (rnd() - 0.5) * sz, (rnd() - 0.5) * sz);
      bGroup.add(m);
    }
    return bGroup;
  };
  planeGroup.add(createFireBlob(-25, 8, -8, 5));
  planeGroup.add(createFireBlob(-15, 4, 5, 4));
  planeGroup.add(createFireBlob(-30, 10, -2, 6));

  const vanGroup = new THREE.Group();
  tag(vanGroup, 'ambulance_van');
  vanGroup.position.set(-35, 0, POS.plane.z + 15);
  root.add(vanGroup);
  const vanMat = track(new THREE.MeshStandardMaterial({ color: 0x76a328, roughness: 0.5 }), surfaceMats);
  const vanBody = new THREE.Mesh(new THREE.BoxGeometry(12, 10, 24), vanMat);
  vanBody.position.set(0, 5, 0); vanBody.rotation.y = 0.3; vanBody.castShadow = true; vanGroup.add(vanBody);
  const vanCab = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 8), vanMat);
  vanCab.position.set(Math.sin(0.3) * 14, 4, Math.cos(0.3) * 14); vanCab.rotation.y = 0.3; vanCab.castShadow = true; vanGroup.add(vanCab);

  // ============================================================
  //  H. RED / BLUE AMBIENT LIGHTING
  // ============================================================
  const redAmb = new THREE.PointLight(COL.ambientRed, 0.5, 90);
  redAmb.position.set(24, 14, -2); root.add(redAmb);
  const blueAmb = new THREE.PointLight(COL.ambientBlue, 0.5, 90);
  blueAmb.position.set(-24, 14, -2); root.add(blueAmb);

  return {
    surfaceMats, glassPanels, editables,
    turnstileGroup, partGroup, innerGroup, midGroup, outerGroup,
    planeGroup, vanGroup, propsGroup, rollEast, rollWest,
  };
}
