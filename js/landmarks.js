import * as THREE from 'three';
import { COL, POS, groundHeight, terrainParams } from './config.js';
import { edged } from './util.js';

const surfaceMats = []; // materials faded by the X-ray toggle
function track(mat) { surfaceMats.push(mat); return mat; }

// Multi-story ruined building: box + floor lines.
function ruin(w, h, d, color = COL.building) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
    track(new THREE.MeshStandardMaterial({ color, roughness: 0.97 })));
  m.castShadow = true; m.receiveShadow = true;
  g.add(m);
  g.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry),
    new THREE.LineBasicMaterial({ color: COL.edge, transparent: true, opacity: 0.4 })));
  const floors = Math.max(1, Math.round(h / 9));
  for (let i = 1; i < floors; i++) {
    const y = -h / 2 + (h / floors) * i;
    const pts = [
      new THREE.Vector3(-w/2, y, d/2), new THREE.Vector3(w/2, y, d/2),
      new THREE.Vector3(w/2, y, -d/2), new THREE.Vector3(-w/2, y, -d/2),
      new THREE.Vector3(-w/2, y, d/2),
    ];
    g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: COL.edge, transparent: true, opacity: 0.22 })));
  }
  return g;
}

// Rectangular concrete portal: two thick legs + heavy lintel.
function portalArch(span, height, legW, depth) {
  const g = new THREE.Group();
  const mat = () => track(new THREE.MeshStandardMaterial({ color: COL.concrete, roughness: 0.95 }));
  const legH = height - legW * 1.4;
  const mkLeg = (sx) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(legW, legH, depth), mat());
    m.position.set(sx, legH / 2, 0); m.castShadow = true; m.receiveShadow = true;
    return m;
  };
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(span + legW, legW * 1.4, depth), mat());
  lintel.position.set(0, legH + legW * 0.7, 0); lintel.castShadow = true;
  const inner = new THREE.Group();
  inner.add(mkLeg(-span / 2), mkLeg(span / 2), lintel);
  // edge lines
  inner.children.forEach(m => inner.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(m.geometry),
    new THREE.LineBasicMaterial({ color: COL.edge, transparent: true, opacity: 0.4 })
  ).translateX(m.position.x).translateY(m.position.y)));
  g.add(inner);
  return g;
}

export function buildLandmarks(root) {
  const gY = groundHeight;

  // Editable registry: objects the in-app editor can select/move/scale.
  const editables = [];
  const tag = (o, id) => { o.userData.editId = id; o.userData.editLabel = id; editables.push(o); return o; };

  // ---------- Main battlefield: ruined building cluster (NW) — sparse, well spread ----------
  const city = new THREE.Group();
  let seed = 11; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 16; i++) {
    let x, z;
    if (rnd() > 0.78) {
      // a few outlying ruins on the pit slopes
      if (rnd() > 0.5) { x = POS.cityX + (rnd() - 0.5) * 110; z = -150 - rnd() * 110; }
      else { x = -120 + rnd() * 200; z = -235 - rnd() * 55; }
    } else {
      // battlefield core — wide, sparse, pushed clear of the turnstile to the south
      x = -150 + rnd() * 215;
      z = -120 - rnd() * 115;
    }
    const w = 13 + rnd() * 17, d = 12 + rnd() * 14, h = 13 + rnd() * 30;
    const tan = rnd() > 0.8;
    const b = ruin(w, h, d, tan ? COL.tan : COL.building);
    b.position.set(x, gY(x, z) + h / 2, z);
    b.rotation.y = rnd() * 0.7 - 0.35;
    tag(b, 'bldg-' + i);
    city.add(b);
  }
  root.add(city);

  // ---------- Battlefield entrance: a pair of blast-wall pylons ----------
  const entrance = new THREE.Group();
  const ex = POS.entrance.x, ez = POS.entrance.z, ey = gY(ex, ez);
  for (let s = -1; s <= 1; s += 2) {
    const pylon = edged(new THREE.Mesh(new THREE.BoxGeometry(7, 26, 14),
      track(new THREE.MeshStandardMaterial({ color: COL.concrete, roughness: 0.95 }))), COL.edge, 0.5);
    pylon.position.set(ex + s * 24, ey + 13, ez);
    pylon.children[0].castShadow = true;
    entrance.add(pylon);
  }
  // low cross-beam to read as a checkpoint gate
  const beam = edged(new THREE.Mesh(new THREE.BoxGeometry(55, 4, 6),
    track(new THREE.MeshStandardMaterial({ color: COL.concrete, roughness: 0.95 }))), COL.edge, 0.5);
  beam.position.set(ex, ey + 24, ez);
  entrance.add(beam);
  tag(entrance, 'entrance');
  root.add(entrance);

  // ---------- Turnstile: a vertical-walled funnel pit with a 6-panel central entrance ----------
  const ts = new THREE.Group();
  ts.position.set(POS.turnstile.x, 0, POS.turnstile.z);   // world grade; meshes use world y
  const R = terrainParams.basinR;
  const wallBase = -terrainParams.basinDepth;
  const floorY = -(terrainParams.basinDepth + terrainParams.basinFunnel);
  // The whole pit is ONE smooth lathe (revolved profile): a flat grade apron reaching OUT
  // to R+10, then a vertical wall, then a conical funnel to the centre. A single watertight
  // ring (96 radial segments). The apron caps the terrain plane's smooth ramp band (R…R+10)
  // so the coarse grid never shows through; the wall + funnel are the visible pit.
  const profile = [
    new THREE.Vector2(R + 10, 0.05),     // flat apron at grade — caps the terrain ramp band
    new THREE.Vector2(R, 0.05),
    new THREE.Vector2(R, wallBase),      // straight down — the vertical wall
    new THREE.Vector2(0.001, floorY),    // funnel slope from wall base to the centre
  ];
  const pit = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 96),
    track(new THREE.MeshStandardMaterial({ color: COL.concrete, roughness: 0.95, side: THREE.DoubleSide })));
  pit.receiveShadow = true; pit.castShadow = true;
  ts.add(pit);
  // Central entrance: six trapezoid panels leaning inward, with gaps between them. Lifted
  // up off the funnel floor so the structure reads clearly above the rim. It's its OWN
  // editable ('turnstile-core'), separate from the basin, so its height can be tuned.
  const pyr = new THREE.Group(); pyr.position.set(0, floorY + 9, 0); ts.add(pyr);
  const bw = 9, tw = 3, ph = 15, th = 2.2;       // base width, top width, height, thickness
  const shape = new THREE.Shape();
  shape.moveTo(-bw / 2, 0); shape.lineTo(bw / 2, 0); shape.lineTo(tw / 2, ph); shape.lineTo(-tw / 2, ph); shape.closePath();
  const panelGeo = new THREE.ExtrudeGeometry(shape, { depth: th, bevelEnabled: false });
  panelGeo.translate(0, 0, -th / 2);
  const panelMat = track(new THREE.MeshStandardMaterial({ color: COL.concrete, roughness: 0.95, flatShading: true, side: THREE.DoubleSide }));
  const rad = 11, lean = 0.5;
  for (let i = 0; i < 6; i++) {
    const pv = new THREE.Group(); pv.rotation.y = i * Math.PI / 3;
    const m = new THREE.Mesh(panelGeo, panelMat); m.castShadow = true;
    m.position.set(0, 0, rad); m.rotation.x = -lean;   // base out at the radius, top leans toward the centre
    pv.add(m); pyr.add(pv);
  }
  tag(pyr, 'turnstile-core');   // the central 6-panel structure — editable on its own (e.g. raise/lower)
  tag(ts, 'turnstile');
  root.add(ts);

  // ---------- Arches: a N–S line of tall rectangular portals spread beside the berm ----------
  // Four arches loosely distributed alongside the earthen embankment west of the LZ.
  const arches = new THREE.Group();
  const archSpecs = [
    { x: -18, z: 82,  span: 16, h: 58 },
    { x: -34, z: 116, span: 14, h: 50 },
    { x: -20, z: 152, span: 15, h: 54 },
    { x: -38, z: 188, span: 13, h: 46 },
  ];
  archSpecs.forEach((sp, i) => {
    const a = portalArch(sp.span, sp.h, 5, 6);
    a.position.set(sp.x, gY(sp.x, sp.z), sp.z);
    a.rotation.y = 0.04;
    tag(a, 'arch-' + i);
    arches.add(a);
  });
  root.add(arches);

  // ---------- Stepped / layered building ----------
  const stepped = new THREE.Group();
  const sx = POS.stepped.x, sz = POS.stepped.z, sy = gY(sx, sz);
  for (let i = 0; i < 5; i++) {
    const slab = edged(new THREE.Mesh(new THREE.BoxGeometry(34 - i * 1.5, 2.4, 26 - i),
      track(new THREE.MeshStandardMaterial({ color: COL.building, roughness: 0.95 }))), COL.edge, 0.45);
    slab.position.set(sx, sy + 3 + i * 6, sz);
    stepped.add(slab);
  }
  tag(stepped, 'stepped');
  root.add(stepped);

  // ---------- Brown spheres ----------
  const spheres = new THREE.Group();
  let s2 = 5; const r2 = () => (s2 = (s2 * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 9; i++) {
    const rad = 3 + r2() * 4;
    const sp = new THREE.Mesh(new THREE.SphereGeometry(rad, 12, 10),
      track(new THREE.MeshStandardMaterial({ color: COL.sphere, roughness: 0.9 })));
    const x = POS.spheres.x + (r2() - 0.5) * 28;
    const z = POS.spheres.z + (r2() - 0.5) * 22;
    sp.position.set(x, gY(x, z) + rad * 0.8, z);
    sp.castShadow = true; spheres.add(sp);
  }
  tag(spheres, 'spheres');
  root.add(spheres);

  // ---------- LZ: helipads + blue shipping containers (far south) ----------
  const lz = new THREE.Group();
  const lx = POS.lz.x, lz_ = POS.lz.z;
  for (let i = 0; i < 2; i++) {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(16, 32),
      track(new THREE.MeshStandardMaterial({ color: COL.groundLo, roughness: 1 })));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(lx - 26 + i * 52, gY(lx, lz_) + 0.2, lz_ + 8);
    lz.add(pad);
    const hRing = new THREE.Mesh(new THREE.RingGeometry(7, 8.5, 6),
      new THREE.MeshBasicMaterial({ color: COL.accent, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    hRing.rotation.x = -Math.PI / 2; hRing.position.copy(pad.position); hRing.position.y += 0.05;
    lz.add(hRing);
  }
  tag(lz, 'lz');
  root.add(lz);

  // ---------- Extraction zone: pads atop the SE hypocenter highland ----------
  // Blue Team (inverted) lands here and Red Team extracts here — the surface
  // directly above the buried chamber, where Neil drives in at the end.
  const exz = new THREE.Group();
  const hx = POS.hill.x, hz = POS.hill.z, hy = gY(hx, hz);
  for (let i = 0; i < 2; i++) {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(15, 32),
      track(new THREE.MeshStandardMaterial({ color: COL.groundLo, roughness: 1 })));
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(hx - 22 + i * 44, hy + 0.2, hz - 8);
    exz.add(pad);
    const hRing = new THREE.Mesh(new THREE.RingGeometry(6.5, 8, 6),
      new THREE.MeshBasicMaterial({ color: COL.accent, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    hRing.rotation.x = -Math.PI / 2; hRing.position.copy(pad.position); hRing.position.y += 0.05;
    exz.add(hRing);
  }
  tag(exz, 'exz');
  root.add(exz);

  return { city, entrance, turnstile: ts, arches, stepped, spheres, lz, exz, surfaceMats, editables };
}
