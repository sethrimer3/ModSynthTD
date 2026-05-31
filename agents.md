# AI Agent Guidelines for Equatoria Idle

## ⚡ Build Number Requirement

**Every time you make a code change or prepare a pull request, increment the build number in `src/buildInfo.ts` by 1.**

The `BUILD_NUMBER` constant in that file is the single source of truth. The Settings tab displays it as "Build #N". Do not skip this step unless the change is documentation-only and the user explicitly says not to bump the build number.

```ts
// src/buildInfo.ts
export const BUILD_NUMBER = N;  // ← increment this by 1
```

---

## Required TypeScript / Build Discipline

Before completing any PR, run the repository's validation commands, including:

- `npm install` if dependencies are missing
- `npm run typecheck` if available
- `npm run build`

A PR is not complete unless the TypeScript check and production build pass.

If TypeScript errors appear:

1. Fix all TypeScript errors caused by the current change.
2. Fix pre-existing TypeScript errors when they are small, obviously safe, or directly blocking the build/deploy.
3. Do not ignore TypeScript errors just because they came from an earlier PR.
4. Do not perform large unrelated rewrites just to clear old errors unless they are necessary for the requested task.
5. If old TypeScript errors remain and are too risky or broad to fix within the PR, document them clearly in `nextSteps.md` with:
   - the exact command that failed
   - the exact error message
   - the file and line number
   - the likely cause
   - a recommended fix

Never claim the task is complete if the build is failing.

## GitHub Pages Deployment Rule

Because this project deploys to GitHub Pages, the final implementation must preserve a passing production build. Any change that prevents `npm run build` from completing successfully should be treated as incomplete.

If the requested feature works locally but the production build fails, prioritize fixing the build before adding more features.

---

This document defines the required standards for AI coding agents working on the Equatoria Idle repository.

The project is a mobile-first idle game written in **HTML + CSS + TypeScript**. It uses a **low native internal resolution** that is then upscaled for display, creating a slightly pixelated look while preserving crisp UI and readable math notation. The game must work well on both **mobile and desktop**, in both **portrait and landscape**, with responsive layouts and clean scaling behavior.

The core gameplay has two major simulation pillars:

1. **Equation progression**
   - The player upgrades visible parts of a mathematical equation on screen
   - Tapping the equation and automated systems generate resources
   - Equation segments are color-tiered and become progressively more complex

2. **Gem particle simulation**
   - Taps emit gem-like particles
   - Particles move visually through the scene, bounce, trail, and get drawn into a forge
   - The forge refines them into actual resources called **Motes**

These guidelines exist to protect:
- correctness
- performance
- readability
- maintainability
- visual consistency
- clean separation of responsibilities

---

## 1. Core Architectural Rule: Hard Separation of Systems

The repository must maintain a strong separation between the following layers:

- **sim/**: game rules, resource generation, progression logic, timers, unlocks
- **render/**: canvas rendering, visual particles, trails, equation display, screen effects
- **ui/**: DOM-based menus, buttons, tabs, overlays, settings panels
- **input/**: tap, click, drag, keyboard, gesture translation into actions
- **audio/**: sound and music playback only
- **data/**: upgrade definitions, color tiers, formulas, balancing constants
- **math-render/** or equivalent: formula formatting, expression layout, notation helpers
- **app/** or root orchestration layer: bootstrapping, screen lifecycle, wiring systems together

### Non-negotiable rules
- `sim/` must not depend on DOM APIs
- `sim/` must not depend on rendering code
- `sim/` must not depend on CSS, layout state, or audio
- `render/` must not mutate authoritative simulation state
- `ui/` must not contain core progression logic
- `input/` must translate player intent into actions, not directly rewrite arbitrary game state

Keep game logic independent from presentation whenever reasonably possible.

---

## 2. Platform and Product Priorities

Equatoria Idle is **mobile-first**, but must also feel good on desktop.

### Required priorities
1. **Mobile usability first**
2. **Responsive layout across aspect ratios**
3. **Crisp low-resolution visual identity**
4. **Readable mathematical expressions**
5. **Smooth performance on modest hardware**
6. **Clear agent-written code that future agents can safely extend**

### Practical implications
- UI must scale cleanly on phones and tablets
- Bottom tab navigation must always remain comfortable to tap
- Important controls must never rely on hover
- Desktop should support mouse input naturally without becoming a separate code path unless necessary
- Portrait and landscape should both function without layout breakage

---

## 3. Visual Scaling and Pixel Rendering Rules

The game renders at a **lower internal resolution** and is then upscaled. The upscale factor may effectively appear like 2x, 3x, 4x, or similar depending on platform and viewport.

### Rules
- Treat the internal game resolution as a deliberate artistic coordinate space
- Preserve crisp scaling whenever possible
- Avoid blurry canvas presentation unless explicitly desired for a specific effect
- Keep pixel-style visuals stable across resize events
- Do not mix “pixel world rendering” and “high-DPI UI rendering” carelessly

### Recommended approach
- Render the main simulation to a low-resolution canvas or internal surface
- Upscale the simulation output for display
- Keep DOM UI readable and responsive at device resolution
- If separate rendering layers are used, clearly distinguish:
  - low-resolution simulation visuals
  - high-resolution UI overlays

### Do not
- hardcode layout around one phone size
- assume landscape only
- let equation text become blurry due to careless CSS scaling
- stretch the canvas independently in X and Y unless that is a deliberate, documented choice

---

## 4. Math Rendering Is a First-Class System

The equation is the centerpiece of the game. It must be visually clean, understandable, and extensible.

### Requirements
- Equation rendering must be treated as a dedicated concern, not an afterthought
- Expressions must remain legible on small screens
- Color-coded segments must be consistent and semantically meaningful
- Layout must handle increasingly complex expressions without collapsing into unreadable clutter

### Agent rules
- Prefer structured expression models over ad hoc string concatenation for complex formulas
- Separate:
  - expression data
  - formatting logic
  - visual rendering logic
- Build with future complexity in mind:
  - addition
  - multiplication
  - exponents
  - function notation
  - nested expressions
  - secret late-game tiers

### Recommended model
Represent equations as structured expression trees or typed segments rather than raw strings where possible.

Example conceptual types:
- `ConstantExpression`
- `BinaryExpression`
- `PowerExpression`
- `FunctionExpression`
- `TierSegment`
- `EquationViewModel`

This improves readability, extensibility, testing, and color-tier rendering.

---

## 5. Color Tier System Rules

The equation uses a rainbow-style progression with 7 visible tiers and secret 8th and 9th tiers.

### Requirements
- Tier identity must be consistent across:
  - equation rendering
  - resources
  - upgrades
  - particles
  - Mote refinement
  - UI indicators
- Tier order must be treated as canonical
- Avoid magic strings repeated throughout the codebase

### Define a single source of truth
Use one canonical data definition for tiers, such as:
- id
- displayName
- color
- unlockOrder
- visibility
- associated resource type
- associated equation role

### Do not
- scatter tier colors across unrelated files
- encode tier logic only in UI text
- hardcode special cases in several places without documenting them

---

## 6. Resource Model and Progression Rules

Current working terminology:
- raw emitted gem particles are visual carriers
- refined resources are called **Motes**
- total score is based on the combined refined resources across colors

### Design expectations
Agents must preserve a clean distinction between:
- visual particle entities
- raw collectible or transit state
- refined Mote totals
- score computation
- unlock and upgrade effects

### Rules
- Do not make visual particles themselves the sole source of truth for economic state unless explicitly designed that way
- Keep authoritative resource totals in simulation state
- Treat score calculations as deterministic and inspectable
- Avoid hidden side effects in UI or rendering code

### Important
Because the total score is the product of tiered refined resources, scaling can become extreme. Agents must implement number systems carefully and document their approach.

Possible approaches:
- big number library
- custom scientific notation layer
- logarithmic helper model for display and comparisons

Whichever approach is used, document it in `DECISIONS.md`.

---

## 7. Particle Simulation Rules

Gem particles are important visually and thematically, but must not compromise performance or code clarity.

### Particle expectations
- emitted when equation is tapped or auto-triggered
- move through the scene
- leave trails
- bounce off boundaries and relevant objects
- can be drawn toward the forge
- visually reinforce resource generation

### Required separation
If practical, distinguish between:
- **authoritative gameplay state**
- **visual particle representation**

Not every screen particle needs to be authoritative simulation state. Agents should choose the lightest architecture that preserves intended gameplay behavior.

### Performance rules
- avoid per-frame garbage in hot loops
- pool particle objects or use packed arrays where helpful
- avoid frequent allocation of trail arrays in active paths
- precompute repeated values where reasonable
- use explicit lifecycle management for particles

### Do not
- create hundreds of new objects every frame in core loops
- use expensive DOM operations for particle motion
- tie particle counts directly to unbounded late-game resource values without caps, batching, or abstraction

---

## 8. UI and Responsive Layout Rules

The game has three bottom tabs:
1. Equation simulation and equation upgrades
2. Resources and special upgrades
3. Settings, credits, visual options, sound options, Discord invitation

### Requirements
- Bottom navigation must remain clear and tappable on phones
- Layout must adapt gracefully to portrait and landscape
- Menus and buttons must scale cleanly to screen size
- Important gameplay information must remain accessible without awkward nesting

### Agent rules
- Use responsive layout systems, not brittle pixel-perfect DOM assumptions
- Prefer CSS variables, layout tokens, and reusable component classes
- Preserve large tap targets
- Avoid hover-only interactions
- Keep tab state management centralized and predictable

### Do not
- bury important gameplay actions inside too many modal layers
- hardcode fixed widths for mobile panels
- create separate disconnected UI systems for mobile and desktop unless necessary

---

## 9. TypeScript Standards

This repository is **TypeScript-first**.

### Rules
- Use strict typing
- Avoid implicit `any`
- Keep core models and APIs strongly typed
- Prefer explicit interfaces and discriminated unions where they improve safety
- Use small, well-named types instead of giant ambiguous objects

### Strongly recommended
- typed upgrade definitions
- typed resource identifiers
- typed tier identifiers
- typed screen/tab identifiers
- typed action/event payloads

### Do not
- use `any` as a shortcut in core gameplay code
- pass large untyped blobs between systems
- rely on fragile string comparisons when a union type would be safer

---

## 10. Naming Conventions

Naming must be consistent and precise.

### General rules
- State uses nouns: `score`, `moteTotals`, `equationState`, `forgeState`
- Actions use verbs: `tapEquation`, `refineMotes`, `unlockTier`, `spawnParticle`
- Boolean names start with:
  - `is`
  - `has`
  - `can`
  - `should`
  - `needs`

Examples:
- `isUnlocked`
- `hasForgeAccess`
- `canAffordUpgrade`
- `shouldShowSecretTier`
- `needsLayoutRefresh`

### Counts, IDs, and indices
- counts end with `Count`
- indices end with `Index`
- IDs end with `Id`

Examples:
- `particleCount`
- `tierIndex`
- `upgradeId`

### Units and spaces
Any value with units should include a suffix where relevant.

Examples:
- `elapsedMs`
- `tickCount`
- `positionPx`
- `velocityPxPerSec`
- `radiusPx`

For coordinate spaces, use explicit suffixes:
- `Screen`
- `Canvas`
- `World`
- `Ui`

Examples:
- `pointerScreen`
- `forgeCenterCanvas`
- `particleWorld`

### Mutable vs readonly models
- mutable state objects end with `State`
- derived or readonly versions end with `View`, `Snapshot`, or `Model`

Examples:
- `EquationState`
- `ForgeState`
- `EquationViewModel`
- `ResourceSnapshot`

---

## 11. Keep Files Small and Legible

Agents must keep files reasonably small and focused.

### Guideline
- Prefer files under roughly **1000 lines**
- Much smaller is better when practical
- Split earlier rather than later if a file is becoming hard to reason about

### Preferred organization
- one major concern per file
- helper modules for formatting or math utilities
- data definitions separated from rendering and simulation
- no giant “everything” files

### When splitting files
- preserve behavior unless intentional changes are requested
- keep naming stable where possible
- update imports cleanly
- document structure changes in `file_index.md`

---

## 12. Required File Indexing

To help future AI agents, maintain a `file_index.md` and keep it current.

### Purpose
This file should briefly summarize:
- what each important file does
- key exported functions/classes
- major sections inside long files
- notable performance-sensitive areas
- known extension points

### Suggested style
For each important file:
- path
- purpose
- major exports
- line-range style section summary when useful

Example:
- `src/sim/equation/equation-state.ts`
  - stores authoritative equation progression state
  - exports `createEquationState`, `applyEquationUpgrade`
  - lines 20–80: state model
  - lines 81–160: upgrade application
  - lines 161–220: derived tap value calculation

Keep this concise and accurate.

---

## 13. Hot-Path Performance Rules

Even though this is an idle game, performance still matters because:
- particle counts may grow
- mobile devices are a priority
- UI and rendering must stay smooth
- late-game activity can become visually dense

### Rules
- avoid hidden allocations in per-frame code
- avoid repeated array recreation in hot loops
- avoid unnecessary closures in high-frequency paths
- prefer simple loops over abstraction-heavy patterns in hot code
- use pooling where particle counts justify it

### Measure what matters
When performance-sensitive changes are made, verify:
- frame stability
- particle update cost
- layout thrashing avoidance
- resize performance
- idle background behavior on mobile

### Do not
- over-engineer micro-optimizations in cold code
- ignore obvious garbage-heavy loops in rendering and particle systems

---

## 14. Game Loop and Time Rules

Agents must keep time handling clear and consistent.

### Rules
- Prefer a single authoritative update loop
- Distinguish clearly between:
  - simulation step timing
  - render timing
  - UI animation timing
- Use named time units consistently
- Clamp or handle large time gaps safely after tab switching or device sleep

### Important idle-game concern
The game may eventually include offline or background progress. If that is implemented:
- document the model clearly
- keep the logic deterministic and inspectable
- separate offline progression calculation from frame-by-frame visual simulation

Do not quietly fake economic state in rendering code.

---

## 15. State Management Rules

Keep game state explicit and predictable.

### Requirements
Separate at minimum:
- progression state
- equation state
- resource state
- particle visual state
- UI state
- settings state

### Rules
- avoid one giant mutable global object unless clearly structured and justified
- keep ownership of each state area clear
- write state transitions in obvious places
- prefer named functions for important mutations

Examples:
- `applyTapToEquation`
- `applyAutomationTick`
- `refineParticlesIntoMotes`
- `setActiveTab`
- `setVisualScaleMode`

---

## 16. Settings and User Preferences

The settings tab includes:
- color theme
- visual settings
- sound settings
- credits
- Discord invitation

### Rules
- settings must be centralized
- defaults must be explicit
- persisted settings must be version-tolerant where possible
- visual settings must not silently break readability or performance

### Recommended examples
- pixel scale preference
- reduced particles mode
- trail intensity
- screen shake on/off
- sound/music volume
- color theme preset
- accessibility-oriented contrast settings if added later

---

## 17. Documentation Requirements

Maintain these files and keep them current:

### `ARCHITECTURE.md`
Describe:
- main runtime flow
- system boundaries
- state ownership
- equation rendering pipeline
- particle rendering pipeline
- UI structure
- resize/scaling strategy

### `DECISIONS.md`
Document important technical decisions such as:
- internal render resolution strategy
- math notation rendering approach
- big-number strategy
- particle authority model
- save format strategy
- offline progress model
- canvas/UI layering approach

### `manual_test_checklist.md`
Include manual checks for:
- tap responsiveness
- equation rendering readability
- portrait and landscape layout
- tab switching
- settings persistence
- particle performance
- forge behavior
- upgrade purchasing
- late-game scaling sanity
- desktop mouse support
- mobile touch support

### `file_index.md`
Keep file-level summaries for agent navigation.

---

## 18. Save Data and Persistence Rules

Idle games depend on trustworthy save behavior.

### Requirements
- save data must be versioned
- migration logic must be explicit if structure changes
- do not silently destroy old saves
- keep saved state minimal but complete

### Rules
- separate transient visual state from persistent progression state
- do not persist unnecessary particle visuals unless there is a strong reason
- document save format changes in `DECISIONS.md` or a changelog entry

---

## 19. Workflow for AI Agents

### Before making changes
1. Read the relevant files fully
2. Read `ARCHITECTURE.md`, `DECISIONS.md`, and `file_index.md`
3. Identify the system boundary you are changing
4. Preserve existing patterns unless there is a clear reason to improve them

### While making changes
- keep code focused and typed
- maintain system separation
- avoid mixing simulation and presentation concerns
- update nearby docs when structure changes
- prefer clarity over cleverness

### After making changes
- verify the app still runs on both mobile-style and desktop-style layouts
- verify no obvious regressions in equation readability
- verify no avoidable performance regressions
- update `file_index.md` if file responsibilities changed
- update `ARCHITECTURE.md` or `DECISIONS.md` if the technical approach changed
- increment build/version metadata if the repository uses it

---

## 20. Common Pitfalls to Avoid

Do not:
- blur the equation through careless scaling
- bury core logic inside DOM event handlers
- represent complex expressions only as ad hoc strings
- mix visual particle effects with authoritative economy state without documentation
- hardcode tier colors in multiple places
- build layout around one phone resolution
- create giant monolithic files
- use weak typing in core progression logic
- create garbage-heavy particle loops
- let mobile usability become an afterthought
- add “temporary” hacks without documenting them

---

## 21. Equation Upgrade System Guidance

Because the equation is the heart of the game, its upgrade system must remain extensible.

### Agents should build for progression such as:
- additive terms
- tap strength increases
- automation timing reductions
- multiplicative terms
- exponent systems
- functions
- nested subexpressions
- late-game special mechanics

### Strong recommendation
Design upgrades around data and effect application rather than giant conditional trees.

Prefer patterns like:
- upgrade definitions
- effect descriptors
- typed application functions
- derived equation builders

This makes balancing and expansion much easier.

---

## 22. Suggested Repository Structure

This is only a recommended structure, but agents should stay close to it unless there is a strong reason not to:

```text
src/
  app/
  sim/
    equation/
    resources/
    progression/
    forge/
  render/
    canvas/
    particles/
    equation/
  ui/
    tabs/
    panels/
    components/
  input/
  audio/
  data/
    tiers/
    upgrades/
    balance/
  settings/
  util/
