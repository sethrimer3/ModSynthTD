# Manual Test Checklist

Use this checklist when doing a full playtest pass before shipping a build. Check each item manually. Items marked *(regression)* should always be tested.

---

## 1. First Load / Cold Start

- [ ] Game canvas renders as a square playing field
- [ ] HUD appears inside the playing field at the top edge and shows `HP 100/100`, `Ore 0`, `Wave 0`, `Radar 1`, a `Meta <n>` button, and `Next 8.0s`
- [ ] Deposit tile is visible (upper-left area)
- [ ] Core tile is visible (center)
- [ ] Debris ring surrounds core with one opening at the left entrance
- [ ] Fog-of-war hides tiles outside the reveal radius
- [ ] Radar ring outline is visible around core
- [ ] Build number watermark is visible bottom-left
- [ ] `run-desktop.bat` builds and launches the game in an Electron window
- [ ] `run-desktop-dev.bat` launches Electron against the Webpack dev server and opens DevTools
- [ ] `run-desktop-no-build.bat` launches the existing `dist` build without rebuilding

---

## 2. Tool Selection *(regression)*

- [ ] Clicking Wall / W / 1 selects Wall tool
- [ ] Clicking Turret / T / 2 selects Turret tool
- [ ] Clicking Radar / R / 3 selects Radar tool
- [ ] Clicking Erase / E / 4 selects Erase tool
- [ ] Active tool button highlights with colored border
- [ ] Hovering the canvas shows a ghost tile under cursor
- [ ] Erase tool shows red ghost; other tools show blue ghost
- [ ] Blueprint ghost shows green highlight when hovering a rebuild target

---

## 3. Building *(regression)*

- [ ] Wall can be placed on empty ground tiles (free)
- [ ] Wall cannot be placed on debris, core, or deposit tiles
- [ ] Wall cannot be placed if it completely blocks the entrance path
- [ ] Turret costs 12 ore; placement refused with "NEED ORE" if insufficient
- [ ] Radar costs 25 ore; placement refused with "NEED ORE" if insufficient
- [ ] Placing radar increments Radar level and expands reveal radius
- [ ] Erase removes a structure; no blueprint ghost left
- [ ] Drag-placing works (click and hold to paint walls along a drag path)

---

## 4. Ore Motes *(regression)*

- [ ] Gold motes spawn near deposit and travel to core
- [ ] Ore counter increments as motes arrive at core
- [ ] Dotted route line from deposit to core is visible

---

## 5. Second Ore Deposit

- [ ] Deposit 2 tile is NOT visible at radar level 1 (reveal radius 5)
- [ ] After placing one radar (reveal radius 6), deposit 2 tile appears
- [ ] Orange motes spawn from deposit 2 and travel to core
- [ ] Ore counter increments from both deposits
- [ ] If the radar is destroyed and reveal radius drops below 6, deposit 2 motes stop

---

## 6. Turret Range Preview

- [ ] With turret tool selected, hovering shows a dashed circle around the cursor
- [ ] Circle radius matches turret attack range (4.5 tiles)
- [ ] Preview is not drawn when hovering outside the visible area or off canvas

---

## 7. Grid Lines

- [ ] Faint grid lines appear over the canvas when the pointer enters the canvas
- [ ] Grid lines disappear when the pointer leaves the canvas

---

## 8. Enemies and Waves *(regression)*

- [ ] Enemies spawn from the entrance after the wave timer reaches 0
- [ ] Enemies path toward the core (avoiding walls and debris)
- [ ] Enemies chip away at adjacent walls (HP bar appears on damaged walls)
- [ ] Turret targets nearest enemy in range and fires a beam
- [ ] Enemies killed by turrets increment ore by 2
- [ ] Wave number increments each wave
- [ ] Wave overlay ("WAVE N") appears briefly at wave start
- [ ] Next-wave timer counts down and shows red when < 2s

---

## 9. Core Damage *(regression)*

- [ ] Enemy reaching the core reduces HP by 8
- [ ] Core tile color changes: green → yellow → red as HP drops
- [ ] HP span color changes to match
- [ ] Reaching 0 HP triggers GAME OVER

---

## 10. Breaker and Breach *(regression)*

- [ ] Wave 5 or later spawns a pink/magenta Breaker enemy
- [ ] Breaker moves toward the debris tile at `breakerTargetTile` (top of core ring)
- [ ] Breaker destroys the target debris tile on arrival
- [ ] "BREACH!" overlay appears in pink
- [ ] After breach, second entrance (top edge) starts spawning enemies from wave 7+
- [ ] Breach is permanent — does not reset between waves

---

## 11. Blueprint Ghosts and Rebuild *(regression)*

- [ ] When a turret or radar is destroyed by enemies, a faint ghost outline remains
- [ ] Hovering the ghost tile with matching tool type shows green ghost
- [ ] Building on a ghost tile uses the rebuild cost (half price)
- [ ] Wall ghosts do NOT appear (walls are free, no ghost needed) — verify cost is 0

---

## 12. Game Over and Restart *(regression)*

- [ ] GAME OVER overlay appears in red with wave count, elapsed time, meta earned
- [ ] Game auto-restarts after ~3 seconds
- [ ] Meta currency is added to persistent total on game over
- [ ] After restart: HP 100/100 (or 120/120 etc. with Core Armor), ore reset (+ Ore Start), wave 0, structures cleared
- [ ] Debris ring rebuilt, second entrance closed, Breaker not yet triggered

---

## 13. Meta Upgrades

- [ ] Upgrade panel is hidden during normal play
- [ ] Clicking the in-field `Meta <n>` button hides the playing field and opens the meta upgrades menu
- [ ] Clicking `Back to Base` returns to the playing field
- [ ] Three upgrade buttons: Core Armor, Turret Power, Ore Start
- [ ] Buttons show current level (0/3), cost in meta, and stat description
- [ ] Buttons show "MAX" when at level 3
- [ ] Affordable buttons have a blue border; unaffordable buttons are dim
- [ ] Clicking an affordable upgrade deducts meta and increments the level
- [ ] Buying Core Armor immediately increases HP by +20, raises max HP, and HUD shows new current/max (e.g. `HP 120/120`)
- [ ] Buying Ore Start immediately adds +30 ore
- [ ] Turret Power bonus is visible in enemy kill speed (harder to observe precisely)
- [ ] "NEED META ◆" overlay appears when clicking an unaffordable upgrade mid-run
- [ ] Upgrade levels persist after browser refresh (stored in localStorage)

---

## 14. Persistence

- [ ] Meta currency persists across page refreshes
- [ ] Upgrade levels persist across page refreshes
- [ ] Clearing localStorage resets both to 0

---

## 15. Responsive Layout

- [ ] Canvas fills width on narrow mobile screens
- [ ] Canvas remains square on narrow mobile screens
- [ ] Toolbar buttons are comfortably tappable on mobile
- [ ] Meta menu and upgrade buttons are comfortably tappable on mobile
- [ ] No horizontal overflow

---

## 16. Worm Enemy

- [ ] First worm spawns at wave 2 from the main entrance
- [ ] Worm head follows BFS path toward the core
- [ ] Body segments trail the head with smooth chain-constraint movement
- [ ] Turrets can target and shoot worm segments (beam flash visible)
- [ ] Killing a middle segment splits the worm into two fragments
- [ ] Fragment with ≥ 3 segments continues moving; fragment with < 3 is removed
- [ ] Each killed segment awards 1 ore
- [ ] Worm head reaching the core deals 6 damage and removes the worm
- [ ] Core drops to 0 HP from worm → game over flow triggers normally
- [ ] `worms = []` on run reset: no worms visible after game-over restart
- [ ] Worm body renders as a smooth curved skin (quadratic bezier, rounded, brown/dark-orange)
- [ ] Amber head circle visible on top of body skin; dark-orange body circles show below
- [ ] Segment HP circles shift to red when HP < 50%
- [ ] Two tiny eye pixels on the head, oriented toward movement direction

---

## 17. Turret Charge Bar

- [ ] Each placed turret shows a 1-pixel charge bar at its top edge
- [ ] Bar shows full (bright cyan) when turret is ready to fire
- [ ] Bar empties (dim) immediately after a shot, then refills over ~0.35 s
- [ ] Bar shows full during the initial 3-second pre-wave delay

---

## 18. HUD Improvements

- [ ] HP display shows `HP current/max` (e.g. `HP 100/100` at start, `HP 120/120` with Core Armor Lv 1)
- [ ] HP color threshold is proportional to max HP (at HP=80 with max=160, color should be yellow, not green)
- [ ] Wave counter shows enemy/worm count when threats are active (e.g. `Wave 3 · 5`)
- [ ] Enemy count disappears between waves when no threats are on the board

---

## 19. Post-Breach Worm (Second Entrance)

- [ ] After breach, a worm spawns from the second (top) entrance on the first eligible wave (wave 7) and every other wave thereafter
- [ ] Worm head enters from the top and paths to the core via BFS
- [ ] Second-entrance worm is smaller (≤ 10 segments) than the main-entrance worm
- [ ] If breach has not occurred, no worm spawns from the second entrance

---

## 20. Core Damage Pulse

- [ ] When core HP drops to ≤ 30% of max, the core tile pulses with a red overlay
- [ ] Pulse rate is visibly fast (approximately 4 Hz)
- [ ] Pulse stops / is not visible when HP is above 30% threshold
- [ ] Pulse does not appear on the game-over screen (suppressed when run is over)

---

## 22. Conveyor Direction Preview Ghost *(new in build 15)*

- [ ] With Conveyor, Extractor, or Splitter tool selected, hovering any tile shows a direction arrow in the ghost overlay
- [ ] Arrow matches the current placement direction (East/South/West/North)
- [ ] Pressing Q rotates the direction; the ghost arrow updates immediately
- [ ] Status bar shows `Dir [→] · Q: rotate` (direction symbol reflects current dir)
- [ ] Status bar also shows cost when hovering a valid placement tile
- [ ] Status bar shows direction hint even when the pointer is not over the canvas

---

## 23. Breaker Warning and Breach Flash *(new in build 15)*

- [ ] When the Breaker is within ~6 tiles of the target debris tile, that tile pulses with a magenta glow
- [ ] Glow pulses continuously until breach occurs
- [ ] On breach, a full-screen magenta flash appears and quickly fades over ~0.65 s
- [ ] BREACH! overlay appears at the same time (pink text, 4-second duration)
- [ ] Warning glow and flash reset when the run resets (game over → restart)

---

## 24. Enemy Approach Warning at Second Entrance *(new in build 15)*

- [ ] After breach opens, a pulsing red downward arrow appears at the top of the grid above the second entrance tile
- [ ] Arrow pulses continuously while breach is open and the run is active
- [ ] Arrow disappears when the run ends

---

## 25. Day/Night Lighting *(new in build 18)*

- [ ] Normal day/night cycle remains one full cycle per 3600 seconds
- [ ] `[` and `]` jump the lighting clock backward/forward by 5 minutes and append time to the build watermark
- [ ] `\` toggles fast day/night preview and appends `FAST` to the build watermark
- [ ] Shadows rotate/change direction as the clock advances
- [ ] Shadows are shortest near noon and longest near sunrise/sunset
- [ ] Shadows and lights do not reveal radar-hidden tiles
- [ ] Sunrise and sunset add a warm tint with subtle directional beams
- [ ] Night is dark with no moonlight wash
- [ ] Core and placed buildings visibly glow through night darkness
- [ ] Canvas warning overlays, build watermark, and DOM HUD remain readable after the darkness pass

