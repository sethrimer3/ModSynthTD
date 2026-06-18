# Tester Smoke Test

Use this checklist before sending a build to outside testers.

- [ ] Fresh save launch.
- [ ] w40 entry.
- [ ] OUT tower placement.
- [ ] w40 wave 1 clear.
- [ ] Reward received.
- [ ] Shop opened.
- [ ] Module bought.
- [ ] Save/reload preserves progress.
- [ ] w60 entry.
- [ ] w60 wave 1 audio/MIDI/notation check.
- [ ] Settings opened.
- [ ] Bug report copied.
- [ ] Save exported.
- [ ] Reset progress.

## Release Artifact Notes

Web build: share the full `dist/` folder after `npm run build`.

Desktop build: share the repo folder with `dist/`, `electron/`, `ASSETS/`, `package.json`, `package-lock.json`, `node_modules/`, and `run-desktop.bat` / `run-desktop-no-build.bat`. The current desktop path is an Electron shell, not an installer package.
