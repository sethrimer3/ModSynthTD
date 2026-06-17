# Architecture Overview

Title: **ModSynth TD**

ModSynth TD is a modular-synth tower-defense campaign. The player builds a real
patchable synthesizer rack; the evaluated patch produces timed combat signals
that fight musical-note enemies. The rack and battlefield share one pannable,
zoomable world-space scene.

This document describes the current (campaign) architecture. See
`V2_MODSYNTH_PLAN.md` for the implementation plan, status ledger, and the
content-extension guide.

---

## 1. Technology Stack

| Concern | Technology |
|---|---|
| Language | TypeScript (strict) |
| Build | Webpack 5 (`npm run build`) |
| Tests | `tsc` + node harness (`npm test`) |
| Desktop shell | Electron |
| Rendering | HTML5 Canvas 2D (battlefield) + DOM/SVG (rack, cables) |
| Audio | Web Audio API |
| Persistence | `localStorage` (key `modsynth-td-save`, schema v1) |

Entry: `src/main.ts` → `src/v2/app.ts` `startModSynthTD()`.

---

## 2. Module map

```
src/v2/
  core/                 pure, renderer-free, node-testable
    ticks.ts            integer musical timing (PPQ 48)
    rng.ts              seeded deterministic randomness
    limits.ts           central bounded-execution caps
    events.ts           canonical SignalEvent
    ports.ts            typed port contracts + compatibility
    modules.ts          data-driven module registry + pure process()
    graph.ts            rack graph: validate, evaluate, (de)serialize
    score.ts            wave-score schema, validate, compile
    enemy-defs.ts       enemy registry (data only)
  data/
    score-dsl.ts        compact rhythm-notation authoring DSL
    worlds.ts           nine-world campaign + authored scores
  state/                pure save/economy/progression
    save.ts             versioned schema, migrations, import/export/reset
    economy.ts          Resonance: milestones, purchases, refunds, shelves
    progression.ts      unlock chain, blueprints, Signal Cipher route check
  ui/                   browser-only
    camera.ts           shared world-space camera + pointer/touch controls
    combat.ts           tick-driven combat runtime + battlefield renderer
    rack-ui.ts          editable shelves, modules, soft cables, pulses
    audio-engine.ts     Web Audio synthesis from SignalEvents
    notation.ts         glowing sheet-music renderer (cached)
    tutorials.ts        contextual one-shot tips
    shop-ui.ts          module shop / browser
    settings-ui.ts      audio, rack position, save tools
    worldmap.ts         campaign map + summaries + hidden secret world
    level.ts            the unified-scene level orchestrator
  app.ts                root: save load, screen routing, persistence
  tests/                deterministic unit tests (81)

src/version2-soft-wire.ts   reused Verlet-rope SVG cable renderer
ASSETS/                      sprites, kick samples, font
```

---

## 3. The canonical signal model

One evaluated patch → one stream of `SignalEvent` (`core/events.ts`). The same
stream drives **combat projectiles, visible cable pulses, the output tower, and
Web Audio voices**. Nothing else (AudioNodes, DOM, canvas objects) is a source
of truth.

`graph.evaluatePatch(graph, {startTick, endTick, seedBase})` is pure,
deterministic, cycle-safe, and bounded (see `core/limits.ts`). It runs without
the renderer or an AudioContext, so it is fully unit-tested.

Authored timing is **integer ticks** at PPQ 48 (`core/ticks.ts`). Seconds are
derived only at the transport/audio boundary. A `WaveScore` compiles into the
enemy spawn schedule, the notation layout, and preview audio from one source.
The notation overlay and battlefield spawn telegraphs consume that compiled
spawn schedule directly; their pulses, handoffs, and enemy creation share the
same absolute spawn tick.

---

## 4. The unified scene

`ui/level.ts` builds one camera-driven scene:
- a viewport-sized battlefield `<canvas>` (camera applied inside `combat.draw`),
- a CSS-transformed rack layer (`translate(pan) scale(zoom)`) holding the DOM
  rack, SVG cables, pulse overlay, and world-anchored next-wave notation.

Both use the one `Camera` (`ui/camera.ts`): wheel zoom, drag pan, touch pan,
pinch, fit-scene, soft clamping. Rack placement (Auto/Left/Right/Below) only
repositions the rack root; module coordinates are shelf/slot-local, so changing
side never disturbs the patch.

Wheel zoom uses a persisted 50%-200% sensitivity multiplier. The 100% default
uses a fine 5% zoom step per wheel event; touch pinch remains direct.

The rack cable SVG, cable hit paths, and pulse overlay share persisted graphics
preferences for front/behind module layering and opacity. Settings apply live
without rebuilding the rack graph.

Rack shelf art is a decorative case layer only. Module panels, content overlays,
plug hit targets, drag ghosts, and output tower controls use explicit higher
stacking layers; decorative masked sun/mountain canvases are pointer-inert and
cannot intercept rack input.

---

## 5. Transport & wave lifecycle

`level.ts` runs a free-running integer-tick transport
(`tickFloat = elapsedSec · bpm · PPQ / 60`). Each frame it processes newly
crossed integer ticks (catch-up capped for tab suspension). States:
`ready → countin → wave → cleared|failed`, then world `victory` and optional
endless mode. During a wave, topology is locked; knobs flagged `liveSafe`
recompute only future events.

The rack transport is always alive in `ready` and `cleared`: a bounded
four-measure preview evaluation drives cable pulses, module meters, output tower
preview fire, and optional synth audio. Preview projectiles are visual-only and
never damage enemies. Live waves subscribe to a wave-length evaluation of the
same patch stream for combat projectiles and scoring.

---

## 6. Persistence

`state/save.ts` — `modsynth-td-save`, schema v1. Per-world rack (modules with
stable ids, cables, tower, synth pref), shelves, best wave, claimed milestone
watermark, completion; plus global Resonance, blueprints, secret reveal, boss
state, settings, tutorials. Malformed saves are backed up (never overwritten);
unknown module types are dropped with cables repaired and reported
non-destructively. Migrations are keyed by version.

---

## 7. Audio safety

`ui/audio-engine.ts` — one AudioContext, master gain → compressor/limiter →
destination; separate percussion and synth buses. Voices are built per
SignalEvent (osc type from waveform, freq from band+pitch, gate/attack/release
envelope), scheduled by event id (no duplicates after suspend/resume), capped
at 12 voices with oldest-steal, and disconnected on `ended`. No audible sound
before a user gesture.

Between-wave rack preview schedules only a short rolling lookahead of upcoming
events and releases event ids when voices end, so the scheduler does not
accumulate an unbounded future queue while the instrument idles.

Per-planet music automatically discovers `ASSETS/LEVELS/<BPM>BPM/kickLoop.ogg`.
When present, that loop replaces the shared `kick_1` and `kick_2` one-shot
fallback while the planet is active.

Every planet music layer represents four bars in 4/4. Layers restart as
overlapping one-shots on exact `240 / BPM` second boundaries rather than using
each file's encoded duration, so all layers stay synchronized while reverb
tails are allowed to finish naturally.

---

## 8. Tests

`npm test` compiles `src/v2/{core,data,state,tests}` (CommonJS, no DOM) and runs
the node harness. The suite covers timing/RNG, graph validation+evaluation,
score compilation, economy, save/migration, world data, audio-content
validation, and a deterministic headless campaign balance simulator.
`npm run build` validates the full browser bundle.

The balance simulator lives in `src/v2/tests/sim.ts`. It evaluates representative
rack profiles against campaign waves without DOM, canvas, or AudioContext and
prints world/wave diagnostics from the same pure graph and score data used by
the live game. It uses the same one-measure post-phrase signal tail as
`ui/level.ts`, so final authored spawns can be answered by live combat and by
headless diagnostics consistently.

## 9. Combat feedback

`ui/combat.ts` derives projectile band color, waveform shape/motion, amplitude
intensity, envelope trail length, echo styling, tower route pulses, and
transient wave diagnostics directly from canonical `SignalEvent` data. Hit text
uses the pitch multiplier bands `EXACT`, `RESONATE`, `NEAR`, and `RESIST` so
players can read exact tuning, acceptable near matches, and inefficient
mismatches without a separate combat model.
# Per-Output Emitter Towers

Each V2 `output` module instance owns an optional placement in `WorldSave.towersByOutputId`. Graph evaluation groups final events in `eventsByOutput`; level wave setup validates contributing outputs and passes those grouped events to combat, where projectile origin, orientation, pulse state, shape, and color are keyed by output module instance id.

## 10. First-Playable Onboarding Layer

The first-playable UX pass keeps graph/evaluation pure and translates existing
state into UI feedback in `ui/level.ts`, `ui/notation.ts`, `ui/rack-ui.ts`, and
`ui/combat.ts`. `validateGraph()` still owns structural patch validity; the
level layer maps its issue codes to one-sentence player actions. Patch Analysis
uses `core/patch-analysis.ts` to summarize output firing rate, dominant Hz,
tower placement, wave groups, and match quality without mutating simulation.

Notation hover/tap popups compare note Hz against currently evaluated output
events using canonical pitch math. Tower placement feedback remains a combat
renderer concern because the battlefield canvas already owns track blocking,
tower drawing, and placement ghosts.
