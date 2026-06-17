# Private Alpha Release Candidate Checklist

## Build And Run

- Install dependencies: `npm install`
- Run tests: `npm test`
- Build web bundle: `npm run build`
- Run web/dev server: `npm run dev`
- Run desktop production shell: `npm run desktop`
- Run existing desktop build without rebuilding: `npm run desktop:no-build`
- Run desktop dev shell against the dev server: `npm run desktop:dev`

## Tester Focus

- Fresh save starts at the world map and makes w40 the obvious first world.
- Enter w40, pan/zoom the unified rack plus battlefield scene, drag the OUT tower onto the battlefield, and clear wave 1.
- Buy a module, save/reload, and confirm rack cables and output tower placement re-render.
- Enter w60 and verify wave 1 notation, MIDI/audio loading, and tower firing behavior.
- Use Settings to export save, import a known-good save, reject bad JSON, and reset progress.
- Use How to Play and Report Bug / Feedback without needing external instructions.

## Known Limitations

- This is a private alpha with limited balance coverage beyond the baseline simulator and focused smoke path.
- Later campaign worlds may need content and balance passes after tester feedback.
- Endless scaling is still a follow-up item.
- Boss-phase bespoke visuals are incomplete.
- Real-device mobile portrait testing and pinch/orientation tuning remain incomplete.

## Content Gaps

- Some enemy visuals reuse base note sprites.
- Advanced worlds rely on existing modules and authored waves; no new private-alpha content is added in this pass.
- Some module combinations need better strategy guidance from future tester feedback.

## Audio Gaps

- Browser autoplay policies can keep audio silent until the player clicks/taps in the game.
- w60 wave 1 has explicit MIDI/audio coverage; other waves can fall back to authored score behavior.
- Audio output still needs human listening checks on tester hardware.

## Save Reset

- In-game: Settings -> Reset Progress, then confirm.
- Browser manual reset: clear localStorage key `modsynth-td-save`.
- Corrupt local saves are backed up under keys beginning `modsynth-td-save-corrupt-` before a fresh save starts.

## Bug Report Template

Use Settings or the level HUD `Report` button. It opens a copyable report with:

- version, build label/date, private-alpha label, save schema
- worldId, wave index, runState
- rack module count, cable count, placed output tower count
- browser user agent
- reduced motion, audio unlocked, synth enabled output count
- notes for what happened, expected behavior, and reproduction steps

## Manual Smoke Path

1. Start with a fresh save.
2. Enter w40.
3. Place the OUT tower.
4. Clear w40 wave 1.
5. Buy a module.
6. Save/reload.
7. Enter w60.
8. Verify w60 wave 1 MIDI/audio/notation behavior.
9. Return to the map.
10. Open settings.
11. Export save.
12. Reset save.
