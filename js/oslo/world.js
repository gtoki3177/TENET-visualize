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
  tarmac.position.set(0, -0.1, -120);   // shifted north so the freeport sits centred on the floor
  tarmac.receiveShadow = true;
  root.add(tarmac);

  // (Runway markings, taxiway lights, control tower, hangars and perimeter fence removed —
  //  the scene is just the freeport buildings on the tarmac now.)

  // ============================================================
  //  C. STATIC LANDMARKS (building, rooms, turnstile)
  // ============================================================
  const landmarks = buildLandmarks(root);

  // ============================================================
  //  D. FIRE / SMOKE EFFECTS
  // ============================================================

  // ── Fire at the crash site: additive rising-flame particles across several burning cores of
  //    the wreck (not one blob). Motion runs in real time (flickers even when the clock is
  //    paused); the timeline only gates its intensity (see fireAmt in update). ──
  const N_FIRE = 180;
  const fireCenter = new THREE.Vector3(POS.crashHole.x, 0, POS.crashHole.z);
  const fireCores = [[0, 0], [15, 6], [-13, -5], [7, -13], [-9, 11], [22, -3], [-19, 3], [4, 16]];
  const fireGeo = new THREE.BufferGeometry();
  const firePositions = new Float32Array(N_FIRE * 3);
  const fireColors = new Float32Array(N_FIRE * 3);
  const fireP = [];
  for (let i = 0; i < N_FIRE; i++) {
    const c = fireCores[i % fireCores.length];
    const a = Math.random() * Math.PI * 2, rr = Math.random() * 6;
    const p = {
      x: fireCenter.x + c[0] + Math.cos(a) * rr,
      z: fireCenter.z + c[1] + Math.sin(a) * rr,
      h: 13 + Math.random() * 17,            // flame height
      speed: 0.7 + Math.random() * 1.1,      // rise loops per real second
      off: Math.random(),
      sway: 1.4 + Math.random() * 2.6,
    };
    fireP.push(p);
    firePositions[i * 3] = p.x; firePositions[i * 3 + 2] = p.z;
  }
  fireGeo.setAttribute('position', new THREE.BufferAttribute(firePositions, 3));
  fireGeo.setAttribute('color', new THREE.BufferAttribute(fireColors, 3));
  const fireMat = new THREE.PointsMaterial({
    size: 4.2, vertexColors: true, transparent: true, opacity: 0.95,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const fire = new THREE.Points(fireGeo, fireMat);
  root.add(fire);

  const fireLight = new THREE.PointLight(COL.fireGlow, 0, 150);
  fireLight.position.set(fireCenter.x, 14, fireCenter.z);
  root.add(fireLight);

  // Fire glow on tarmac surface (projected light)
  const tarmacFireLight = new THREE.PointLight(0xff6622, 0, 70);
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
    color: COL.ember, size: 1.0, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const embers = new THREE.Points(emberGeo, emberMat);
  root.add(embers);


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
    // 747 skids IN ALONG THE GROUND from the north and slams to rest at t=0 (a ground crash,
    // not a descent from the sky — stays at y=0 the whole way in).
    const fly = clamp01((t + 0.08) / 0.08);   // 0 at t=-0.08 → 1 at t=0
    landmarks.planeGroup.position.set(
      POS.plane.x + (1 - fly) * 16,
      0,
      POS.plane.z - (1 - fly) * 180,
    );
    // Turnstile: before a figure emerges the outward opening WINDS 180° to the far side
    // (blue CCW / red CW), then UNWINDS back to front (the way it came) AS the figure
    // appears. Two emergence beats (cycle END = appearance): Neil 2 at 0:07, TP 2 at 1:00.
    if (landmarks.turnstile) {
      const wr = (ta, w, r) => {           // 0→π over [ta-w-r, ta-r], then π→0 over [ta-r, ta]
        if (t <= ta - w - r || t >= ta) return 0;
        return t < ta - r ? Math.PI * (t - (ta - w - r)) / w : Math.PI * (1 - (t - (ta - r)) / r);
      };
      const SPIN = 7 / 180;   // wind+unwind in ~7s of the 180s clock, split evenly
      const ang = wr(8 / 180, SPIN / 2, SPIN / 2)    // first turn: starts 0:01, ends 0:08
                + wr(60 / 180, SPIN / 2, SPIN / 2);  // second turn: starts 0:53, ends 1:00
      landmarks.turnstile.blue.rotation.y = ang;    // CCW out, CW back
      landmarks.turnstile.red.rotation.y = -ang;    // CW out, CCW back
    }

    // Bullet holes on the proving-window glass: synced to the plane impact — the 4 pop in
    // inner→outer right as the 747 hits (t≈0), then repair (un-shoot) inner→outer over 1:06–1:15.
    if (landmarks.bulletHoles) {
      const APP = [0, 1, 2, 3], REP = [66, 69, 72, 75], RAMP = 0.6;   // seconds
      landmarks.bulletHoles.forEach((h, i) => {
        const a = APP[i] / 180, r = REP[i] / 180, ramp = RAMP / 180;
        let s;
        if (t < a) s = 0;
        else if (t < a + ramp) s = (t - a) / ramp;          // pop in
        else if (t < r) s = 1;
        else if (t < r + ramp) s = 1 - (t - r) / ramp;       // repair (shrink away)
        else s = 0;
        h.visible = s > 0.001;
        h.scale.setScalar(Math.max(0.001, s));
      });
    }

    // Fire — real-time rising flames; the timeline only gates intensity (grows in after impact).
    const fireAmt = clamp01(t / 0.1);
    const ft = performance.now() * 0.001;
    const fpos = fire.geometry.attributes.position.array;
    const fcol = fire.geometry.attributes.color.array;
    for (let i = 0; i < N_FIRE; i++) {
      const p = fireP[i];
      const ph = (ft * p.speed + p.off) % 1;                 // 0→1 rise loop
      fpos[i * 3]     = p.x + Math.sin(ft * 3 + i) * p.sway * ph;
      fpos[i * 3 + 1] = ph * p.h * (0.45 + 0.55 * fireAmt);
      fpos[i * 3 + 2] = p.z + Math.cos(ft * 2.6 + i * 1.3) * p.sway * ph;
      // hot yellow at the base → orange → red, fading out near the top (additive → fade = clear)
      const k = Math.max(0, (1 - ph) * fireAmt * (0.7 + 0.3 * Math.sin(ft * 13 + i * 3)));
      fcol[i * 3]     = k;                          // R
      fcol[i * 3 + 1] = k * (0.6 - 0.5 * ph);       // G (yellow at base)
      fcol[i * 3 + 2] = k * 0.1 * (1 - ph);         // B (faint, base only)
    }
    fire.geometry.attributes.position.needsUpdate = true;
    fire.geometry.attributes.color.needsUpdate = true;
    fireLight.intensity = fireAmt * (3.0 + 0.6 * Math.sin(ft * 11));
    tarmacFireLight.intensity = fireAmt * 1.6;

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
  }

  return {
    root, tarmac, landmarks, locations, points,
    update, setXray,
    get xray() { return xray; },
  };
}
