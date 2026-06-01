# Manual Test Checklist

Use this checklist when doing a full playtest pass before shipping a build. Check each item manually. Items marked *(regression)* should always be tested.

---

## 1. First Load / Cold Start

- [ ] Game canvas renders at correct aspect ratio
- [ ] HUD shows `HP 100`, `Ore 0`, `Wave 0`, `Radar 1`, `Meta <n>`, `Next 8.0s`
- [ ] Deposit tile is visible (upper-left area)
- [ ] Core tile is visible (center)
- [ ] Debris ring surrounds core with one opening at the left entrance
- [ ] Fog-of-war hides tiles outside the reveal radius
- [ ] Radar ring outline is visible around core
- [ ] Build number watermark is visible bottom-left

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
- [ ] After restart: HP 100 (+ Core Armor), ore reset (+ Ore Start), wave 0, structures cleared
- [ ] Debris ring rebuilt, second entrance closed, Breaker not yet triggered

---

## 13. Meta Upgrades

- [ ] Upgrade panel is visible below the toolbar
- [ ] Three upgrade buttons: Core Armor, Turret Power, Ore Start
- [ ] Buttons show current level (0/3), cost in meta, and stat description
- [ ] Buttons show "MAX" when at level 3
- [ ] Affordable buttons have a blue border; unaffordable buttons are dim
- [ ] Clicking an affordable upgrade deducts meta and increments the level
- [ ] Buying Core Armor immediately increases HP by +20 and raises max HP
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
- [ ] Toolbar buttons are comfortably tappable on mobile
- [ ] Upgrade panel buttons are comfortably tappable on mobile
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
- [ ] Worm spine (brown line) and segment circles render correctly (amber head, dark-orange body)
- [ ] Segment color shifts to red when HP < 50%
