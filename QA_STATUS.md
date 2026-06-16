# Alpha QA Status

Date: 2026-06-16

## Automated Status

- `npm test`: passing, 125 tests.
- `npm run build`: passing; Webpack reports bundle-size warnings only.
- Headless balance simulation: covered by `src/v2/tests/sim.test.ts` and prints profile/world summaries during `npm test`.

## Known Incomplete Systems

- Campaign balance is diagnostic, not final. Several non-tutorial worlds still fail under simple profiles, which is expected until a content balance pass.
- Endless-mode scaling is still follow-up work.
- Boss-specific presentation for `w200` remains incomplete.
- Mobile pinch/orientation behavior still needs real-device testing.

## Known Content Gaps

- Level audio coverage is intentionally partial. `w60` has wave 1 OGG/MIDI coverage; later `w60` waves and other worlds fall back to authored wave scores and default audio behavior.
- Some enemy sprite identities still reuse base note sprites.
- Audio output quality has not been manually captured in this environment.

## Manual Alpha QA Steps

- Fresh save: clear localStorage, load the app, confirm starter rack, world map, settings defaults, tutorial prompts, and visible tower placement.
- `w40`: place the starter output tower, run waves 1-2, confirm clears, Resonance rewards, wave replay no double-claim, and no missing-output warning.
- `w60`: start wave 1, confirm MIDI-derived notation/spawns match audible synth pitch when synth is enabled, then confirm later waves fall back safely to authored waves.
- Shop: buy and sell unlocked modules, buy/refund shelves, confirm no Resonance gain from loops and starter modules remain protected.
- Multi-output tower placement: buy an extra OUT, patch it, place both towers, run a wave, save/load, confirm both placements persist; sell the purchased OUT and confirm its tower disappears.
- Settings: test audio mixer sliders, synth toggle, wire layer, wire opacity, reduced motion, zoom sensitivity, save export/import, and reset.
- Save/load: reload after wave progress, module purchases, shelf changes, tower placement, and settings changes.
- Electron startup: run `run-desktop.bat`, `run-desktop-dev.bat`, and `run-desktop-no-build.bat`; confirm title, app render, and no startup console errors.
