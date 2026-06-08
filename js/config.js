// Shared constants — no imports so every module can use it without cycles.
// Orientation matched to the aerial reference. North = -z, South = +z, East = +x.
//
//   A compact cluster sits in the SOUTH-WEST: the LZ (foreground), arches
//   spread along the earthen berm just west of them, then the turnstile and
//   main battlefield trending north-west. The tunnel ENTRANCE is at the NE
//   edge of the battlefield. The DETONATION hypocenter is the broad terraced
//   hill far to the EAST-SOUTH, across the open quarry floor.

export const COL = {
  forward:    0xe5484d,  // red  = forward time
  forwardSoft:0xf3b0b2,
  inverted:   0x2f6fed,  // blue = inverted / reverse time
  invertedSoft:0xa9c2f6,
  neilCar:    0x4e8a5a,  // Neil's green car (a prop, not a time-state)
  tan:        0xd8c79b,  // the building destroyed in both directions
  tanEdge:    0x8f7d52,
  sphere:     0xc7b287,
  edge:       0x2a3340,
  ground:     0xe3e7ed,
  groundHi:   0xeceff3,
  groundLo:   0xd2d8e0,
  building:   0xedf0f4,
  concrete:   0xdadfe5,
  vault:      0xe6ebf1,
  accent:     0x111418,
  path:       0xe5484d,  // underground route line (forward descent)
};

// Landmark coordinates (see header for the layout).
export const POS = {
  lz:        { x: 52.64, z: 284.23 },  // SW foreground — Red Team's main LZ (baked from editor 2026-06-08)
  arches:    { x: -27,  z: 178 },   // representative centre of the arch line (baked, moved south)
  turnstile: { x: -19.24, z: -1.58 },  // baked from editor (2026-06-08) — pit + choreography follow
  entrance:  { x: -52,  z: -108 },  // mouth of the main battlefield
  spheres:   { x: -28,  z: -128 },  // battlefield feature (moved north, out of the turnstile pit)
  stepped:   { x: -98,  z: -120 },  // battlefield feature
  building:  { x: -40,  z: -230 },  // double-exploding building (5:00) — just SE of the tunnel entrance
  cave:      { x: -75,  z: -290 },  // tunnel entrance — directly north of the building cluster

  // Eastern detonation hypocenter + buried chamber (far EAST-SOUTH)
  hill:      { x: 360,  z: 70  },   // big terraced hill — detonation point (further south)
  gate:      { x: 360,  z: 62  },   // locked iron gate (underground)
  chamber:   { x: 360,  z: 66  },   // chamber centre (rope drop)
  volkov:    { x: 365,  z: 74  },   // Volkov + Algorithm (underground)

  vaultY:    -55,                    // underground chamber floor height
  cityX:     -150,
};

export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);

// Editable terrain parameters (P4). groundHeight() reads these live, so changing one
// and rebuilding the terrain mesh reshapes the ground. `terrainDefaults` = reset values.
export const terrainDefaults = Object.freeze({
  hillR: 130, hillH: 58,            // detonation hill: radius, height
  apronHalfW: 92, apronLen: 320,    // hill approach ramp: half-width, length
  basinR: 60, basinDepth: 5, basinFunnel: 9,   // turnstile pit: radius, wall-base depth, funnel depth to centre
  bermH: 46, bermCenterZ: 170,      // arches berm: height, N–S centre (baked from editor — moved south)
});
export const terrainParams = { ...terrainDefaults };

// Quantise a height into mine-pit terraces (mostly flat steps, slight ramp).
function terrace(h, step = 7) {
  const base = Math.floor(h / step) * step;
  return base + (h - base) * 0.18;
}

// Terrain height field, shared so actors sit on the ground.
export function groundHeight(x, z) {
  const P = terrainParams;
  let y = Math.sin(x * 0.010) * 1.3 + Math.cos(z * 0.012) * 1.3;

  // Eastern detonation hypocenter — a broad terraced mesa.
  const R = P.hillR;
  const dh = Math.hypot(x - POS.hill.x, z - POS.hill.z);
  if (dh < R) {
    const k = dh / R;                         // 0 centre … 1 rim
    const edge = clamp01((1 - k) / 0.40);     // broad flat top, gentler shoulders
    y += smooth(edge) * P.hillH;
  }

  // Broad, gentle approach slope on the NW face of the hill, aligned with the
  // tunnel/route (the hill→cave diagonal) so Neil drives up the same way the
  // underground passage runs. A wide apron rising slowly to the plateau edge.
  {
    const dirx = -0.78, dirz = -0.62;            // hill → cave (NW), matching the tunnel direction
    const ddx = x - POS.hill.x, ddz = z - POS.hill.z;
    const s = ddx * dirx + ddz * dirz;
    const perp = -ddx * dirz + ddz * dirx;
    const halfW = P.apronHalfW, plateauR = 56, rampLen = P.apronLen;   // wide + long = gentle rise
    if (s > 0 && Math.abs(perp) < halfW) {
      const along = s <= plateauR ? 1 : clamp01(1 - (s - plateauR) / rampLen);
      // Trapezoid cross-section: a FLAT driving strip in the middle, steeper slopes on the two sides.
      const ap = Math.abs(perp), flatHalf = halfW * 0.45;
      const across = ap <= flatHalf ? 1 : smooth(clamp01(1 - (ap - flatHalf) / (halfW - flatHalf)));
      const rampH = P.hillH * smooth(along) * across;
      if (rampH > y) y = rampH;
    }
  }

  // (North & west mine-pit walls removed — the battlefield ground reads as a flat plane.)

  // Turnstile arena: a closed, vertical-walled circular pit collapsing to the centre.
  // The visible wall + funnel are ONE smooth lathe mesh (landmarks.js); the coarse terrain
  // plane only has to drop out of sight beneath it WITHOUT a hard grid-step (a step on the
  // 5-unit grid zig-zags into a sawtooth the mesh can't cap). So the plane is shaped as a
  // SMOOTH bowl: funnel inside R (sunk 0.6 below the mesh), then a smooth ramp up to grade
  // over R…Rout, then eased back into the noisy ground. The lathe's flat apron (out to Rout)
  // caps that whole ramp band; nothing under it ever pokes through.
  {
    const dx = x - POS.turnstile.x, dz = z - POS.turnstile.z;
    const R = P.basinR, dt = Math.hypot(dx, dz);
    const Rout = R + 10;
    if (dt < Rout) {
      y = dt < R
        ? -P.basinDepth - P.basinFunnel * (1 - dt / R) - 0.6              // funnel, just under the mesh
        : lerp(-P.basinDepth - 0.6, 0, smooth((dt - R) / (Rout - R)));    // smooth ramp up to grade
    } else if (dt < Rout + 8) {
      y = lerp(0, y, smooth(clamp01((dt - Rout) / 8)));                   // ease flat rim back into noise
    }
  }

  // Earthen berm / embankment running N-S just west of the arches — a large
  // raised shoulder the arches stand beside (no separate mesh needed). Centred on
  // the arches latitude so it does NOT reach north into the turnstile.
  {
    const ox = x + 100;            // positive = east of ridge centre at x ≈ −100
    const oz = z - P.bermCenterZ;  // centred on the arch line, well south of the turnstile
    if (ox > -50 && ox < 70 && Math.abs(oz) < 100) {
      const along  = smooth(clamp01(1 - (oz / 100) ** 2));
      const across = smooth(clamp01(ox < 0 ? (ox + 50) / 50 : 1 - ox / 70));
      y += P.bermH * along * across;
    }
  }

  return y;
}
