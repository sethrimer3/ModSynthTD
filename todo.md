# TinyBaseIdle TODO

This file is the condensed implementation checklist for the project. Keep `design.md` focused on vision, design intent, and system explanations. Track concrete implementation work here.

## Agent Maintenance Rules

AI agents should maintain this file as part of normal implementation work.

- When a checklist item is fully implemented and validated, mark it `[x]` in the same change set.
- If an item is only partially implemented, leave it unchecked and add or refine a follow-up item for what remains.
- If work is deferred, descoped, blocked, or intentionally skipped, add a concise unchecked item under the most relevant section.
- If implementation reveals new required work, add it here rather than burying it in chat, commit notes, or `design.md`.
- Keep items short, concrete, and implementation-oriented.
- Do not use this file for broad design vision. Put design intent in `design.md`.

## Current Priority: Make the Core Factory-Defense Loop Real

- [x] Add actual conveyor placement as the basic infinite logistics tool.
- [x] Replace fixed deposit-to-core mote paths with player-built conveyor routes.
- [x] Add a basic extractor/drill in the Mining category.
- [x] Make deposits output motes only when connected to an extractor or route.
- [x] Add simple building input/output ports so routing direction matters.
- [x] Route ore into the core, turrets, and processors through the same logistics system.
- [x] Add one finite strategic routing piece, preferably Bridge or Splitter.
- [x] Add UI feedback for blocked, invalid, or disconnected routes (red indicator on extractor, "!" hints on unconnected deposits).

## Short-Term Combat and Defense

- [x] Convert the current basic turret into a resource-fed weapon instead of a free-firing cooldown turret.
- [x] Show visible stored ammo or charge inside turrets (ammo bar replaces charge bar).
- [x] Add ammo starvation feedback when a turret has no supplied resource (red pixel when ammo=0).
- [x] Add at least one distinct weapon beyond the basic turret, such as Laser or Cannon.
- [x] Add enemy approach warnings for newly revealed directions.
- [x] Improve the Breaker breach event with stronger warning and visual telegraphing.
- [x] Add one non-worm enemy variant with a meaningfully different counterplay pattern.

## Repair, Rebuild, and Destruction

- [x] Expand the repair brush with better hover cost previews and clearer rebuild state.
- [x] Add Rebuild All.
- [x] Add Rebuild Affordable.
- [x] Add rebuild filters: walls, turrets, conveyors, and advanced logistics.
- [x] Preserve blueprint ghost data for conveyors and extractors (same ghost system as other structures).
- [x] Add visual repair motes, drones, scaffolding, or rebuild animation.
- [x] Add one repair automation building.

## Resources and Processing

- [x] Add at least one processor — Crusher already present; coal routed via logistics into Crusher.
- [x] Add one refined resource with a distinct mote size or shape (gunpowder mote is now 1×3 vertical pixel vs coal/ore 2×2 square).
- [x] Add one resource conversion chain: coal mote → Crusher → gunpowder → Gatling.
- [ ] Add basic storage behavior for at least one building (full-ammo cap exists on turrets; dedicated storage building deferred).
- [x] Add destruction consequences for stored dangerous resources.
- [ ] Add bottleneck visibility for overproduction, starvation, or full storage (extractor no-route indicator is first step; per-route flow readout deferred).

## Radar and Expansion

- [x] Make radar expand visible and buildable area through clearer stages.
- [x] Add radar-based enemy direction warnings.
- [x] Add radar-based resource discovery beyond the current second deposit.
- [ ] Add radar-based debris weakness or breach warning information.
- [ ] Add zoom-out behavior tied to radar while keeping particles readable.

## Procedural Enemies

- [x] Tune worm splitting so the intended survival threshold is consistent with the design.
- [x] Add at least one worm variant, such as Armored, Crystal, Acid, or Siege Worm.
- [x] Add segment-specific combat effects for at least one weapon.
- [x] Add clearer damage feedback on worm segments.
- [x] Add enemy behavior that targets logistics, not only the core or nearby structures.

## Meta and Idle Systems

- [ ] Turn the nine-slot screen from placeholder UI into real slot state.
- [ ] Add unlockable base slots.
- [ ] Add planet-specific local resources or modifiers.
- [ ] Add module assignment limits for strategic logistics pieces.
- [ ] Add finite harvest windows for base runs.
- [ ] Add offline simulation summary: earned resources, failure time, bottleneck cause.
- [x] Add run summary details beyond basic meta gain.

## Future World Systems

- [ ] Add Crystal Ridge world prototype.
- [ ] Add Caustic Water world prototype with liquid motes or pipes.
- [ ] Add Verdant Growth world prototype with overgrowth or parasitic routing threats.
- [ ] Add Volcanic Heat world prototype with heat/coolant pressure.
- [ ] Add Astral/Void world prototype with phase or gravity routing behavior.
- [ ] Prototype side-view crust/depth screen.
- [ ] Connect deep drilling to top-down resources.

## UI and Polish

- [x] Add flow rate readouts per route.
- [x] Add turret uptime and ammo starvation readouts.
- [x] Finish day/night lighting integration with directional shadows, masked building glows, and debug time controls.
- [ ] Add optional advanced overlays: heat, bottlenecks, purity, threat forecast.
- [ ] Improve build previews for multi-tile buildings and routed structures.
- [x] Add clearer tutorial prompts for the first route, first turret, first wall, first radar, and first breach.
- [ ] Keep all visuals readable at the native pixel scale.
- [x] Add conveyor direction preview ghost for conveyor/extractor tool (Q to rotate tooltip visible in place).

## Maintenance

- [ ] Move checklist-style progress tracking out of `design.md` over time.
- [ ] Keep this file ordered by implementation priority.
- [ ] When a feature is implemented, mark it here and update `design.md` only if the actual design changed.
