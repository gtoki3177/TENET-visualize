import * as THREE from 'three';
import { COL, POS, BLDG } from './config.js';

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

// ── Main build ───────────────────────────────────────────
export function buildLandmarks(root) {
  const editables = [];
  const tag = (o, id) => {
    o.userData.editId = id;
    o.userData.editLabel = id;
    editables.push(o);
    return o;
  };
  const surfaceMats = [];
  const glassPanels = [];

  // ── Material Library ───────────────────────────────────
  const extWallMat   = track(new THREE.MeshStandardMaterial({ color: COL.concrete,     roughness: 0.92 }), surfaceMats);
  const intWallMat   = track(new THREE.MeshStandardMaterial({ color: COL.wall,          roughness: 0.85 }), surfaceMats);
  const vaultWallMat = track(new THREE.MeshStandardMaterial({ color: COL.concreteDark,  roughness: 0.88 }), surfaceMats);
  const floorMat     = track(new THREE.MeshStandardMaterial({ color: COL.floor,         roughness: 0.55, metalness: 0.05 }), surfaceMats);
  const floorRedMat  = track(new THREE.MeshStandardMaterial({ color: COL.floorRed,      roughness: 0.55, metalness: 0.05 }), surfaceMats);
  const floorBlueMat = track(new THREE.MeshStandardMaterial({ color: COL.floorBlue,     roughness: 0.55, metalness: 0.05 }), surfaceMats);
  const ceilingMat   = track(new THREE.MeshStandardMaterial({ color: COL.ceiling,       roughness: 0.9 }), surfaceMats);
  const glassMat     = track(new THREE.MeshStandardMaterial({ color: COL.glass, roughness: 0.05, transparent: true, opacity: 0.32, side: THREE.DoubleSide }), surfaceMats);
  const metalMat     = track(new THREE.MeshStandardMaterial({ color: COL.metal,         roughness: 0.5, metalness: 0.35 }), surfaceMats);
  const metalDarkMat = track(new THREE.MeshStandardMaterial({ color: COL.metalDark,     roughness: 0.6, metalness: 0.4 }), surfaceMats);
  const boxMat       = track(new THREE.MeshStandardMaterial({ color: COL.crate,         roughness: 0.88 }), surfaceMats);
  const boxLightMat  = track(new THREE.MeshStandardMaterial({ color: COL.crateLight,    roughness: 0.85 }), surfaceMats);
  const shutterMat   = track(new THREE.MeshStandardMaterial({ color: 0x4a4e52,          roughness: 0.75, metalness: 0.25 }), surfaceMats);
  const stripMat     = track(new THREE.MeshStandardMaterial({ color: COL.stripLight, emissive: COL.stripLight, emissiveIntensity: 0.6, roughness: 0.3 }), surfaceMats);
  const mullionMat   = track(new THREE.MeshStandardMaterial({ color: COL.metalDark,     roughness: 0.5, metalness: 0.5 }), surfaceMats);
  const scorchMat    = track(new THREE.MeshStandardMaterial({ color: 0x2a2420,          roughness: 0.95 }), surfaceMats);

  // ============================================================
  //  A. FREEPORT BUILDING SHELL (Exterior)
  // ============================================================
  const shellGroup = new THREE.Group();
  tag(shellGroup, 'building_shell');
  root.add(shellGroup);

  const bW = BLDG.width;       // 64
  const bD = BLDG.depth;       // 130
  const bH = BLDG.height;      // 20
  const wT = BLDG.wallT;       // 3
  // Building spans z = -45 to z = 85, centered at z = 20
  const bZ = (POS.northWall.z + POS.southWall.z) / 2;  // 20

  // East wall (right, +x)
  const eastWall = new THREE.Mesh(new THREE.BoxGeometry(wT, bH, bD), extWallMat);
  eastWall.position.set(bW / 2 + wT / 2, bH / 2, bZ);
  eastWall.castShadow = true;
  shellGroup.add(eastWall);

  // West wall (left, -x)
  const westWall = new THREE.Mesh(new THREE.BoxGeometry(wT, bH, bD), extWallMat);
  westWall.position.set(-bW / 2 - wT / 2, bH / 2, bZ);
  westWall.castShadow = true;
  shellGroup.add(westWall);

  // North wall (behind vault)
  const northWall = new THREE.Mesh(new THREE.BoxGeometry(bW + wT * 2, bH, wT), extWallMat);
  northWall.position.set(0, bH / 2, POS.northWall.z - wT / 2);
  northWall.castShadow = true;
  shellGroup.add(northWall);

  // South wall — split into pieces around the crash hole
  const crashX = POS.crashHole.x;  // 12
  const crashW = BLDG.crashW;      // 22
  const crashH = BLDG.crashH;      // 16
  const southZ = POS.southWall.z + wT / 2;  // 86.5

  // South wall LEFT of crash hole
  const swLeftW = (bW / 2 + wT) + (crashX - crashW / 2);  // from -35 to 1
  if (swLeftW > 0) {
    const swLeft = new THREE.Mesh(new THREE.BoxGeometry(swLeftW, bH, wT), extWallMat);
    swLeft.position.set(-bW / 2 - wT / 2 + swLeftW / 2, bH / 2, southZ);
    swLeft.castShadow = true;
    shellGroup.add(swLeft);
  }

  // South wall RIGHT of crash hole
  const crashRight = crashX + crashW / 2;  // 23
  const swRightW = (bW / 2 + wT) - crashRight;
  if (swRightW > 0) {
    const swRight = new THREE.Mesh(new THREE.BoxGeometry(swRightW, bH, wT), extWallMat);
    swRight.position.set(crashRight + swRightW / 2, bH / 2, southZ);
    swRight.castShadow = true;
    shellGroup.add(swRight);
  }

  // South wall ABOVE crash hole
  const aboveH = bH - crashH;
  if (aboveH > 0) {
    const swAbove = new THREE.Mesh(new THREE.BoxGeometry(crashW, aboveH, wT), extWallMat);
    swAbove.position.set(crashX, crashH + aboveH / 2, southZ);
    swAbove.castShadow = true;
    shellGroup.add(swAbove);
  }

  // Crash hole edges — scorched debris framing
  const debrisThick = 1.5;
  // Bottom debris edge
  const debBottom = new THREE.Mesh(new THREE.BoxGeometry(crashW + 4, debrisThick, wT + 2), scorchMat);
  debBottom.position.set(crashX, debrisThick / 2, southZ);
  debBottom.rotation.z = 0.05;
  shellGroup.add(debBottom);
  // Left debris edge
  const debLeft = new THREE.Mesh(new THREE.BoxGeometry(debrisThick, crashH + 2, wT + 2), scorchMat);
  debLeft.position.set(crashX - crashW / 2 - 1, crashH / 2, southZ);
  debLeft.rotation.z = -0.08;
  shellGroup.add(debLeft);
  // Right debris edge
  const debRight = new THREE.Mesh(new THREE.BoxGeometry(debrisThick, crashH + 2, wT + 2), scorchMat);
  debRight.position.set(crashX + crashW / 2 + 1, crashH / 2, southZ);
  debRight.rotation.z = 0.06;
  shellGroup.add(debRight);

  // ROOF
  const roof = new THREE.Mesh(new THREE.BoxGeometry(bW + wT * 2 + 4, 1.5, bD + wT * 2 + 4), extWallMat);
  roof.position.set(0, bH + 0.75, bZ);
  roof.receiveShadow = true;
  shellGroup.add(roof);

  // Roof overhang edge lines
  const roofEdge = new THREE.LineSegments(
    new THREE.EdgesGeometry(roof.geometry),
    new THREE.LineBasicMaterial({ color: COL.edge, transparent: true, opacity: 0.3 })
  );
  roofEdge.position.copy(roof.position);
  shellGroup.add(roofEdge);

  // ============================================================
  //  B. INTERIOR FLOOR
  // ============================================================
  // Main floor slab
  const intFloor = new THREE.Mesh(new THREE.BoxGeometry(bW, 0.5, bD), floorMat);
  intFloor.position.set(0, 0.25, bZ);
  intFloor.receiveShadow = true;
  root.add(intFloor);

  // Red-tinted floor strip (right corridor + right vault)
  const redFloor = new THREE.Mesh(new THREE.BoxGeometry(bW / 2 - 1, 0.1, bD - 10), floorRedMat);
  redFloor.position.set(bW / 4, 0.56, bZ);
  root.add(redFloor);

  // Blue-tinted floor strip (left corridor + left vault)
  const blueFloor = new THREE.Mesh(new THREE.BoxGeometry(bW / 2 - 1, 0.1, bD - 10), floorBlueMat);
  blueFloor.position.set(-bW / 4, 0.56, bZ);
  root.add(blueFloor);

  // ============================================================
  //  C. TWIN CORRIDORS
  // ============================================================
  const corrGroup = new THREE.Group();
  root.add(corrGroup);

  const corrW = BLDG.corrW;  // 14
  const corrH = BLDG.corrH;  // 16
  const divT  = BLDG.divT;   // 2
  const corrLen = POS.hallStart.z - POS.hallEnd.z;  // 70
  const corrZ = (POS.hallStart.z + POS.hallEnd.z) / 2;  // 40

  // Central dividing wall (between red and blue corridors)
  const divWall = new THREE.Mesh(new THREE.BoxGeometry(divT, corrH, corrLen), intWallMat);
  divWall.position.set(0, corrH / 2, corrZ);
  divWall.castShadow = true;
  tag(divWall, 'corridor_divider');
  corrGroup.add(divWall);

  // Corridor ceiling (red side)
  const ceilRed = new THREE.Mesh(new THREE.BoxGeometry(corrW, 1, corrLen), ceilingMat);
  ceilRed.position.set(corrW / 2 + divT / 2, corrH, corrZ);
  corrGroup.add(ceilRed);

  // Corridor ceiling (blue side)
  const ceilBlue = new THREE.Mesh(new THREE.BoxGeometry(corrW, 1, corrLen), ceilingMat);
  ceilBlue.position.set(-corrW / 2 - divT / 2, corrH, corrZ);
  corrGroup.add(ceilBlue);

  // Strip lights on corridor ceilings (red side)
  for (let i = 0; i < 5; i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 8), stripMat);
    strip.position.set(corrW / 2 + divT / 2, corrH - 0.5, POS.hallEnd.z + 8 + i * 14);
    corrGroup.add(strip);
  }
  // Strip lights (blue side)
  for (let i = 0; i < 5; i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 8), stripMat);
    strip.position.set(-corrW / 2 - divT / 2, corrH - 0.5, POS.hallEnd.z + 8 + i * 14);
    corrGroup.add(strip);
  }

  // Roll-down security shutters (partially open / damaged)
  const shutZ = 68; // near the loading bay end
  const shutH = 12;
  const shutGap = 4; // gap at the bottom (partially rolled up)

  // Red side shutter
  const shutRed = new THREE.Mesh(new THREE.BoxGeometry(corrW - 1, shutH, 0.8), shutterMat);
  shutRed.position.set(corrW / 2 + divT / 2, shutGap + shutH / 2, shutZ);
  tag(shutRed, 'shutter_red');
  corrGroup.add(shutRed);

  // Blue side shutter
  const shutBlue = new THREE.Mesh(new THREE.BoxGeometry(corrW - 1, shutH, 0.8), shutterMat);
  shutBlue.position.set(-corrW / 2 - divT / 2, shutGap + shutH / 2, shutZ);
  tag(shutBlue, 'shutter_blue');
  corrGroup.add(shutBlue);

  // ============================================================
  //  D. TURNSTILE ROOM (Rectangular, split by proving window)
  // ============================================================
  const vaultGroup = new THREE.Group();
  root.add(vaultGroup);

  const vW = BLDG.vaultW;  // 54
  const vD = BLDG.vaultD;  // 36
  const vH = BLDG.vaultH;  // 18
  const vCenterZ = POS.vault.z;  // -20

  // Vault floor (darker than corridors)
  const vaultFloor = new THREE.Mesh(new THREE.BoxGeometry(vW, 0.3, vD),
    track(new THREE.MeshStandardMaterial({ color: 0x606468, roughness: 0.4, metalness: 0.1 }), surfaceMats));
  vaultFloor.position.set(0, 0.15, vCenterZ);
  vaultFloor.receiveShadow = true;
  vaultGroup.add(vaultFloor);

  // Vault ceiling
  const vaultCeil = new THREE.Mesh(new THREE.BoxGeometry(vW, 1.2, vD), ceilingMat);
  vaultCeil.position.set(0, vH, vCenterZ);
  vaultGroup.add(vaultCeil);

  // Vault ceiling strip lights (subtle)
  for (let i = -1; i <= 1; i++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, vD - 4), stripMat);
    strip.position.set(i * 16, vH - 0.5, vCenterZ);
    vaultGroup.add(strip);
  }

  // Vault side walls (east and west) — these are thicker internal walls
  const vaultEast = new THREE.Mesh(new THREE.BoxGeometry(2.5, vH, vD), vaultWallMat);
  vaultEast.position.set(vW / 2 + 1.25, vH / 2, vCenterZ);
  vaultEast.castShadow = true;
  vaultGroup.add(vaultEast);

  const vaultWest = new THREE.Mesh(new THREE.BoxGeometry(2.5, vH, vD), vaultWallMat);
  vaultWest.position.set(-vW / 2 - 1.25, vH / 2, vCenterZ);
  vaultWest.castShadow = true;
  vaultGroup.add(vaultWest);

  // Vault back wall (north)
  const vaultNorth = new THREE.Mesh(new THREE.BoxGeometry(vW + 5, vH, 2.5), vaultWallMat);
  vaultNorth.position.set(0, vH / 2, vCenterZ - vD / 2 - 1.25);
  vaultNorth.castShadow = true;
  tag(vaultNorth, 'vault_back_wall');
  vaultGroup.add(vaultNorth);

  // Vault front wall (south) — has two doorways for the twin corridors
  // Left section (from west wall to blue doorway)
  const doorW = 10; // doorway width
  const doorH = 14;
  const doorRedX = corrW / 2 + divT / 2;   // center of red corridor
  const doorBlueX = -corrW / 2 - divT / 2; // center of blue corridor

  // Solid sections around the doorways
  const vaultFrontZ = vCenterZ + vD / 2 + 1.25;

  // Far left section
  const flSec = new THREE.Mesh(new THREE.BoxGeometry(vW / 2 + 2.5 - Math.abs(doorBlueX) - doorW / 2, vH, 2.5), vaultWallMat);
  flSec.position.set(-vW / 2 - 1.25 + flSec.geometry.parameters.width / 2, vH / 2, vaultFrontZ);
  vaultGroup.add(flSec);

  // Section between the two doorways
  const midSec = new THREE.Mesh(new THREE.BoxGeometry(
    (doorRedX - doorW / 2) - (doorBlueX + doorW / 2), vH, 2.5
  ), vaultWallMat);
  midSec.position.set((doorBlueX + doorW / 2 + doorRedX - doorW / 2) / 2, vH / 2, vaultFrontZ);
  vaultGroup.add(midSec);

  // Far right section
  const frSec = new THREE.Mesh(new THREE.BoxGeometry(vW / 2 + 2.5 - doorRedX - doorW / 2, vH, 2.5), vaultWallMat);
  frSec.position.set(vW / 2 + 1.25 - frSec.geometry.parameters.width / 2, vH / 2, vaultFrontZ);
  vaultGroup.add(frSec);

  // Above doorway lintels
  const aboveDoor = vH - doorH;
  if (aboveDoor > 0) {
    const lintelRed = new THREE.Mesh(new THREE.BoxGeometry(doorW, aboveDoor, 2.5), vaultWallMat);
    lintelRed.position.set(doorRedX, doorH + aboveDoor / 2, vaultFrontZ);
    vaultGroup.add(lintelRed);

    const lintelBlue = new THREE.Mesh(new THREE.BoxGeometry(doorW, aboveDoor, 2.5), vaultWallMat);
    lintelBlue.position.set(doorBlueX, doorH + aboveDoor / 2, vaultFrontZ);
    vaultGroup.add(lintelBlue);
  }

  // ── PROVING WINDOW (Full-height glass partition at x=0) ──
  const glassH = BLDG.glassH;  // 14
  const glassT = BLDG.glassT;  // 0.6
  const glassLen = vD - 4;     // nearly full depth of vault

  // Glass panels (two halves for shatter effect at midpoint)
  const glassBottom = new THREE.Mesh(
    new THREE.BoxGeometry(glassT, glassH, glassLen),
    glassMat
  );
  glassBottom.position.set(0, glassH / 2 + 1, vCenterZ);
  tag(glassBottom, 'proving_window_glass');
  vaultGroup.add(glassBottom);
  glassPanels.push(glassBottom);

  // Glass frame above
  const glassAbove = new THREE.Mesh(
    new THREE.BoxGeometry(glassT + 1, vH - glassH - 1, glassLen),
    ceilingMat
  );
  glassAbove.position.set(0, glassH + 1 + (vH - glassH - 1) / 2, vCenterZ);
  vaultGroup.add(glassAbove);

  // Mullions (vertical metal strips on the glass)
  const mullionCount = BLDG.mullionN;
  const mullionSpacing = glassLen / (mullionCount + 1);
  for (let i = 1; i <= mullionCount; i++) {
    const mullion = new THREE.Mesh(
      new THREE.BoxGeometry(BLDG.mullionW + 0.3, glassH + 1, BLDG.mullionW),
      mullionMat
    );
    mullion.position.set(0, glassH / 2 + 0.5, vCenterZ - glassLen / 2 + i * mullionSpacing);
    vaultGroup.add(mullion);
  }

  // Horizontal mullion bar at mid-height
  const hMullion = new THREE.Mesh(
    new THREE.BoxGeometry(BLDG.mullionW + 0.3, BLDG.mullionW, glassLen),
    mullionMat
  );
  hMullion.position.set(0, glassH / 2 + 1, vCenterZ);
  vaultGroup.add(hMullion);

  // Base frame for the glass
  const glassBase = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1, glassLen + 2),
    metalDarkMat
  );
  glassBase.position.set(0, 0.5, vCenterZ);
  vaultGroup.add(glassBase);

  // ============================================================
  //  E. THE ROTAS TURNSTILE MACHINE
  // ============================================================
  const turnstileGroup = new THREE.Group();
  turnstileGroup.position.set(0, 0, POS.turnstile.z);
  root.add(turnstileGroup);

  // Red cylinder (Forward)
  const cylR = 5.5;
  const cylH = 13;

  const redCylMat = track(new THREE.MeshStandardMaterial({
    color: 0xc52010, roughness: 0.25, metalness: 0.2
  }), surfaceMats);
  const redCyl = edged(new THREE.Mesh(
    new THREE.CylinderGeometry(cylR, cylR, cylH, 32),
    redCylMat
  ), 0x800000, 0.35);
  redCyl.position.set(8, cylH / 2, 0);
  tag(redCyl, 'turnstile_red');
  turnstileGroup.add(redCyl);

  // Blue cylinder (Inverted)
  const blueCylMat = track(new THREE.MeshStandardMaterial({
    color: 0x0870dd, roughness: 0.25, metalness: 0.2
  }), surfaceMats);
  const blueCyl = edged(new THREE.Mesh(
    new THREE.CylinderGeometry(cylR, cylR, cylH, 32),
    blueCylMat
  ), 0x003399, 0.35);
  blueCyl.position.set(-8, cylH / 2, 0);
  tag(blueCyl, 'turnstile_blue');
  turnstileGroup.add(blueCyl);

  // Glass viewing panels on cylinders (subtle transparent rings)
  const viewPanelGeo = new THREE.CylinderGeometry(cylR + 0.3, cylR + 0.3, 4, 32, 1, true);
  const viewPanelMat = track(new THREE.MeshStandardMaterial({
    color: 0xaaccee, transparent: true, opacity: 0.15, side: THREE.DoubleSide, roughness: 0.05
  }), surfaceMats);

  const redView = new THREE.Mesh(viewPanelGeo, viewPanelMat);
  redView.position.set(8, cylH / 2 + 1, 0);
  turnstileGroup.add(redView);

  const blueView = new THREE.Mesh(viewPanelGeo, viewPanelMat);
  blueView.position.set(-8, cylH / 2 + 1, 0);
  turnstileGroup.add(blueView);

  // Central wedge between cylinders
  const wedge = new THREE.Mesh(
    new THREE.CylinderGeometry(3.5, 3.5, cylH, 3),
    metalMat
  );
  wedge.position.set(0, cylH / 2, 0);
  wedge.rotation.y = Math.PI;
  turnstileGroup.add(wedge);

  // Base ring / track
  const baseRing = new THREE.Mesh(
    new THREE.TorusGeometry(8, 0.8, 8, 32),
    metalDarkMat
  );
  baseRing.rotation.x = Math.PI / 2;
  baseRing.position.set(0, 0.8, 0);
  turnstileGroup.add(baseRing);

  // Support pylons (4 vertical metal posts)
  const pylonGeo = new THREE.BoxGeometry(0.8, cylH + 2, 0.8);
  const pylonPositions = [
    [14, 0, 3], [14, 0, -3], [-14, 0, 3], [-14, 0, -3]
  ];
  for (const [px, py, pz] of pylonPositions) {
    const pylon = new THREE.Mesh(pylonGeo, metalDarkMat);
    pylon.position.set(px, (cylH + 2) / 2, pz);
    pylon.castShadow = true;
    turnstileGroup.add(pylon);
  }

  // Horizontal rail connecting pylons
  const railGeo = new THREE.BoxGeometry(0.5, 0.5, 6);
  const railL = new THREE.Mesh(railGeo, metalDarkMat);
  railL.position.set(14, cylH + 1, 0);
  turnstileGroup.add(railL);
  const railR = new THREE.Mesh(railGeo, metalDarkMat);
  railR.position.set(-14, cylH + 1, 0);
  turnstileGroup.add(railR);

  // Top cross beam
  const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(28, 0.6, 0.6), metalDarkMat);
  crossBeam.position.set(0, cylH + 1, 0);
  turnstileGroup.add(crossBeam);

  // Glow lights inside turnstile (subtle emissive)
  const redGlow = new THREE.PointLight(0xff2200, 0.6, 20);
  redGlow.position.set(8, cylH / 2, 0);
  turnstileGroup.add(redGlow);

  const blueGlow = new THREE.PointLight(0x0055ff, 0.6, 20);
  blueGlow.position.set(-8, cylH / 2, 0);
  turnstileGroup.add(blueGlow);

  // ── Vault doors (heavy blast doors) at the corridor entrances ──
  const doorGeo = new THREE.BoxGeometry(doorW + 1, doorH, 2.5);
  const redDoor = new THREE.Mesh(doorGeo, metalDarkMat);
  redDoor.position.set(doorRedX, doorH / 2, vaultFrontZ + 1);
  tag(redDoor, 'vault_door_red');
  vaultGroup.add(redDoor);

  const blueDoor = new THREE.Mesh(doorGeo, metalDarkMat);
  blueDoor.position.set(doorBlueX, doorH / 2, vaultFrontZ + 1);
  tag(blueDoor, 'vault_door_blue');
  vaultGroup.add(blueDoor);

  // ============================================================
  //  F. LOADING BAY (transition between crash hole and corridors)
  // ============================================================
  // A wider open area just inside the building
  const loadCeil = new THREE.Mesh(new THREE.BoxGeometry(bW, 1, 15), ceilingMat);
  loadCeil.position.set(0, bH, 78);
  root.add(loadCeil);

  // ============================================================
  //  G. PROPS & DETAILS
  // ============================================================
  const propsGroup = new THREE.Group();
  root.add(propsGroup);

  // Art crates along corridor walls
  const makeCrate = (x, y, z, w, h, d, mat) => {
    const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || boxMat);
    c.position.set(x, y + h / 2, z);
    c.castShadow = true;
    propsGroup.add(c);
    return c;
  };

  // Red corridor crates (art storage)
  makeCrate(22, 0, 55, 8, 10, 6, boxMat);
  makeCrate(24, 0, 48, 6, 7, 5, boxLightMat);
  makeCrate(23, 0, 38, 5, 5, 5, boxMat);

  // Blue corridor crates
  makeCrate(-22, 0, 50, 7, 9, 6, boxMat);
  makeCrate(-24, 0, 42, 5, 6, 5, boxLightMat);
  makeCrate(-21, 0, 32, 6, 8, 7, boxMat);

  // Loading bay debris / crates
  makeCrate(20, 0, 80, 10, 6, 8, boxMat);
  makeCrate(-18, 0, 82, 8, 5, 6, boxLightMat);
  makeCrate(8, 0, 76, 6, 4, 6, boxMat);

  // Vault interior crates (scattered)
  makeCrate(18, 0, -15, 5, 4, 4, boxLightMat);
  makeCrate(-20, 0, -28, 7, 6, 5, boxMat);

  // Security camera mounts (small boxes on walls)
  const camGeo = new THREE.BoxGeometry(1.2, 1.2, 1.8);
  const camPositions = [
    [bW / 2 - 0.5, corrH - 2, 60],
    [-bW / 2 + 0.5, corrH - 2, 60],
    [bW / 2 - 0.5, corrH - 2, 20],
    [-bW / 2 + 0.5, corrH - 2, 20],
  ];
  for (const [cx, cy, cz] of camPositions) {
    const cam = new THREE.Mesh(camGeo, metalDarkMat);
    cam.position.set(cx, cy, cz);
    propsGroup.add(cam);
  }

  // ============================================================
  //  H. 747 CRASH SITE & AMBULANCE
  // ============================================================
  const planeGroup = new THREE.Group();
  tag(planeGroup, '747_crash');
  planeGroup.position.set(POS.plane.x, 0, POS.plane.z);
  root.add(planeGroup);

  // Main fuselage section (half-embedded in building)
  const fuselageMat = track(new THREE.MeshStandardMaterial({ color: COL.plane, roughness: 0.6 }), surfaceMats);
  const fuselageGeo = new THREE.CylinderGeometry(10, 10, 55, 24);
  fuselageGeo.rotateZ(Math.PI / 2);
  const fuselage = new THREE.Mesh(fuselageGeo, fuselageMat);
  fuselage.position.set(-5, 10, -10);
  fuselage.rotation.y = -0.25; // angled crash
  fuselage.castShadow = true;
  planeGroup.add(fuselage);

  // Nose section (pointing into the crash hole)
  const noseGeo = new THREE.ConeGeometry(10, 18, 24);
  noseGeo.rotateZ(-Math.PI / 2);
  const nose = new THREE.Mesh(noseGeo, fuselageMat);
  nose.position.set(-30, 10, -6);
  nose.rotation.y = -0.25;
  nose.castShadow = true;
  planeGroup.add(nose);

  // Wing fragment on tarmac
  const wingGeo = new THREE.BoxGeometry(35, 1, 8);
  const wing = new THREE.Mesh(wingGeo, fuselageMat);
  wing.position.set(15, 1.5, 10);
  wing.rotation.y = 0.4;
  wing.rotation.z = 0.15;
  planeGroup.add(wing);

  // Engine pods
  const engineGeo = new THREE.CylinderGeometry(3.5, 3.5, 10, 16);
  engineGeo.rotateZ(Math.PI / 2);
  const engineMat = track(new THREE.MeshStandardMaterial({ color: COL.planeEngine, roughness: 0.7 }), surfaceMats);
  const engine1 = new THREE.Mesh(engineGeo, engineMat);
  engine1.position.set(10, 5, 15);
  engine1.rotation.y = 0.3;
  planeGroup.add(engine1);
  const engine2 = new THREE.Mesh(engineGeo, engineMat);
  engine2.position.set(20, 4, -5);
  engine2.rotation.y = -0.2;
  engine2.rotation.z = 0.1;
  planeGroup.add(engine2);

  // Scattered debris (small boxes)
  for (let i = 0; i < 12; i++) {
    const size = 1 + Math.random() * 3;
    const deb = new THREE.Mesh(
      new THREE.BoxGeometry(size, size * 0.6, size * 0.8),
      Math.random() > 0.5 ? fuselageMat : scorchMat
    );
    deb.position.set(
      (Math.random() - 0.5) * 50,
      size * 0.3,
      (Math.random() - 0.5) * 40
    );
    deb.rotation.set(Math.random() * 0.3, Math.random() * Math.PI, Math.random() * 0.3);
    planeGroup.add(deb);
  }

  // Stylized fire blobs at crash point
  const createFireBlob = (x, y, z, s) => {
    const bGroup = new THREE.Group();
    bGroup.position.set(x, y, z);
    const colors = [0xe62915, 0xff8c00, 0xffd700];
    for (let i = 0; i < 4; i++) {
      const geo = new THREE.IcosahedronGeometry(s * (0.5 + Math.random() * 0.8), 0);
      const mat = new THREE.MeshStandardMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        roughness: 0.8, flatShading: true
      });
      const m = new THREE.Mesh(geo, track(mat, surfaceMats));
      m.position.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
      m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      bGroup.add(m);
    }
    return bGroup;
  };

  planeGroup.add(createFireBlob(-25, 8, -8, 5));
  planeGroup.add(createFireBlob(-15, 4, 5, 4));
  planeGroup.add(createFireBlob(-30, 10, -2, 6));
  planeGroup.add(createFireBlob(5, 3, 15, 3));

  // Green Ambulance (Van)
  const vanGroup = new THREE.Group();
  tag(vanGroup, 'ambulance_van');
  vanGroup.position.set(-35, 0, POS.plane.z + 15);
  root.add(vanGroup);

  const vanMat = track(new THREE.MeshStandardMaterial({ color: 0x76a328, roughness: 0.5 }), surfaceMats);
  const vanBody = new THREE.Mesh(new THREE.BoxGeometry(12, 10, 24), vanMat);
  vanBody.position.set(0, 5, 0);
  vanBody.rotation.y = 0.3;
  vanBody.castShadow = true;
  vanGroup.add(vanBody);

  const vanCab = new THREE.Mesh(new THREE.BoxGeometry(12, 8, 8), vanMat);
  vanCab.position.set(Math.sin(0.3) * 14, 4, Math.cos(0.3) * 14);
  vanCab.rotation.y = 0.3;
  vanCab.castShadow = true;
  vanGroup.add(vanCab);

  // ============================================================
  //  I. RED/BLUE AMBIENT LIGHTING (inside the building)
  // ============================================================
  // Red side corridor light
  const redAmb = new THREE.PointLight(COL.ambientRed, 0.5, 60);
  redAmb.position.set(corrW / 2 + divT / 2, 12, 40);
  root.add(redAmb);

  // Blue side corridor light
  const blueAmb = new THREE.PointLight(COL.ambientBlue, 0.5, 60);
  blueAmb.position.set(-corrW / 2 - divT / 2, 12, 40);
  root.add(blueAmb);

  // Vault red side light
  const vRedLight = new THREE.PointLight(0xffe0d0, 0.4, 40);
  vRedLight.position.set(14, 10, POS.vault.z);
  root.add(vRedLight);

  // Vault blue side light
  const vBlueLight = new THREE.PointLight(0xd0e0ff, 0.4, 40);
  vBlueLight.position.set(-14, 10, POS.vault.z);
  root.add(vBlueLight);

  return {
    surfaceMats, glassPanels, vaultGroup, planeGroup, vanGroup, editables,
    turnstileGroup, shellGroup, corrGroup, propsGroup,
  };
}
