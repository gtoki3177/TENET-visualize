import * as THREE from 'three';
import { COL, POS, groundHeight, clamp01, lerp, smooth } from './config.js';
import { buildLandmarks } from './landmarks.js';
import { edged } from './util.js';

const FIELD = 1200;

export function buildWorld(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const gY = groundHeight;

  // Materials belonging to underground geometry — in X-ray they stop
  // depth-testing so they always read through the faded surface.
  const undergroundMats = [];

  // ---------- Terrain ----------
  const geo = new THREE.PlaneGeometry(FIELD, FIELD, 240, 240);
  geo.rotateX(-Math.PI / 2);
  const tpos = geo.attributes.position;
  function rebuildTerrain() {        // re-sample groundHeight (after a terrain-param edit)
    for (let i = 0; i < tpos.count; i++) tpos.setY(i, gY(tpos.getX(i), tpos.getZ(i)));
    tpos.needsUpdate = true;
    geo.computeVertexNormals();
  }
  rebuildTerrain();
  const terrainMat = new THREE.MeshStandardMaterial({ color: COL.ground, roughness: 0.9 });
  const terrain = new THREE.Mesh(geo, terrainMat);
  terrain.receiveShadow = true;
  root.add(terrain);

  // ---------- Static landmarks ----------
  const landmarks = buildLandmarks(root);

  // ---------- Tunnel entrance: a hollow rectangular portal tilted up out of the ground ----------
  const cave = new THREE.Group();
  const cx = POS.cave.x, cz = POS.cave.z, cy = gY(cx, cz);
  const portal = new THREE.Group();
  const pmat = new THREE.MeshStandardMaterial({ color: 0x6b7480, roughness: 1 });
  const PW = 30, PD = 22, PTH = 2.5, PL = 54;            // outer width, depth, wall thickness, length (long shaft)
  const pwall = (w, h, d, x, z) => {                     // a thick wall of the rectangular tube
    const m = edged(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), pmat), COL.edge, 0.5);
    m.position.set(x, 0, z); m.children[0].castShadow = true; m.children[0].receiveShadow = true;
    portal.add(m);
  };
  pwall(PTH, PL, PD, -(PW / 2 - PTH / 2), 0);            // left  wall
  pwall(PTH, PL, PD,  (PW / 2 - PTH / 2), 0);            // right wall
  pwall(PW - 2 * PTH, PL, PTH, 0,  (PD / 2 - PTH / 2));  // front wall
  pwall(PW - 2 * PTH, PL, PTH, 0, -(PD / 2 - PTH / 2));  // back  wall
  // black hollow interior — a dark box filling the cavity, recessed below the rim so the opening
  // reads as a deep blacked-out hole rather than seeing straight through the tube.
  const cavity = new THREE.Mesh(new THREE.BoxGeometry(PW - 2 * PTH - 0.4, PL - 4, PD - 2 * PTH - 0.4),
    new THREE.MeshBasicMaterial({ color: 0x090c11 }));
  cavity.position.set(0, -1.5, 0); portal.add(cavity);
  const TILT = 70 * Math.PI / 180;                      // axis ~20° above horizontal (shallow, reclined)
  portal.rotation.x = TILT;
  // Position so the mouth's front-bottom lip sits flush with grade; the long shaft then buries its
  // back end underground. lipY = world height of the local (+PL/2, +PD/2) corner relative to centre.
  const lipY = (PL / 2) * Math.cos(TILT) - (PD / 2) * Math.sin(TILT);
  portal.position.set(cx, cy - lipY, cz);
  cave.add(portal);
  root.add(cave);

  // ---------- Descent tunnel ----------
  // Drops at the central cave entrance, then runs EAST underground across the
  // quarry to the chamber beneath the eastern detonation hill.
  const vy = POS.vaultY;
  const gx = POS.gate.x, gz = POS.gate.z;
  // Tunnel drops at the NE cave, then runs east-southeast underground to the vault.
  const tunnelPts = [
    new THREE.Vector3(cx, cy - 5, cz),                   // (25, cy-5, -195) cave mouth
    new THREE.Vector3(cx + 10, cy - 26, cz + 12),        // drop into shaft
    new THREE.Vector3(cx + 30, vy + 12, cz + 22),        // bottom of shaft, turning SE
    new THREE.Vector3(150, vy + 5, -80),                  // heading east-southeast
    new THREE.Vector3(255, vy + 4, 5),                    // mid-traverse
    new THREE.Vector3(gx, vy + 3, gz - 8),               // arriving at gate
  ];
  const curve = new THREE.CatmullRomCurve3(tunnelPts);
  const tubeMat = new THREE.MeshStandardMaterial({
    color: COL.forward, transparent: true, opacity: 0.14, side: THREE.DoubleSide });
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 9, 12, false), tubeMat);
  root.add(tube);
  undergroundMats.push(tubeMat);

  // Bright centreline path so the route reads clearly (esp. under X-ray).
  const pathGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(220));
  const pathMat = new THREE.LineBasicMaterial({ color: COL.path, transparent: true, opacity: 0.5 });
  const pathLine = new THREE.Line(pathGeo, pathMat);
  root.add(pathLine);
  undergroundMats.push(pathMat);

  // ---------- Vault / gate chamber beneath the highland ----------
  const vault = new THREE.Group();
  const vmat = (o) => { const m = new THREE.MeshStandardMaterial(o); undergroundMats.push(m); return m; };
  const floor = new THREE.Mesh(new THREE.BoxGeometry(72, 1.5, 64),
    vmat({ color: COL.vault, roughness: 1 }));
  floor.position.set(gx, vy, gz + 8); floor.receiveShadow = true; vault.add(floor);
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(72, 30, 1.5),
    vmat({ color: COL.vault, roughness: 1, transparent: true, opacity: 0.9 }));
  backWall.position.set(gx, vy + 15, gz + 40); vault.add(backWall);
  // locked iron gate slab
  const gate = new THREE.Mesh(new THREE.BoxGeometry(28, 20, 2.4),
    vmat({ color: COL.accent, roughness: 0.5, metalness: 0.35 }));
  gate.position.set(gx, vy + 10, gz);
  vault.add(gate);
  // vertical bars to read as a gate (not a wall)
  for (let i = -3; i <= 3; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 18, 3),
      vmat({ color: 0x9aa3ae, metalness: 0.4, roughness: 0.4 }));
    bar.position.set(gx + i * 3.6, vy + 10, gz + 0.6); vault.add(bar);
  }
  const algo = new THREE.Mesh(new THREE.OctahedronGeometry(3),
    vmat({ color: 0xf2c14e, emissive: 0x8a5a00, emissiveIntensity: 0.45, roughness: 0.4 }));
  algo.position.set(POS.volkov.x, vy + 6, POS.volkov.z - 4); vault.add(algo);
  // Volkov's pit — a dark shaft beside the Algorithm that he is dropped into before the blast.
  const pit = new THREE.Mesh(new THREE.CylinderGeometry(6, 5, 34, 16, 1, true),
    vmat({ color: 0x05070a, roughness: 1, side: THREE.DoubleSide }));
  pit.position.set(POS.volkov.x + 5, vy - 16, POS.volkov.z + 5); vault.add(pit);
  const pitCap = new THREE.Mesh(new THREE.CircleGeometry(6, 16),
    vmat({ color: 0x05070a }));
  pitCap.rotation.x = -Math.PI / 2; pitCap.position.set(POS.volkov.x + 5, vy + 0.7, POS.volkov.z + 5); vault.add(pitCap);
  root.add(vault);

  // ---------- Twin-exploding building (5:00) ----------
  // A solid tower split into an UPPER and a LOWER block. Each block is shattered into a
  // set of irregular fragments (a jittered grid partition, so the pieces tile back into a
  // solid box when assembled) plus a dust cloud that kicks up while it shatters / reforms.
  // It is intact ONLY at the 5:00 instant (t=0.5); at every other time one block is ruined.
  // FORWARD: before 5:00 the TOP block lies intact on the ground while the BOTTOM is rubble;
  // crossing 5:00 the top flies up into place and the bottom reassembles (whole), then the
  // top bursts apart in a cloud of debris+dust. REVERSE is the same f(t) run backward, so it
  // reads as: bottom intact, top recovers from the blast → whole → bottom explodes, top drops.
  const bx = POS.building.x, bz = POS.building.z, by = gY(bx, bz);
  const BW = 24, BD = 20, BH = 42, HALF_H = BH / 2;   // tower width, depth, full height, half height
  const T5 = 0.5;                          // the 5:00 pivot (Red/Blue clocks read 5:00 here)
  const tanTower = new THREE.Group();
  tanTower.position.set(bx, by, bz);       // local frame: y=0 at grade, building rises +y
  const topHalf = new THREE.Group();    tanTower.add(topHalf);
  const bottomHalf = new THREE.Group(); tanTower.add(bottomHalf);
  const tanMat = new THREE.MeshStandardMaterial({ color: COL.tan, roughness: 0.92, flatShading: true });
  landmarks.surfaceMats.push(tanMat);

  // Partition a block into irregular tiling fragments via jittered cut planes per axis.
  const jitterCuts = (n, len, start) => {
    const c = [0];
    for (let i = 1; i < n; i++) c.push(i / n + (Math.random() - 0.5) * 0.6 / n);
    c.push(1); c.sort((a, b) => a - b);
    const seg = [];
    for (let i = 0; i < n; i++) { const a = start + c[i] * len, b = start + c[i + 1] * len; seg.push([(a + b) / 2, b - a]); }
    return seg;
  };
  // Each fragment flies a CLOSED-FORM ballistic arc: launch velocity (out + up) + spin, pulled down by
  // gravity G, landing (τLand solved analytically) into a damped post-impact roll. Pure function of τ →
  // scrub-safe and reversible (no per-frame state, no collision solver to swallow the blast energy).
  // `loose` is a tiny offset for the TOP block's pre-5:00 "nearly-intact, dropped" pose.
  const G = 150, TSCALE = 108, DROP_W = 0.0167; // gravity; timeline→τ (~10 clock-sec blast); top-drop window
  function makeFragments(group, arr, originY, L) {
    const xs = jitterCuts(2, BW, -BW / 2), ys = jitterCuts(3, HALF_H, originY), zs = jitterCuts(2, BD, -BD / 2);
    for (const [cx, sw] of xs) for (const [cy, shh] of ys) for (const [cz, sd] of zs) {
      const frag = edged(new THREE.Mesh(new THREE.BoxGeometry(sw, shh, sd), tanMat), COL.tanEdge, 0.4);
      const home = new THREE.Vector3(cx, cy, cz);
      const dir = Math.random() * Math.PI * 2, hsp = L.hMin + Math.random() * L.hRange;
      const v0 = new THREE.Vector3(Math.cos(dir) * hsp, L.vMin + Math.random() * L.vRange, Math.sin(dir) * hsp);
      const omega = new THREE.Vector3((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7);
      const floorRest = 0.8 + Math.random() * 2.4;
      const tauLand = (v0.y + Math.sqrt(Math.max(0, v0.y * v0.y + 2 * G * (home.y - floorRest)))) / G;
      frag.userData = {
        home, v0, omega, floorRest, tauLand,
        land: new THREE.Vector3(home.x + v0.x * tauLand, floorRest, home.z + v0.z * tauLand),
        rotLand: new THREE.Vector3(omega.x * tauLand, omega.y * tauLand, omega.z * tauLand),
        loose: new THREE.Vector3((Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 2.5),
        looseRot: new THREE.Vector3((Math.random() - 0.5) * 0.16, (Math.random() - 0.5) * 0.16, (Math.random() - 0.5) * 0.16),
      };
      frag.position.copy(home);
      group.add(frag); arr.push(frag);
    }
  }
  const topChunks = [], bottomChunks = [];
  // TOP: a real blast, flung wide. BOTTOM: an inverted-time blast — rubble strewn NEARBY (gentler launch),
  // strewn from the start of the timeline and drawing back together as it nears 5:00.
  makeFragments(topHalf, topChunks, HALF_H, { hMin: 16, hRange: 24, vMin: 42, vRange: 38 });  // tighter (less wide scatter)
  makeFragments(bottomHalf, bottomChunks, 0, { hMin: 42, hRange: 46, vMin: 16, vRange: 24 });  // harder, mostly LATERAL blast
  root.add(tanTower);

  // Dust clouds — one per block, expanding + blooming while that block shatters/reforms.
  const dustTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(232,226,210,0.9)'); grd.addColorStop(0.45, 'rgba(214,206,186,0.45)'); grd.addColorStop(1, 'rgba(214,206,186,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  })();
  function makeDust(count, originY, upBias) {
    const home = new Float32Array(count * 3), drift = new Float32Array(count * 3), pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const hx = (Math.random() - 0.5) * BW, hy = originY + Math.random() * HALF_H, hz = (Math.random() - 0.5) * BD;
      home[i * 3] = hx; home[i * 3 + 1] = hy; home[i * 3 + 2] = hz;
      const a = Math.random() * Math.PI * 2, rr = 0.5 + Math.random();
      drift[i * 3] = Math.cos(a) * rr; drift[i * 3 + 1] = upBias * (0.3 + Math.random()); drift[i * 3 + 2] = Math.sin(a) * rr;
      pos[i * 3] = hx; pos[i * 3 + 1] = hy; pos[i * 3 + 2] = hz;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xcfc7b1, size: 4, map: dustTex, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat); pts.userData = { home, drift, count };
    tanTower.add(pts); return pts;
  }
  const topDust = makeDust(90, HALF_H, 1.6);     // blows upward
  const bottomDust = makeDust(80, 0, 0.5);       // collapses, low billow
  // Drive a dust cloud from a 0→1 morph amount: bloom (kick up) at mid-morph, expand outward.
  function setDust(pts, p, spread, residual) {
    const op = Math.sin(clamp01(p) * Math.PI) * 0.8 + clamp01(p) * residual;
    pts.material.opacity = op;
    if (op < 0.004) return;
    const { home, drift, count } = pts.userData, arr = pts.geometry.attributes.position.array, g = p * spread;
    for (let i = 0; i < count; i++) {
      arr[i * 3] = home[i * 3] + drift[i * 3] * g;
      arr[i * 3 + 1] = home[i * 3 + 1] + drift[i * 3 + 1] * g;
      arr[i * 3 + 2] = home[i * 3 + 2] + drift[i * 3 + 2] * g;
    }
    pts.geometry.attributes.position.needsUpdate = true;
  }
  // Place a fragment at elapsed time τ: projectile arc until it lands, then a damped roll to rest.
  const ROLL = 0.5, SETTLE_K = 6;
  function applyBallistic(c, tau) {
    const u = c.userData, h = u.home, v = u.v0, wv = u.omega;
    if (tau <= 0) { c.position.copy(h); c.rotation.set(0, 0, 0); return; }
    if (tau <= u.tauLand) {                    // airborne — gravity arc + tumble
      c.position.set(h.x + v.x * tau, h.y + v.y * tau - 0.5 * G * tau * tau, h.z + v.z * tau);
      c.rotation.set(wv.x * tau, wv.y * tau, wv.z * tau);
    } else {                                   // grounded — exponential-decay roll, then still
      const sd = 1 - Math.exp(-SETTLE_K * (tau - u.tauLand)), ext = (ROLL / SETTLE_K) * sd;
      c.position.set(u.land.x + v.x * ext, u.floorRest, u.land.z + v.z * ext);
      c.rotation.set(u.rotLand.x + wv.x * ext * 0.4, u.rotLand.y + wv.y * ext * 0.4, u.rotLand.z + wv.z * ext * 0.4);
    }
  }

  // ---------- Detonation flash at the SE highland ----------
  const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 }));
  flash.position.set(POS.hill.x, gY(POS.hill.x, POS.hill.z) + 6, POS.hill.z);
  root.add(flash);

  // ---------- Camera framings ----------
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const locations = {
    turnstile: { label: 'Turnstile', target: v(POS.turnstile.x, gY(POS.turnstile.x, POS.turnstile.z) + 6, POS.turnstile.z),
      pos: v(POS.turnstile.x + 30, gY(POS.turnstile.x, POS.turnstile.z) + 75, POS.turnstile.z + 100) },
    lz: { label: 'Helicopter LZ', target: v(POS.lz.x, gY(POS.lz.x, POS.lz.z) + 8, POS.lz.z),
      pos: v(POS.lz.x - 40, gY(POS.lz.x, POS.lz.z) + 70, POS.lz.z + 95) },
    cave: { label: 'Tunnel Entrance', target: v(cx, cy + 8, cz + 18),
      pos: v(cx + 36, cy + 52, cz + 96) },
    vault: { label: 'Algorithm Vault', target: v(gx, vy + 8, gz + 2),
      pos: v(gx - 58, vy + 36, gz - 58) },
    detonation: { label: 'Hypocenter · Extraction', target: v(POS.hill.x, gY(POS.hill.x, POS.hill.z) + 10, POS.hill.z),
      pos: v(POS.hill.x - 150, gY(POS.hill.x, POS.hill.z) + 100, POS.hill.z + 50) },
    building: { label: 'Twin-Destroyed Building', target: v(bx, by + 18, bz),
      pos: v(bx + 55, by + 55, bz + 75) },
  };

  const points = {
    turnstile: v(POS.turnstile.x, gY(POS.turnstile.x, POS.turnstile.z) + 18, POS.turnstile.z),
    lz: v(POS.lz.x, gY(POS.lz.x, POS.lz.z) + 14, POS.lz.z),
    cave: v(cx, cy + 14, cz),
    vault: v(gx, vy + 20, gz + 4),
    detonation: v(POS.hill.x, gY(POS.hill.x, POS.hill.z) + 12, POS.hill.z),
    building: v(bx, by + BH + 6, bz),
    arches: v(POS.arches.x, gY(POS.arches.x, POS.arches.z) + 56, POS.arches.z),
    entrance: v(POS.entrance.x, gY(POS.entrance.x, POS.entrance.z) + 30, POS.entrance.z),
  };

  // ---------- X-ray (fade the surface so the underground reads) ----------
  let xray = false;
  function setXray(on) {
    xray = on;
    for (const m of landmarks.surfaceMats) {
      m.transparent = true; m.opacity = on ? 0.12 : 1; m.depthWrite = !on;
    }
    // Make the ground itself transparent and stop it writing/testing depth,
    // so nothing underground is occluded by the surface.
    terrainMat.transparent = true;
    terrainMat.opacity = on ? 0.08 : 1;
    terrainMat.depthWrite = !on;
    // Boost the underground route and let it draw through the faded surface.
    tubeMat.opacity = on ? 0.4 : 0.14;
    pathMat.opacity = on ? 0.95 : 0.5;
    for (const m of undergroundMats) m.depthTest = !on;
    tube.renderOrder = on ? 3 : 0;
    pathLine.renderOrder = on ? 4 : 0;
  }

  // ---------- update(t) ----------
  function update(t) {
    const DTAU = 1.6;                            // dust span in τ (≈ how long fragments are airborne)
    // ---- TOP block: dropped + loosened before 5:00 → whole at 5:00 → baked blast after ----
    if (t <= T5) {
      // Reverse-time read: once the bottom has blown out from under it, the top drops straight
      // DOWN onto the rubble and loosens slightly (not a full explosion).
      const e = smooth(clamp01((T5 - t) / DROP_W)); // 0 at 5:00 → 1 fully dropped
      topHalf.position.set(0, -HALF_H * e, 0);   // vertical drop only — no sideways shove
      topHalf.rotation.set(0, 0, 0);
      for (const c of topChunks) {
        const u = c.userData;
        c.position.set(u.home.x + u.loose.x * e, u.home.y + u.loose.y * e, u.home.z + u.loose.z * e);
        c.rotation.set(u.looseRot.x * e, u.looseRot.y * e, u.looseRot.z * e);
      }
      setDust(topDust, 0);
    } else {
      topHalf.position.set(0, 0, 0); topHalf.rotation.set(0, 0, 0);
      const tau = (t - T5) * TSCALE;
      for (const c of topChunks) applyBallistic(c, tau);  // dramatic ballistic blast, flung wide
      setDust(topDust, clamp01(tau / DTAU), 36, 0.14);
    }
    // ---- BOTTOM block: inverted-time ballistic — rubble strewn nearby pre-5:00, whole (τ=0) at/after ----
    const tauB = Math.max(0, (T5 - t) * TSCALE);
    for (const c of bottomChunks) applyBallistic(c, tauB);
    setDust(bottomDust, clamp01(tauB / DTAU), 26, 0.1);
    const fp = clamp01((t - 0.92) / 0.08);
    flash.scale.setScalar(1 + fp * 70);
    flash.material.opacity = fp * 0.5 * (1 - clamp01((t - 0.985) / 0.015));

    // Algorithm: hauled up the rope with TP & Ives at the extraction (vault → hilltop)
    const ar = clamp01((t - 0.88) / 0.09);
    algo.position.set(
      lerp(POS.volkov.x, POS.hill.x - 10, ar),
      lerp(vy + 6, gY(POS.hill.x, POS.hill.z) + 6, ar),
      lerp(POS.volkov.z - 4, POS.hill.z, ar));
  }

  return { root, terrain, landmarks, locations, points, FIELD, vy, update, setXray, rebuildTerrain, get xray() { return xray; } };
}
