# Implementation Decisions

This document records important implementation choices, tradeoffs, and design decisions that are not obvious from the code alone. Update it when making significant system changes.

---

## D-000: Square Field and Separate Meta Menu

**Decision**: The local board is a 20 x 20 tile square. The HUD is overlaid inside the square playing field, and the meta currency is shown as a button that opens a separate meta upgrades menu.

**Reason**: The square field matches the compact base identity and keeps resource, wave, radar, and timer information spatially tied to the play area. Moving upgrades behind the meta button prevents permanent upgrade controls from competing with the local build loop.

**Tradeoff**: The meta menu temporarily hides the playing field. This is intentional because permanent upgrade decisions are meta-scale actions rather than direct local placement actions.

---

## D-001: Single-Module Prototype Architecture

**Decision**: All game logic, rendering, and UI is in one `game.ts` file.

**Reason**: The project is in early prototype phase. A single-file design keeps iteration fast and avoids premature abstraction. Module separation should happen once the systems stabilize.

**Revisit when**: The file exceeds ~1500 lines or when two independent features need to share a non-trivial system.

---

## D-002: BFS Distance Field for Enemy Pathfinding

**Decision**: Enemies navigate using a BFS distance field computed from the core outward, recomputed whenever a structure is placed or destroyed.

**Reason**: Simple, correct, and handles dynamic obstacles (walls) naturally. The field is small (20 x 20 tiles) so full recomputation is cheap.

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

After the breach event, a smaller worm also spawns from the second entrance every other wave starting at `SECOND_ENTRANCE_ACTIVATION_WAVE`, trailing off the top edge of the board.

**Reason**: The worm fulfils the design doc requirement for a "simple procedural worm enemy" (§21.11). Chain-constraint body movement is a minimal and robust way to produce snake-like motion without inverse kinematics. Splitting rewards focused fire on single segments and creates emergent sub-threat management. Reusing the existing BFS distance field keeps pathfinding consistent across enemy types. The second-entrance worm adds meaningful post-breach pressure without requiring new enemy types.

**Tradeoff**: Each worm segment is an individual targeting candidate for turrets, which increases the inner loop cost of `updateTurrets()`. At current worm sizes (6–14 segments) this is negligible, but very large swarms of worms could stress it.

**File size note**: `game.ts` now exceeds the ~1500-line threshold noted in D-001 (~1700 lines after this feature). Module separation was deferred to keep the current implementation sprint focused. This should be addressed in a follow-up refactor.

**Alternative considered**: Storing worm segment positions as world-space floats instead of tile-space floats. Rejected because tile-space coordinates are consistent with all other game objects and the grid-aligned visuals.

---

## D-014: Turret Charge Bar

**Decision**: A 1-pixel-high charge bar is drawn at the top edge of each turret tile. The bar fills from empty to full over one fire cycle (`TURRET_FIRE_COOLDOWN_SEC = 0.35 s`). When fully charged, the bar renders in the turret's accent color (`#27e0ff`); while charging, it renders dim (`#0e6680`). During the initial startup delay (before the first shot), the bar shows as fully charged.

**Reason**: Fulfils the design doc item "One tower shows stored ammo or internal resource state" (§21.11). Gives the player immediate visual feedback about turret readiness without adding UI text or a separate indicator element. The single pixel row is unobtrusive at the 12 px tile scale.

**Tradeoff**: All turrets share one global fire cycle (`turretFireCooldownSec`), so all charge bars fill and empty in sync. This is a simplification; individual per-turret cooldowns were not implemented to avoid refactoring the turret firing loop.

---

## D-015: HP Display Scaled to Max Core HP

**Decision**: The HUD now shows `HP current/max` (e.g. `HP 80/160`) and the color thresholds in both the HUD and core tile are computed as fractions of `maxCoreHp = BASE_CORE_HP + upgradeLevel.coreArmor * CORE_ARMOR_HP_PER_LEVEL` rather than a hardcoded 100.

**Reason**: Previously the HP ratio used `/100`, which caused the green→yellow and yellow→red color thresholds to fire at wrong HP values when Core Armor was purchased. With max HP 160, `coreHp = 80` (50%) would incorrectly show as healthy green (`80 > 60`), when it should show as damaged yellow (50% < 60%). Showing `current/max` also helps the player understand the benefit of Core Armor upgrades immediately.

---

## D-016: Smooth Worm Body Rendering

**Decision**: The worm spine line (lineWidth 2, straight segments) was replaced with a smooth quadratic bezier curve body skin (lineWidth 4, `lineCap: 'round'`, `lineJoin: 'round'`). Two tiny eye pixels are drawn on the head, oriented toward the head's movement direction (away from the second segment).

**Reason**: The design doc (§21.2) calls for "smooth body skins rendered over hit segments". The midpoint quadratic bezier produces a smooth organic body without heavy math: for each middle control point, the bezier endpoint is the midpoint between that segment and the next, creating C1 continuity. The thick rounded path naturally creates a tapered worm silhouette.

**Tradeoff**: The bezier path uses canvas save/restore for `lineWidth`/`lineCap`/`lineJoin` settings, adding minimal per-frame cost. Per-segment circles are still rendered on top so HP damage states remain visible.

---

## D-017: Deposit 2 Tile Protection in Structure Placement

**Decision**: `attemptPlaceStructure` now guards against placing structures on `deposit2Tile`, matching the existing guard for `depositTile` and `coreTile`.

**Reason**: The second deposit tile was not protected in the placement path (only in the repair path). Once `revealRadiusTile >= 6`, the player could overwrite the deposit 2 tile with a wall or other structure. This was unintended — the tile should behave like `depositTile` and be unplaceable.

---

## D-018: Status Bar Cost Hints for All Build Tools

**Decision**: The status bar below the toolbar now shows contextual hints for all tool types, not just the repair tool:
- **Turret / Radar**: shows `Cost: N⊕` or `Rebuild: N⊕` when hovering a valid empty tile; green if affordable, red if not.
- **Erase**: shows `Erase: <type>` in the erase color when hovering a placed structure.
- **Repair**: existing rebuild/repair cost hint behavior unchanged.
- **Wall**: no hint shown (walls are free; cost is already shown in the toolbar key as `[W]`).

**Reason**: The player needs quick feedback about whether they can afford a placement before clicking. Showing the cost in context (green = can afford, red = cannot) prevents the "NEED ORE" overlay from being the only indicator. The erase hint gives a quick sanity-check of what will be removed.

---

## D-019: Core Damage Pulse Animation

**Decision**: When `coreHp` drops to or below the `coreHpDamagedThreshold` (30% of max), the core tile flashes a red translucent overlay pulsing at 4 Hz using `Math.sin(elapsedSec * Math.PI * 4)`. The pulse is suppressed once `isRunOver` is true to avoid flickering on the game-over screen.

**Reason**: The existing HP bar and color change give text/color feedback for low HP. A pulsing animation provides a more urgent visual alarm that draws attention even in peripheral vision during active combat. The 4 Hz rate is fast enough to feel urgent without being visually disruptive.

---

## D-020: Minimal Electron Desktop Runtime

**Decision**: Electron support is a thin desktop shell around the existing Webpack output. Production desktop mode loads `dist/index.html`; developer desktop mode loads the Webpack dev server at `http://127.0.0.1:8080` by default and opens DevTools. The Electron window keeps `contextIsolation: true` and `nodeIntegration: false`.

**Reason**: The game remains browser-first while gaining a local desktop path. Keeping Electron separate from the TypeScript game code avoids changing gameplay state flow, rendering, input, or persistence.

**Tradeoff**: `run-desktop-dev.bat` starts the Webpack dev server in a separate command window and waits briefly before launching Electron. If the dev server takes longer than expected or uses a different port, set `TINY_BASE_IDLE_DEV_SERVER_URL` before running `npm run desktop:dev`.

---

## D-021: Conveyor/Extractor Logistics System

**Decision**: Deposits no longer automatically send motes to the core. Mote flow is now gated entirely behind player-built infrastructure. Two new structures were added:

- **Extractor** (hotkey X, free): must be placed adjacent to a deposit. Its output direction determines which tile the mote chain begins from.
- **Conveyor** (hotkey V, free): each tile stores an output direction (0=E, 1=S, 2=W, 3=N). Chains of conveyors form routes.

Routing is evaluated each tick via `findConveyorRoute()`: a greedy path-follow starting at the extractor's output direction, traversing conveyor tiles in sequence until reaching a valid destination (core, turret, crusher, or gatling) or detecting an invalid or cyclic path (returns null). Route validity is cached in `extractorHasRoute` for visual feedback.

`RoutedMote` objects carry `resourceType`, a full tile path, a segment index, and interpolated progress. They are spawned by `updateExtractors()` and moved by `updateRoutedMotes()`. `deliverMote()` dispatches the resource to the destination.

Q key and right-click on an existing conveyor/extractor rotate its direction.

**Reason**: The design doc calls for player-built logistics as a core identity mechanic. Auto-spawning motes removed all logistics strategy. Conveyors are the minimal viable implementation that produces visible flow and lets the player build intentional routes.

**Tradeoff**: All in-flight `RoutedMote` objects carry a full path copy. For routes up to 64 tiles this is fine. If routes grow much longer, a shared route-handle approach would be needed. The old `motes`, `motes2`, `coalMotes` arrays are kept for legacy drain (in-flight on game start) and will naturally empty.

---

## D-022: Resource-Fed Turret (Ammo System)

**Decision**: The basic turret no longer free-fires on a shared global cooldown. It now consumes one unit of `turretAmmo` per shot. Ammo is supplied by routing ore motes from a deposit through conveyors to the turret tile. Each turret starts with `TURRET_AMMO_STARTING = 4` ammo to ensure the first wave is survivable before logistics are built. The per-turret ammo bar replaces the old shared charge bar: it shows a cyan fill proportional to `TURRET_AMMO_MAX (10)`, and a small red pixel when ammo = 0 (starvation indicator).

The global `turretFireCooldownSec` is retained to throttle the fire cadence; the per-tile ammo check is layered on top.

**Reason**: The design doc requires turrets to depend on supplied resources. The old free-firing model made logistics irrelevant to combat. Starting ammo prevents a hard first-wave difficulty spike, consistent with the "first route should be approachable" design intent.

**Tradeoff**: Ore can flow to either the core (currency income) or turrets (ammo). This creates the intended logistics tension between economic and military routing.

---

## D-023: BASE_STARTING_ORE Bootstrapping Ore

**Decision**: `resetRun` now sets `ore = BASE_STARTING_ORE + oreBonus`, where `BASE_STARTING_ORE = 20`, instead of starting at 0 (plus meta bonus). Conveyors and extractors cost 0 ore.

**Reason**: With deposits no longer auto-delivering ore, the player needs starting capital to place at least one extractor and a short conveyor chain before any income arrives. 20 ore is enough to build one turret (12 ore) with change to spare for conveyors, or to build a short route first and accumulate ammo before the first wave.

---

## D-024: Bounded Day/Night Lighting Pass

**Decision**: The day/night cycle remains exactly 3600 seconds by default. The renderer computes one `SunState` per frame, draws bounded stepped shadows from visible debris/structures/core opposite the sun direction, applies daylight/sunset/night overlays to the board, then draws local building lights clipped to radar-visible tiles.

**Reason**: This gives the prototype visible time-of-day motion without per-pixel raytracing or large allocations. Shadows change direction and length across the cycle, while lights make the core and powered buildings readable at night without revealing unexplored tiles.

**Debug controls**: `[` and `]` jump the lighting clock by 5 minutes. `\` toggles a fast preview speed. These controls only affect the environment clock and watermark/debug display; normal gameplay starts with a one-hour cycle.

**Weather scope**: Weather remains clear by default. Rain and snow are documented as no-op scaffolding for future background tint and foreground particle passes.

