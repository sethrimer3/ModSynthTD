# Implementation Decisions

This document records important implementation choices, tradeoffs, and design decisions that are not obvious from the code alone. Update it when making significant system changes.

---

## D-001: Single-Module Prototype Architecture

**Decision**: All game logic, rendering, and UI is in one `game.ts` file.

**Reason**: The project is in early prototype phase. A single-file design keeps iteration fast and avoids premature abstraction. Module separation should happen once the systems stabilize.

**Revisit when**: The file exceeds ~1500 lines or when two independent features need to share a non-trivial system.

---

## D-002: BFS Distance Field for Enemy Pathfinding

**Decision**: Enemies navigate using a BFS distance field computed from the core outward, recomputed whenever a structure is placed or destroyed.

**Reason**: Simple, correct, and handles dynamic obstacles (walls) naturally. The field is small (20 × 12 tiles) so full recomputation is cheap.

**Tradeoff**: Recomputation happens synchronously on every structural change. If the grid grows significantly, this may need incremental updates or caching.

---

## D-003: Mote Progress Interpolation

**Decision**: Motes are represented as a single `progress` value (0 to 1). Position is computed in the renderer by linear interpolation between the source deposit and the core.

**Reason**: Keeps the simulation simple and allocation-free. The visual result is satisfying for the current prototype.

**Future**: When conveyor routing is added, motes will need path node chains, not just a start/end pair. The interface should be extended then, not now.

---

## D-004: Immediate-Effect Meta Upgrades

**Decision**: Buying a meta upgrade applies its effect immediately to the current run (e.g., Core Armor raises current `coreHp` immediately; Ore Start adds ore immediately).

**Reason**: Immediate feedback is more satisfying. DESIGN.md does not specify deferred vs. immediate effects. Immediate is simpler to implement and more rewarding.

**Tradeoff**: Ore Start bonus applies mid-run (not just on restart). This is intentional — the player earns meta from surviving long, so spending it mid-run is a valid catch-up mechanic.

---

## D-005: Blueprint Ghosts for Destroyed Structures

**Decision**: When a structure is destroyed by an enemy, it leaves a blueprint ghost. The ghost shows the original structure type and allows the player to rebuild at a reduced cost.

**Reason**: Destruction should create strategic tension and redesign opportunity, not tedious manual reconstruction. Blueprint ghosts preserve layout intent while making rebuilding accessible.

**Scope**: Blueprint ghosts are NOT created when the player manually erases a structure. Manual deletion is intentional and should not generate ghosts.

---

## D-006: Second Ore Deposit Behind Radar Threshold

**Decision**: The second ore deposit (`deposit2Tile`) is only visible and active when `revealRadiusTile >= 6` (one radar building placed).

**Reason**: This directly rewards radar investment with a resource income boost, making radar a meaningful decision. The threshold of 6 tiles is chosen so the deposit becomes visible shortly after the first radar is placed (`revealRadiusTile` starts at 5 and each radar adds 1).

**Deposit color**: Deposit 2 motes render as `#ffaa33` (orange-amber) vs. deposit 1 motes at `#ffd677` (gold) so the player can visually distinguish them.

---

## D-007: Entrance Validity Check on Structure Placement

**Decision**: When placing a structure, the code computes a trial distance field and rejects the placement if the entrance tile becomes unreachable from the core (distance = -1).

**Reason**: Prevents the player from completely blocking enemy pathing, which would create an undefined game state. Walling off the entrance entirely is not a valid strategy in the current design.

**Note**: This check uses the primary entrance only. The second entrance (opened by the Breaker breach) is not guarded by this check.

---

## D-008: Fixed Timestep Cap

**Decision**: `dtSec` is capped at 0.05 seconds (20 FPS equivalent) in the game loop.

**Reason**: Prevents large physics jumps after tab visibility changes, device sleep, or slow frames. The game would be unplayable without this cap on low-end devices or when the tab is backgrounded.

---

## D-009: Radar Validation on Structure Destroy

**Decision**: When a radar structure is destroyed, `radarLevel` and `revealRadiusTile` are decremented (clamped to their minimums). The second deposit deactivates if `revealRadiusTile` drops below `DEPOSIT2_MIN_REVEAL_RADIUS_TILE`.

**Reason**: Radar loss should be consequential — the player loses vision, which may reveal that parts of the base are now unguarded. Active motes from deposit 2 are cleared automatically on the next `updateMotes` tick.

---

## D-010: Meta Upgrade Panel Updates Every Frame

**Decision**: `updateUpgradePanelState()` is called at the end of each `render()` call, updating the 3 upgrade button DOM elements every frame (~60 Hz).

**Reason**: Simplest correct approach. The upgrade panel needs to reflect current `metaCurrency` and `upgradeLevel` at all times. The 3 buttons update only `textContent`, `disabled`, and a few CSS classes — cheap DOM operations that do not cause layout thrash.

**Alternative considered**: Update only when meta currency or upgrade level changes. Rejected because it requires change tracking and is premature optimization for 3 buttons.

---

## D-011: Repair Brush Tool

**Decision**: A fifth tool (`repair`, key `F`/`5`) was added. It calls `attemptRepair()` which handles two cases:
1. A blueprint ghost exists (structure was enemy-destroyed): rebuild at `STRUCTURE_REBUILD_COST`.
2. A live structure has missing HP: restore to max HP at a prorated fraction of rebuild cost.

Walls are always free to rebuild/repair (`STRUCTURE_REBUILD_COST.wall = 0`). Repair validates the entrance path (no blocking) when rebuilding ghosts.

**Reason**: The repair brush is the primary recovery mechanic. Separating it from the build tool avoids ambiguity when clicking on a ghost or damaged structure. The prorated cost formula (`ceil(missingHp * rebuildCost / maxHp)`) makes partial repairs cheaper than full rebuilds and is easy to reason about.

**Alternative considered**: Let normal build tools auto-detect ghosts and offer rebuild. Rejected because it would hide the repair flow and require more edge-case handling in the main placement path.

---

## D-012: Nine-Slot Placeholder Screen

**Decision**: A 3×3 DOM grid was added below the upgrade panel. Slot 1 is styled as `ACTIVE`; slots 2–9 are `LOCKED`. No logic is attached.

**Reason**: Milestone 8 requires a visible placeholder for the multi-base meta system. The DOM grid is cheap and lets the layout be reviewed and iterated without coupling to any game logic.

**Alternative considered**: Canvas-rendered slot grid. Rejected because it would mix UI chrome with gameplay rendering and add unnecessary complexity.

---

## D-013: Worm Enemy System

**Decision**: A segmented worm enemy was added. The worm is a `Worm` object containing a `segments: WormSegment[]` array. Segment 0 is the head. The head uses BFS pathfinding (same distance field as regular enemies). Each subsequent segment uses a chain-constraint: if distance to the preceding segment exceeds `WORM_SEGMENT_SPACING_TILE` (0.6 tiles), the segment is pulled toward the preceding one. Worms split at any dead segment; fragments with fewer than `WORM_MIN_SURVIVE_SEGMENTS` (3) segments are discarded.

**Reason**: The worm fulfils the design doc requirement for a "simple procedural worm enemy" (§21.11). Chain-constraint body movement is a minimal and robust way to produce snake-like motion without inverse kinematics. Splitting rewards focused fire on single segments and creates emergent sub-threat management. Reusing the existing BFS distance field keeps pathfinding consistent across enemy types.

**Tradeoff**: Each worm segment is an individual targeting candidate for turrets, which increases the inner loop cost of `updateTurrets()`. At current worm sizes (6–14 segments) this is negligible, but very large swarms of worms could stress it.

**File size note**: `game.ts` now exceeds the ~1500-line threshold noted in D-001 (~1680 lines after this feature). Module separation was deferred to keep the current implementation sprint focused. This should be addressed in a follow-up refactor.

**Alternative considered**: Storing worm segment positions as world-space floats instead of tile-space floats. Rejected because tile-space coordinates are consistent with all other game objects and the grid-aligned visuals.
