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
  // Four bullet holes in the glass (dark discs, both faces).
  const holeMat = track(new THREE.MeshStandardMaterial({ color: 0x0c0e10, roughness: 0.95 }), surfaceMats);
  const holeRing = track(new THREE.MeshStandardMaterial({ color: 0x9fb6c4, roughness: 0.4, transparent: true, opacity: 0.5, side: THREE.DoubleSide }), surfaceMats);
  for (const [hy, hz] of [[partH - 0.6, partCz - 8], [partH - 3, partCz - 2.5], [partH - 1.8, partCz + 4], [partH - 3.4, partCz + 9]]) {
    for (const sx of [0.26, -0.26]) {
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.55, 14), holeMat);
      hole.position.set(sx, hy, hz); hole.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      partGroup.add(hole);
      const crack = new THREE.Mesh(new THREE.RingGeometry(0.55, 1.1, 14), holeRing);
      crack.position.set(sx * 0.9, hy, hz); crack.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
      partGroup.add(crack);
    }
  }

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
    const w = door.w - 0.4, slatN = 12;        // reaches the ground; thinner panel
    const totalH = HEX.wallH - 0.3, slatH = totalH / slatN;
    for (let i = 0; i < slatN; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(w, slatH * 0.9, 0.5), shutterMat);
      slat.position.set(0, slatH / 2 + i * slatH, 0);
      slat.castShadow = true; g.add(slat);
    }
    tag(g, id); root.add(g);
    return g;
  }
  const rollWest = rollingDoor(0, HEX.outerDoors[0][0], 'rolling_door_west');  // NORTH, west side
  const rollEast = rollingDoor(0, HEX.outerDoors[0][1], 'rolling_door_east');  // NORTH, east side

  // Sliding black door panel (indicative) in every non-rolling opening. Editable, so it
  // can be "slid" with the gizmo.
  function slideDoor(ring, edge, door, group, id) {
    const { ang } = edgeInfo(ring, edge);
    const p = pointOnEdge(ring, edge, door.at);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(door.w * 0.92, HEX.wallH * 0.8, 0.7),
      track(new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.55, metalness: 0.35 }), surfaceMats));
    panel.position.set(p.x, HEX.wallH * 0.4, p.y);
    panel.rotation.y = -ang; panel.castShadow = true;
    tag(panel, id); group.add(panel);
    return panel;
  }
  slideDoor(innerC, 3, HEX.innerDoors[3][0], innerGroup, 'door_inner_E');
  slideDoor(innerC, 3, HEX.innerDoors[3][1], innerGroup, 'door_inner_W');
  slideDoor(midC, 1, HEX.midDoors[1][0], midGroup, 'door_mid_R');
  slideDoor(midC, 5, HEX.midDoors[5][0], midGroup, 'door_mid_L');
  slideDoor(outerC, 0, HEX.outerDoors[0][2], outerGroup, 'door_conn');
  slideDoor(outerC, 1, HEX.outerDoors[1][0], outerGroup, 'door_outR');

  // ============================================================
  //  E. THE ROTAS TURNSTILE MACHINE (two cylinders + frame)
  // ============================================================
  const turnstileGroup = new THREE.Group();
  root.add(turnstileGroup);
  const cylR = 5.5, cylH = 13, cz = HEX.cylZ;
  const openA = Math.PI * 0.5;   // rectangular opening (≈90° gap in the hollow shell)

  // A HOLLOW cylinder with a rectangular opening (open-ended arc). At rest the opening
  // faces OUTWARD; the whole group spins about its axis (driven by world.update).
  function turnstileShell(x, faceEast, color, edgeColor) {
    const g = new THREE.Group();
    g.position.set(x, 0, cz);
    // CylinderGeometry vertex: x=r·sin(θ), z=r·cos(θ) → +z (SOUTH)=θ=0. Both openings face
    // SOUTH at rest; world.update winds them to north (blue CCW / red CW) and back.
    const gap = 0;
    const mat = track(new THREE.MeshStandardMaterial({ color, roughness: 0.25, metalness: 0.2, side: THREE.DoubleSide }), surfaceMats);
    const shell = new THREE.Mesh(
      new THREE.CylinderGeometry(cylR, cylR, cylH, 40, 1, true, gap + openA / 2, Math.PI * 2 - openA), mat);
    shell.position.y = cylH / 2; shell.castShadow = true; shell.receiveShadow = true;
    g.add(shell);
    // Solid top cap (cover the top).
    const cap = new THREE.Mesh(new THREE.CircleGeometry(cylR, 40), mat);
    cap.rotation.x = -Math.PI / 2; cap.position.y = cylH; g.add(cap);
    // jamb bars down the two edges of the opening, + top/bottom rims
    const trimMat = track(new THREE.MeshStandardMaterial({ color: edgeColor, roughness: 0.5, metalness: 0.4 }), surfaceMats);
    for (const s of [1, -1]) {
      const a = gap + s * openA / 2;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.7, cylH, 1.2), trimMat);
      bar.position.set(Math.sin(a) * cylR, cylH / 2, Math.cos(a) * cylR);  // match cylinder vertex convention
      bar.rotation.y = Math.PI / 2 - a; g.add(bar);
    }
    for (const yy of [0.4, cylH]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(cylR, 0.35, 8, 40), trimMat);
      rim.rotation.x = Math.PI / 2; rim.position.y = yy; g.add(rim);
    }
    const glow = new THREE.PointLight(faceEast ? 0xff2200 : 0x0055ff, 0.6, 22);
    glow.position.y = cylH / 2; g.add(glow);
    return g;
  }
  const redCyl = turnstileShell(HEX.cylX, true, 0xc52010, 0x800000);
  tag(redCyl, 'turnstile_red'); turnstileGroup.add(redCyl);
  const blueCyl = turnstileShell(-HEX.cylX, false, 0x0870dd, 0x003399);
  tag(blueCyl, 'turnstile_blue'); turnstileGroup.add(blueCyl);

  // Static frame (does NOT spin): just the base track ring on the floor.
  for (const x of [HEX.cylX, -HEX.cylX]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(cylR + 1.2, 0.5, 8, 28), metalDarkMat);
    ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.6, cz);
    turnstileGroup.add(ring);
  }

  // ============================================================
  //  F. PROPS
  // ============================================================
  const propsGroup = new THREE.Group();
  root.add(propsGroup);   // (scattered crates removed)

  // ============================================================
  //  G. 747 CRASH SITE & AMBULANCE (south, outside the compound)
  // ============================================================
  const planeGroup = new THREE.Group();
  tag(planeGroup, '747_crash');
  planeGroup.position.set(POS.plane.x, 0, POS.plane.z);
  planeGroup.rotation.y = 0;   // fuselage E-W (along x), parallel to and in front of the north wall
  root.add(planeGroup);

  const fuselageMat = track(new THREE.MeshStandardMaterial({ color: COL.plane, roughness: 0.5, metalness: 0.12 }), surfaceMats);
  const engineMat   = track(new THREE.MeshStandardMaterial({ color: COL.planeEngine, roughness: 0.6, metalness: 0.25 }), surfaceMats);
  const trimMat     = track(new THREE.MeshStandardMaterial({ color: COL.planeEdge, roughness: 0.6 }), surfaceMats);
  let s = 7; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;

  // Stylised 747, built nose-toward-+X in local space (R = fuselage radius).
  function build747() {
    const g = new THREE.Group();
    const R = 5;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 44, 24), fuselageMat);
    tube.rotation.z = Math.PI / 2; tube.castShadow = true; g.add(tube);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(R, 20, 16), fuselageMat);
    nose.scale.set(1.7, 1, 1); nose.position.x = 22; nose.castShadow = true; g.add(nose);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(R, 17, 24), fuselageMat);
    tail.rotation.z = -Math.PI / 2; tail.position.set(-28.5, 1.8, 0); tail.castShadow = true; g.add(tail);
    // 747 upper-deck hump (forward third)
    const hump = new THREE.Mesh(new THREE.SphereGeometry(R * 0.82, 18, 14), fuselageMat);
    hump.scale.set(2.4, 0.85, 0.9); hump.position.set(12, R * 0.72, 0); hump.castShadow = true; g.add(hump);
    // window / livery stripe down each side
    for (const sd of [1, -1]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(42, 1.1, 0.2), trimMat);
      stripe.position.set(-3, R * 0.45, sd * R); g.add(stripe);
    }

    // Swept main wing (span along +z for side=+1), with two underslung engines.
    function wing(side) {
      const root = 18, tip = 6, span = 34, sweep = 15;
      const sh = new THREE.Shape();
      sh.moveTo(9, 0); sh.lineTo(9 - root, 0); sh.lineTo(9 - sweep - tip, span); sh.lineTo(9 - sweep, span); sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 1.1, bevelEnabled: false });
      geo.translate(0, 0, -0.55); geo.rotateX(Math.PI / 2);     // lay flat in XZ, thickness on Y
      const m = new THREE.Mesh(geo, fuselageMat);
      m.scale.z = side; m.position.set(0, -0.5, side * (R - 0.5));
      m.rotation.x = -side * 0.05;       // slight dihedral
      m.castShadow = true; g.add(m);
      for (const [ex, ez] of [[3, 11], [-1, 21]]) {
        const nac = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.0, 7, 16), engineMat);
        nac.rotation.z = Math.PI / 2; nac.position.set(ex, -3.2, side * ez); nac.castShadow = true; g.add(nac);
        const intake = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.5, 8, 16), trimMat);
        intake.rotation.y = Math.PI / 2; intake.position.set(ex + 3.6, -3.2, side * ez); g.add(intake);
        const pylon = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 0.8), fuselageMat);
        pylon.position.set(ex - 0.5, -1.6, side * ez); g.add(pylon);
      }
    }
    wing(1); wing(-1);

    // Tail — vertical fin + horizontal stabilisers.
    const finSh = new THREE.Shape();
    finSh.moveTo(-22, 0); finSh.lineTo(-33, 0); finSh.lineTo(-35, 15); finSh.lineTo(-27, 15); finSh.closePath();
    const finGeo = new THREE.ExtrudeGeometry(finSh, { depth: 0.9, bevelEnabled: false });
    finGeo.translate(0, 0, -0.45);
    const fin = new THREE.Mesh(finGeo, fuselageMat); fin.position.y = R - 1.2; fin.castShadow = true; g.add(fin);
    function stab(side) {
      const sh = new THREE.Shape();
      sh.moveTo(-25, 0); sh.lineTo(-31, 0); sh.lineTo(-34, 12); sh.lineTo(-30.5, 12); sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.8, bevelEnabled: false });
      geo.translate(0, 0, -0.4); geo.rotateX(Math.PI / 2);
      const m = new THREE.Mesh(geo, fuselageMat); m.scale.z = side; m.position.set(0, R - 2.2, side * 1.6); g.add(m);
    }
    stab(1); stab(-1);
    return g;
  }

  const jet = build747();
  jet.scale.set(2, 2, 2);            // 2× size
  jet.position.y = 12;               // belly near the ground at 2× scale
  planeGroup.add(jet);

  // A little scattered debris near the wreck.
  for (let i = 0; i < 7; i++) {
    const size = 1 + rnd() * 3;
    const deb = new THREE.Mesh(new THREE.BoxGeometry(size, size * 0.6, size * 0.8), rnd() > 0.5 ? fuselageMat : scorchMat);
    deb.position.set((rnd() - 0.5) * 46, size * 0.3, (rnd() - 0.5) * 30);
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
  planeGroup.add(createFireBlob(24, 6, 0, 5));    // nose fire
  planeGroup.add(createFireBlob(2, 4, 12, 4));    // wing root
  planeGroup.add(createFireBlob(10, 5, -6, 4));

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
    turnstileGroup, turnstile: { red: redCyl, blue: blueCyl },
    partGroup, innerGroup, midGroup, outerGroup,
    planeGroup, vanGroup, propsGroup, rollEast, rollWest,
  };
}
