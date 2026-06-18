# ModSynth TD Tester README

ModSynth TD is a private-alpha modular-synth tower defense game. Build a small signal rack, drag each OUT tower onto the battlefield, and tune CLOCK -> OSC -> OUT patches so exact or near frequency hits clear enemy waves.

## Private Alpha

This build is unfinished and meant for feedback. Saves may reset between versions, balance is still moving, and some audio/visual polish is incomplete.

## Run The Web Build

1. Open the shared web build folder.
2. Open `index.html` in a browser.
3. If the browser blocks local files, start any local static server from that folder and open the local URL.

If you are testing from this repo instead of a shared build:

```powershell
npm install
npm run build
```

Then open `dist/index.html`, or serve the `dist/` folder with your preferred static-file server.

Share the entire `dist/` folder for web testers. It contains `index.html`, the bundled JavaScript, and copied asset files.

## Run The Desktop Build

From the repo folder, double-click:

- `run-desktop.bat` to build and launch the desktop app.
- `run-desktop-no-build.bat` to launch the already-built `dist/` output.
- `run-desktop-dev.bat` only for development testing.

For a desktop tester drop, share the repo folder with `dist/`, `electron/`, `ASSETS/`, `package.json`, `package-lock.json`, `node_modules/`, and the `run-desktop*.bat` launchers. This repo does not currently define a packaged installer.

## Reset Progress

Open `Settings`, choose `RESET PROGRESS`, then click the confirmation button.

## Export A Save

Open `Settings`, choose `EXPORT SAVE`, and attach the downloaded JSON file to the bug report if it helps reproduce the issue.

## Report Bugs

Open `Settings` or the level HUD, choose `Report Bug / Feedback`, click `COPY`, and paste the report into the tester feedback thread. No telemetry is sent.

Include:

- What happened.
- What you expected.
- Steps to reproduce.
- A save export when the bug depends on progress.

## First Things To Test

1. Fresh save launch.
2. Enter `w40 First Signal`.
3. Pan/zoom between the rack and battlefield.
4. Drag the OUT tower onto the battlefield.
5. Verify `CLOCK -> OSC -> OUT`.
6. Start wave 1.
7. Watch for exact, near, and resisted hit feedback.
8. Earn Resonance.
9. Open Shop and buy or inspect a module.
10. Enter `w60 Pulse Orbit` and check wave 1 audio/MIDI/notation behavior.

## Known Limitations

- Audio coverage is incomplete.
- Mobile layout is still being tested.
- Some visual polish is unfinished.
- Advanced worlds may be underbalanced or overbalanced.
- Browser autoplay restrictions may keep audio silent until a click or tap.
- Save migration should work but needs more tester coverage.
