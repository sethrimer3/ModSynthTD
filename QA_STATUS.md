# QA Status

Manual alpha checklist for the public-alpha content, balance, and game-feel pass.

## Automated Status

- [x] `npm test` passes on this pass.
- [x] `npm run build` passes on this pass.
- [x] Main menu build label is incremented to `BUILD 005` for this code-changing pass.
- [x] Development webpack compile passes after limiting ts-loader to bundled browser files; the stale test-type dev overlay was fixed.
- [x] Electron desktop shell launched via `npm run desktop:no-build`; Electron processes started successfully in this environment.
- [x] Headless balance simulator prints all campaign worlds and rack profiles.
- [x] Late-game strong profile clears w40, w60, w80, w100, w120, w140, w160, and w180 in the simulator.
- [x] w60 audio coverage is explicit: wave 1 has MIDI/OGG coverage, later waves fall back to authored score content with partial-coverage warnings.
- [x] Static z-index regression fix is implemented: moved modules restore baseline module, plug, and content layers above decorative rack artwork.
- [ ] Browser/manual fresh-save validation through w40 and w60 still needs to be run end-to-end on a stable browser session.

## Known Content Gaps

- w200 remains an optional secret/final challenge with authored score content but no bespoke boss-phase visuals.
- Several enemy ids still reuse base note sprites.
- Some normal campaign worlds are intentionally difficult for starter/weak racks; advanced worlds are balanced around deliberate patch improvement.
- Mobile portrait still needs a real-device touch pass; this pass made responsive layout fixes but did not complete device verification.

## Known Audio Gaps

- w60 wave 1 is the only currently covered per-wave MIDI/intro audio asset path.
- Missing per-wave audio must remain a warning/fallback to authored waves, not a silent failure.
- Audio output still needs a manual listening pass because automated tests validate config/timing contracts, not what speakers produce.
- Browser autoplay constraints still apply: between-wave rack audio remains silent until the existing user gesture unlock succeeds.
- Synth preview voices are canceled on level exit through the existing level teardown path; audible orphan-voice verification still needs a listening pass.

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
- [x] Static review: Patch Analysis now shows `PATCH VALID - PLACE OUT TOWER` when the starter patch is valid but no OUT tower is placed.
- [ ] Graph cycle detected: Start Wave explains to break the feedback loop.
- [ ] Module unlocked but not affordable: Shop shows required Resonance.
- [ ] Tower placed on invalid tile: drag ghost shows blocked feedback and the placement is rejected.

## Persistence And Shell

- [ ] Save/reload preserves rack, cables, placed towers, completed waves, settings, and tutorial seen state.
- [ ] Electron startup works through `run-desktop.bat`.
- [x] `npm run desktop:no-build` starts Electron processes against the existing `dist` build in this environment.

## Layout And Settings

- [ ] Mobile portrait layout keeps rack, battlefield, HUD, notation, and Patch Analysis readable.
- [x] Static layout fix: mobile Patch Analysis panel is width-constrained and height-capped; settings/shop controls wrap on narrow screens.
- [ ] Desktop landscape layout keeps rack and playfield reachable with Fit/Rack/Grid.
- [ ] Settings audio toggles and volume sliders apply live: master, beat loop, background loop, enemy notes, SFX, and emitters/towers.
- [ ] Synth/tower audio continues from the same rack patch in prep and after a wave clear once audio is unlocked.
- [ ] Always-running preview before first wave: rack cables, module faces, OUT charge, placed output tower preview, and optional synth audio behave correctly.
- [ ] Always-running preview after wave clear: visuals and unlocked synth audio resume without silence.
- [ ] Always-running preview after failed wave/retry: retry returns to prep preview without stale live-wave audio.
- [ ] Always-running preview after save/reload: saved rack and output tower resume prep preview.
- [ ] Always-running preview with synth enabled and disabled: visuals continue, audio follows the synth toggle.
- [ ] Always-running preview with audio unlocked and not unlocked: visuals continue before gesture, synth audio starts only after unlock.
- [ ] Reduced motion keeps notation, tower placement, and combat feedback understandable.

## Combat And Rack Feel

- [ ] Exact-Hz hits show strong `EXACT` feedback and clear impact glow.
- [ ] Near matches show weaker `NEAR` feedback.
- [ ] Mismatches/resisted hits show restrained `RESIST` feedback without flooding text.
- [x] Static review: enemy escape floater now reads `ESCAPE! BASE -1`, alongside the existing finish-lane flash and HUD base-hit message.
- [x] Static review: first successful combat hit now shows a one-time `FIRST HIT` floater.
- [ ] Connecting cables, invalid cable attempts, moving modules, buying/selling modules, output tower placement, and cable pulses feel responsive.
- [ ] Moved, newly bought, starter, output, and save-reloaded rack modules render above decorative sun/mountain art and remain clickable.
- [ ] Between waves, output tower preview pulses/projectiles continue without enemy damage or duplicate live-wave fire.

## Alpha Release Flow

- [ ] Fresh-save QA: reset localStorage, enter w40, place OUT tower, clear w40 wave 1.
- [ ] w60 QA: enter Pulse Orbit, verify wave 1 MIDI/sheet/combat pitch alignment, and confirm missing later audio falls back safely.
- [ ] Mobile portrait QA: touch tower placement, rack scrolling/focus, cable drag, settings, and wave start.
- [ ] Desktop landscape QA: mouse cable drag/reroute, module drag, Fit/Rack/Grid, wheel zoom, settings.
- [ ] Electron startup QA: `run-desktop.bat`, `run-desktop-no-build.bat`, and app title/window.
- [ ] Save migration QA: import or load an older tower save and confirm output tower migration/repair.
- [ ] Performance QA: dense w160/w180 waves with reduced motion off/on and wire opacity at 100%.
- [x] Static performance fix: between-wave preview projectiles are capped so dense always-running preview cannot grow an unbounded visual projectile list.
- [ ] Intentional alpha incompletes are visible in this file before external release.

## Validation

- [x] `npm test` passes.
- [x] `npm run build` passes.

## Private Alpha Readiness

- [ ] Ready for public alpha.
- [x] Ready for private alpha candidate, with manual fresh-save/mobile/audio checks still required before public release.
