import * as THREE from 'three';
import { COL, POS, groundHeight, clamp01, lerp } from './config.js';
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

  // ---------- Hypocenter: hex cave entrance (far north) ----------
  const cave = new THREE.Group();
  const cx = POS.cave.x, cz = POS.cave.z, cy = gY(cx, cz);
  const hex = new THREE.Mesh(new THREE.CylinderGeometry(15, 13, 7, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b7480, roughness: 1 }));
  hex.position.set(cx, cy - 3.5, cz); cave.add(hex);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(12, 6),
    new THREE.MeshBasicMaterial({ color: 0x20262e }));
  hole.rotation.x = -Math.PI / 2; hole.position.set(cx, cy + 0.3, cz); cave.add(hole);
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
  root.add(vault);

  // ---------- Tan building destroyed in BOTH directions (beside the cave) ----------
  const bx = POS.building.x, bz = POS.building.z, by = gY(bx, bz);
  const tanTower = new THREE.Group();
  const tanSlabs = [];
  const N = 6, sh = 7, bw = 24, bd = 20;
  for (let i = 0; i < N; i++) {
    const slab = edged(new THREE.Mesh(new THREE.BoxGeometry(bw, sh, bd),
      new THREE.MeshStandardMaterial({ color: COL.tan, roughness: 0.92 })), COL.tanEdge, 0.55);
    const restY = by + sh / 2 + i * sh;
    slab.userData = {
      restY,
      scatter: new THREE.Vector3((Math.random() - 0.5) * 34, by + sh / 2 + Math.random() * 3, (Math.random() - 0.5) * 30),
      rot: new THREE.Vector3((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6),
      level: i / (N - 1),
    };
    slab.position.set(bx, restY, bz);
    tanSlabs.push(slab); tanTower.add(slab);
  }
  root.add(tanTower);
  landmarks.surfaceMats.push(...tanSlabs.map(s => s.children[0].material));

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
    cave: { label: 'Tunnel Entrance', target: v(cx, cy + 4, cz),
      pos: v(cx + 50, cy + 60, cz - 80) },
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
    building: v(bx, by + N * sh + 6, bz),
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
    for (const s of tanSlabs) {
      const u = s.userData;
      const healAmt = 1 - clamp01((t - 0.40) / 0.06);
      const bottomBroken = healAmt * (1 - u.level);
      const topBroken = clamp01((t - 0.50) / 0.06) * u.level;
      const p = clamp01(Math.max(bottomBroken, topBroken));
      const o = new THREE.Vector3(bx, u.restY, bz);
      s.children[0].position.set(lerp(o.x, u.scatter.x, p), lerp(u.restY, u.scatter.y, p), lerp(o.z, u.scatter.z, p));
      s.children[0].rotation.set(u.rot.x * p, u.rot.y * p, u.rot.z * p);
      s.children[1].position.copy(s.children[0].position);
      s.children[1].rotation.copy(s.children[0].rotation);
    }
    const fp = clamp01((t - 0.92) / 0.08);
    flash.scale.setScalar(1 + fp * 70);
    flash.material.opacity = fp * 0.5 * (1 - clamp01((t - 0.985) / 0.015));
  }

  return { root, terrain, landmarks, locations, points, FIELD, vy, update, setXray, rebuildTerrain, get xray() { return xray; } };
}
