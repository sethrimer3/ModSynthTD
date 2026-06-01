# AI Agent Guidelines for TinyBaseIdle Repository

This repository is being adapted from a space-ship prototype into the game described in `design.md`, working title **Neon Mote Defense**. The current codebase, README, architecture notes, and test checklist may still contain legacy ship-game assumptions. When legacy behavior conflicts with the new design direction, treat `design.md` as the product blueprint and update supporting docs as the implementation changes.

The goals for AI agents are **clarity**, **performance**, **stable gameplay behavior**, and **faithfulness to the design pillars**.

---

## 1. Product Direction

Before making gameplay or UX changes, read `design.md` and `todo.md`.

The target game is a micro-scale idle tower defense and factory strategy game:

- Compact grid-built bases.
- Pixel/mote-scale particles inside or around grid structures.
- Neon retro visuals with low-resolution clarity.
- Radar-based visibility and expansion.
- Enemies that eventually attack from multiple directions.
- First-world debris protection that later breaks for a meaningful surprise.
- Persistent meta progression across base destruction.
- Simple initial interactions that reward complex optimization.

Do not drift the game toward a generic shooter, generic tower defense, or generic idle game unless the user explicitly asks. Preserve the core identity: **the player builds clean grid systems that tame chaotic glowing particles**.

---

## 2. Prototype Priorities

Prioritize the near-term work tracked in `todo.md`, while using `design.md` to understand the intended direction.

Core early priorities:

1. One base slot.
2. Top-down grid board.
3. Core in the center.
4. Debris/rock barrier with one initial enemy entrance.
5. Grid placement for walls, turrets, radar, and resource structures.
6. Visible mote/resource movement.
7. Enemy waves that later breach a second direction.
8. Base destruction, restart, and simple persistent currency.

Avoid implementing late-game systems before the local base loop feels good. The side-view crust system, full nine-slot meta-grid, and advanced planet specialization should remain secondary until the MVP is playable.

---

## 3. Task Tracking and Deferred Work

`todo.md` is the implementation task tracker. `design.md` is the broader blueprint and should not be treated as the primary checklist.

AI agents must keep `todo.md` current:

- When a `todo.md` item is fully implemented and validated, mark it `[x]` in the same change set.
- If an item is only partially implemented, leave it unchecked and add a concise follow-up item for what remains.
- If work is deferred, skipped, descoped, blocked, or discovered but not implemented, add an unchecked item to `todo.md` under the most relevant section.
- If a task reveals additional implementation work, add it to `todo.md` before finishing.
- Do not hide deferred work only in chat responses, commit messages, PR descriptions, or code comments.
- Keep `todo.md` concrete and implementation-oriented. Keep broad vision and design rationale in `design.md`.

---

## 4. Simple to Learn, Hard to Master

Every feature should preserve beginner readability. Complexity should come from interacting systems, not opaque UI.

Good complexity sources:

- Limited tile space.
- Resource routing and non-free crossings.
- Building ports and rotation.
- Enemy pressure from expanding directions.
- Radar tradeoffs: more resources, more danger.
- Particle interactions such as water, ore motes, coolant, heat, dust, gas, or lava.
- Planet/base-specific module loadouts.

Bad complexity sources:

- Hidden formulas with no feedback.
- Dense menus before the player understands the core loop.
- Too many resource types in the first minutes.
- Simulation behavior the player cannot observe or reason about.

---

## 5. Visual and Scale Guidelines

The intended look is neon, readable, and retro.

Preferred direction:

- Low native resolution scaled up with nearest-neighbor.
- Crisp square particles/motes.
- Dark planetary backgrounds with bright neon resources.
- Pixelated glow/bloom used carefully for contrast, not blur.
- Optional build grid that is visible during placement.
- Clear silhouettes for enemies, walls, turrets, radar, core, and resource nodes.

Design scale target:

- Build structures belong on a tile grid.
- Motes/particles live at a finer pixel/sub-tile scale.
- A useful target from `design.md` is 1 mote at 1 native pixel and 1 build tile around 12 by 12 native pixels, though existing code may use other values during transition.

Do not let visual polish reduce gameplay readability.

---

## 6. Determinism and Consistency

Gameplay should feel stable and explainable even if it is not a deterministic multiplayer simulation.

- Always scale time-based behavior by `dt`, `deltaTime`, or a clearly named seconds value.
- Avoid frame-dependent gameplay.
- Avoid hidden randomness without a clear seed or documented reason.
- Procedural board generation, planet generation, enemy spawns, and resource placement should be seedable or at least reproducible enough for debugging.
- If adding or changing procedural generation rules, document the seed/inputs or rationale in `DECISIONS.md`.

---

## 7. Tech Stack Scope

- Core code is **TypeScript**.
- Keep strict typing. Avoid implicit `any`.
- JavaScript should only be used for tooling or external integration.
- The current build is Webpack-based.
- Use the existing scripts:
  - `npm run build` for production build validation.
  - `npm run dev` for watch-mode local development.

---

## 8. Performance Expectations

This game is expected to render many enemies, particles, motes, projectiles, and grid structures. Aim for smooth 60 FPS where practical.

Hot-path rules:

- Avoid avoidable object allocation in per-frame loops.
- Use `for` loops instead of `map`, `filter`, or `reduce` in hot paths.
- Prefer in-place array compaction for frequently updated entity lists.
- Reuse arrays, vectors, objects, canvases, and render buffers where practical.
- Cache expensive lookups when the underlying state has not changed.
- Keep particle counts bounded by tile, chunk, viewport, or simulation region.
- Abstract or summarize far-away/offline particle behavior rather than replaying every mote.

Quality settings should degrade expensive visuals before compromising basic readability.

---

## 9. Simulation Boundaries

The design wants Powder Game-like life, not an uncontrolled full powder simulator unless the user explicitly redirects the project.

Preferred model:

- Buildings and structures are placed on a readable tile grid.
- Motes move within tile channels, conveyors, pipes, deposits, pools, or active terrain.
- Resource flows should be visible and satisfying.
- Simulation should remain bounded, debuggable, and performant.

When adding particle mechanics:

- Define what the particle represents.
- Define where it can exist.
- Define how it is produced, moved, consumed, stored, and destroyed.
- Define how the player can understand or influence it.
- Add caps, pooling, or chunking before the mechanic can scale out of control.

---

## 10. Input and Game Loop Responsibilities

- Input handling should capture user intent and emit actions. Avoid mutating game simulation state directly inside low-level input handlers.
- The main game loop should orchestrate update order.
- Keep simulation, rendering, UI, and input separable where feasible.
- A placed structure should not hide surprise side effects in a renderer or UI class.
- Save/offline simulation logic should not depend on rendering state.

When in doubt, data flows should be:

`input intent -> game command -> simulation update -> render/UI feedback`

---

## 11. Naming Guidelines

### General

- State: nouns (`position`, `velocity`, `health`, `tile`, `mote`).
- Actions: verbs (`move`, `fire`, `spawn`, `route`, `reveal`).
- Commands: imperative verbs (`placeWall`, `spawnBreaker`, `revealRadarRadius`).

### Booleans

Booleans must start with `is`, `has`, `can`, `should`, or `needs`.

Examples:

- `isVisible`
- `hasPower`
- `canRoute`
- `shouldReveal`
- `needsRepair`

### Counts, Indices, and IDs

- Counts end with `Count`.
- Indices end with `Index`.
- IDs end with `Id`.

### Units of Measure

Include units in names where ambiguity is possible:

- `Ms`, `Sec`
- `Px`, `World`, `Tile`
- `Rad`, `Deg`
- `NativePx`, `ScreenPx`
- `MoteCount`, `TileCount`

Examples:

- `radarRadiusTile`
- `elapsedSec`
- `buildTileSizeNativePx`
- `enemySpawnAngleRad`

---

## 12. Gameplay Invariants

Preserve these unless the user explicitly changes the design:

- The core is the heart of the base. Losing the core ends the local run.
- Early play must be understandable quickly.
- Grid placement should remain clean and readable.
- Particles should support the gameplay, not obscure it.
- Radar should create both opportunity and risk.
- Debris/rocks can teach safety early and later become breakable.
- Enemies should eventually challenge multiple sides of the base.
- Persistent/meta resources can survive destruction, but local/base resources should not all be risk-free.
- Upgrades should change decisions, not only inflate numbers.

---

## 13. Documentation Requirements

Maintain:

1. `design.md` - main product blueprint and design source of truth.
2. `todo.md` - condensed implementation checklist and deferred-work tracker.
3. `DECISIONS.md` - important implementation and design decisions.
4. `ARCHITECTURE.md` - current system overview and data flow.
5. `manual_test_checklist.md` - manual playtest checklist.

When changing gameplay direction, update `design.md` or add a note if the implementation intentionally diverges from it.

When completing, deferring, or discovering implementation work, update `todo.md`.

When changing systems, update `ARCHITECTURE.md`.

When creating a new important rule, tradeoff, scope choice, performance strategy, or procedural generation rule, update `DECISIONS.md`.

When adding player-visible features, update `manual_test_checklist.md`.

Legacy docs may still describe the old ship game. Update them incrementally as systems are replaced.

---

## 14. Build Number and Validation

The current code displays a build number at the bottom-left of the game screen.

- Preserve the visible build number unless the project is intentionally restructured.
- Increment the build number by 1 with every PR request/change that alters code or behavior.
- Documentation-only changes do not need a build-number increment unless the user requests it.
- Run `npm run build` when code changes are made.
- For docs-only changes, build validation is optional.

---

## 15. Workflow for AI Agents

### Before changes

1. Read `design.md`.
2. Read `todo.md`.
3. Read the relevant source modules.
4. Check `ARCHITECTURE.md`, `DECISIONS.md`, and `manual_test_checklist.md` for affected systems.
5. Identify whether the task belongs to design docs, task tracking, architecture docs, code, tests, or all of them.
6. Note any legacy ship-game assumptions that may conflict with the new direction.

### While changing

1. Keep changes localized and readable.
2. Follow naming guidelines.
3. Avoid per-frame allocations in hot paths.
4. Keep rendering and simulation separated where feasible.
5. Prefer small, testable systems over large hidden global state.
6. Preserve player readability and feedback.

### After changes

1. Update docs if design, architecture, task tracking, or testing expectations changed.
2. Mark completed `todo.md` items `[x]` when they are fully implemented and validated.
3. Add unfinished, deferred, descoped, blocked, or newly discovered work to `todo.md`.
4. Validate the build when code changed.
5. Verify the build number rule.
6. Add or update manual test items for player-visible behavior.
7. State any uncertainty or incomplete validation in the final response.

---

## 16. AI Response Expectations

When reporting work back to the user:

- Be specific about what changed.
- Mention files changed.
- Mention whether the build was run.
- Mention commit SHA if a commit was created.
- Do not claim validation that was not performed.
- If repo state is legacy or ambiguous, say so instead of guessing.

---

## Summary

Prioritize:

1. Faithfulness to `design.md`.
2. Current implementation priorities in `todo.md`.
3. Simple-to-learn player experience.
4. Clear grid-based structures.
5. Satisfying mote/powder visuals.
6. Stable and explainable gameplay.
7. Strong performance.
8. Documentation that reflects the current direction.
