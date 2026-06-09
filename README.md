# TENET · Interactive Battle Visualizations

A schematic, navigable 3D reconstruction of two key set-pieces from *Tenet* — built
to explore the **spatial and temporal logic** of each, not to reproduce film footage.
Geometry is stylised; what we're after is the choreography of inverted vs forward time.

Two scenes ship side-by-side under one shell:

- **Stalsk-12 · Temporal Pincer** — the final assault, a 10-minute window with a
  forward Red Team and inverted Blue Team converging on the Algorithm vault.
- **Oslo Freeport · Turnstile** — the freeport break-in and the fight at the turnstile,
  where forward grapples inverted and bullets un-fire.

Built with [three.js](https://threejs.org/) (loaded from a CDN) and vanilla ES modules.

## Run it

Because it uses ES modules and loads three.js from a CDN, it must be served over HTTP
(opening the file directly with `file://` won't work). From this folder:

```bash
python -m http.server 8123
```

then open <http://localhost:8123/>. The shell at `index.html` shows scene tabs at the
top — click between **Stalsk-12** and **Oslo Freeport**. Each scene also has its own
direct URL (`stalsk.html`, `oslo.html`); opening either directly redirects back to the
shell so the tab UI stays consistent.

## What each scene shows

### Stalsk-12

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

### Oslo Freeport

- **Freeport hallways** leading to the vault containing the **Rotas turnstile**.
- The 747 crash that drives the distraction (modelled at the crash apron).
- **TP 2 & Neil 2**: the inverted second selves who emerge at the very END of the big
  timeline, walk backward to the turnstile, then forward again. Each is a single
  continuous traveller with two phases (inverted → forward); the editor and clip system
  treat each phase as its own POV so different footage can be assigned.
- A 7-beat **timeline** spanning the break-in, the turnstile fight, and the exit.

## Controls (shared)

- **Drag** to orbit, **scroll** to zoom (also zooms while following a character).
- **View** rail (left): god view, or follow a character. Following adds a **subjective
  timeline**; the camera hands off between an entity's selves as that subjective time
  advances. For an inverted moment, dragging the subjective track right runs the global
  clock *backward* ("TIME INVERTED" lights up). In Stalsk, the three Neil entries are
  entry points into Neil's *single continuous subjective experience*.
- **Playback direction** (▶ toggle, next to play): in god view, flip the master clock
  between forward (→) and reverse (←). Disabled while following a character (their
  subjective time drives the clock instead).
- **Locations** rail (right): jump to scene-specific landmarks (LZ, turnstile, vault,
  hypocenter; or freeport hallway, crash apron, etc.).
- **X-RAY** (Stalsk only, top-right): make the ground transparent to trace the tunnel.
- **EDIT** (top-right): scene editor — see the next section.
- **Timeline** (bottom): scrub or play the master clock; key beats are marked.
  **←/→ arrow keys** jump to the previous/next beat (or, while a character is selected
  in the editor, to that character's previous/next keyframe).
- **Hover an event** marker for the inline clip thumbnail; **click** (in edit mode) to
  set its clip files.

## Scene editor (EDIT mode)

Click **EDIT** to enter editing. The orange panel at the right is the editor; the body
gets an `editing` class so clickable hints light up across the UI. There are two close
buttons on the panel: **—** minimises the body (edit mode stays on, so you can keep
dragging diamonds and timing things), **✕** exits edit mode entirely.

### Landmarks

Click any landmark — the gizmo attaches. Switch between **Move**, **Rotate**, **Scale**
in the panel; hovering highlights the object. The orbit re-centres on selection.

### Characters

Pick one from the dropdown or click it in the world. Scrub the timeline to a moment,
then drag the model — that becomes a keyframe at that time. Rotating leaves a
rotation-only keyframe; moving leaves a position-only keyframe (the two are independent
so a turn doesn't accidentally drop a stray position key).

- **Del position @ t** / **Del rotation @ t**: remove just that kind of key at the
  current `t`.
- **Visibility windows**: per-actor "show/hide from t" step keys — click the **Show
  from t** / **Hide from t** chips to mark whether the actor is visible from now on.

While a character is selected, the timeline diamonds **switch** from event beats to
that actor's keyframes. Each diamond is:

- **Clickable** — jump exactly to that keyframe.
- **Draggable** — slide it left/right to re-time the key (the track re-sorts).

The panel also shows a **◆ Keyframe values** section when the playhead is on a
keyframe. Type or scrub the **t**, **X**, **Y**, **Z**, and **ry** fields to edit the
keyframe precisely. The `t` row (highlighted) re-times the keyframe — the diamond
slides to match. The 3D scene refreshes live.

**Other niceties**: Number inputs **drag to scrub**. Hovering highlights the object.
**Ctrl+Z** undoes (one entry per drag, not per intermediate step). **Reset object**
restores the selected entity's factory defaults; **Reset all** wipes every edit.
**Export / Import JSON** dumps or restores the whole scene's edits as text; there's
also a **TERRAIN** section (Stalsk) and **named save slots** + .json file
download/upload at the bottom of the panel.

### Event markers (the labelled story beats)

In edit mode each event diamond on the main timeline is also draggable. Sliding one
re-times the story beat *and* migrates its clip override (so the assigned video
follows). Clicking is unchanged — seek to the beat and go to its location.

The orange **＋ Add event @ t** button at the top of the editor panel creates a *new*
event at the current timeline `t`. The clip popover opens with the title field focused;
type a name, set clip paths if you have them, hit Save. The new marker shows in
**orange fill** to distinguish it from factory beats. User-added events also get a
🗑 **Delete event** button in the popover.

## Clip system

Each event can carry a forward clip and a reverse clip (`.mp4` paths). Hovering an
event during playback plays the matching clip. Per-POV overrides let you assign a
different clip when following a specific character (e.g. TP 2 — Inverted phase vs
TP 2 — Forward phase).

Clip assignments resolve through a three-layer chain:

1. **Hardcoded defaults** in each `EVENTS` literal (factory baseline).
2. **`clips/<scene>/clips.json`** — the team's committed shared file. Wins over factory
   defaults.
3. **localStorage** — your live working drafts. Wins over the committed JSON.

Click an event title or marker in edit mode → the Clip Files popover opens. Type
forward / reverse paths, optionally per-POV via the dropdown. The bottom of the
popover has **↓ Export all clips as JSON** — it downloads a single JSON bundle
containing:

- Your clip overrides (keyed by `t.toFixed(3)`).
- `__eventTimes` — any re-timed factory beats.
- `__addedEvents` — any new event markers you created.

Save that download as `clips/<scene>/clips.json`, commit it, and teammates inherit your
clip assignments, re-timings, and new beats together. Merge behaviour on load:
committed events come first, your local drafts override, then the union is written
back to localStorage so subsequent reloads start clean.

## Structure

```
index.html                        # scene-tab shell (iframes stalsk.html / oslo.html)
stalsk.html                       # Stalsk-12 page (UI overlay + import map)
oslo.html                         # Oslo Freeport page

js/
  editor.js                       # shared scene editor (gizmo, keyframes, vis, slots, undo)
  stalsk/
    config.js                     # constants, landmark coordinates, terrain height field
    util.js                       # shared helpers (edged-mesh wrapper)
    world.js                      # terrain, tunnel, vault, X-ray, camera framings
    landmarks.js                  # arches, turnstile, buildings, LZ, helipads
    entities.js                   # units, helicopters, Neils, choreographed keyframes
    squads.js                     # red/blue team flocking + obstacle-aware pathing
    views.js                      # camera / orbit / follow controller
    app.js                        # scene setup, timeline, playback dir, subjective-time
  oslo/
    config.js                     # constants, freeport layout
    world.js                      # freeport hallways, crash apron, vault
    landmarks.js                  # turnstile, doors, exit ramps
    entities.js                   # Protagonist, Neil, TP2, Neil2 (multi-phase)
    views.js                      # camera / follow controller
    app.js                        # scene setup, timeline, phase-aware subjective time

clips/
  stalsk/clips.json               # committed clip overrides / event-times / added events
  oslo/clips.json                 # same, for Oslo
  stalsk/*.mp4, oslo/*.mp4        # actual video files referenced by clip paths

uploads/                          # design references (hand-drawn map, satellite, film stills)
```

> Prototype / work in progress. Geometry and event timings are approximate; the editor
> is the day-to-day tool for tuning them.
