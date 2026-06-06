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

// ── Key Positions (world units) ─────────────────────────
export const POS = {
  // Building origin is at (0, 0, 20)  — center-ish of the structure
  bldgCenter: { x: 0, z: 20 },

  // Exterior / crash site
  exterior:   { x: 15,  z: 110 },   // south exterior (tarmac)
  crashWall:  { x: 12,  z: 85  },   // where the 747 nose punches through
  crashHole:  { x: 12,  z: 85  },   // center of the breach
  plane:      { x: 25,  z: 115 },   // 747 wreckage centre on tarmac

  // Interior
  loading:    { x: 0,   z: 78  },   // loading bay (entry after crash)

  // Twin corridors
  hallRed:    { x: 15,  z: 40  },   // Red (forward) corridor center
  hallBlue:   { x: -15, z: 40  },   // Blue (inverted) corridor center
  hallStart:  { z: 75 },            // south end of corridors (near loading)
  hallEnd:    { z: 5 },             // north end (approaching vault)

  // The Proving Window divides the two corridors and the vault room
  provingWin: { x: 0,   z: 0  },    // center of the proving window

  // Vault / Turnstile (Rectangular room)
  vault:      { x: 0,   z: -20 },   // vault center
  vaultRed:   { x: 14,  z: -20 },   // inside vault, red side
  vaultBlue:  { x: -14, z: -20 },   // inside vault, blue side
  turnstile:  { x: 0,   z: -25 },   // the Rotas turnstile device (straddles the window)

  // South face of the building
  southWall:  { z: 85 },
  // North face (behind vault)
  northWall:  { z: -40 },

  // Vertical
  floorY:     0,
  ceilingH:   20,
};

export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const lerp    = (a, b, t) => a + (b - a) * t;
export const smooth  = (t) => t * t * (3 - 2 * t);
