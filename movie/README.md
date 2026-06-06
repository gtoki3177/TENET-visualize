# TENET · Stalsk-12 — Interactive Battle Visualization

A schematic, navigable 3D reconstruction of the final **Temporal Pincer** assault on
Stalsk-12 from *Tenet* — built to explore the battle's **spatial and temporal logic**,
not to reproduce film footage. Geometry is stylised.

Built with [three.js](https://threejs.org/) (loaded from a CDN) and vanilla ES modules.

## Run it

Because it uses ES modules and loads three.js from a CDN, it must be served over HTTP
(opening the file directly with `file://` won't work). From this folder:

```bash
python -m http.server 8123
```

then open <http://localhost:8123/> (it serves `index.html` automatically).

## What it shows

- **South→north spine**: main LZ + arches → turnstile → battlefield entrance →
  buildings → the double-exploding building (the **5:00** mark) → tunnel entrance.
- **SE hypocenter highland** (steep mesa) with the buried **Algorithm vault**, reached
  by a long U-turn tunnel from the northern entrance; a drivable ramp climbs the NW face.
- **Temporal pincer**: forward **Red Team** (red) and inverted **Blue Team** (blue),
  with battlefield fire running in both directions of time.
- **The double-exploding building** heals bottom-up then is destroyed top-down.
- **One Neil, three on-screen selves** (colour = time-direction): **Neil — FWD** the
  rescuer (reverts red at the turnstile → car → ropes → out of the car → walks back to
  the turnstile), **Neil — BWD** his inverted (blue) copy who advances with Blue then
  peels off to the turnstile, and **Neil — After** (blue) who goes back in to lock the
  gate and take the bullet. FWD/BWD only exist once they step out of the turnstile.
- A 14-beat **timeline** of the 10-minute battle.

## Controls

- **Drag** to orbit, **scroll** to zoom (also zooms while following a character).
- **View** rail (left): god view, or follow Red/Blue/Protagonist/Ives, or Neil. The three
  Neil entries are entry points into Neil's *single continuous subjective experience*
  (BWD → turnstile → FWD drive/rescue → enters the door with his After self → After locks
  the gate, takes the bullet, lies down to the start). Following adds a **subjective
  timeline**; the camera hands off between Neil's selves as that subjective time advances.
  For an inverted moment, dragging the subjective track right runs the global clock
  *backward* ("TIME INVERTED" lights up). Neil — FWD / BWD are greyed out until Neil
  emerges from the turnstile.
- **Playback direction** (▶ toggle, next to play): in god view, flip the master clock
  between forward (→) and reverse (←). Disabled while following a character (their
  subjective time drives the clock instead).
- **Locations** rail (right): jump to the LZ, turnstile, tunnel entrance, vault, hypocenter.
- **X-RAY** (top-right): make the ground transparent to trace the underground tunnel.
- **EDIT** (top-right): scene editor. **Landmarks** — click one, then move/rotate/scale with the
  gizmo. **Characters** — pick one (dropdown) or click it, scrub the timeline to a moment, then
  drag it: that becomes a keyframe at that time (Delete-keyframe removes it). Selecting recentres
  the orbit; Ctrl+Z undoes. Edits auto-save (localStorage), re-apply on load; Export/Import JSON,
  or Reset. With a character selected you can also edit its **visibility windows** (the
  time ranges it appears). Clicking a keyframe / pressing ←→ recentres the camera on it.
  A **TERRAIN** section reshapes the ground (hill, apron, basin, berm) — note landmarks
  and characters don't auto-re-snap to big terrain changes. Number fields **drag to scrub**,
  hovering highlights the object, and there are **named save slots** + JSON **file** download/upload.
- **Timeline** (bottom): scrub or play the master clock; 14 key beats are marked.
  **←/→ arrow keys** jump to the previous/next beat (or, while a character is selected in
  the editor, to that character's previous/next keyframe).

## Structure

```
index.html                        # entry point: UI overlay + import map
js/
  config.js      # shared constants, landmark coordinates, terrain height field
  util.js        # shared helpers (edged-mesh wrapper)
  editor.js      # in-app scene editor (gizmo, select, persist) — Phase 1: landmarks
  world.js       # terrain, tunnel, vault, X-ray, camera framings
  landmarks.js   # arches, turnstile, buildings, LZ, helipads
  entities.js    # units, helicopters, Neils, the choreographed keyframes
  views.js       # camera / orbit / follow controller
  app.js         # scene setup, timeline, playback direction, subjective-time logic
uploads/         # design references (hand-drawn map, satellite, film stills)
```

> Prototype / work in progress. Geometry and event timings are approximate.
