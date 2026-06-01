# TinyBaseIdle TODO

This file is the condensed implementation checklist for the project. Keep `design.md` focused on vision, design intent, and system explanations. Track concrete implementation work here.

## Current Priority: Make the Core Factory-Defense Loop Real

- [ ] Add actual conveyor placement as the basic infinite logistics tool.
- [ ] Replace fixed deposit-to-core mote paths with player-built conveyor routes.
- [ ] Add a basic extractor/drill in the Mining category.
- [ ] Make deposits output motes only when connected to an extractor or route.
- [ ] Add simple building input/output ports so routing direction matters.
- [ ] Route ore into the core, turrets, and processors through the same logistics system.
- [ ] Add one finite strategic routing piece, preferably Bridge or Splitter.
- [ ] Add UI feedback for blocked, invalid, or disconnected routes.

## Short-Term Combat and Defense

- [ ] Convert the current basic turret into a resource-fed weapon instead of a free-firing cooldown turret.
- [ ] Show visible stored ammo or charge inside turrets.
- [ ] Add ammo starvation feedback when a turret has no supplied resource.
- [ ] Add at least one distinct weapon beyond the basic turret, such as Laser or Cannon.
- [ ] Add enemy approach warnings for newly revealed directions.
- [ ] Improve the Breaker breach event with stronger warning and visual telegraphing.
- [ ] Add one non-worm enemy variant with a meaningfully different counterplay pattern.

## Repair, Rebuild, and Destruction

- [ ] Expand the repair brush with better hover cost previews and clearer rebuild state.
- [ ] Add Rebuild All.
- [ ] Add Rebuild Affordable.
- [ ] Add rebuild filters: walls, turrets, conveyors, and advanced logistics.
- [ ] Preserve more blueprint ghost data, including rotation, connections, and upgrade level.
- [ ] Add visual repair motes, drones, scaffolding, or rebuild animation.
- [ ] Add one repair automation building.

## Resources and Processing

- [ ] Add at least one processor, such as Smelter or Crusher.
- [ ] Add one refined resource with a distinct mote size or shape.
- [ ] Add one resource conversion chain: raw mote -> processed mote -> weapon/building use.
- [ ] Add basic storage behavior for at least one building.
- [ ] Add destruction consequences for stored dangerous resources.
- [ ] Add bottleneck visibility for overproduction, starvation, or full storage.

## Radar and Expansion

- [ ] Make radar expand visible and buildable area through clearer stages.
- [ ] Add radar-based enemy direction warnings.
- [ ] Add radar-based resource discovery beyond the current second deposit.
- [ ] Add radar-based debris weakness or breach warning information.
- [ ] Add zoom-out behavior tied to radar while keeping particles readable.

## Procedural Enemies

- [ ] Tune worm splitting so the intended survival threshold is consistent with the design.
- [ ] Add at least one worm variant, such as Armored, Crystal, Acid, or Siege Worm.
- [ ] Add segment-specific combat effects for at least one weapon.
- [ ] Add clearer damage feedback on worm segments.
- [ ] Add enemy behavior that targets logistics, not only the core or nearby structures.

## Meta and Idle Systems

- [ ] Turn the nine-slot screen from placeholder UI into real slot state.
- [ ] Add unlockable base slots.
- [ ] Add planet-specific local resources or modifiers.
- [ ] Add module assignment limits for strategic logistics pieces.
- [ ] Add finite harvest windows for base runs.
- [ ] Add offline simulation summary: earned resources, failure time, bottleneck cause.
- [ ] Add run summary details beyond basic meta gain.

## Future World Systems

- [ ] Add Crystal Ridge world prototype.
- [ ] Add Caustic Water world prototype with liquid motes or pipes.
- [ ] Add Verdant Growth world prototype with overgrowth or parasitic routing threats.
- [ ] Add Volcanic Heat world prototype with heat/coolant pressure.
- [ ] Add Astral/Void world prototype with phase or gravity routing behavior.
- [ ] Prototype side-view crust/depth screen.
- [ ] Connect deep drilling to top-down resources.

## UI and Polish

- [ ] Add flow rate readouts per route.
- [ ] Add turret uptime and ammo starvation readouts.
- [ ] Add optional advanced overlays: heat, bottlenecks, purity, threat forecast.
- [ ] Improve build previews for multi-tile buildings and routed structures.
- [ ] Add clearer tutorial prompts for the first route, first turret, first wall, first radar, and first breach.
- [ ] Keep all visuals readable at the native pixel scale.

## Maintenance

- [ ] Move checklist-style progress tracking out of `design.md` over time.
- [ ] Keep this file ordered by implementation priority.
- [ ] When a feature is implemented, mark it here and update `design.md` only if the actual design changed.
