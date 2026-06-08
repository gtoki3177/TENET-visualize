// ============================================================================
//  squads.js — generative squad movement for Stalsk-12.
//
//  The teams used to walk in straight lerp lines between 3 grid anchors, so they
//  clipped through buildings and through each other. This module replaces the
//  battlefield traversal with a DETERMINISTIC steering simulation that is run
//  once (at scene load, after editor overrides are applied) and cached as plain
//  position tracks — i.e. an automatic "bake". Because it is deterministic
//  (no RNG), the same buildings + routes always yield the same paths, so moving
//  a building or a leader route and reloading re-derives fresh squad paths.
//
//  Model: every soldier is the same steering agent; only the TARGET differs.
//    - leader   → the time-scheduled route point (keeps the squad on the clock)
//    - follower → leader position + a heading-relative formation slot
//  Three steering forces: Arrive(target) + Separation(boids) + ObstacleAvoid.
//  Output: per-member [{t, x, z}] tracks over the battlefield window only; the
//  heli/disembark/board phases stay owned by entities.js.
// ============================================================================

// ---------- Obstacle extraction ----------
// Derive XZ bounding circles from tagged building meshes in world space. Read
// AFTER the editor applies object overrides so moved buildings are reflected.
// THREE is injected (keeps this module dependency-free + unit-testable in Node).
export function extractObstacles(root, THREE, { match, pad = 4 } = {}) {
  const isObstacle = match || ((id) =>
    /^bldg-/.test(id) || id === 'entrance' || id === 'stepped' || id === 'turnstile-core');
  const box = new THREE.Box3(), size = new THREE.Vector3(), ctr = new THREE.Vector3();
  const out = [];
  root.traverse((o) => {
    const id = o.userData && o.userData.editId;
    if (!id || !isObstacle(id)) return;
    box.setFromObject(o);
    if (!isFinite(box.min.x)) return;
    box.getSize(size); box.getCenter(ctr);
    // bounding circle on the ground plane (XZ half-diagonal) + clearance pad
    const r = 0.5 * Math.hypot(size.x, size.z) + pad;
    out.push({ x: ctr.x, z: ctr.z, r, id });
  });
  return out;
}

// ---------- small 2D vector helpers (plain {x,z}) ----------
const sub = (a, b) => ({ x: a.x - b.x, z: a.z - b.z });
const add = (a, b) => ({ x: a.x + b.x, z: a.z + b.z });
const scl = (a, s) => ({ x: a.x * s, z: a.z * s });
const len = (a) => Math.hypot(a.x, a.z);
const norm = (a) => { const l = len(a) || 1; return { x: a.x / l, z: a.z / l }; };
const clampLen = (a, m) => { const l = len(a); return l > m ? scl(a, m / l) : a; };
const lerp2 = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k });

// sample a [{t,x,z}] schedule at time tt (clamped, linear)
function sampleSchedule(route, tt) {
  if (tt <= route[0].t) return { x: route[0].x, z: route[0].z };
  const last = route[route.length - 1];
  if (tt >= last.t) return { x: last.x, z: last.z };
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1];
    if (tt <= b.t) { const k = (tt - a.t) / (b.t - a.t); return lerp2(a, b, k); }
  }
  return { x: last.x, z: last.z };
}

// ---------- organic flock model ----------
// The leader is the scheduled route point projected clear of buildings (exact, on the clock,
// auto-detours around moved buildings). Followers have NO fixed slots: each is a stateful agent
// that eases toward a cohesion anchor a little BEHIND the leader (so the leader stays in front),
// while separation keeps them spaced and an obstacle clamp keeps them out of buildings. The ease
// is partial, so the group trails — a roundish blob when stopped, stretched into an ellipse when
// moving. It's a single deterministic forward pass (no RNG), so it still bakes to scrub-safe tracks.
const DEFAULTS = {
  sampleDt: 0.01,      // output keyframe spacing in clock-t
  avoidClear: 5,       // soldiers keep at least this beyond a building's bounding circle
  minSep: 9,           // minimum spacing between two soldiers (don't clip)
  relaxIters: 12,      // separation + clamp relaxation passes per sample
  headingSmooth: 0.2,  // low-pass on leader heading
  followBack: 0,       // blob centred ON the leader — leader is just one of the pack, not out front
  catchup: 0.6,        // 0..1 ease toward the anchor each sample — high = followers stay tight to
                       // the leader (little trailing) so the squad never separates from him
};

// Push a point out to the edge of any obstacle clearance circle it's inside (a couple passes
// to resolve overlapping circles). Returns a cleared {x,z}.
function clampObstacles(x, z, obstacles, clear) {
  for (let pass = 0; pass < 2; pass++) {
    for (const ob of obstacles) {
      const dx = x - ob.x, dz = z - ob.z;
      const d = Math.hypot(dx, dz);
      const R = ob.r + clear;
      if (d < R) {
        if (d > 1e-4) { x = ob.x + dx / d * R; z = ob.z + dz / d * R; }
        else { x = ob.x + R; z = ob.z; }
      }
    }
  }
  return { x, z };
}

// Simulate one team. members[0] is the leader.
//   team = { route:[{t,x,z}], window:[t0,t1], members:[{emergeT,boardT,spawn:{x,z}}, ...] }
// Returns members-aligned array of tracks: [{t,x,z}...] over [t0,t1].
export function simulateSquad(team, obstacles, params = {}) {
  const p = { ...DEFAULTS, ...params };
  const [t0, t1] = team.window;
  const M = team.members;
  const tracks = M.map(() => []);
  const startSched = sampleSchedule(team.route, t0);
  let heading = norm(sub(sampleSchedule(team.route, t0 + 0.02), startSched));
  if (!isFinite(heading.x) || (heading.x === 0 && heading.z === 0)) heading = { x: 0, z: -1 };
  const start = clampObstacles(startSched.x, startSched.z, obstacles, p.avoidClear);
  let prevLeader = { ...start };

  // Deterministic initial scatter behind the leader (golden-angle spiral → even, no RNG).
  const pos = M.map((m, i) => {
    if (i === 0) return { ...start };
    const ang = i * 2.399963, rad = 4 + 2.2 * Math.sqrt(i);
    return { x: start.x - heading.x * p.followBack + Math.cos(ang) * rad,
             z: start.z - heading.z * p.followBack + Math.sin(ang) * rad };
  });

  const steps = Math.max(1, Math.round((t1 - t0) / p.sampleDt));
  for (let s = 0; s <= steps; s++) {
    const t = s === steps ? t1 : t0 + s * p.sampleDt;     // land exactly on t1

    const sched = sampleSchedule(team.route, t);
    const leaderPos = clampObstacles(sched.x, sched.z, obstacles, p.avoidClear);
    const mv = sub(leaderPos, prevLeader);
    if (len(mv) > 0.4) heading = norm(lerp2(heading, norm(mv), p.headingSmooth));
    prevLeader = leaderPos;
    pos[0] = { ...leaderPos };

    // cohesion: ease every follower toward an anchor just behind the leader (partial → trailing)
    const anchor = { x: leaderPos.x - heading.x * p.followBack, z: leaderPos.z - heading.z * p.followBack };
    for (let i = 1; i < M.length; i++) pos[i] = lerp2(pos[i], anchor, p.catchup);

    // relax: separation (don't clip each other / the leader) + obstacle clamp
    for (let it = 0; it < p.relaxIters; it++) {
      for (let a = 0; a < pos.length; a++) {
        for (let b = a + 1; b < pos.length; b++) {
          const off = sub(pos[a], pos[b]);
          const d = len(off) || 1e-4;
          if (d < p.minSep) {
            const n = scl(off, 1 / d);
            const push = p.minSep - d;
            if (a === 0) { pos[b] = sub(pos[b], scl(n, push)); }          // leader anchored on schedule
            else { pos[a] = add(pos[a], scl(n, push * 0.5)); pos[b] = sub(pos[b], scl(n, push * 0.5)); }
          }
        }
      }
      for (let a = 1; a < pos.length; a++) pos[a] = clampObstacles(pos[a].x, pos[a].z, obstacles, p.avoidClear);
    }

    for (let i = 0; i < M.length; i++) tracks[i].push({ t: +t.toFixed(4), x: +pos[i].x.toFixed(2), z: +pos[i].z.toFixed(2) });
  }
  return tracks;
}

// sample a [{t,x,z}] track at tt (clamped, linear) — for entities.update()
export function sampleSquadTrack(track, tt) {
  return sampleSchedule(track, tt);
}
