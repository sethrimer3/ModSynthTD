# QA Status

Manual alpha checklist for the first-playable onboarding pass.

## Fresh Save Flow

- [ ] Clear/reset save data and launch the app.
- [ ] Enter w40 from the world map.
- [ ] New player can identify the rack, battlefield, next-wave score, Patch Analysis, Shop, and Start Wave without external instructions.
- [ ] Tutorial prompts teach CLOCK -> OSC -> OUT, OUT tower placement, score preview, and Start Wave without a long modal.
- [ ] Complete w40 wave 1 with the starter patch and placed OUT tower.
- [ ] Confirm Resonance reward appears and the next unlock/reward state is understandable.

## Early Progression

- [ ] Buy the first affordable/unlocked module from the Shop.
- [ ] Unaffordable but unlocked modules explain the Resonance cost.
- [ ] Place or reposition the OUT tower from its rack silhouette.
- [ ] Clear w60 wave 1 and confirm Hz/note matching is readable in Patch Analysis and note hover popups.

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
- [ ] Settings audio toggles and volume sliders apply live.
- [ ] Reduced motion keeps notation, tower placement, and combat feedback understandable.

## Validation

- [ ] `npm test` passes.
- [ ] `npm run build` passes.
