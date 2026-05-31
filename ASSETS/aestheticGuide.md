# Equatoria Idle — Aesthetic Guide

## Gold Accent Color

The game uses a single gold accent color for borders, text highlights, active states, and UI glow effects.

| Role        | Old Color           | New Color           |
|-------------|---------------------|---------------------|
| Primary     | `#c9a84c`           | `#fff172`           |
| RGB         | `rgb(201, 168, 76)` | `rgb(255, 241, 114)`|

### Usage Notes
- The CSS variable `--accent` holds the primary accent hex value.
- `--accent-glow` is the accent with `0.3` alpha, used for glow/shadow effects.
- `--accent-border` is the accent with `0.2` alpha, used for border tints.
- All inline rgba() occurrences in CSS and TypeScript use the same RGB base: `255, 241, 114`.
- The slider glow in the settings panel also derives from this color:
  - Dark end (0% value): `rgb(100, 95, 45)` (approximately 39% brightness)
  - Bright end (100% value): `rgb(255, 241, 114)` (= `#fff172`)

---

## Page Break Sprites

Two page-break decorative dividers are used throughout the menu UI.

| Sprite                 | Path                                             | Placement                                    |
|------------------------|--------------------------------------------------|----------------------------------------------|
| `pageBreak_large.png`  | `ASSETS/SPRITES/menuElements/pageBreak_large.png` | Top of every scrollable menu panel           |
| `pageBreak_small.png`  | `ASSETS/SPRITES/menuElements/pageBreak_small.png` | Bottom of every section within a menu panel  |

---

## Tab Icon Sprites

Each tab in the bottom navigation bar has three icon states.
The Upgrades tab additionally has a 36-frame animation sequence.

### Icon Paths

| Tab           | Normal                                                             | Hover                                                              | Selected                                                              |
|---------------|--------------------------------------------------------------------|--------------------------------------------------------------------|-----------------------------------------------------------------------|
| Equation      | `ASSETS/SPRITES/menuElements/icons/equationTab/equationTab_icon.png`     | `…/equationTab_icon_hover.png`     | `…/equationTab_icon_selected.png`     |
| Upgrades      | `ASSETS/SPRITES/menuElements/icons/upgradesTab/upgradesTab_icon.png`     | *(animation frame 1)*              | `…/upgradesTab_icon_selected.png`     |
| RPG           | `ASSETS/SPRITES/menuElements/icons/rpgTab/rpgTab_icon.png`               | `…/rpgTab_icon_hover.png`          | `…/rpgTab_icon_selected.png`          |
| Achievements  | `ASSETS/SPRITES/menuElements/icons/achievementsTab/achievementsTab_icon.png` | `…/achievementsTab_icon_hover.png` | `…/achievementsTab_icon_selected.png` |
| Settings      | `ASSETS/SPRITES/menuElements/icons/settingsTab/settingsTab_icon.png`     | `…/settingsTab_icon_hover.png`     | `…/settingsTab_icon_selected.png`     |

### Upgrades Tab Animation

Animation frames are stored in:
`ASSETS/SPRITES/menuElements/icons/upgradesTab/upgradesTabAnimation/upgradesTabAnimation_frame_ (N).png`

where N ranges from 1 to 36.

- **Frame 1** visually matches the normal (idle) state.
- **Frame 36** visually matches the selected state.
- The animation plays **forward** (1 → 36) when the tab is hovered or selected.
- The animation plays **backward** (36 → 1) when the tab is neither hovered nor selected.
- If interrupted mid-animation, playback reverses from the current frame.
- Total forward/backward duration: ~400 ms.
