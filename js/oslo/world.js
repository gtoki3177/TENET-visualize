import * as THREE from 'three';
import { COL, POS, clamp01, lerp } from './config.js';
import { buildLandmarks } from './landmarks.js';

export function buildWorld(scene) {
  const root = new THREE.Group();
  scene.add(root);

  // ============================================================
  //  A. AIRPORT TARMAC (ground plane)
  // ============================================================

  // Main tarmac surface
  const tarmacGeo = new THREE.PlaneGeometry(800, 600, 1, 1);
  tarmacGeo.rotateX(-Math.PI / 2);
  const tarmacMat = new THREE.MeshStandardMaterial({
    color: COL.tarmac, roughness: 0.92, metalness: 0.02
  });
  const tarmac = new THREE.Mesh(tarmacGeo, tarmacMat);
  tarmac.position.y = -0.1;
  tarmac.receiveShadow = true;
  root.add(tarmac);

  // Taxiway center line (yellow)
  const taxiLineMat = new THREE.MeshStandardMaterial({
    color: COL.tarmacLine, roughness: 0.8, emissive: COL.tarmacLine, emissiveIntensity: 0.15
  });
  // Dashed center line running east-west across the south area
  for (let i = -8; i < 8; i++) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(12, 0.08, 0.6), taxiLineMat);
    dash.position.set(i * 18, 0.01, 160);
    root.add(dash);
  }

  // Edge markings (white lines along the building perimeter)
  const edgeLineMat = new THREE.MeshStandardMaterial({
    color: COL.tarmacWhite, roughness: 0.85
  });
  // South edge line
  const southEdge = new THREE.Mesh(new THREE.BoxGeometry(120, 0.08, 0.4), edgeLineMat);
  southEdge.position.set(0, 0.01, POS.southWall.z + 12);
  root.add(southEdge);
  // Another edge line further south
  const southEdge2 = new THREE.Mesh(new THREE.BoxGeometry(200, 0.08, 0.4), edgeLineMat);
  southEdge2.position.set(0, 0.01, 140);
  root.add(southEdge2);

  // Taxiway guide lights (small emissive spheres)
  const guideLightMat = new THREE.MeshStandardMaterial({
    color: 0xeedd44, emissive: 0xeedd44, emissiveIntensity: 0.8, roughness: 0.3
  });
  const guideLightGeo = new THREE.SphereGeometry(0.4, 8, 8);
  for (let i = -6; i <= 6; i++) {
    const light = new THREE.Mesh(guideLightGeo, guideLightMat);
    light.position.set(i * 20, 0.4, 160);
    root.add(light);
  }

  // ============================================================
  //  B. BACKGROUND ELEMENTS
  // ============================================================

  // Distant control tower silhouette
  const towerGroup = new THREE.Group();
  towerGroup.position.set(-200, 0, 250);
  const towerBase = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 5, 45, 8),
    new THREE.MeshStandardMaterial({ color: 0x606870, roughness: 0.9 })
  );
  towerBase.position.y = 22.5;
  towerGroup.add(towerBase);
  const towerCab = new THREE.Mesh(
    new THREE.BoxGeometry(14, 6, 14),
    new THREE.MeshStandardMaterial({ color: 0x708090, roughness: 0.7 })
  );
  towerCab.position.y = 48;
  towerGroup.add(towerCab);
  // Tower glass windows
  const towerGlass = new THREE.Mesh(
    new THREE.BoxGeometry(14.5, 4, 14.5),
    new THREE.MeshStandardMaterial({ color: 0x88aacc, roughness: 0.1, transparent: true, opacity: 0.6 })
  );
  towerGlass.position.y = 47;
  towerGroup.add(towerGlass);
  root.add(towerGroup);

  // Distant hangars (simple boxes)
  const hangarMat = new THREE.MeshStandardMaterial({ color: 0x707880, roughness: 0.9 });
  const hangar1 = new THREE.Mesh(new THREE.BoxGeometry(60, 18, 35), hangarMat);
  hangar1.position.set(180, 9, 220);
  root.add(hangar1);
  const hangar2 = new THREE.Mesh(new THREE.BoxGeometry(45, 15, 30), hangarMat);
  hangar2.position.set(250, 7.5, 250);
  root.add(hangar2);

  // Perimeter fence (line of thin posts)
  const fencePostGeo = new THREE.BoxGeometry(0.3, 3, 0.3);
  const fencePostMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8 });
  for (let i = -15; i <= 15; i++) {
    const post = new THREE.Mesh(fencePostGeo, fencePostMat);
    post.position.set(i * 20, 1.5, 280);
    root.add(post);
  }
  // Fence wire (thin box connecting posts)
  const fenceWire = new THREE.Mesh(
    new THREE.BoxGeometry(600, 0.08, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x999999, roughness: 0.7 })
  );
  fenceWire.position.set(0, 2.5, 280);
  root.add(fenceWire);
  const fenceWire2 = fenceWire.clone();
  fenceWire2.position.y = 1.5;
  root.add(fenceWire2);

  // ============================================================
  //  C. STATIC LANDMARKS (building, rooms, turnstile)
  // ============================================================
  const landmarks = buildLandmarks(root);

  // ============================================================
  //  D. FIRE / SMOKE EFFECTS
  // ============================================================

  // ── Fire particles at crash site ──
  const N_FIRE = 80;
  const fireGeo = new THREE.BufferGeometry();
  const firePositions = new Float32Array(N_FIRE * 3);
  const fireDirs = [];
  const fireCenter = new THREE.Vector3(POS.crashHole.x, 8, POS.crashHole.z);

  for (let i = 0; i < N_FIRE; i++) {
    fireDirs.push(new THREE.Vector3(
      (Math.random() - 0.5) * 20,
      Math.random() * 22 + 5,
      (Math.random() - 0.5) * 16
    ));
    firePositions[i * 3]     = fireCenter.x;
    firePositions[i * 3 + 1] = 8;
    firePositions[i * 3 + 2] = fireCenter.z;
  }
  fireGeo.setAttribute('position', new THREE.BufferAttribute(firePositions, 3));
  const fireMat = new THREE.PointsMaterial({
    color: COL.fire, size: 2.8, transparent: true, opacity: 0.8
  });
  const fire = new THREE.Points(fireGeo, fireMat);
  root.add(fire);
  fire.userData = { dirs: fireDirs, center: fireCenter };

  const fireLight = new THREE.PointLight(COL.fireGlow, 0, 140);
  fireLight.position.copy(fireCenter).setY(14);
  root.add(fireLight);

  // Fire glow on tarmac surface (projected light)
  const tarmacFireLight = new THREE.PointLight(0xff6622, 0, 60);
  tarmacFireLight.position.set(POS.plane.x, 3, POS.plane.z);
  root.add(tarmacFireLight);

  // ── Smoke column (dark particles rising from crash) ──
  const N_SMOKE = 50;
  const smokeGeo = new THREE.BufferGeometry();
  const smokePositions = new Float32Array(N_SMOKE * 3);
  const smokeDirs = [];
  for (let i = 0; i < N_SMOKE; i++) {
    smokeDirs.push(new THREE.Vector3(
      (Math.random() - 0.5) * 12,
      Math.random() * 40 + 15,
      (Math.random() - 0.5) * 10
    ));
    smokePositions[i * 3]     = fireCenter.x;
    smokePositions[i * 3 + 1] = 15;
    smokePositions[i * 3 + 2] = fireCenter.z;
  }
  smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3));
  const smokeMat = new THREE.PointsMaterial({
    color: COL.smoke, size: 4.5, transparent: true, opacity: 0
  });
  const smoke = new THREE.Points(smokeGeo, smokeMat);
  root.add(smoke);

  // ── Embers (tiny orange particles drifting) ──
  const N_EMBER = 35;
  const emberGeo = new THREE.BufferGeometry();
  const emberPositions = new Float32Array(N_EMBER * 3);
  const emberDirs = [];
  for (let i = 0; i < N_EMBER; i++) {
    emberDirs.push(new THREE.Vector3(
      (Math.random() - 0.5) * 30 + 5, // drift with wind
      Math.random() * 35 + 5,
      (Math.random() - 0.5) * 20
    ));
    emberPositions[i * 3]     = fireCenter.x;
    emberPositions[i * 3 + 1] = 10;
    emberPositions[i * 3 + 2] = fireCenter.z;
  }
  emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3));
  const emberMat = new THREE.PointsMaterial({
    color: COL.ember, size: 1.2, transparent: true, opacity: 0
  });
  const embers = new THREE.Points(emberGeo, emberMat);
  root.add(embers);

  // ── Glass shatter particles (at Proving Window) ──
  const N_GLASS = 50;
  const glassGeo = new THREE.BufferGeometry();
  const glassPos = new Float32Array(N_GLASS * 3);
  const glassDirs = [];
  for (let i = 0; i < N_GLASS; i++) {
    glassDirs.push(new THREE.Vector3(
      (Math.random() - 0.5) * 14,
      Math.random() * 10 + 2,
      (Math.random() - 0.5) * 18
    ));
  }
  glassGeo.setAttribute('position', new THREE.BufferAttribute(glassPos, 3));
  const glassMat = new THREE.PointsMaterial({
    color: COL.glass, size: 1.6, transparent: true, opacity: 0
  });
  const glassShatter = new THREE.Points(glassGeo, glassMat);
  glassShatter.position.set(POS.provingWin.x, 8, POS.provingWin.z);
  root.add(glassShatter);

  // ============================================================
  //  E. CAMERA FRAMINGS
  // ============================================================
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const locations = {
    exterior: {
      label: 'Freeport Overview',
      target: v(0, 8, 0),
      pos: v(120, 95, 150),
    },
    crash: {
      label: 'Crash Site',
      target: v(POS.crashHole.x, 10, POS.crashHole.z),
      pos: v(POS.crashHole.x - 35, 30, POS.crashHole.z + 45),
    },
    hallway: {
      label: 'Rolling Doors (sides)',
      target: v(POS.gateEast.x, 8, POS.gateEast.z),
      pos: v(POS.gateEast.x + 60, 34, POS.gateEast.z + 40),
    },
    turnstile: {
      label: 'Turnstile Room',
      target: v(0, 8, -2),
      pos: v(40, 30, 44),
    },
  };

  const points = {
    exterior:  v(0, 24, -8),
    crash:     v(POS.crashHole.x, 20, POS.crashHole.z),
    gateEast:  v(POS.gateEast.x, 13, POS.gateEast.z),
    gateWest:  v(POS.gateWest.x, 13, POS.gateWest.z),
    partition: v(POS.provingWin.x, 15, POS.provingWin.z),
    turnstile: v(0, 15, POS.turnstile.z),
  };

  // ============================================================
  //  F. X-RAY TOGGLE
  // ============================================================
  let xray = false;
  function setXray(on) {
    xray = on;
    for (const m of landmarks.surfaceMats) {
      m.transparent = true;
      m.opacity = on ? 0.10 : (m.userData?.baseOpacity ?? 1);
      m.depthWrite = !on;
    }
    tarmacMat.transparent = true;
    tarmacMat.opacity = on ? 0.06 : 1;
    tarmacMat.depthWrite = !on;
  }

  // ============================================================
  //  G. UPDATE(t)
  // ============================================================
  function update(t) {
    // Fire grows with time
    const fireAmt = clamp01(t / 0.15);
    const fArr = fire.geometry.attributes.position.array;
    fireDirs.forEach((d, i) => {
      const anim = (Math.sin(t * 8 + i * 0.7) * 0.3 + 0.7) * fireAmt;
      fArr[i * 3]     = fire.userData.center.x + d.x * anim;
      fArr[i * 3 + 1] = fire.userData.center.y + d.y * anim;
      fArr[i * 3 + 2] = fire.userData.center.z + d.z * anim;
    });
    fire.geometry.attributes.position.needsUpdate = true;
    fireMat.opacity = 0.4 + 0.5 * fireAmt;
    fireLight.intensity = fireAmt * 3.0;
    tarmacFireLight.intensity = fireAmt * 1.5;

    // Smoke rises
    const smokeAmt = clamp01(t / 0.2);
    const sArr = smoke.geometry.attributes.position.array;
    smokeDirs.forEach((d, i) => {
      const phase = (Math.sin(t * 3 + i * 1.2) * 0.2 + 0.8) * smokeAmt;
      sArr[i * 3]     = fireCenter.x + d.x * phase;
      sArr[i * 3 + 1] = 15 + d.y * phase;
      sArr[i * 3 + 2] = fireCenter.z + d.z * phase;
    });
    smoke.geometry.attributes.position.needsUpdate = true;
    smokeMat.opacity = smokeAmt * 0.25;

    // Embers drift
    const emberAmt = clamp01((t - 0.05) / 0.15);
    const eArr = embers.geometry.attributes.position.array;
    emberDirs.forEach((d, i) => {
      const phase = (Math.sin(t * 5 + i * 2.1) * 0.4 + 0.6) * emberAmt;
      eArr[i * 3]     = fireCenter.x + d.x * phase;
      eArr[i * 3 + 1] = 10 + d.y * phase;
      eArr[i * 3 + 2] = fireCenter.z + d.z * phase;
    });
    embers.geometry.attributes.position.needsUpdate = true;
    emberMat.opacity = emberAmt * 0.6;

    // Glass shatter (proving window burst at t ≈ 0.45)
    const shatterT = clamp01((t - 0.42) / 0.08);
    const shatterFade = 1 - clamp01((t - 0.55) / 0.1);
    glassMat.opacity = shatterT * shatterFade * 0.8;
    const gArr = glassShatter.geometry.attributes.position.array;
    glassDirs.forEach((d, i) => {
      gArr[i * 3]     = d.x * shatterT;
      gArr[i * 3 + 1] = d.y * shatterT;
      gArr[i * 3 + 2] = d.z * shatterT;
    });
    glassShatter.geometry.attributes.position.needsUpdate = true;
  }

  return {
    root, tarmac, landmarks, locations, points,
    update, setXray,
    get xray() { return xray; },
  };
}
