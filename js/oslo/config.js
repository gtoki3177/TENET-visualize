// Oslo Freeport — shared constants and helpers
// =============================================
// Layout: The freeport is a large concrete warehouse on an airport tarmac.
// Y=0 is the ground floor. The building is oriented north-south.
//
// PLAN VIEW (looking down, +y up):
//
//   NORTH (-z)
//     ┌─────────────────────────────┐
//     │      TURNSTILE ROOM         │
//     │   ┌───┐ glass ┌───┐        │
//     │   │RED│partition│BLU│       │
//     │   │CYL│ x=0   │CYL│       │
//     │   └───┘       └───┘        │
//     ├──────────┬──────────────────┤  z ≈ 0  (proving window line)
//     │ RED CORR │ BLUE CORR        │
//     │  (+x)    │  (-x)            │
//     │          │                  │
//     │          │                  │
//     ├──────────┴──────────────────┤  z ≈ 70  (shutters)
//     │      LOADING BAY            │
//     ├─────── CRASH WALL ──────────┤  z ≈ 85  (south face of building)
//     │   747 wreckage on tarmac    │
//   SOUTH (+z)
//
// Red side (Forward time) is on the right (+x)
// Blue side (Inverted time) is on the left (-x)

// ── Colours ──────────────────────────────────────────────
export const COL = {
  forward:      0xe5484d,  // red = forward time
  forwardSoft:  0xf3b0b2,
  inverted:     0x2f6fed,  // blue = inverted / reverse time
  invertedSoft: 0xa9c2f6,

  // Building materials
  concrete:     0xc8cdd4,  // exterior concrete
  concreteWarm: 0xd5cfc5,  // warm concrete (interior walls)
  concreteDark: 0x6b7078,  // dark concrete (vault)
  wall:         0xe0e3e8,  // interior corridor walls
  wallInner:    0xf0f2f5,
  floor:        0x9ea3aa,  // polished concrete floor
  floorRed:     0xa89898,  // warm-tinted floor (red side)
  floorBlue:    0x98a0a8,  // cool-tinted floor (blue side)
  ceiling:      0xb8bcc2,  // concrete ceiling
  glass:        0xb0cfe0,  // proving window glass
  glassTint:    0xc4ddf0,
  metal:        0x7a848e,  // structural metal
  metalDark:    0x50585f,  // dark metal (doors, frames)
  accent:       0x111418,
  edge:         0x2a3340,

  // Fire & effects
  fire:         0xff6b2b,
  fireGlow:     0xffaa44,
  ember:        0xff4400,
  smoke:        0x3a3a3a,

  // Props
  crate:        0xc4a86a,  // art crates
  crateLight:   0xd8c890,
  turnstile:    0x9aa3ae,
  gold:         0xf2c14e,

  // 747
  plane:        0xd0d4da,
  planeEdge:    0x6a7480,
  planeEngine:  0x707880,

  // Exterior / Background
  tarmac:       0x3a3e42,  // dark asphalt
  tarmacLine:   0xe8d44d,  // yellow taxiway line
  tarmacWhite:  0xd0d4d8,  // white edge marking
  runway:       0x2e3236,  // runway surface (darker)
  sky:          0x8a9aae,  // overcast sky grey-blue
  skyHorizon:   0xbcc6d0,

  // Lighting accents
  ambientRed:   0xffe0e0,
  ambientBlue:  0xe0e8ff,
  stripLight:   0xfff8e8,  // corridor strip lighting
};

// ── Building Dimensions (world units) ────────────────────
export const BLDG = {
  // Overall freeport shell
  width:   64,     // x-extent (±32 from center)
  depth:  130,     // z-extent (from z=-45 to z=85)
  height:  20,     // wall height
  wallT:    3,     // wall thickness

  // Corridor dimensions
  corrW:   14,     // corridor width (each side)
  corrH:   16,     // corridor height (slightly lower than building)
  divT:     2,     // central divider thickness

  // Turnstile room
  vaultW:  54,     // vault width (interior)
  vaultD:  36,     // vault depth (z-extent)
  vaultH:  18,     // vault ceiling height

  // Proving window
  glassH:  14,     // glass height
  glassT:   0.6,   // glass thickness
  mullionW: 0.4,   // mullion width
  mullionN: 6,     // number of mullion strips

  // Crash hole
  crashW:  22,     // hole width
  crashH:  16,     // hole height
};

export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const lerp    = (a, b, t) => a + (b - a) * t;
export const smooth  = (t) => t * t * (3 - 2 * t);

// ── 3-LAYER HEXAGON GEOMETRY (the freeport core) ─────────
// Three concentric, IRREGULAR hexagons. NO ceiling/roof. North = -z (top of the plan),
// South = +z (bottom). Blue turnstile sits West (-x), Red East (+x).
//
// Edge numbering (the user's, around the inner turnstile room):
//   1 = top edge, hugging the turnstiles            (base length L)
//   2 = NW edge (blue side)  ┐ ≈ 1.5·L, ~110° from edge 1
//   3 = NE edge (red side)   ┘
//   4 = SW edge (blue side)  ┐ ≈ 0.8·L, ~110° from edges 2/3
//   5 = SE edge (red side)   ┘
//   6 = bottom edge — the door edge, PARALLEL to edge 1 (bottom corners ≈140°)
// The two bottom (6) doors flank the partition; the SE/SW (4/5) edges hold the middle-ring
// doors; the outer ring's TOP edge holds the two rolling steel doors → outside.
//
// Corner order [TL, TR, RE, BR, BL, WE]; CODE edge indices:
//   0 TL→TR = user 1 (top)        3 BR→BL = user 6 (bottom / doors)
//   1 TR→RE = user 3 (NE/red)     4 BL→WE = user 4 (SW/blue)
//   2 RE→BR = user 5 (SE/red)     5 WE→TL = user 2 (NW/blue)
//
// Inner corners derived from L, the 1.5L sides, and the 110° corner angles:
const _L = 24;                          // edge-1 base length
const _S = 1.5 * _L;                    // edges 2 & 3
const _M = 0.8 * _L;                    // edges 4 & 5  (→ bottom edge ≈ 0.8L too)
const _d3 = { x: Math.sin(20 * Math.PI / 180), z: Math.cos(20 * Math.PI / 180) }; // NE dir
const _TR = { x: _L / 2, z: -12 };
const _RE = { x: _TR.x + _S * _d3.x, z: _TR.z + _S * _d3.z };
// SE dir = NE turned 70° clockwise (in x-right / z-down): (cos140°, sin140°)
const _d5 = { x: Math.cos(140 * Math.PI / 180), z: Math.sin(140 * Math.PI / 180) };
const _BR = { x: _RE.x + _M * _d5.x, z: _RE.z + _M * _d5.z };
const _innerCorners = [
  [-_TR.x, _TR.z],   // TL
  [ _TR.x, _TR.z],   // TR
  [ _RE.x, _RE.z],   // RE
  [ _BR.x, _BR.z],   // BR
  [-_BR.x, _BR.z],   // BL
  [-_RE.x, _RE.z],   // WE
];

// Outward edge-offset of a closed polygon (preserves edge directions / angles / parallelism).
function offsetPolygon(corners, dist) {
  const n = corners.length;
  const lines = corners.map((a, i) => {
    const b = corners[(i + 1) % n];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz) || 1;
    const ux = dx / L, uz = dz / L;
    // outward normal for clockwise (z-down) winding is (dz, -dx)
    return { px: a[0] + dist * uz, pz: a[1] - dist * ux, ux, uz };
  });
  const out = [];
  for (let i = 0; i < n; i++) {
    const l0 = lines[(i - 1 + n) % n], l1 = lines[i];
    const det = -l0.ux * l1.uz + l1.ux * l0.uz;
    const dx = l1.px - l0.px, dz = l1.pz - l0.pz;
    const t = (-dx * l1.uz + l1.ux * dz) / det;
    out.push([l0.px + t * l0.ux, l0.pz + t * l0.uz]);
  }
  return out;
}
function pointOnEdge(ring, i, f) {
  const a = ring[i], b = ring[(i + 1) % ring.length];
  return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f };
}

// Pull the inner + middle rings NORTH, toward the outer ring's top wall, so the merged
// top connection isn't a big empty wedge. The OUTER ring stays put (offset from the base
// hexagon); the inner/middle are that base shifted north, then offset/merged.
const NORTHSHIFT = 24;
const _baseInner = _innerCorners;
const _shiftedInner = _baseInner.map(c => [c[0], c[1] - NORTHSHIFT]);

export const HEX = {
  inner: _shiftedInner,
  gapThin: 12,   // thin transition layer (inner hex → middle hex)
  gapBig:  28,   // large outer layer    (middle hex → outer hex)
  wallH:   18,   // wall height (NO roof above)

  // Doors per ring: { CODE-edgeIndex: [ {at: 0..1 along edge, w} ] }
  // The two ROLLING doors are on the OUTER ring's NORTH (top) edge, at its two sides —
  // this is where the middle ring's 2/3 edges meet the outer ring's edge 1, and where the
  // 747 crashes in. Inner doors flank the partition on the south edge.
  innerDoors: { 3: [{ at: 0.30, w: 6 }, { at: 0.70, w: 6 }] },        // bottom (user 6), flank partition
  midDoors:   { 2: [{ at: 0.50, w: 9 }], 4: [{ at: 0.50, w: 9 }] },   // SE/SW (user 5/4)
  outerDoors: { 0: [{ at: 0.26, w: 14 }, { at: 0.74, w: 14 }] },      // NORTH (user 1) two sides: rolling doors → outside

  // Turnstile cylinders + partition (shifted north with the inner room)
  cylZ:   -4 - NORTHSHIFT,
  cylX:    8,
  partN:  -4 - NORTHSHIFT,        // partition runs from between the cylinders …
  partS:  _BR.z - NORTHSHIFT,     // … south to the bottom (door) edge
};

// Rings (arrays of [x,z]). Outer is offset from the UN-shifted base so it stays put;
// inner/middle are the north-shifted hexagon, so they sit close to the outer top wall.
export const RINGS = {
  inner: HEX.inner,                                            // shifted north
  mid:   offsetPolygon(HEX.inner, HEX.gapThin),
  outer: offsetPolygon(_baseInner, HEX.gapThin + HEX.gapBig),  // from base → unchanged
};

// MERGE: lift the middle ring's top corners up onto the outer ring's top edge, so the
// middle's NE/NW edges (user 2/3) connect to the outer ring's top edge (user 1). The
// middle's own top edge is then dropped (it coincides with the outer top), and the two
// side segments of the outer top edge — outboard of where the middle joins — become the
// rolling doors. (So the "big outer layer" is open at the top, a horseshoe.)
export const MERGE = { skipMidTop: true };
const _topZ = RINGS.outer[0][1];
RINGS.mid[0] = [RINGS.mid[0][0], _topZ];   // mid TL → onto outer top edge
RINGS.mid[1] = [RINGS.mid[1][0], _topZ];   // mid TR → onto outer top edge

// Compact the OUTER ring's south half — the room now sits north, so the southern big
// layer was oversized. Pull the east/west points and the bottom corners inward (keep the
// top edge / rolling doors / crash fixed).
RINGS.outer[2] = [ 58, 12];   // RE
RINGS.outer[3] = [ 20, 40];   // BR
RINGS.outer[4] = [-20, 40];   // BL
RINGS.outer[5] = [-58, 12];   // WE
{
  const xoL = RINGS.outer[0][0], xoR = RINGS.outer[1][0];  // outer top-edge x range
  const xmL = RINGS.mid[0][0],   xmR = RINGS.mid[1][0];    // where the middle joins
  const span = xoR - xoL;
  const atOf = x => (x - xoL) / span;
  const segCw = (xoL + xmL) / 2, segCe = (xmR + xoR) / 2;  // centres of the two side gaps
  const segW = Math.max(10, (xoR - xmR) - 3);
  HEX.outerDoors = { 0: [ { at: atOf(segCw), w: segW }, { at: atOf(segCe), w: segW } ] };
}

// World positions of every doorway.
export const DOORS = {
  rollW:  pointOnEdge(RINGS.outer, 0, HEX.outerDoors[0][0].at),  // outer NORTH rolling door, west
  rollE:  pointOnEdge(RINGS.outer, 0, HEX.outerDoors[0][1].at),  // outer NORTH rolling door, east
  midSE:  pointOnEdge(RINGS.mid,   2, 0.5),                      // middle SE (red)
  midSW:  pointOnEdge(RINGS.mid,   4, 0.5),                      // middle SW (blue)
  innE:   pointOnEdge(RINGS.inner, 3, HEX.innerDoors[3][0].at),  // inner bottom, east (red)
  innW:   pointOnEdge(RINGS.inner, 3, HEX.innerDoors[3][1].at),  // inner bottom, west (blue)
  redCyl:  { x:  HEX.cylX, z: HEX.cylZ },
  blueCyl: { x: -HEX.cylX, z: HEX.cylZ },
};

// ── Key Positions (world units) ─────────────────────────
export const POS = {
  bldgCenter: { x: 0, z: 0 },

  // Crash site — the 747 explodes OUTSIDE, north of the east rolling door (it does not
  // breach the wall). Fire/smoke sit outside; the plane wreck is further north.
  exterior:   { x: 0,              z: DOORS.rollE.z - 85 },
  crashWall:  { x: DOORS.rollE.x,  z: DOORS.rollE.z },
  crashHole:  { x: DOORS.rollE.x,  z: DOORS.rollE.z - 18 },   // explosion outside the wall
  plane:      { x: DOORS.rollE.x + 3, z: DOORS.rollE.z - 50 },

  // Turnstile room core
  provingWin: { x: 0, z: (HEX.partN + HEX.partS) / 2 },
  vault:      { x: 0, z: HEX.cylZ },
  vaultRed:   { x:  HEX.cylX, z: HEX.cylZ },
  vaultBlue:  { x: -HEX.cylX, z: HEX.cylZ },
  turnstile:  { x: 0, z: HEX.cylZ },

  // Rolling doors (outer top edge) → outside
  gateEast:   DOORS.rollE,
  gateWest:   DOORS.rollW,

  // South / north reference (for tarmac markings)
  southWall:  { z: 70 },
  northWall:  { z: RINGS.outer[0][1] - 6 },

  // Vertical
  floorY:     0,
  ceilingH:   18,
};
