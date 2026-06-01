# Game Design Blueprint

> **How to track implementation progress:** Items in this document marked `[x]` are implemented in the current build. Items marked `[ ]` are planned but not yet implemented. When completing a feature, change `[ ]` to `[x]` in the relevant checklist section.

Working title: Neon Mote Defense

This document is the main design blueprint for the project. It is intentionally written as a living plan rather than a fixed specification. The goal is to preserve the core picture of the game while leaving room for iteration, prototyping, and discovery.

## 1. High Concept

Neon Mote Defense is a micro-scale idle tower defense and factory strategy game. The player builds compact bases on small planetary plots, routes resources through neon lines, conveyors, pipes, and modules, and defends a fragile core from enemies that eventually attack from every direction.

At first, the game should feel extremely simple:

1. Defend the core.
2. Connect a resource to a useful building.
3. Place walls and turrets.
4. Survive longer to earn more.

Over time, the game reveals deeper systems:

1. Multiple base slots or planets can run in parallel.
2. Each planet has unique resources, hazards, enemies, and module constraints.
3. Bases have finite harvest windows.
4. Destroyed bases stop earning local resources, but persistent meta resources remain.
5. Radar expands the visible and buildable world.
6. Particle systems create physically interesting resource behavior.
7. Enemies eventually break the player's assumptions about safe directions.

The ideal emotional arc is:

> "This is simple. I connect resources, place defenses, and survive."
>
> "Wait, the debris can break? Enemies can come from that side too?"
>
> "Now I need to redesign this whole base around routing, defense layers, particle flow, and long-term planetary extraction."

## 2. Core Design Pillars

### 2.1 Simple to Learn, Hard to Master

The game should teach through visible cause and effect. A new player should understand the first interaction in seconds: drag a connection from a resource to the core or to a turret, then watch particles or motes move along the route.

Depth should come from overlapping constraints, not from dense menus. The main sources of mastery are:

- Limited board space.
- Resource lines that cannot freely overlap or cross.
- Buildings with input and output ports.
- Enemy pressure from changing directions.
- Finite resource extraction windows.
- Planet-specific resources and module loadouts.
- Particle interactions such as water flow, coolant, mineral motes, heat, gas, dust, pressure, and crystallization.

### 2.2 The Player Builds Order Inside a Chaotic Living World

The world should feel alive at the mote scale. Water flows. Minerals travel as tiny points. Energy sparks pulse through conduits. Dust, gas, heat, and debris can move, clog, leak, or react.

The player does not directly control every particle. The player places clean grid structures that shape particle behavior.

The identity of the game is:

> The player builds clean, readable machines on a grid, but those machines manipulate messy, glowing, physical particles.

### 2.3 Compact Bases, High Density

The game should avoid sprawling Factorio-scale bases at the local level. Each base should be a small board with intense spatial decisions. The player should be able to read the whole local base quickly, especially in the early game.

Complexity comes from density, routing, particle behavior, and multi-base strategy rather than enormous maps.

### 2.4 Runs Matter, But Meta Progression Persists

A base is temporary. It earns resources only while alive and while its local resource window is active. When a base is destroyed, base-specific resources are lost or stop being generated. Persistent prestige or meta resources survive and can be used for broader upgrades.

This gives the game idle tension. The player is not merely waiting for infinite income. A base has a lifespan, and better engineering extends that lifespan.

### 2.5 Discovery Through Radar

The player starts with a small visible area. A buildable radar expands the visible and usable board. Radar should feel both rewarding and risky:

- It reveals new resources.
- It reveals new terrain.
- It creates room for more defense layers.
- It shows hidden enemy approach directions.
- It may reveal that the base was less safe than it appeared.

Radar expansion is one of the main progression mechanics inside a base.

## 3. Game Structure

The game has three major scales.

### 3.1 Meta Scale: Nine Base or Planet Slots

The larger game can be organized around a 3 by 3 grid of base slots.

```text
[ Planet 1 ] [ Planet 2 ] [ Planet 3 ]
[ Planet 4 ] [ Planet 5 ] [ Planet 6 ]
[ Planet 7 ] [ Planet 8 ] [ Planet 9 ]
```

The player starts with one slot. More slots are purchased or unlocked over time. Each slot can run a base independently.

Possible slot rules:

- Each base has its own local resources.
- Each base can be destroyed independently.
- A destroyed base stops producing local resources.
- Persistent meta resources survive destruction.
- Some upgrades apply globally.
- Some modules are unique and must be assigned to specific base slots.
- Each planet may have a different module loadout, resource ecosystem, or enemy pressure pattern.

The 3 by 3 grid should eventually create strategic decisions:

- Which planet should receive the best radar module?
- Which base should specialize in energy?
- Which base should be sacrificed for high-risk rare materials?
- Which base should be rebuilt after destruction?
- Which planets are safe idle income and which are active challenge planets?

### 3.2 Local Scale: The Base Defense Board

Each base is a top-down grid-based board. The core sits near the center at first. Resources, terrain, debris, enemy spawn zones, and buildable tiles occupy the board.

Early board concept:

```text
?????????????????
???????###???????
??????#####??????
?????##...##?????
????##..C..##????
????##.....##????
?????##...##?????
??????##.##??????
???????...???????
?????????????????
```

Legend:

```text
? = unexplored or outside radar range
# = rock, rubble, debris, or natural barrier
. = buildable ground
C = core
```

The first world should start with debris around the base and one obvious opening. This creates a friendly tutorial shape:

```text
Enemies >>>  opening  >>>  core
```

Later, stronger enemies can break debris. The player realizes the base must become a perimeter defense, not just a path defense.

### 3.3 Mote Scale: Pixel Particles Inside Grid Structures

The base is placed on a structure grid, but particle behavior happens at a finer scale.

Recommended scale:

- One powder mote = 1 native pixel.
- One build tile = 12 by 12 native pixels.
- Screen scale = 3x nearest-neighbor upscaling.
- One displayed build tile = 36 by 36 screen pixels.

A 12 by 12 tile is useful because it divides cleanly by 2, 3, 4, and 6. This helps with ports, pipes, conveyor lanes, turret barrels, center points, and particle channels.

Buildings should occupy tiles. Motes should move within the pixel space of those tiles.

Example:

```text
A conveyor is a 1 tile structure.
Inside it, mineral motes move as 1 pixel glowing particles.
The player sees the conveyor as a clear building and the resources as animated motes.
```

This gives the game a clean interface and a lively simulation.

## 4. Visual Style

### 4.1 Overall Look

The visual style should be neon, readable, and somewhat retro. It should draw inspiration from Equatoria Idle's glowing resource identity, while becoming its own game with more grid structure, defense, and particle simulation.

Recommended look:

- Dark planetary or space-crust backgrounds.
- Bright neon resources and motes.
- Pixelated particles.
- Crisp nearest-neighbor scaling.
- Chunky readable structures.
- Pixelated glow and bloom effects.
- Faint grid lines that can be toggled or shown while building.
- Clear color coding for resource types.

### 4.2 Resolution and Scaling

Recommended rendering approach:

- Render the game at a low native resolution.
- Scale up by 3x using nearest-neighbor.
- Keep particles sharp at the native pixel level.
- Use glow as a secondary layer, but avoid making everything blurry.

Possible native resolutions:

- 480 by 270 for a compact retro look.
- 640 by 360 for a little more visible space.

The game can still run in a larger browser window. The visual identity comes from the native canvas and pixel scale.

### 4.3 Resource Readability

Every resource should have a strong visual identity.

Possible examples:

- Ore motes: dense amber, rust, or gold particles.
- Water motes: blue particles that flow and pool.
- Energy sparks: yellow, white, or electric cyan pulses.
- Crystal shards: magenta, violet, ruby, emerald, sapphire, or diamond-like motes.
- Heat: orange shimmer or lava motes.
- Gas: translucent drifting particles.
- Dust: pale powder motes that can clog systems.

The player should be able to identify resources without reading labels after a short learning period.

## 5. Core Gameplay Loop

### 5.1 Local Base Loop

The local loop is:

1. Start a base on a small visible board.
2. Place or connect the first resource.
3. Route resources into the core, turret, or processor.
4. Build walls, towers, and support modules.
5. Survive enemy waves.
6. Earn local and meta resources.
7. Upgrade radar to reveal more terrain and resources.
8. Expand defense layers.
9. Adapt when enemies breach new directions.
10. Eventually the base is destroyed or retired.
11. Spend persistent rewards on meta upgrades.

### 5.2 Idle Loop

Bases can run while the player is away, but they are not infinite money machines.

Possible idle rules:

- Each base has a harvest window, such as 5 hours, before local resources are depleted or dramatically reduced.
- Enemies keep scaling while the base runs.
- Offline simulation can be approximate rather than exact.
- When a base dies, it stops producing.
- The player can collect meta resources after returning.
- More advanced upgrades improve offline prediction, safety, or automation.

The idle system should reward good design. A better base survives longer, extracts more, and converts more value before destruction.

### 5.3 Meta Loop

The meta loop is:

1. Spend persistent resources on global upgrades.
2. Unlock new base slots.
3. Unlock new module categories.
4. Unlock new planets or world types.
5. Assign unique modules to base slots.
6. Improve radar, automation, extraction, or defense globally.
7. Push deeper into dangerous planets for rarer resources.

Meta progression should not erase the importance of local design. It should give the player new tools and strategic options.

## 6. Base Layout Rules

### 6.1 Grid-Based Structure Placement

Structures should be placed on a grid. This keeps the game readable and makes walls, lanes, conveyors, pipes, and turrets easy to understand.

Recommended rules:

- Structures snap to the tile grid.
- Walls are placed tile by tile or dragged as lines.
- Buildings can occupy 1 by 1, 2 by 2, or 3 by 3 tiles.
- Some buildings have directional ports.
- Rotation matters for advanced layouts.
- Terrain can block placement.
- Radar controls which tiles are visible and buildable.

### 6.2 Drag-Line Resource Routing

A central mechanic should be dragging neon lines to allocate resources. This can feel intuitive, like drawing a connection between two points, while creating deep spatial constraints.

Basic rules:

- Drag from a resource output to a module input.
- Lines occupy routing space.
- Lines cannot freely cross by default.
- Lines may be limited by length, energy cost, heat, signal strength, or pressure.
- Special modules can bridge, split, tunnel, amplify, insulate, or convert lines.

The key is that a beginner can simply connect A to B, while an advanced player optimizes an entire routing network.

### 6.3 Ports and Rotation

Buildings should not accept resources from every side equally. Many modules should have visible ports.

Example:

```text
Ore input     -> [ Smelter ] -> Metal output
Energy input  -> [ Smelter ]
```

This makes placement and rotation meaningful. A beginner thinks:

> "Put ore into the smelter."

An advanced player thinks:

> "Rotate the smelter so ore comes from the left, energy from below, and metal exits toward the cannon without blocking coolant."

### 6.4 Bridges and Overpasses

Since non-crossing lines create strategy, crossings should not be impossible forever. Crossings should be powerful tools with cost.

Possible crossing tools:

- Bridge: lets one line pass over another.
- Tunnel: routes beneath debris or terrain.
- Phase conduit: expensive late-game line crossing.
- Splitter: one input to multiple outputs.
- Merger: multiple compatible inputs into one output.
- Valve: controls flow direction or priority.

The default rule should be simple: no free crossing. The advanced rule should be: crossing is possible, but it costs resources, module slots, heat, power, or space.

## 7. Radar and Expansion

Radar is both a building and a progression system.

### 7.1 Radar Functions

Radar can:

- Increase visible radius.
- Increase buildable radius.
- Reveal hidden resource pockets.
- Reveal enemy approach vectors.
- Reveal debris weaknesses.
- Reveal underground or crust data.
- Warn about breach enemies.
- Enable zoom-out or a larger camera view.

### 7.2 Radar Progression

Possible radar stages:

```text
No radar:
Small safe base area, one enemy direction.

Radar I:
Nearby terrain and one extra resource become visible.

Radar II:
More build space, second possible enemy path, first rare resource.

Radar III:
Outer debris, weak points, larger enemy warning radius.

Radar IV:
Full perimeter pressure, all-direction defense, advanced resources.
```

Radar upgrades should create interesting tension. The player wants new resources, but revealing more of the world also reveals more danger.

### 7.3 Zoom-Out Behavior

Radar can justify zooming out. However, zoom-out should not make the particles unreadable.

Possible solution:

- Default view focuses on the core and nearby tiles.
- Radar expands the camera bounds and visible world.
- At higher zoom levels, particle detail can simplify into brighter flow bands or density indicators.
- The player can zoom between macro planning and local particle detail.

## 8. Enemy Design

### 8.1 Directional Progression

Enemies should eventually come from all directions, but the first experience should be controlled.

Progression:

1. One opening, one direction.
2. Second direction after debris breach.
3. Multiple weak points.
4. Enemies attack walls and debris directly.
5. Burrowers, flyers, or tunneling threats bypass normal lanes.
6. Full perimeter defense.

### 8.2 Debris as Tutorial Protection

The first world should use debris as natural protection.

At first, debris makes the game approachable:

- The player only defends one side.
- The resource and defense concepts are easier to learn.
- The map feels safe and understandable.

Later, heavy enemies break debris:

- The player is surprised.
- The map changes permanently during the run.
- The player learns not to trust static protection.
- Defense evolves from lane defense to perimeter defense.

### 8.3 Enemy Types

Possible early enemy types:

- Crawler: basic enemy, follows open paths.
- Swarm mote: small, fast, low health.
- Armored crawler: slow and resistant to basic turrets.
- Spitter: attacks walls or modules from range.
- Breaker: damages debris and opens new paths.
- Burrower: emerges near resource lines or under walls.
- Flyer: ignores walls but is weak to anti-air or lasers.
- Leech: drains energy lines.
- Sludge: leaves debris or slows conveyors.
- Spark eater: targets energy motes.

### 8.4 The First Breach Moment

The first major surprise should be a Breaker-type enemy that smashes through a supposedly safe wall of debris.

Design goal:

- The player has learned to defend one lane.
- The Breaker creates a new lane.
- The player must adapt quickly.
- The event is dramatic but not unfair.

The game should warn the player slightly before it happens, perhaps through radar pings, screen shake, cracks in the debris, or enemy telegraphing.

## 9. Resource and Particle Systems

### 9.1 Resource Categories

Possible resource categories:

- Solid motes: ore, crystal, dust, slag.
- Liquid motes: water, coolant, acid, lava.
- Energy motes: sparks, plasma, charge pulses.
- Gas motes: steam, vapor, toxic gas, pressure pockets.
- Rare motes: relic particles, stellar dust, void motes, eigen crystals.

### 9.2 Particle Behavior Goals

The particle simulation should be visually satisfying but strategically manageable.

Useful behaviors:

- Water flows downward or along channels.
- Mineral motes move on conveyors.
- Energy sparks pulse through conduits.
- Heat transfers or spreads locally.
- Gas rises or diffuses.
- Dust can clog filters or conveyors.
- Coolant reduces heat.
- Lava damages enemies but risks overheating structures.
- Crystal motes can be refined into high-tier ammo or upgrades.

### 9.3 Keep the Simulation Bounded

The game should not become a full general-purpose powder simulator unless that becomes the project's core goal. For performance and clarity, particles should be constrained by gameplay structures.

Recommended constraints:

- Most particles live inside active chunks near the base or visible area.
- Buildings define particle channels.
- Particle counts are capped per tile or per chunk.
- Offline simulation uses abstraction rather than full particle steps.
- Far-away or zoomed-out particles can be summarized as flow rates.

### 9.4 Resource Conversion

Basic chain examples:

```text
Ore -> Smelter -> Metal -> Cannon ammo
Water -> Pump -> Coolant -> Laser stability
Energy -> Battery -> Turret power
Crystal -> Refinery -> Prism shards -> Beam tower ammo
Dust -> Filter -> Compressed dust -> Explosive or shield material
```

The key is that resources should be visible as motes moving through the player's network.

## 10. Building and Module Catalog

### 10.1 Core Buildings

- Core: the base heart. If destroyed, the base ends.
- Wall: basic defense and path shaping.
- Gate: wall that can open for friendly flow or maintenance.
- Turret: basic kinetic defense.
- Laser: precise energy weapon.
- Cannon: consumes metal or ammo.
- Shield emitter: consumes energy, protects an area.
- Repair node: repairs nearby walls and modules.

### 10.2 Resource Buildings

- Drill: extracts solid motes from resource deposits.
- Pump: extracts or moves liquids.
- Collector: gathers loose motes.
- Conveyor: moves solid motes through tiles.
- Pipe: moves liquids.
- Conduit: moves energy sparks.
- Smelter: converts ore into metal.
- Refinery: converts raw crystals or rare motes.
- Filter: separates dust, water, gas, or impurities.
- Battery: stores energy.
- Tank: stores liquid.
- Silo: stores solid motes.

### 10.3 Routing Tools

- Splitter: divides flow between outputs.
- Merger: combines compatible flows.
- Bridge: allows one route to cross another.
- Tunnel: sends a route under terrain or other routes.
- Valve: controls flow priority.
- Regulator: smooths bursts into steady output.
- Amplifier: increases line throughput at energy cost.
- Insulator: prevents heat or contamination spread.

### 10.4 Expansion Buildings

- Radar: reveals more map and threat information.
- Scanner: reveals resource type, depth, and purity.
- Stabilizer: slows environmental hazards.
- Beacon: increases turret range or enemy warning.
- Relay: extends routing or power range.
- Deep drill: interacts with the side-view crust system.

### 10.5 Unique Module Loadouts

Each base or planet can have limited module slots. Some modules are unique, so the player must decide where to assign them.

Example unique modules:

- Solar prism: boosts energy conversion on bright planets.
- Tidal pump: boosts water systems on aquatic planets.
- Crystal loom: improves rare crystal refinement.
- Rubble anchor: strengthens debris and walls.
- Deep scanner: reveals crust layers faster.
- Swarm lure: concentrates enemy paths but increases wave intensity.
- Phase bridge: allows resource crossing without normal bridge cost.

This supports the nine-slot meta game. Not every base should use the same solution.

## 11. Planet and Biome Concepts

Planet identity should be defined by terrain, resources, enemies, hazards, and module constraints.

Possible planet types:

### 11.1 Starter Rubble World

Purpose: tutorial and first mastery layer.

Features:

- Debris-surrounded starting base.
- One entrance at first.
- Basic ore and energy.
- First radar expansion.
- First Breaker enemy breach.

### 11.2 Crystal Ridge World

Features:

- Crystal walls and reflective terrain.
- Prism resources.
- Laser-reflection interactions.
- Enemies that use crystal cover.

### 11.3 Caustic Water World

Features:

- Flowing water particles.
- Coolant and pressure systems.
- Aquatic enemies or swimming swarms.
- Corrosion and filtering.

### 11.4 Verdant Growth World

Features:

- Vines, spores, roots, and organic channels.
- Enemies that grow through terrain.
- Resource lines can be overgrown or parasitized.
- Bio-reactors or living walls.

### 11.5 Volcanic Heat World

Features:

- Lava motes and heat pressure.
- High energy output with overheating risk.
- Fire-resistant enemies.
- Coolant becomes crucial.

### 11.6 Astral or Void World

Features:

- Unstable gravity or drifting motes.
- Rare stellar particles.
- Teleporting or phasing enemies.
- Late-game routing tools.

## 12. Side-View Crust and Depth System

The main game should probably start as top-down. The side-view crust system can become a mid-game or meta-game layer.

### 12.1 Purpose

The side-view crust layer gives the player a reason to think about depth, geology, extraction, and long-term planetary planning.

It can show:

- Surface base.
- Crust layers.
- Ore veins.
- Water tables.
- Magma pockets.
- Pressure zones.
- Ancient structures.
- Rare deep resources.

### 12.2 Interaction with Top-Down Base

Possible interactions:

- Deep drills bring rare resources into the top-down board.
- Drilling creates heat, pressure, or enemy risk.
- Underground pockets can flood, erupt, or release gas.
- Radar and scanner upgrades reveal deeper layers.
- Late-game enemies can emerge from below.

### 12.3 Keep It Secondary at First

The side-view system should not be required in the first prototype. It is a strong future differentiator, but the MVP should prove the top-down grid plus particle plus defense loop first.

## 13. Progression and Economy

### 13.1 Resource Layers

The economy should have at least three layers:

1. Local run resources: earned and used inside one base run.
2. Planet resources: tied to a specific planet or base slot, possibly lost or stopped on destruction.
3. Meta resources: persistent prestige resources used for global upgrades.

### 13.2 Base Destruction

When a base is destroyed:

- The local run ends.
- The base stops producing resources.
- Unspent local resources are lost or partially salvaged.
- Meta resources earned during the run are retained.
- The slot can be rebuilt.

Possible salvage upgrades can let the player keep a portion of local materials after destruction.

### 13.3 Big Persistent Upgrades

Persistent upgrades should feel meaningful. Examples:

- Unlock additional base slots.
- Increase starting radar range.
- Unlock new module categories.
- Increase offline simulation accuracy.
- Improve starting wall strength.
- Unlock bridge or tunnel routing.
- Unlock second resource type at start.
- Improve core health.
- Improve global mote throughput.
- Unlock new planets.
- Unlock module assignment slots.

### 13.4 Avoid Flat Number Inflation Only

The game can have idle scaling, but it should not rely only on bigger numbers. Good upgrades should change decisions:

- New routing possibilities.
- New enemy counters.
- New resource conversions.
- New planet strategies.
- New ways to automate or stabilize bases.

## 14. UI and UX

### 14.1 Main Screen Goals

The main screen should show:

- The core.
- Current visible base area.
- Resource deposits.
- Routing lines.
- Enemy approach warnings.
- Build grid.
- Active waves or threat level.
- Base health and production summary.
- Radar radius and unexplored fog.

### 14.2 Beginner Clarity

The first minutes should have very low UI burden.

Initial tutorial actions:

1. Drag ore to the core.
2. Place one turret.
3. Watch enemies enter from one opening.
4. Build a wall.
5. Upgrade or place radar.
6. See a new resource.
7. Survive a breach event.

### 14.3 Advanced Readouts

Advanced players may want:

- Flow rate per line.
- Bottleneck warnings.
- Heat map.
- Resource purity.
- Turret uptime.
- Ammo starvation warnings.
- Enemy approach forecast.
- Offline survival estimate.
- Per-base production comparison.

These should be unlockable, collapsible, or optional so the early game stays simple.

## 15. Technical Direction

### 15.1 Recommended Architecture

The game should separate systems by scale:

- Meta progression system.
- Base board system.
- Tile grid placement system.
- Particle simulation system.
- Enemy wave and pathing system.
- Routing network system.
- Rendering system.
- Save and offline simulation system.

### 15.2 Rendering

Recommended rendering approach:

- Canvas-based low-resolution native render.
- Nearest-neighbor upscaling.
- Separate layers for terrain, structures, particles, enemies, projectiles, UI, and glow.
- Pixelated glow buffer if possible.
- Avoid high-resolution blur that breaks the retro look.

### 15.3 Simulation

Recommended simulation approach:

- Fixed timestep for gameplay.
- Particle chunks or active regions for performance.
- Abstract flow rates for distant or offline systems.
- Deterministic-ish resource movement where possible.
- Cap particle counts per tile or channel.
- Use simple rules first, then add complexity.

### 15.4 Offline Simulation

Offline simulation should probably not replay every particle step. It should summarize:

- Average production.
- Average consumption.
- Defensive strength.
- Enemy scaling.
- Bottlenecks.
- Failure time estimate.
- Resources earned before failure.

A simple approximation is acceptable if it is transparent and feels fair.

## 16. MVP Plan

The first playable prototype should prove the core loop, not the full meta game.

### 16.1 MVP Features

Minimum viable prototype:

- [x] One base slot.
- [x] One top-down board.
- [x] Core in center.
- [x] Debris barrier with one enemy entrance.
- [x] Grid placement for walls and turrets.
- [x] One resource deposit.
- [x] Drag-line or simple conveyor connection from resource to turret or core.
- [x] One mote type moving visibly.
- [x] Enemy waves from one direction.
- [x] Radar building that reveals a larger area.
- [x] Breaker enemy that opens a second direction.
- [x] Base destruction and restart.
- [x] Simple persistent currency.

### 16.2 MVP Success Criteria

The prototype is successful if:

- A new player understands the first connection quickly.
- The particle movement is visually satisfying.
- The grid building feels clean.
- The first breach moment is surprising but fair.
- The player immediately sees how better layout would improve survival.
- The game suggests long-term depth without requiring everything to exist yet.

## 17. Near-Term Implementation Milestones

### Milestone 1: Design Foundation

- [x] Create DESIGN.md.
- [x] Choose working title.
- [x] Define initial resource names.
- [x] Define build tile size and native resolution.
- [x] Define first board dimensions.

### Milestone 2: Grid and Rendering

- [x] Implement low-res canvas scaling.
- [x] Implement tile grid overlay.
- [x] Implement basic terrain, debris, core, and buildable ground.
- [x] Implement camera and radar visibility mask.

### Milestone 3: Basic Building

- [x] Place walls.
- [x] Place one turret.
- [x] Place one resource extractor.
- [x] Place core.
- [x] Support basic build preview.

### Milestone 4: Mote Flow

- [x] Spawn ore or energy motes.
- [x] Move motes along a simple drawn route or conveyor.
- [x] Deliver motes to a building.
- [x] Display bottleneck or storage count.

### Milestone 5: Enemy Waves

- [x] Spawn enemies from one entrance.
- [x] Basic pathing toward core.
- [x] Turret targeting and damage.
- [x] Core damage and base loss.

### Milestone 6: Radar Expansion

- [x] Build radar.
- [x] Reveal more terrain.
- [x] Reveal a new resource.
- [x] Expand camera or visible radius.

### Milestone 7: Breach Event

- [x] Add Breaker enemy.
- [x] Break debris.
- [x] Open a second path.
- [x] Teach perimeter defense.

### Milestone 8: Meta Skeleton

- [x] Add run summary.
- [x] Add persistent currency.
- [x] Add one permanent upgrade.
- [x] Add placeholder nine-slot screen.

## 18. Open Questions

These decisions are intentionally unresolved:

1. Should the player directly draw routes, place conveyors, or both?
2. Should routes be strict lines, tile paths, or freeform neon paths snapped to ports?
3. How much of the particle simulation should be true powder behavior versus visualized flow?
4. Should enemies path on the tile grid, the pixel grid, or a separate navigation graph?
5. How harsh should base destruction be?
6. How long should a typical base survive before idle scaling overwhelms it?
7. Should all nine slots run simultaneously from the beginning, or unlock slowly?
8. Should planets share resources directly, or only through meta progression?
9. Should the side-view crust system be a separate screen or an overlay?
10. What is the final name and theme language?

## 19. Design Risks

### 19.1 Too Much Complexity Too Early

The concept has many strong systems. The first build should not include all of them. The first experience must be simple: connect resource, build defense, survive.

### 19.2 Particle Simulation Performance

A full powder simulation can become expensive. The game should use constrained particle systems and abstracted flow when needed.

### 19.3 Visual Noise

Neon particles, lasers, enemies, terrain, and UI can become hard to read. The art direction must prioritize clarity. Resource colors, enemy silhouettes, grid lines, and warnings must remain distinct.

### 19.4 Idle Fairness

If bases die offline, the player must feel the result was understandable. The game should explain why the base failed and what bottleneck caused it.

### 19.5 Same-Solution Problem

If every planet can use the same optimal layout, the nine-slot system loses purpose. Planets need meaningful differences in resources, terrain, enemies, and module constraints.

## 20. Guiding Summary

The game should start as a tiny readable defense puzzle and grow into a multi-base neon particle factory defense game.

The most important foundation is:

```text
Grid structures for clarity.
Pixel motes for life and beauty.
Radar for discovery and risk.
Debris for early safety and later surprise.
Finite base runs for idle tension.
Nine specialized slots for meta strategy.
```

The first prototype should make one small board feel good. If placing a few structures, watching motes move, and surviving a debris breach is fun, the larger game has a strong foundation.

## 21. New Design Notes: Logistics Scarcity, Procedural Enemies, Repair, and Visible Mote Flow

### 21.1 Infinite Basic Logistics, Finite Strategic Logistics

Basic conveyor belts should be infinite or effectively infinite. They are the player's basic building language, so the player should not feel blocked from making simple resource routes. If the player has ore and a turret, the player should usually be able to connect them with basic conveyor without worrying about a hard conveyor count.

Advanced logistics pieces should be finite and tied to the meta game. Bridges, routers, splitters, filters, tunnels, valves, smart gates, and other special routing pieces solve powerful spatial problems, so their scarcity creates meaningful layout decisions.

The intended rule is:

- Basic conveyors are abundant.
- Important routing tools are limited.
- Limited routing tools are unlocked and expanded through meta upgrades.
- Limited routing tools should usually be movable, refundable, or recoverable so experimentation is not punished.
- If a finite piece is destroyed, the player should not permanently lose the meta slot. The physical structure can be rebuilt from a blueprint ghost at a cost.

This turns routing into a strategic layer. A player might think, "Where do I spend my one bridge?" or "This planet only has two routers, so I need a simpler layout."

Possible finite logistics pieces:

- Bridge: lets one route pass over another.
- Tunnel: routes beneath debris, terrain, or other routes.
- Splitter: sends one input to multiple outputs.
- Merger: combines compatible inputs.
- Valve: controls flow direction or priority.
- Filter: only allows certain resources through.
- Router: sends resources based on type, destination, threat state, or priority rule.
- Smart gate: late-game conditional routing.
- Phase conduit: expensive late-game crossing or bypass tool.
- Planet relay: rare tool for cross-base or meta-level resource transfer.

Example early logistics loadout:

Infinite conveyor
1 bridge
1 splitter
0 routers
0 filters
0 tunnels

Example later logistics loadout:

Infinite conveyor
4 bridges
3 splitters
2 routers
2 filters
1 tunnel
1 emergency relay

Different planets can have different logistics constraints. A tight crystal planet might give more bridges. A wet planet might emphasize valves and pumps. A void planet might allow phase conduits but restrict normal walls or normal routing.

### 21.2 Procedural Enemy Philosophy

Enemies should be procedurally animated and rendered when practical, rather than relying only on sprite sheets. The goal is for enemies to feel physically present, readable, and reactive to damage.

This should follow the spirit of the Equatoria Idle fish system, where fish were built from linked circles and rendered cleanly and naturally. Tiny Base Idle can use similar procedural body systems for worms, fish, centipedes, vine creatures, crystal serpents, burrowers, and bosses.

Procedural enemies can be built from:

- Linked circles.
- Segment chains.
- Constraint-based spines.
- Procedural fins, legs, antennae, armor plates, crystals, sacs, and glow organs.
- Smooth body skins rendered over hit segments.
- Damage cracks, missing pieces, burning sections, frozen joints, or exposed cores.

The simulation body and the visual body do not need to be identical. A worm can be simulated as linked circular hit segments, while rendered with a smooth continuous body over those circles.

### 21.3 Worm Enemy System

A core early procedural enemy type should be the Worm.

A worm is made from linked circular segments. Each segment has its own HP, position, radius, and optional role.

Segment data could include:

- Position.
- Velocity.
- Radius.
- HP and max HP.
- Armor or resistance tags.
- Segment role, such as head, body, armored body, explosive sac, weak point, or tail.
- Previous and next segment references.

Basic worm structure:

H-O-O-O-O-O-O-O-T

When a middle segment is destroyed, the worm can split into two separate worms. Any resulting worm with at least 5 linked circles survives as an independent enemy. Any fragment smaller than 5 linked circles dies permanently.

Example:

Before:
H-O-O-O-X-O-O-O-O-T

After destroyed segment X:
H-O-O-O     O-O-O-O-T
fragment    surviving worm if 5 or more segments

This creates interesting combat consequences:

- Lasers and saws can cut worms apart.
- Area damage can clean up small fragments.
- Snipers can target heads, weak points, or high-value segments.
- Shock weapons can chain through adjacent segments.
- Freezing can slow the whole constraint chain.
- High single-target damage may split one enemy into multiple threats.
- Some weapons might intentionally cut worms into manageable pieces.
- Some worm variants might become more dangerous when split.

Possible worm variants:

- Basic worm: 8 to 12 segments, low armor, seeks the core.
- Armored worm: armor plates every few segments, weak points between plates.
- Regenerator worm: slowly regrows missing tail segments unless cut below survival size.
- Brood worm: both halves remain dangerous after splitting.
- Crystal worm: drops crystal motes when segments are destroyed.
- Burrow worm: tunnels under walls and emerges near resource lines.
- Acid worm: corrodes structures and increases rebuild cost.
- Siege worm: prioritizes repair infrastructure, routers, bridges, and weak walls.
- Splitter boss: intentionally fragments into many smaller worms under heavy damage.

The linked-segment system should be reusable. The first implementation can be a simple worm, but the underlying body system should eventually support other procedural creatures.

### 21.4 Segment-Level Combat Interactions

Different towers should interact with segmented enemies in distinct ways.

Examples:

- Basic turret: shoots the nearest segment.
- Sniper: targets the head, highest-HP segment, or weak point.
- Laser: cuts through multiple segments in a line.
- Saw trap: excels at severing worms.
- Acid sprayer: applies damage over time across multiple segments.
- Crusher: deals high damage to one segment, good for splitting.
- Freezer: slows body constraints and movement.
- Shock tower: chains between adjacent segments.
- Harpoon: pins a segment in place, stretching or slowing the worm.
- Flame turret: burns along connected segments.

This makes enemy anatomy part of gameplay, not only visual style.

### 21.5 Repair, Rebuild, and Blueprint Ghosts

Because enemies can damage and destroy specific sections of the base, the game needs an easy system for rebuilding destroyed sections. Destruction should create tension and redesign opportunities, not tedious reconstruction.

When a structure is destroyed by enemies or hazards, it should leave behind a faint blueprint ghost. This ghost remembers the original structure so the player can rebuild it without manually recreating the layout.

A blueprint ghost should remember:

- Original structure type.
- Rotation.
- Settings.
- Connections.
- Upgrade level.
- Resource routing links.
- Whether it was destroyed by enemies, hazards, or manual deletion.

Manually deleted structures should not leave rebuild ghosts unless the player explicitly chooses to preserve them.

Repair and rebuilding should have three layers:

1. Manual repair brush.
2. Rebuild All button.
3. Automated rebuild structures.

#### 21.5.1 Repair Brush

The repair brush is the player's immediate recovery tool. It should feel like spot-cleaning after a breach.

The player selects a repair brush, then paints over damaged or destroyed structures. Each tile shows a cost preview and repairs or rebuilds instantly or quickly.

Possible rules:

- Paint over damaged structures to repair them.
- Paint over blueprint ghosts to rebuild them.
- Show cost preview while hovering or dragging.
- Support brush sizes such as 1 tile, 3 tile, and 5 tile.
- Allow filters such as repair only, rebuild only, walls only, conveyors only, or critical structures only.
- Prevent rebuilding if an enemy occupies the tile.
- Repair should cost resources, but the interaction should be fast and low-friction.

#### 21.5.2 Rebuild All Button

The Rebuild All button is the strategic cleanup option after a wave or while paused.

It scans destroyed blueprint ghosts and shows the total cost before confirming.

Example:

Rebuild All: 238 metal, 41 energy, 12 crystal

Useful options:

- Rebuild all.
- Rebuild affordable.
- Rebuild walls only.
- Rebuild conveyors only.
- Rebuild turrets only.
- Rebuild advanced logistics only.
- Exclude high-risk storage buildings.

This prevents the game from becoming tedious after every breach. The player should not have to manually recreate a known layout unless they want to redesign it.

#### 21.5.3 Auto-Rebuilder Towers and Repair Automation

Repair towers, rebuild spires, maintenance drone bays, or assembler beacons can automatically repair and rebuild nearby structures.

Possible rules:

- They have a radius.
- They consume repair resources.
- They prioritize critical systems.
- They send tiny repair drones or glowing builder motes.
- They repair damaged buildings first, then rebuild destroyed ghosts.
- They can be upgraded through meta progression.
- They can be disabled by EMP, destroyed by siege enemies, or starved by resource shortages.
- They should not be so powerful that enemy breaches stop mattering.

Repair automation should be visible and satisfying. Broken walls can rebuild from scaffolding. Turrets can reassemble barrels. Conveyors can relight segment by segment. Repair motes or drones can visibly travel from the repair structure to the damaged section.

### 21.6 Rebuild Cost Balance

Rebuilding should reduce tedium without erasing consequences.

Good starting rules:

- Damaged structure repair: 25 to 50 percent of missing HP cost.
- Destroyed basic structure rebuild: 50 to 75 percent of original cost.
- Destroyed advanced structure rebuild: 75 to 100 percent of original cost.
- Rare finite pieces are not permanently lost. The physical object can be rebuilt, but the player still owns the meta slot.

If rebuilding is too cheap, breaches do not matter. If rebuilding is too tedious, breaches become annoying.

### 21.7 Visible Resource Flow

The player should be able to see resources moving through the base whenever possible. Conveyors, pipes, conduits, towers, processors, and weapons should expose at least some of their internal resource state visually.

Design goals:

- Conveyors show solid motes moving tile by tile.
- Pipes show liquid motes, pressure pulses, or flow bands.
- Energy conduits show sparks traveling in the direction of supply.
- Turrets show loaded ammo motes, charged energy, or visible internal storage.
- Refineries show transformation by changing mote size, color, density, or glow.
- Weapons visually consume the motes they fire or convert.

This makes the base legible. The player should often be able to diagnose starvation, overproduction, bottlenecks, and danger by watching the motion itself.

### 21.8 Refined Mote Scale

Higher-value resources can become larger or more structured rather than only changing color. A raw resource may be a 1 by 1 mote, while refined outputs may become 2 by 2 clusters, 3 by 3 crystals, linked sparks, dense capsules, or shaped shards.

Possible progression:

Raw ore mote        = 1 native pixel
Refined metal mote  = 2 by 2 cluster
Charged shell mote  = 3 by 3 glowing ammo unit
Rare crystal mote   = faceted pixel cluster with sparkle edges

This makes resource refinement visually satisfying and immediately readable.

### 21.9 Stored Motes and Destruction Risk

Buildings can store resources internally. This creates a useful risk-reward layer.

Examples:

- A cannon stores metal shell motes.
- A laser stores charged energy motes.
- A flamethrower stores heat or fuel motes.
- A repair tower stores repair motes.
- A battery stores energy sparks.
- A silo stores solid motes.

If a building is destroyed while storing dangerous motes, those motes may spill, detonate, discharge, burn, freeze, poison, or scatter. This makes placement matter.

Possible rules:

- Basic ore spills harmlessly and may be recollected.
- Charged ammo can explode or create shrapnel.
- Energy storage can arc to nearby structures and enemies.
- Acid leaks and damages both enemies and structures.
- Coolant spills can extinguish heat or freeze water.
- Rare motes may be partially lost if the container is destroyed.

This should be readable and fair. Dangerous storage should have visible warning states, such as bright internal motes, pressure pulses, heat shimmer, or unstable glow.

### 21.10 Meta Upgrade Hooks

These systems create useful meta upgrades.

Possible upgrades:

- Unlock bridge.
- Increase bridge count.
- Unlock router.
- Increase router count.
- Unlock splitter.
- Unlock filter.
- Unlock tunnel.
- Unlock repair brush.
- Increase repair brush size.
- Unlock Rebuild All.
- Unlock Rebuild Affordable.
- Unlock auto-rebuilder tower.
- Increase repair tower radius.
- Improve repair efficiency.
- Preserve more blueprint ghost data.
- Improve dangerous storage safety.
- Reduce explosion risk from stored ammo.
- Unlock procedural enemy scanner or weak-point targeting.

The goal is for meta progression to unlock new decisions, not just larger numbers.

### 21.11 MVP Implications

The first prototype should not include all of this, but it should lay the foundation.

Recommended MVP additions:

- [ ] Basic conveyor is infinite.
- [ ] At least one finite strategic piece exists, such as a bridge or splitter.
- [x] One enemy can damage or destroy structures.
- [x] Destroyed structures leave blueprint ghosts.
- [x] The player can use a repair brush to rebuild ghosts.
- [x] One visible resource mote type moves through conveyors.
- [x] One tower shows stored ammo or internal resource state.
- [x] One simple procedural worm enemy: segmented worm with BFS head navigation, chain-constrained body, per-segment HP, and splitting on segment death.

The most important early test is whether one small board feels good when the player places structures, watches motes move, survives a breach, repairs damaged sections, and sees how better layout would improve survival.
