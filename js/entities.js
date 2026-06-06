import * as THREE from 'three';
import { COL, POS, groundHeight, clamp01, lerp } from './config.js';

const gY = groundHeight;

// Sample a keyframe track into `out` (avoids allocating a Vector3 every frame).
function kf(frames, t, out) {
  if (t <= frames[0].t) return out.copy(frames[0].p);
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i], b = frames[i + 1];
    if (t <= b.t) return out.lerpVectors(a.p, b.p, (t - a.t) / (b.t - a.t));
  }
  return out.copy(frames[frames.length - 1].p);
}
const _v = new THREE.Vector3();   // shared scratch for per-frame sampling
const gp = (x, z) => new THREE.Vector3(x, gY(x, z), z);
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

// withContainer: a slung shipping container marks an EXTRACTION helicopter
// (carrying troops out); a bare helicopter is inserting/landing.
function makeHeli(color, withContainer = false) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(2.6, 9, 4, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
  body.rotation.z = Math.PI / 2; body.castShadow = true;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(11, 1.4, 1.4),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
  tail.position.x = -9;
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(26, 0.4, 1.6),
    new THREE.MeshStandardMaterial({ color: COL.edge, transparent: true, opacity: 0.45 }));
  rotor.position.y = 4;
  const rotor2 = rotor.clone(); rotor2.rotation.y = Math.PI / 2;
  g.add(body, tail, rotor, rotor2);
  g.userData.rotors = [rotor, rotor2];
  if (withContainer) {
    const cont = new THREE.Mesh(new THREE.BoxGeometry(11, 4.5, 4.5),
      new THREE.MeshStandardMaterial({ color: COL.inverted, roughness: 0.85 }));
    cont.position.y = -7; cont.castShadow = true; g.add(cont);
    const cm = new THREE.LineBasicMaterial({ color: COL.edge, transparent: true, opacity: 0.45 });
    for (const dx of [-3.5, 3.5]) {
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(
        [new THREE.Vector3(dx, -1.5, 0), new THREE.Vector3(dx * 0.4, -5, 0)]), cm));
    }
  }
  return g;
}

function makeCar(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(11, 4, 6),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
  body.position.y = 3.5; body.castShadow = true;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(6, 3.5, 5.4),
    new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
  cab.position.set(-1, 6.5, 0);
  g.add(body, cab);
  return g;
}

function makeBurst(center, color) {
  const N = 90;
  const geo = new THREE.BufferGeometry();
  const dirs = [];
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  for (let i = 0; i < N; i++) dirs.push(new THREE.Vector3(
    Math.random() - 0.5, Math.random() * 0.8 + 0.1, Math.random() - 0.5
  ).normalize().multiplyScalar(14 + Math.random() * 30));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 1.7, transparent: true, opacity: 0.9 }));
  pts.userData = { center, dirs };
  return pts;
}

export function buildEntities(scene, world) {
  const root = new THREE.Group();
  scene.add(root);
  const vy = world.vy;
  const cave = POS.cave, cy = gY(cave.x, cave.z);
  const lz = POS.lz, hill = POS.hill, ts = POS.turnstile;
  const gate = POS.gate, chamber = POS.chamber, volk = POS.volkov;

  // State exposed to app.js so the labels can recolour live.
  const flags = { neil1Forward: false };

  // ---------- Helicopters ----------
  // Red Team's Chinooks INSERT at the southern main LZ (bare — landing).
  const redHelis = [makeHeli(COL.forward), makeHeli(COL.forward)];
  redHelis.forEach((h, i) => { h.position.set(lz.x - 26 + i * 52, 70, lz.z + 8); root.add(h); });
  // Blue Team (inverted) is airlifted OUT at the main LZ — extraction, carries containers.
  const blueHelis = [makeHeli(COL.inverted, true), makeHeli(COL.inverted, true)];
  blueHelis.forEach((h, i) => { const bx = lz.x + 50 + i * 22, bz = lz.z + 34;
    h.position.set(bx, gY(bx, bz) + 11, bz); root.add(h); });
  // Red Team's extraction Chinook — bare (red helis carry no containers).
  const exPadY = gY(hill.x, hill.z);
  const exHeli = makeHeli(COL.forward, false); exHeli.visible = false; root.add(exHeli);
  // Blue extraction helis lift away from the SE hypocenter at the blast (containers).
  const hypoBlueHelis = [makeHeli(COL.inverted, true), makeHeli(COL.inverted, true)];
  hypoBlueHelis.forEach(h => { h.visible = false; root.add(h); });
  // Volkov's grey INSERTION helicopter (airdrops him at the northern cave — bare).
  const volkovHeli = makeHeli(0xb9c0c8); root.add(volkovHeli);

  // Disembark/board points: the GROUND spots directly under each transport, so troops
  // spill out of (and later climb back into) the helis/containers rather than the bare LZ.
  const redInsSpot = i => gp(lz.x - 26 + i * 52, lz.z + 8);        // under the 2 red Chinooks
  const redExtSpot = gp(hill.x + 8, hill.z - 4);                   // under the red extraction Chinook
  const blueInsSpot = i => gp(lz.x + 50 + i * 22, lz.z + 34);      // under the 2 blue container helis
  const blueExtSpot = i => gp(hill.x - 24 + i * 48, hill.z + 22);  // under the 2 blue extraction helis

  // ---------- Red team (forward): disembark Chinooks → battlefield assault → board extraction Chinook ----------
  const redTeam = [];
  for (let i = 0; i < 12; i++) {
    const u = makeUnit(COL.forward, 0.8); root.add(u);
    redTeam.push({ u,
      heli: i < 6 ? 0 : 1,                       // which insertion Chinook he rides in on
      emergeT: 0.08 + (i % 6) * 0.016,           // staggered disembark 0.08→0.16 (after the Chinook sets down)
      boardT:  0.88 + (i % 6) * 0.013,           // staggered re-board 0.88→0.95 (before the Chinook lifts)
      pBat: gp(-58 + (i % 5) * 22, -120 - (i % 3) * 18),
      pHypo: gp(hill.x - 22 + (i % 4) * 13, hill.z + 18 + Math.floor(i / 4) * 11) }); // stage beside Blue
  }
  // ---------- Blue team (inverted) round-trip, seen in forward time ----------
  // Spills sequentially out of the LZ containers (t≈0) → fights across the battlefield →
  // climbs back into the SE hypocenter containers, which then lift away at the blast (t=1).
  const blueTeam = [];
  for (let i = 0; i < 12; i++) {
    const u = makeUnit(COL.inverted, 0.8); root.add(u);
    blueTeam.push({ u,
      heli: i < 6 ? 0 : 1,                       // which container heli he emerges from
      emergeT: 0.08 + (i % 6) * 0.016,           // staggered emerge 0.08→0.16 (after the containers set down)
      boardT:  0.83 + (i % 6) * 0.014,           // staggered load 0.83→0.91 (before the containers lift)
      pBat:  gp(-54 + (i % 5) * 22, -108 - (i % 3) * 16),
      pHypo: gp(hill.x - 28 + (i % 4) * 13, hill.z - 28 + Math.floor(i / 4) * 11) });
  }

  // ---------- Protagonist & Ives (forward): LZ → north cave → underground SE to the vault ----------
  const tp = makeUnit(COL.forward, 1.15); root.add(tp);
  const ives = makeUnit(COL.forward, 1.15); root.add(ives);
  const TP_EMERGE = 0.12;   // TP & Ives disembark the red Chinook with the assault wave
  const tpFrames = [
    { t: 0.00, p: gp(lz.x - 26, lz.z + 8) },        // aboard the red Chinook on the LZ
    { t: TP_EMERGE, p: gp(lz.x - 26, lz.z + 8) },   // step out as it sets down
    { t: 0.18, p: gp(ts.x + 26, ts.z + 6) },
    { t: 0.22, p: gp(-22, -80) },
    { t: 0.34, p: gp(8, -155) },                        // heading NE toward the cave
    { t: 0.44, p: gp(cave.x + 20, cave.z + 28) },
    { t: 0.52, p: gp(cave.x + 6, cave.z + 8) },
    { t: 0.55, p: gp(cave.x, cave.z) },
    { t: 0.58, p: up(cave.x, cy - 14, cave.z) },
    { t: 0.63, p: up(cave.x + 28, vy + 8, cave.z + 20) }, // bottom of shaft, turning SE
    { t: 0.67, p: up(155, vy, -80) },                   // traversing east underground
    { t: 0.70, p: up(gate.x - 8, vy, gate.z - 16) },
    { t: 0.80, p: up(gate.x - 8, vy, gate.z - 16) },
    { t: 0.84, p: up(volk.x, vy, volk.z - 2) },
    { t: 0.88, p: up(chamber.x, vy, chamber.z) },
    { t: 0.93, p: up(chamber.x, vy + 30, chamber.z) },
    { t: 0.97, p: gp(hill.x - 10, hill.z) },
  ];
  const ivesFrames = tpFrames.map(f => ({ t: Math.min(1.1, f.t + 0.01), p: f.p.clone().add(new THREE.Vector3(7, 0, 6)) }));

  // ---------- Volkov: airdrops at the cave, sets the trap, then descends to guard ----------
  const volkov = makeUnit(0xcfd6de, 1.1); root.add(volkov);
  const volkovFrames = [
    { t: 0.28, p: up(cave.x + 4, cy + 46, cave.z + 4) },
    { t: 0.34, p: gp(cave.x + 8, cave.z + 6) },
    { t: 0.40, p: gp(cave.x + 4, cave.z + 2) },
    { t: 0.45, p: up(cave.x, cy - 10, cave.z) },
    { t: 0.55, p: up(cave.x + 28, vy + 8, cave.z + 20) },
    { t: 0.62, p: up(155, vy, -80) },
    { t: 0.70, p: up(volk.x, vy, volk.z) },
    { t: 1.00, p: up(volk.x, vy, volk.z) },
  ];

  // ---------- Neil — After: the inverted (blue) self at the gate ----------
  const neilGate = makeUnit(COL.inverted, 1.1, true); root.add(neilGate);
  const ngLie = up(gate.x + 6, vy, gate.z + 12), ngStand = up(gate.x, vy, gate.z + 6);
  // After opening the gate he runs back UP the tunnel (reverse of the descent) to the
  // turnstile, arriving at t=1.10 to vanish into it together with his forward self.
  const futureRun = [
    { t: 0.86, p: up(gate.x - 4, vy + 8, gate.z + 4) },     // at the gate, just opened it
    { t: 0.93, p: up(255, vy + 4, 5) },                     // back up the tunnel
    { t: 0.99, p: up(150, vy + 5, -80) },
    { t: 1.03, p: up(cave.x + 26, vy + 12, cave.z + 18) },  // climbing the shaft
    { t: 1.06, p: up(cave.x, cy - 4, cave.z) },             // at the cave mouth
    { t: 1.08, p: gp(cave.x - 26, cave.z + 22) },           // surfaced, running for the turnstile
    { t: 1.10, p: gp(ts.x + 4, ts.z) },                     // enters the turnstile (with his forward self)
  ];

  // ---------- The reversing bullet ----------
  const bullet = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffcf6b }));
  bullet.visible = false; root.add(bullet);
  const gunPt = up(volk.x, vy + 5, volk.z), hitPt = up(gate.x, vy + 5, gate.z + 6);

  // ---------- Neil — FWD: appears at the turnstile at t=0.40 (forward/red copy) ----------
  // Reverts at the turnstile (→ red), gets in the car, rides through the rescue, then
  // after the blast steps OUT of the car and walks back to the turnstile to invert.
  const neil = makeUnit(COL.inverted, 1.15); root.add(neil);
  const neilFrames = [
    { t: 0.40, p: gp(ts.x + 2, ts.z) },         // appears at the turnstile pyramid (immediately red)
    { t: 0.45, p: gp(ts.x + 6, ts.z - 14) },    // gets in the car — invisible (riding) until the blast
    { t: 1.00, p: gp(345, 62) },                // blast over — steps out of the car on the plateau
    { t: 1.04, p: gp(220, -40) },               // walking back down the apron (along the tunnel diagonal)
    { t: 1.07, p: gp(20, -55) },                // crossing back toward the turnstile
    { t: 1.10, p: gp(ts.x + 4, ts.z) },         // enters the turnstile (with his After self)
  ];

  // ---------- Neil's green car ----------
  // Trails behind TP toward the cave (honking), then drives on to the hill for the
  // rope rescue. After the blast it stays on the plateau — Neil continues on foot.
  const car = makeCar(COL.neilCar); root.add(car);
  const carFrames = [
    { t: 0.00, p: gp(ts.x + 8, ts.z - 18) },       // parked in the north ramp corridor
    { t: 0.42, p: gp(ts.x + 8, ts.z - 18) },       // still parked as Neil reverts
    { t: 0.45, p: gp(ts.x + 6, ts.z - 14) },       // Neil gets in (by the pyramid)
    { t: 0.49, p: gp(ts.x + 16, ts.z - 66) },      // up the north ramp, out of the pit
    { t: 0.52, p: gp(cave.x - 2, cave.z + 42) },   // closing on TP, honking
    { t: 0.55, p: gp(cave.x - 14, cave.z + 30) },  // TP enters the cave — car stops just outside
    { t: 0.64, p: gp(cave.x - 14, cave.z + 30) },  // waits
    { t: 0.80, p: gp(126, -116) },                 // apron foot (NW, on the tunnel-aligned slope)
    { t: 0.86, p: gp(204, -54) },                  // climbing the diagonal
    { t: 0.90, p: gp(266, -4) },                   // upper slope
    { t: 0.94, p: gp(345, 62) },                   // on the plateau — pulls TP & Ives out
    { t: 1.10, p: gp(345, 62) },                   // stays here (Neil leaves on foot)
  ];

  // ---------- Neil — BWD: the inverted (blue) self riding with Blue Team ----------
  // His subjective journey: off the Blue helicopter at the hypocenter → advances with
  // Blue across the battlefield → peels off to the turnstile and enters it. Because he
  // is inverted, world-time runs this in reverse (turnstile at 0.40 → hypocenter at 0.94).
  const neil3 = makeUnit(COL.inverted, 1.15); neil3.visible = false; root.add(neil3);
  const neil3Frames = [
    { t: 0.40, p: gp(ts.x - 3, ts.z + 2) },         // at the turnstile (his subjective END — enters here)
    { t: 0.48, p: gp(-52, -106) },                  // peels past the battlefield entrance
    { t: 0.58, p: gp(-18, -150) },                  // crossing the battlefield with Blue
    { t: 0.74, p: gp(180, 20) },                    // heading SE with Blue
    { t: 0.94, p: gp(hill.x - 30, hill.z - 25) },   // off the Blue helicopter at the hypocenter (subjective START)
  ];

  // ---------- Extraction ropes (highland top → chamber) ----------
  const ropes = new THREE.Group();
  const ropeTopY = gY(hill.x, hill.z);
  for (let i = 0; i < 2; i++) {
    const x = chamber.x - 2 + i * 4;
    ropes.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([up(x, ropeTopY, chamber.z), up(x, vy, chamber.z)]),
      new THREE.LineBasicMaterial({ color: COL.accent })));
  }
  ropes.visible = false; root.add(ropes);

  // ---------- Trap marker at the cave (seals the entrance) ----------
  const trap = new THREE.Mesh(new THREE.TorusGeometry(13, 1, 6, 6),
    new THREE.MeshBasicMaterial({ color: COL.forward, transparent: true, opacity: 0 }));
  trap.rotation.x = -Math.PI / 2; trap.position.set(cave.x, cy + 0.6, cave.z); root.add(trap);

  // ---------- Battlefield bursts (forward expands, inverted contracts) ----------
  const bursts = [
    { p: makeBurst(gp(-50, -110).setY(gY(-50, -110) + 8), COL.forward), inv: false },
    { p: makeBurst(gp(-20, -150).setY(gY(-20, -150) + 8), COL.forward), inv: false },
    { p: makeBurst(gp(-70, -90).setY(gY(-70, -90) + 8), COL.inverted), inv: true },
    { p: makeBurst(gp(0, -130).setY(gY(0, -130) + 8), COL.inverted), inv: true },
  ];
  bursts.forEach(b => root.add(b.p));

  const followables = {
    red:         { obj: redTeam[0].u, offset: new THREE.Vector3(90, 70, 110),  name: 'Red Team' },
    blue:        { obj: blueTeam[0].u, offset: new THREE.Vector3(-90, 70, 110), name: 'Blue Team' },
    protagonist: { obj: tp,           offset: new THREE.Vector3(70, 50, 85),    name: 'The Protagonist' },
    ives:        { obj: ives,          offset: new THREE.Vector3(65, 45, 80),   name: 'Ives' },
    // Neil's three on-screen selves — one person, three time-vectors / stages.
    neilFwd:     { obj: neil,          offset: new THREE.Vector3(-46, 42, 64),  name: 'Neil — Forward' },   // person, rides the car
    neilBwd:     { obj: neil3,         offset: new THREE.Vector3(-70, 55, 95),  name: 'Neil — Inverted' },
    neilAfter:   { obj: neilGate,      offset: new THREE.Vector3(24, 16, 30),   name: 'Neil — After' },     // vault — keep close
  };

  // Actors whose position the editor has "frozen" (grabbing the gizmo) — update()
  // must not overwrite them while the user drags / before the keyframe is committed.
  const FREEZE = new Set();

  // Editable visibility windows (P3). null = always visible; else a list of [a,b)
  // intervals in clock-t. 9 ≈ "to the end".
  const visSpec = {
    tp: null, ives: null, car: null, neilGate: null,
    neil: [[0.40, 0.45], [1.00, 9]],
    neil3: [[0.40, 0.95]],
    volkov: [[0.27, 9]],
  };
  const inWindows = (iv, tt) => !iv || iv.some((seg) => tt >= seg[0] && tt < seg[1]);

  function update(t, dt) {
    dt = dt || 0.016;
    // Red insertion Chinooks: descend onto LZ, troops disembark, then fly away
    // Shared transport cadence: fly IN (descend) by 0.08, hold while troops un/load, fly OUT from 0.19.
    const landRed = clamp01(t / 0.08), goRed = clamp01((t - 0.19) / 0.18);
    redHelis.forEach((h, i) => {
      const rx = lz.x - 26 + i * 52, rz = lz.z + 8, ry = gY(rx, rz) + 9;
      h.visible = t < 0.40;
      h.position.set(rx + goRed * (i === 0 ? -22 : 22), lerp(70, ry, landRed) + goRed * 100, rz - goRed * 75);
      h.userData.rotors.forEach(r => r.rotation.y += dt * 26);
    });
    // Blue container helis fly IN and OUT in lockstep with the red Chinooks (shared landRed/goRed).
    blueHelis.forEach((h, i) => {
      const bx = lz.x + 50 + i * 22, bz = lz.z + 34, by = gY(bx, bz) + 11;
      h.visible = t < 0.40;
      h.position.set(bx + goRed * (i * 2 - 1) * 18, lerp(70, by, landRed) + goRed * 90, bz - goRed * 60);
      h.userData.rotors.forEach(r => r.rotation.y += dt * 26);
    });
    // Red extraction Chinook: descends to hypocenter, lifts out, then departs
    exHeli.visible = t > 0.78 && t < 1.08;
    if (exHeli.visible) {
      const desc = clamp01((t - 0.78) / 0.12), go = clamp01((t - 0.98) / 0.08);  // hold grounded while troops board, then lift
      exHeli.position.set(hill.x + 8 + go * 35, exPadY + 70 - desc * 62 + go * 85, hill.z - 4 - go * 45);
      exHeli.userData.rotors.forEach(r => r.rotation.y += dt * 32);
    }
    // Blue extraction helis at hypocenter: set down for loading at the blast, take troops aboard, lift off
    hypoBlueHelis.forEach((h, i) => {
      h.visible = t > 0.80 && t < 1.08;
      if (h.visible) {
        const lift = clamp01((t - 0.94) / 0.12);   // grounded 0.80→0.94 while the squad loads, then lifts
        h.position.set(hill.x - 24 + i * 48, exPadY + 11 + lift * 80, hill.z + 22 + lift * 40);
        h.userData.rotors.forEach(r => r.rotation.y += dt * 30);
      }
    });

    // Volkov's heli hovers over the cave during the airdrop, then leaves
    volkovHeli.visible = t > 0.22 && t < 0.46;
    if (volkovHeli.visible) {
      const leave = clamp01((t - 0.4) / 0.06);
      volkovHeli.position.set(cave.x + 4 + leave * 40, cy + 48 + leave * 18, cave.z + 4 - leave * 30);
      volkovHeli.userData.rotors.forEach(r => r.rotation.y += dt * 30);
    }

    // Red: hidden inside the Chinook until emergeT → spills out → assaults → re-boards the
    // extraction Chinook at boardT (walks into it, then vanishes "aboard" before it lifts).
    redTeam.forEach(o => {
      const spawn = redInsSpot(o.heli);
      if (t < o.emergeT) { o.u.visible = false; o.u.position.copy(spawn); return; }
      if (t >= o.boardT) {
        const f = clamp01((t - o.boardT) / 0.05);
        o.u.position.lerpVectors(o.pHypo, redExtSpot, f);
        o.u.visible = f < 1;                    // climbs in, then gone (aboard)
        return;
      }
      o.u.visible = true;
      if (t < 0.62) o.u.position.lerpVectors(spawn, o.pBat, clamp01((t - o.emergeT) / 0.5));
      else o.u.position.lerpVectors(o.pBat, o.pHypo, clamp01((t - 0.62) / (o.boardT - 0.62)));
    });
    // Blue: emerges sequentially from the LZ containers → fights → climbs into the
    // hypocenter containers at boardT, which then lift away with them aboard.
    blueTeam.forEach(o => {
      const spawn = blueInsSpot(o.heli);
      if (t < o.emergeT) { o.u.visible = false; o.u.position.copy(spawn); return; }
      if (t >= o.boardT) {
        const f = clamp01((t - o.boardT) / 0.05);
        o.u.position.lerpVectors(o.pHypo, blueExtSpot(o.heli), f);
        o.u.visible = f < 1;                    // loaded into the container, then gone
        return;
      }
      o.u.visible = true;
      if (t < 0.5) o.u.position.lerpVectors(spawn, o.pBat, clamp01((t - o.emergeT) / 0.5));
      else o.u.position.lerpVectors(o.pBat, o.pHypo, clamp01((t - 0.5) / (o.boardT - 0.5)));
    });

    if (!FREEZE.has('tp')) kf(tpFrames, t, tp.position);
    if (!FREEZE.has('ives')) kf(ivesFrames, t, ives.position);
    tp.visible = inWindows(visSpec.tp, t) && t >= TP_EMERGE;     // hidden inside the Chinook until disembark
    ives.visible = inWindows(visSpec.ives, t) && t >= TP_EMERGE;

    // Neil — FWD — colour flips blue (inverted) → red (forward) on revert
    if (!FREEZE.has('neil')) kf(neilFrames, t, neil.position);
    const reverted = t >= 0.40;
    flags.neil1Forward = reverted;
    neil.userData.mat.color.set(reverted ? COL.forward : COL.inverted);
    neil.userData.ring.color.set(reverted ? COL.forward : COL.inverted);
    neil.visible = inWindows(visSpec.neil, t);

    // Neil — BWD — the blue copy riding with Blue Team from turnstile out to the hypocenter
    neil3.visible = inWindows(visSpec.neil3, t);
    if (neil3.visible && !FREEZE.has('neil3')) kf(neil3Frames, t, neil3.position);

    car.visible = inWindows(visSpec.car, t);
    if (!FREEZE.has('car')) {
      kf(carFrames, t, car.position);
      kf(carFrames, Math.min(1.10, t + 0.02), _v);
      if (_v.distanceTo(car.position) > 0.4) car.lookAt(_v.x, car.position.y, _v.z);
    }
    // While riding (invisible), the FWD self IS the car — so following Neil — FWD
    // tracks the car's path instead of drifting along his straight keyframe gap.
    if (t >= 0.45 && t < 1.00 && !FREEZE.has('neil')) neil.position.copy(car.position);

    // Volkov
    volkov.visible = inWindows(visSpec.volkov, t);
    if (volkov.visible && !FREEZE.has('volkov')) kf(volkovFrames, t, volkov.position);

    // Neil — After: lies dead → revives & takes the bullet → opens the gate → runs back
    // up the tunnel to the turnstile. (In his subjective time, played in reverse.) Its pose
    // is scripted, but the gizmo can still grab it (FREEZE) and the run-back phase (t≥0.86)
    // is keyframe-editable via the `futureRun` track.
    neilGate.visible = inWindows(visSpec.neilGate, t);
    if (!FREEZE.has('neilGate')) {
      if (t < 0.70) { neilGate.position.copy(ngLie); neilGate.children[0].rotation.z = Math.PI / 2; }
      else if (t < 0.76) {
        const f = (t - 0.70) / 0.06;
        neilGate.position.lerpVectors(ngLie, ngStand, f);
        neilGate.children[0].rotation.z = Math.PI / 2 * (1 - f);
      } else if (t < 0.86) {
        neilGate.position.copy(ngStand); neilGate.children[0].rotation.z = 0; neilGate.userData.ring.opacity = 0.55;
      } else {
        kf(futureRun, t, neilGate.position);
        neilGate.children[0].rotation.z = 0;
        neilGate.userData.ring.opacity = 0.55 * (1 - clamp01((t - 1.06) / 0.04)); // fades as he enters the turnstile
      }
    }

    bullet.visible = t > 0.71 && t < 0.77;
    if (bullet.visible) {
      const f = (t - 0.71) / 0.06;
      const k = f < 0.5 ? f / 0.5 : (1 - f) / 0.5;
      bullet.position.lerpVectors(gunPt, hitPt, k);
    }

    trap.material.opacity = clamp01((t - 0.52) / 0.04) * 0.7 * (1 - clamp01((t - 0.72) / 0.2));
    ropes.visible = t > 0.85 && t < 0.99;

    bursts.forEach(b => {
      const arr = b.p.geometry.attributes.position.array;
      const amt = b.inv ? 1 - clamp01((t - 0.1) / 0.4) : clamp01((t - 0.5) / 0.4);
      b.p.userData.dirs.forEach((d, i) => {
        arr[i*3] = b.p.userData.center.x + d.x * amt;
        arr[i*3+1] = b.p.userData.center.y + d.y * amt;
        arr[i*3+2] = b.p.userData.center.z + d.z * amt;
      });
      b.p.geometry.attributes.position.needsUpdate = true;
      b.p.material.opacity = 0.15 + 0.7 * (1 - amt);
    });
  }

  // ---------- Editor hooks (P2): expose keyframe tracks for the in-app editor ----------
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const editTracks = { tp: tpFrames, ives: ivesFrames, neil: neilFrames, neil3: neil3Frames, car: carFrames, volkov: volkovFrames, neilGate: futureRun };
  const editActors = [
    { obj: tp,       id: 'char:tp',       name: 'tp',       label: 'TP' },
    { obj: ives,     id: 'char:ives',     name: 'ives',     label: 'Ives' },
    { obj: neil,     id: 'char:neil',     name: 'neil',     label: 'Neil — FWD (on foot)' },
    { obj: neil3,    id: 'char:neil3',    name: 'neil3',    label: 'Neil — BWD' },
    { obj: neilGate, id: 'char:neilGate', name: 'neilGate', label: 'Neil — After (run-back)' },
    { obj: car,      id: 'char:car',      name: 'car',      label: "Neil's car" },
    { obj: volkov,   id: 'char:volkov',   name: 'volkov',   label: 'Volkov' },
  ];
  for (const a of editActors) { a.obj.userData.editId = a.id; a.obj.userData.editKind = 'actor'; a.obj.userData.trackName = a.name; }
  const serTrack = (frames) => frames.map(f => [r3(f.t), r3(f.p.x), r3(f.p.y), r3(f.p.z)]);
  const baseTracks = {};
  for (const k in editTracks) baseTracks[k] = serTrack(editTracks[k]);
  const baseVis = {};
  for (const k in visSpec) baseVis[k] = visSpec[k] ? visSpec[k].map((iv) => [...iv]) : null;

  const edit = {
    freeze: FREEZE, actors: editActors, tracks: editTracks, baseTracks,
    vis: visSpec, baseVis,
    setVisibility(name, intervals) { if (name in visSpec) visSpec[name] = intervals; },
    applyVis(name, data) { if (name in visSpec) visSpec[name] = data ? data.map((iv) => [iv[0], iv[1]]) : null; },
    resetVis(name) { if (name in visSpec) visSpec[name] = baseVis[name] ? baseVis[name].map((iv) => [...iv]) : null; },
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

  // X-ray: let the characters be seen THROUGH the faded floor. The terrain goes
  // transparent (world.setXray), but the actor meshes still depth-test, so underground
  // selves (TP/Ives in the vault, Volkov, Neil — After) stay hidden behind the ground.
  // Drop their depth-test and bump render order so they always read in X-ray.
  const xrayActors = [tp, ives, volkov, neilGate, neil, neil3, car,
    ...redTeam.map(o => o.u), ...blueTeam.map(o => o.u)];
  function setXray(on) {
    for (const g of xrayActors) g.traverse(o => {
      if (!o.isMesh) return;
      o.renderOrder = on ? 6 : 0;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) m.depthTest = !on;
    });
  }

  return { root, followables, flags, update, setXray, refs: { tp, ives, neil, neil3, neilGate, volkov, car }, edit };
}
