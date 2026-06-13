# V2_MODSYNTH_PLAN.md — ModSynth TD Campaign Implementation Plan

Living plan for developing ModSynth TD (Version 2) into a full modular-synth
tower-defense campaign. Updated after every major vertical slice.

Last updated: 2026-06-12 (Slice 1 start)

---

## 1. Current architecture (as found)

The legacy TinyBaseIdle game was already removed (commit a53bcfd). The app
boots directly into the ModSynth TD prototype:

```
src/
  main.ts                     — entry; calls startVersion2()
  version2.ts                 — 2.5k lines: world map, level screen, rack panel,
                                signal-graph walk, combat loop, canvas renderer
  version2-audio.ts           — SubdivisionTransport + kick/hi-hat AudioSystem
  version2-enemies.ts         — note-enemy registry (16th/8th/quarter/half/whole),
                                discrete subdivision movement, canvas draw
  version2-waves.ts           — 5 handcrafted waves (subdiv offsets) + endless gen
  version2-rack-wiring.ts     — drag-to-connect patch cables between plugs
  version2-rack-wiring-types.ts — plug types + pairwise compatibility table
  version2-soft-wire.ts       — Verlet-rope SVG cable renderer (slack, slurp)
  styles.css
```

### Legacy systems worth preserving
- **Soft-wire renderer** (`version2-soft-wire.ts`) — Verlet rope cables with
  sag, color bleed, slurp-on-disconnect. Kept nearly as-is; extended with
  per-wire slack variation, signal pulses, hit paths, highlight/dim states.
- **Note enemies** (`version2-enemies.ts`) — sprites, resonance bands,
  subdivision-quantized movement. Kept; registry extended.
- **SubdivisionTransport** — beatFloat → discrete subdiv events with
  tab-suspension resync. Generalized to integer ticks.
- **Neon visual identity** — colors, Pixelify Sans, glow styling, planet
  previews, waveform projectiles, canvas track rendering.
- **Output tower** — placement, rotation, oriented firing.

### Obsolete / conflicting systems (replaced in V2 campaign)
- Single fixed `SynthChannel/FrequencyModule/ClockModule/DelayModule`
  instances with hardcoded plug ids (`ch1-out`, `clock-in`, …) — replaced by
  a data-driven module-instance registry with stable IDs.
- `evaluateSignalGraph` linear chain walk — replaced by a real directed-graph
  evaluator over canonical SignalEvents.
- `WaveManager` subdiv-offset waves — replaced by integer-tick authored
  scores compiled to spawn schedules + notation.
- Rack as fixed HUD panel below canvas — replaced by world-space rack layer
  in the unified scene.
- `LEVELS` (3 placeholder planets) — replaced by 9-world campaign data.
- Docs `design.md` / `todo.md` / most of `ARCHITECTURE.md` describe the
  removed factory game; superseded by this plan for V2 work.

### Persistence as found
No Version 2 persistence existed (only legacy keys `tiny-base-idle-meta` /
`tiny-base-idle-upg` from the removed game, treated as legacy and left
untouched). Migration therefore starts from a clean slate: the v1 schema is
the first real schema; legacy keys are preserved, never overwritten.

---

## 2. Target architecture

### One unified world-space scene
`src/v2/scene.ts` owns a scene container per level:
- `<div class="scene-root">` with `transform: translate(panX,panY) scale(zoom)`
- battlefield `<canvas>` (drawn in world units, redrawn each frame)
- rack layer `<div>` (DOM shelves + modules) positioned in scene coordinates
- SVG wire layer covering the rack region
- shared `Camera` (`src/v2/camera.ts`) with screenToWorld/worldToScreen,
  wheel zoom, drag pan, touch pan, pinch zoom, fit-scene, clamping.
The battlefield canvas itself stays screen-sized; the camera transform is
applied inside its draw pass, while DOM rack/wires live in a CSS-transformed
container driven by the same camera. Pointer math goes through one
conversion helper.

### One canonical signal model
`src/v2/signal-events.ts`:

```ts
interface SignalEvent {
  id: string;            // stable: `${waveId}:${tick}:${moduleId}:${n}`
  tick: number;          // integer musical tick from wave start
  durationTicks: number;
  band: FrequencyBand;   // pitch/resonance
  waveform: Waveform;    // voice type
  amplitude: number;     // bounded 0..MAX_AMPLITUDE
  gate: number;          // 0..1 gate fraction of duration
  route: string[];       // module instance ids traversed (provenance)
  sourceModuleId: string;
  seed: number;          // deterministic per-event seed
  directions: SignalDirection[]; // tower fire directions
  pitchOffset: number;   // semitone offset for audio voicing
}
```

Graph compilation: `compilePatch(rack, ticks) → SignalEvent[]` is pure,
deterministic, bounded, and runs without DOM/AudioContext. Combat
projectiles, cable pulses, tower firing, and Web Audio scheduling all
consume the same compiled events.

### Integer musical timing
`src/v2/ticks.ts`: `TICKS_PER_QUARTER = 48` (PPQ 48; sixteenth = 12,
eighth-triplet = 16, thirty-second = 6). Authored scores use integer ticks.
Seconds conversion happens only at the transport boundary
(`secPerTick = 60 / bpm / 48`).

### Module system
- `src/v2/ports.ts` — port domains (`clock`, `trigger`, `pitch`, `control`,
  `voice`, `output`), central `arePortsCompatible()`, fan-in/out limits.
- `src/v2/modules.ts` — module type registry: id, name, faceplate, width
  (rack grid units), cost, ports, default settings, per-type
  `process(events, settings, ctx) → events` transform, tooltip.
- `src/v2/graph.ts` — instances + cables; `validateGraph()` (cycles, missing
  ports, incompatibility, no-output-route, fan-out, depth, amplification);
  `evaluateGraph()` deterministic topological traversal with bounds.

### Bounded execution limits (documented constants)
- MAX_DEPTH = 24 traversal layers
- MAX_EVENTS_PER_INPUT = 16 (delay echoes × splits per source event)
- MAX_TOTAL_EVENTS_PER_WAVE = 4096
- MAX_AMPLITUDE = 2.0, MIN note interval clamps
- MAX_FANOUT = 4 per output port, MAX_VOICES (audio) = 12
- Delay: max 4 repeats, feedback ≤ 0.65; mixer normalizes Σ gain ≤ 1.2

### Score model
`src/v2/score.ts` — `WaveScore { measures, events: ScoreEvent[] }`,
`ScoreEvent { tick, durationTicks, enemyTypeId, band, lane?, tieToNext? }`.
`compileScore()` → spawn schedule (integer ticks) + notation layout data +
preview-audio events. `validateScore()` enforces measure fill, integer
ticks, positive durations, known enemy ids, determinism.

### Notation
`src/v2/notation.ts` — constrained custom canvas renderer: 4/4, staff,
note heads/stems/flags/beams (8th/16th pairs), rests, chords, ties,
barlines, playhead. Rendered to an offscreen canvas, cached per wave,
glow-tinted by world theme. (VexFlow rejected: bundle cost + styling
control; our subset is small.)

### Worlds & campaign
`src/v2/worlds.ts` — 9 worlds (IDs `w40`…`w200`):

| id | name | BPM | lesson | waves |
|----|------|-----|--------|-------|
| w40 | First Signal | 40 | basics/tutorial | 8 |
| w60 | Pulse Orbit | 60 | 8ths, waveforms, shop | 10 |
| w80 | Bifurcation | 80 | splitter, chords | 10 |
| w100 | Phase Drift | 100 | phase, delay, syncopation | 10 |
| w120 | Confluence | 120 | mixer, multi-source | 10 |
| w140 | Modulation Field | 140 | filter, envelope, clock div | 10 |
| w160 | Dense Array | 160 | sequencer, big racks | 12 |
| w180 | Overdrive | 180 | mastery | 12 |
| w200 | The Final Measure | 200 | secret finale | gauntlet + 3 boss phases |

Tracks: distinct geometry per world (S-curve, orbit loop, forked lanes,
zig-zag, converging double-entry, spiral, serpentine multi-lane, long
gauntlet). Endless mode after completion.

### Economy
Meta-currency: **Resonance** (final name; musically apt, already a core
mechanic term in-game). Earned via cumulative per-wave milestone tables
(`newReward = cum(newBest) − cum(prevBest)`), world completion bonuses,
challenge + secret rewards. Modules 100% refundable outside combat;
starter modules are non-sellable (zero resale, repair-starter-patch
restores them free). Shelves 2–4 purchasable per world, refundable when
empty and not shelf 1.

### Save schema
`src/v2/save.ts` — localStorage key `modsynth-td-save`, JSON with
`schemaVersion: 1`. Contains: currency, blueprint unlocks, per-world state
(bestWave, completed, shelves, modules [stable instance ids, type,
shelf/slot, settings], cables, tower, synthOutputEnabled), settings
(rackPosition, audio volumes, reducedMotion), tutorials seen, secret
reveal, claim records. Migration framework: `migrations[]` keyed by
version; unknown module types dropped safely with cables repaired;
malformed JSON → backup to `modsynth-td-save-corrupt-<ts>` + defaults +
recovery notice. Export/import/reset in settings UI.

### Audio
`src/v2/audio.ts` — one AudioContext, master gain → compressor/limiter →
destination. Buses: percussion, synth (per-world enable + volume).
Voices built per SignalEvent (osc type from waveform, freq from band +
pitchOffset, envelope from gate/env settings, bounded filter/delay).
Polyphony cap 12 with oldest-voice steal; all nodes stopped/disconnected
onended. Scheduler keyed by event id — no duplicates after resume.

## 3. Implementation stages

1. **Slice 1 (this slice)**: plan; test harness (`npm test` via tsc →
   node); pure core: ticks, signal events, ports, modules, graph, score.
2. **Slice 2**: save/migrations, economy, progression (pure + tested).
3. **Slice 3**: 9 worlds + authored scores + validation tests.
4. **Slice 4**: unified scene, camera, shelves, module drag, shop UI.
5. **Slice 5**: combat/audio/pulses from SignalEvents; prep/live states.
6. **Slice 6**: notation preview, world map, tutorials, secret unlock,
   boss, campaign-complete.
7. **Slice 7**: regression, balance, docs, final report.

## 4. Testing strategy

- `npm test`: compiles `src/v2/**` + `tests/**` with a separate
  tsconfig (CommonJS, no DOM-dependent files imported by tests) and runs
  `node dist-tests/tests/run-tests.js`. Pure systems (ticks, score, graph,
  economy, save, worlds) are covered by deterministic assertions.
- `npm run build` after every slice.
- Browser exercise via dev server where the environment allows.

## 5. Risks / unresolved

- Bundle size of 9 worlds of score data — fine (text).
- DOM rack inside CSS-scaled container: pointer math must divide by zoom;
  verified in Slice 4.
- Performance of many wires: physics throttled, hit paths cached.
- Electron runtime not exercised in this environment (browser only).

## 6. Status ledger

| Acceptance area | Status |
|---|---|
| Core systems (ticks, events, ports, modules, graph, score, enemies) | done, unit-tested |
| Save schema + migrations + import/export/reset | done, unit-tested |
| Economy (milestones, purchases, refunds, shelves) | done, unit-tested |
| Progression + Signal Cipher route check | done, unit-tested |
| Nine worlds + authored scores + validation | done, unit-tested (81 tests) |
| Unified scene + camera (pan/zoom/pinch/fit) | done, browser-verified |
| Multi-shelf editable rack + soft cables | done, browser-verified |
| Module shop / sell / refund | done, code-complete |
| Combat from canonical SignalEvents | done, browser-verified |
| Web Audio synthesis from SignalEvents | done, code-complete (heard path not audio-captured here) |
| Glowing notation + playhead sync | done, browser-verified |
| World map + summaries + hidden secret world | done, browser-verified |
| Tutorials, settings, test pulse | done, code-complete |
| Secret cipher reveal + boss world | done, code-complete (route check unit-tested) |
| Production build | passing |

## 7. Extending ModSynth TD (content guide)

All content is data-driven. To add:

- **A world**: append a `WorldDef` to `WORLDS` in `src/v2/data/worlds.ts`
  (unique `worldId`, exact BPM, theme, `lanes` via `track(...)`, `towerStart`,
  `waves`, `rewardTable` of length === waves, `completionReward`). Add the id
  to `CAMPAIGN_ORDER` for a visible world. `worlds.test.ts` will validate it.
- **A track**: build a `Tile[]` with `track(p0, p1, …)` (orthogonal waypoints);
  add to a world's `lanes`. Multi-lane = multiple entries; score notes use `lane`.
- **A score wave**: call `wave('id', ['<dsl lane>', …], 'Title')` using the
  rhythm DSL in `src/v2/data/score-dsl.ts` (`q e s h w d t`, rests `rq…`,
  chords `[ … ]`, ties `T`, band suffix `:l/:m/:h`, barline `|`).
- **An enemy**: add an `EnemyDef` to `ENEMY_DEFS` in `core/enemy-defs.ts`
  (+ a sprite mapping in `ui/combat.ts SPRITES`).
- **A module**: define a `ModuleTypeDef` in `core/modules.ts` (ports, settings,
  pure `process`), add to `MODULE_TYPES`; set `unlockAfterWorld` for a blueprint.
- **A port type**: add a `PortDomain` in `core/ports.ts` and extend
  `arePortsCompatible`; give the domain a color in `PORT_DOMAIN_COLORS`.
- **A connector/router**: it's just a module with multiple out ports whose
  `process` distributes events; see SPLITTER / ROUTER / MIXER.
- **A blueprint unlock**: set `unlockAfterWorld` on the module; completion
  auto-grants via `applyWorldCompletionUnlocks`.
- **A challenge**: add a flag to `SaveData`, gate it in `progression.ts`.
- **A save migration**: bump `CURRENT_SCHEMA_VERSION` in `state/save.ts` and
  add `MIGRATIONS[oldVersion]`. `normalizeSave` already repairs unknown data.
