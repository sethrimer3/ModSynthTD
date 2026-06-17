# QA Status

Manual alpha checklist for the public-alpha content, balance, and game-feel pass.

## Automated Status

- [x] `npm test` passes on this pass.
- [x] `npm run build` passes on this pass.
- [x] Headless balance simulator prints all campaign worlds and rack profiles.
- [x] Late-game strong profile clears w40, w60, w80, w100, w120, w140, w160, and w180 in the simulator.
- [x] w60 audio coverage is explicit: wave 1 has MIDI/OGG coverage, later waves fall back to authored score content with partial-coverage warnings.
- [ ] Browser/manual fresh-save validation through w40 and w60 still needs to be run.

## Known Content Gaps

- w200 remains an optional secret/final challenge with authored score content but no bespoke boss-phase visuals.
- Several enemy ids still reuse base note sprites.
- Some normal campaign worlds are intentionally difficult for starter/weak racks; advanced worlds are balanced around deliberate patch improvement.
- Mobile portrait and Electron startup are checklist items, not yet manually reverified in this pass.

## Known Audio Gaps

- w60 wave 1 is the only currently covered per-wave MIDI/intro audio asset path.
- Missing per-wave audio must remain a warning/fallback to authored waves, not a silent failure.
- Audio output still needs a manual listening pass because automated tests validate config/timing contracts, not what speakers produce.

## Known Balance Risks

- w40 is easy with a strong/exact rack but still teaches band mismatch because the starter mid-band rack does not clear every later tutorial wave by itself.
- w60 introduces pressure through mixed bands; players may need to adjust OSC band or buy a simple pitch/gain module after w40.
- w140-w180 now clear with the late-game simulator profile, but require manual play to confirm the tactile rack path to those solutions is readable.
- w200 is not included in the visible campaign simulator summary and should be tested separately before promising a public final challenge.

## Fresh Save Flow

- [ ] Clear/reset save data and launch the app.
- [ ] Enter w40 from the world map.
- [ ] New player can identify the rack, battlefield, next-wave score, Patch Analysis, Shop, and Start Wave without external instructions.
- [ ] Tutorial prompts teach CLOCK -> OSC -> OUT, OUT tower placement, score preview, and Start Wave without a long modal.
- [ ] Complete w40 wave 1 with the starter patch and placed OUT tower.
- [ ] Confirm Resonance reward appears and the next unlock/reward state is understandable.
- [ ] Confirm w40 teaches exact/near/resisted hits without external instructions.

## Early Progression

- [ ] Buy the first affordable/unlocked module from the Shop.
- [ ] Unaffordable but unlocked modules explain the Resonance cost.
- [ ] Place or reposition the OUT tower from its rack silhouette.
- [ ] Clear w60 wave 1 and confirm Hz/note matching is readable in Patch Analysis and note hover popups.
- [ ] Confirm after w40 the player can afford at least one meaningful module or upgrade.
- [ ] Confirm after w60 the player has enough Resonance to experiment without flooding the shop.

## Invalid Patch Cases

- [ ] No clock source: Start Wave explains to add/keep CLOCK and patch it into the chain.
- [ ] No oscillator/voice: Start Wave explains CLOCK -> OSC -> OUT.
- [ ] No output route: Start Wave explains to patch into OUT.
- [ ] Incompatible cable: cable route is rejected or Start Wave explains matching jack colors.
- [ ] Output module has no placed tower: Start Wave blocks and asks for OUT tower placement.
- [ ] Graph cycle detected: Start Wave explains to break the feedback loop.
- [ ] Module unlocked but not affordable: Shop shows required Resonance.
- [ ] Tower placed on invalid tile: drag ghost shows blocked feedback and the placement is rejected.

## Persistence And Shell

- [ ] Save/reload preserves rack, cables, placed towers, completed waves, settings, and tutorial seen state.
- [ ] Electron startup works through `run-desktop.bat`.
- [ ] `run-desktop-no-build.bat` opens the existing `dist` build.

## Layout And Settings

- [ ] Mobile portrait layout keeps rack, battlefield, HUD, notation, and Patch Analysis readable.
- [ ] Desktop landscape layout keeps rack and playfield reachable with Fit/Rack/Grid.
- [ ] Settings audio toggles and volume sliders apply live: master, beat loop, background loop, enemy notes, SFX, and emitters/towers.
- [ ] Reduced motion keeps notation, tower placement, and combat feedback understandable.

## Combat And Rack Feel

- [ ] Exact-Hz hits show strong `EXACT` feedback and clear impact glow.
- [ ] Near matches show weaker `NEAR` feedback.
- [ ] Mismatches/resisted hits show restrained `RESIST` feedback without flooding text.
- [ ] Enemy escapes show `ESCAPE!`, finish-lane flash, and base-hit feedback.
- [ ] Connecting cables, invalid cable attempts, moving modules, buying/selling modules, output tower placement, and cable pulses feel responsive.

## Alpha Release Flow

- [ ] Fresh-save QA: reset localStorage, enter w40, place OUT tower, clear w40 wave 1.
- [ ] w60 QA: enter Pulse Orbit, verify wave 1 MIDI/sheet/combat pitch alignment, and confirm missing later audio falls back safely.
- [ ] Mobile portrait QA: touch tower placement, rack scrolling/focus, cable drag, settings, and wave start.
- [ ] Desktop landscape QA: mouse cable drag/reroute, module drag, Fit/Rack/Grid, wheel zoom, settings.
- [ ] Electron startup QA: `run-desktop.bat`, `run-desktop-no-build.bat`, and app title/window.
- [ ] Save migration QA: import or load an older tower save and confirm output tower migration/repair.
- [ ] Performance QA: dense w160/w180 waves with reduced motion off/on and wire opacity at 100%.
- [ ] Intentional alpha incompletes are visible in this file before external release.

## Validation

- [ ] `npm test` passes.
- [ ] `npm run build` passes.
