# Architecture Overview

Working title: **Neon Mote Defense**

This document describes the current system structure and data flow for the prototype. It should be updated whenever systems are significantly changed.

---

## 1. Technology Stack

| Concern | Technology |
|---|---|
| Language | TypeScript (strict mode) |
| Build | Webpack 5 |
| Desktop shell | Electron |
| Rendering | HTML5 Canvas 2D |
| Persistence | `localStorage` |
| Styling | CSS (single flat file) |

Commands:
- `npm run build` — production bundle
- `npm run dev` — watch mode local dev server

- `npm run desktop` - build production bundle, then launch Electron from `dist/index.html`
- `npm run desktop:dev` - launch Electron against the Webpack dev server URL
- `npm run desktop:no-build` - launch Electron against the existing `dist/index.html`

---

## 2. Module Structure

The prototype is currently a single-module design (one `game.ts` file). As complexity grows, systems should be separated into their own modules.

```
src/
  main.ts         — entry point, imports game and CSS
  game.ts         — all game systems (monolithic prototype)
  styles.css      — all UI styles
```

Desktop runtime:
- `electron/main.cjs` - Electron main process and BrowserWindow setup.
- `run-desktop.bat` builds, then launches Electron.
- `run-desktop-dev.bat` starts the Webpack dev server in a separate terminal, then launches Electron with DevTools.
- `run-desktop-no-build.bat` launches the existing `dist` bundle without rebuilding.

---

## 3. System Overview

### 3.1 Constants and Configuration

All tuning values are `const` declarations at the top of `game.ts`. Structure costs, damage values, spawn rates, and radar thresholds are named constants so they can be changed without searching for magic numbers.

Key constants:
- `tileSizePx` — native pixel size of one build tile (12)
- `gridWidthTile` / `gridHeightTile` — board dimensions (20 x 20)
- `coreTile`, `depositTile`, `deposit2Tile` — fixed positions
- `turretRangeTile` — turret attack range in tiles
- `TURRET_FIRE_COOLDOWN_SEC` — turret fire cycle duration (0.35 s)
- `META_UPGRADE_CONFIGS` — upgrade label, cost, cap, and stat formula
- `coreHpDamagedThreshold` — HP fraction (30%) below which the core pulses red

### 3.2 Game State

Top-level mutable state is declared as `let` at module level:

| Variable | Type | Purpose |
|---|---|---|
| `ore` | number | Local run currency |
| `totalOreEarned` | number | Cumulative ore earned this run (for ore/s rate display) |
| `metaCurrency` | number | Persistent prestige currency |
| `upgradeLevel` | Record | Purchased permanent upgrade levels |
| `coreHp` | number | Current core health |
| `waveIndex` | number | Current wave number |
| `radarLevel` | number | Current radar expansion count |
| `revealRadiusTile` | number | Fog-of-war reveal radius |
| `enemies` | Enemy[] | Active enemy list |
| `motes` | Mote[] | Ore motes from deposit 1 |
| `motes2` | Mote[] | Ore motes from deposit 2 |
| `worms` | Worm[] | Active worm enemy list |
| `structures` | Structure[] | Flat tile-index array of placed structures |
| `terrainIsDebris` | boolean[] | Flat tile-index array of debris tiles |
| `structureHp` | Map<number, number> | HP per placed structure (by tile index) |
| `blueprintGhosts` | Map<number, Structure> | Destroyed structure ghosts for rebuilding |
| `distanceField` | Int16Array | BFS distance from core, recomputed on structural change |
| `turretAngleRad` | Map<number, number> | Last firing angle per turret tile |
| `environment` | EnvironmentState | Day/night time accumulator and disabled-by-default weather scaffold |

### 3.3 Persistence

Two `localStorage` keys:
- `tiny-base-idle-meta` — meta currency total (number)
- `tiny-base-idle-upg` — upgrade levels (JSON object)

### 3.4 Terrain

`buildStarterTerrain()` sets up the initial debris ring around the core with one open entrance at `entranceTile`. Terrain is stored as a flat boolean array indexed by `tileIndex(x, y)`.

### 3.5 Pathfinding

Enemies use a BFS distance field computed from the core outward (`computeDistanceField()`). The field is recomputed whenever a structure is placed or destroyed. Enemies step toward the neighbor with the lowest distance value each frame.

The Breaker enemy bypasses the distance field and moves directly toward `breakerTargetTile` (a debris tile near the top of the base). When it arrives, it clears that debris tile and opens the second entrance.

### 3.6 Game Loop

```
requestAnimationFrame
  └─ update(dtSec)
       ├─ updateEnemies(dtSec)
       ├─ updateWorms(dtSec)
       ├─ updateTurrets(dtSec)
       └─ updateMotes(dtSec)
  └─ render()
       ├─ draw terrain and structures
       ├─ draw grid lines (during hover)
       ├─ draw deposits and motes
       ├─ draw enemies and shot flashes
       ├─ draw worm enemies
       ├─ draw hover ghost and turret range preview
       ├─ draw overlays (WAVE, BREACH, GAME OVER)
       └─ update HUD spans and upgrade panel
```

Time step is capped at `Math.min(0.05, dt)` to prevent large jumps.

### 3.7 Mote System

Motes represent ore particles traveling from a deposit to the core. Each mote has a `progress` value from 0 to 1. Position is linearly interpolated from deposit to core in the render step.

- `motes` — deposit 1 (upper-left, always visible)
- `motes2` — deposit 2 (lower-right, revealed at `revealRadiusTile >= 6`)

Both deliver 1 ore on arrival and are removed from the array.

### 3.8 Radar and Fog

`isTileVisible(x, y)` returns true when a tile is within `revealRadiusTile` distance from the core. Unexplored tiles are rendered as near-black. Radar buildings increment `radarLevel` and `revealRadiusTile` up to a maximum.

### 3.9 Meta Upgrade System

Three persistent upgrades are stored in `upgradeLevel` and persisted to `localStorage`. Each has 3 levels:

| Key | Effect per level |
|---|---|
| `coreArmor` | +20 max core HP |
| `turretPower` | +3 turret damage per shot |
| `oreBonus` | +30 starting ore each run |

Upgrades are purchased via `buyUpgrade()` which costs meta currency, applies the effect immediately to the current run, saves state, and refreshes the upgrade panel UI.

---

## 4. Rendering

The canvas renders at native resolution (240 x 240 pixels for a 20 x 20 grid at 12 px/tile). The CSS `image-rendering: pixelated` scales it up to fill its square field container.

The HUD is DOM rendered over the top-left and top-right of the square playing field. The meta currency is a HUD button; activating it hides the playing field and opens the separate meta upgrade menu.

Draw order per frame:
1. Background clear
2. Weather background scaffold (currently no-op while clear)
3. Terrain tiles (debris, ground, unexplored fog)
4. Blueprint ghosts
5. Structures (wall, turret, radar, logistics, production, repair)
6. Structure HP bars
7. Directional tile shadows and dawn/dusk sunbeams
8. Core tile (with pulsing red overlay when critically damaged)
9. Deposits, resource motes, route rings, grid/range previews, shot flashes, enemies, worms, and hover ghost
10. Daylight/sunset tint and night darkness
11. Masked local building/core night glows clipped to visible radar tiles
12. Weather foreground scaffold (currently no-op while clear)
13. Canvas overlays (breach warnings, wave text, game over)
14. Build number watermark and optional day/night debug time
15. HUD span updates (ore shows rate `/s` after 4 s elapsed) + upgrade panel state update
16. Status bar update (cost hint for turret/radar; erase target name; repair cost)

---

## 5. Input

Mouse and touch input is handled via `pointerdown`, `pointermove`, `pointerup`, and `pointercancel` events on the canvas. Pointer capture is used to support drag-placing structures.

Keyboard shortcuts are handled via `keydown` on `window`. Keys `w/1`, `t/2`, `r/3`, `e/4`, `f/5` select tools. `[` and `]` jump the day/night clock backward/forward by 5 minutes for visual testing, and `\` toggles a fast day/night preview; normal play remains one 3600-second cycle.

---

## 6. Future Architecture Notes

When these systems grow enough to warrant separation:

- Extract `terrain.ts` — terrain generation, debris state, BFS distance field
- Extract `enemies.ts` — enemy types, wave spawning, pathfinding update
- Extract `motes.ts` — particle simulation, deposit management
- Extract `upgrades.ts` — meta upgrade definitions, purchase logic, persistence
- Extract `renderer.ts` — all canvas draw calls
- Extract `hud.ts` — DOM update logic
- Extract `input.ts` — input event handling and tool selection
