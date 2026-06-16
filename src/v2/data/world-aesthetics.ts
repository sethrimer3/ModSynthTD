/**
 * world-aesthetics.ts — Data-driven per-world visual profiles.
 *
 * Each WorldAesthetic maps a worldId to a complete set of color/style
 * tokens consumed by the renderer layers (combat, rack, notation, HUD, fluid).
 * No worldId conditionals should appear in render code; read the aesthetic
 * data and use it directly.
 *
 * Palette design notes:
 *   All worlds use a very dark scene background with the world primary as the
 *   main accent. Tints are kept subtle so the battlefield stays readable.
 *   The fluidSeed is an RGB triple used to inject ambient dye at idle/prep
 *   time so the fluid background softly reflects the world's mood.
 */

import { WorldTheme } from './worlds';

// ── Interface ────────────────────────────────────────────────────────────────

export interface WorldAesthetic {
  worldId: string;

  // ── Core palette ────────────────────────────────────────────────────────
  /** Main accent color (= WorldTheme.primary). */
  primary: string;
  /** Secondary/highlight glow color (= WorldTheme.glow). */
  glow: string;
  /** App canvas/scene background fill. */
  background: string;
  /** UI panel/popup background. */
  panel: string;
  /** Panel border/separator color. */
  border: string;
  /** Dimmer version of primary for muted UI elements. */
  muted: string;

  // ── Battlefield ─────────────────────────────────────────────────────────
  /** Color of the battlefield grid lines (rgba string). */
  gridColor: string;
  /** Start-tile marker color. */
  spawnColor: string;
  /** Finish-tile marker color. */
  finishColor: string;
  /** Track/lane circuit trace color; overrides primary if set explicitly. */
  trackColor: string;

  // ── Rack ────────────────────────────────────────────────────────────────
  /** Rack case background fill. */
  rackCase: string;
  /** Rack case border color. */
  rackBorder: string;
  /** Rack slot grid vertical line color (rgba). */
  rackGridV: string;
  /** Rack slot grid horizontal line color (rgba). */
  rackGridH: string;
  /** Mounting rail dark stripe. */
  rackRailDark: string;
  /** Mounting rail light stripe. */
  rackRailLight: string;

  // ── Notation ────────────────────────────────────────────────────────────
  /** Notation staff line color (rgba). */
  staffColor: string;
  /** Notation barline color (rgba). */
  barlineColor: string;
  /** Notation rest color (rgba). */
  restColor: string;
  /** Notation tie/slur color (rgba). */
  tieColor: string;

  // ── Fluid background ────────────────────────────────────────────────────
  /** Ambient dye seed RGB triple [0–255] injected during idle/prep. */
  fluidSeed: readonly [number, number, number];
  /** Strength multiplier for the ambient seed injection (0 = none). */
  fluidSeedStrength: number;
}

// ── Profiles ─────────────────────────────────────────────────────────────────

const AESTHETICS: Record<string, WorldAesthetic> = {
  // w40 — First Signal — deep space cyan/teal
  w40: {
    worldId: 'w40',
    primary: '#00ddcc', glow: '#00ffee',
    background: '#010a0a',
    panel: 'rgba(4,14,18,0.93)',
    border: '#00ddcc33',
    muted: '#006655',
    gridColor: 'rgba(0,120,110,0.38)',
    spawnColor: '#00ffcc', finishColor: '#ff3366',
    trackColor: '#00ddcc',
    rackCase: '#060e0d', rackBorder: '#00ddcc44',
    rackGridV: 'rgba(0,120,110,0.38)', rackGridH: 'rgba(0,100,90,0.28)',
    rackRailDark: '#0a1e1c', rackRailLight: '#14302d',
    staffColor: 'rgba(0,200,185,0.30)',
    barlineColor: 'rgba(0,220,200,0.50)',
    restColor: 'rgba(0,200,185,0.50)',
    tieColor: 'rgba(0,230,210,0.75)',
    fluidSeed: [0, 180, 160], fluidSeedStrength: 0.12,
  },

  // w60 — Pulse Orbit — violet/purple nebula
  w60: {
    worldId: 'w60',
    primary: '#aa66ff', glow: '#cc88ff',
    background: '#07010e',
    panel: 'rgba(12,6,22,0.93)',
    border: '#aa66ff33',
    muted: '#552288',
    gridColor: 'rgba(90,40,170,0.38)',
    spawnColor: '#cc88ff', finishColor: '#ff3399',
    trackColor: '#aa66ff',
    rackCase: '#0a060f', rackBorder: '#aa66ff44',
    rackGridV: 'rgba(90,40,170,0.38)', rackGridH: 'rgba(80,35,155,0.28)',
    rackRailDark: '#160b22', rackRailLight: '#231038',
    staffColor: 'rgba(150,90,240,0.28)',
    barlineColor: 'rgba(170,110,255,0.48)',
    restColor: 'rgba(140,80,230,0.48)',
    tieColor: 'rgba(180,130,255,0.72)',
    fluidSeed: [120, 50, 220], fluidSeedStrength: 0.11,
  },

  // w80 — Bifurcation — amber/orange split-path
  w80: {
    worldId: 'w80',
    primary: '#ff8800', glow: '#ffaa44',
    background: '#0a0600',
    panel: 'rgba(16,9,3,0.93)',
    border: '#ff880033',
    muted: '#884400',
    gridColor: 'rgba(140,70,0,0.38)',
    spawnColor: '#ffcc44', finishColor: '#ff3300',
    trackColor: '#ff8800',
    rackCase: '#0e0800', rackBorder: '#ff880044',
    rackGridV: 'rgba(140,70,0,0.38)', rackGridH: 'rgba(120,60,0,0.28)',
    rackRailDark: '#1e1000', rackRailLight: '#2e1800',
    staffColor: 'rgba(200,110,0,0.28)',
    barlineColor: 'rgba(220,130,0,0.48)',
    restColor: 'rgba(190,100,0,0.50)',
    tieColor: 'rgba(255,170,60,0.70)',
    fluidSeed: [200, 90, 0], fluidSeedStrength: 0.13,
  },

  // w100 — Phase Drift — electric blue / ghost trails
  w100: {
    worldId: 'w100',
    primary: '#44aaff', glow: '#66ccff',
    background: '#01040e',
    panel: 'rgba(4,8,20,0.93)',
    border: '#44aaff33',
    muted: '#224477',
    gridColor: 'rgba(30,80,160,0.40)',
    spawnColor: '#66ccff', finishColor: '#ff4466',
    trackColor: '#44aaff',
    rackCase: '#04080f', rackBorder: '#44aaff44',
    rackGridV: 'rgba(30,80,160,0.40)', rackGridH: 'rgba(25,70,145,0.30)',
    rackRailDark: '#0a1428', rackRailLight: '#0e1e38',
    staffColor: 'rgba(60,150,230,0.30)',
    barlineColor: 'rgba(80,170,255,0.50)',
    restColor: 'rgba(55,140,215,0.50)',
    tieColor: 'rgba(100,195,255,0.72)',
    fluidSeed: [40, 120, 240], fluidSeedStrength: 0.14,
  },

  // w120 — Confluence — teal/lime layered signal
  w120: {
    worldId: 'w120',
    primary: '#33ff88', glow: '#66ffaa',
    background: '#010a04',
    panel: 'rgba(4,14,8,0.93)',
    border: '#33ff8833',
    muted: '#117744',
    gridColor: 'rgba(20,140,65,0.38)',
    spawnColor: '#66ffaa', finishColor: '#ff3366',
    trackColor: '#33ff88',
    rackCase: '#050f08', rackBorder: '#33ff8844',
    rackGridV: 'rgba(20,140,65,0.38)', rackGridH: 'rgba(18,120,55,0.28)',
    rackRailDark: '#0a1e10', rackRailLight: '#102e1a',
    staffColor: 'rgba(40,200,100,0.28)',
    barlineColor: 'rgba(60,220,120,0.48)',
    restColor: 'rgba(35,190,90,0.50)',
    tieColor: 'rgba(80,240,140,0.70)',
    fluidSeed: [30, 200, 100], fluidSeedStrength: 0.12,
  },

  // w140 — Modulation Field — pink/magenta pulsing bloom
  w140: {
    worldId: 'w140',
    primary: '#ff66ff', glow: '#ff99ff',
    background: '#0a0109',
    panel: 'rgba(18,4,16,0.93)',
    border: '#ff66ff33',
    muted: '#882288',
    gridColor: 'rgba(160,40,155,0.38)',
    spawnColor: '#ff99ff', finishColor: '#ff3344',
    trackColor: '#ff66ff',
    rackCase: '#0f0410', rackBorder: '#ff66ff44',
    rackGridV: 'rgba(160,40,155,0.38)', rackGridH: 'rgba(140,35,135,0.28)',
    rackRailDark: '#200830', rackRailLight: '#300c44',
    staffColor: 'rgba(220,80,215,0.28)',
    barlineColor: 'rgba(240,100,235,0.48)',
    restColor: 'rgba(210,70,205,0.50)',
    tieColor: 'rgba(255,130,250,0.70)',
    fluidSeed: [220, 60, 215], fluidSeedStrength: 0.13,
  },

  // w160 — Dense Array — yellow/white step-grid LEDs
  w160: {
    worldId: 'w160',
    primary: '#ffee44', glow: '#ffff88',
    background: '#080800',
    panel: 'rgba(14,14,4,0.93)',
    border: '#ffee4433',
    muted: '#887700',
    gridColor: 'rgba(150,140,20,0.40)',
    spawnColor: '#ffff88', finishColor: '#ff4422',
    trackColor: '#ffee44',
    rackCase: '#0c0c04', rackBorder: '#ffee4444',
    rackGridV: 'rgba(150,140,20,0.40)', rackGridH: 'rgba(130,120,18,0.30)',
    rackRailDark: '#1c1c08', rackRailLight: '#28280c',
    staffColor: 'rgba(210,195,40,0.28)',
    barlineColor: 'rgba(230,215,55,0.50)',
    restColor: 'rgba(200,185,38,0.50)',
    tieColor: 'rgba(250,240,100,0.70)',
    fluidSeed: [210, 190, 30], fluidSeedStrength: 0.14,
  },

  // w180 — Target Lock — magenta/red laser targeting scanner
  w180: {
    worldId: 'w180',
    primary: '#ff2266', glow: '#ff55aa',
    background: '#080004',
    panel: 'rgba(14,2,8,0.95)',
    border: '#ff226644',
    muted: '#881144',
    gridColor: 'rgba(180,20,70,0.42)',
    spawnColor: '#ff55aa', finishColor: '#ff8800',
    trackColor: '#ff2266',
    rackCase: '#100208', rackBorder: '#ff226655',
    rackGridV: 'rgba(180,20,70,0.42)', rackGridH: 'rgba(160,18,60,0.32)',
    rackRailDark: '#220412', rackRailLight: '#340620',
    staffColor: 'rgba(240,40,100,0.30)',
    barlineColor: 'rgba(255,55,120,0.55)',
    restColor: 'rgba(230,38,95,0.52)',
    tieColor: 'rgba(255,100,160,0.75)',
    fluidSeed: [240, 20, 90], fluidSeedStrength: 0.18,
  },

  // w200 — The Final Measure — violet/gold cipher, corrupted signal
  w200: {
    worldId: 'w200',
    primary: '#cc88ff', glow: '#ffdd66',
    background: '#030108',
    panel: 'rgba(7,3,16,0.97)',
    border: '#cc88ff44',
    muted: '#553388',
    gridColor: 'rgba(100,50,160,0.42)',
    spawnColor: '#ffdd66', finishColor: '#ff3399',
    trackColor: '#cc88ff',
    rackCase: '#080314', rackBorder: '#cc88ff55',
    rackGridV: 'rgba(100,50,160,0.42)', rackGridH: 'rgba(85,42,140,0.32)',
    rackRailDark: '#140828', rackRailLight: '#1e0c3c',
    staffColor: 'rgba(160,90,240,0.30)',
    barlineColor: 'rgba(200,130,255,0.55)',
    restColor: 'rgba(150,80,230,0.52)',
    tieColor: 'rgba(220,180,255,0.78)',
    fluidSeed: [140, 60, 240], fluidSeedStrength: 0.20,
  },
};

// ── Fallback ──────────────────────────────────────────────────────────────────

/** Generic dark aesthetic used for unknown worldIds. */
function fallbackAesthetic(theme: WorldTheme): WorldAesthetic {
  return {
    worldId: '__fallback__',
    primary: theme.primary, glow: theme.glow,
    background: '#01030a',
    panel: 'rgba(4,8,20,0.93)',
    border: `${theme.primary}33`,
    muted: '#2a3d65',
    gridColor: 'rgba(20,38,72,0.40)',
    spawnColor: theme.glow, finishColor: '#ff3366',
    trackColor: theme.primary,
    rackCase: '#060c18', rackBorder: `${theme.primary}44`,
    rackGridV: 'rgba(20,45,85,0.45)', rackGridH: 'rgba(18,42,82,0.30)',
    rackRailDark: '#16233c', rackRailLight: '#22365a',
    staffColor: 'rgba(110,150,210,0.30)',
    barlineColor: 'rgba(110,150,210,0.45)',
    restColor: 'rgba(130,170,230,0.50)',
    tieColor: 'rgba(180,220,255,0.75)',
    fluidSeed: [20, 60, 140], fluidSeedStrength: 0.10,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return the WorldAesthetic for a given worldId.
 * Falls back gracefully if the worldId is unknown (e.g. a modded world).
 */
export function getWorldAesthetic(worldId: string, theme: WorldTheme): WorldAesthetic {
  const found = AESTHETICS[worldId];
  if (found) return found;
  // Unknown world: build a dynamic fallback from the theme colors so at
  // minimum the primary/glow colors remain accurate.
  return fallbackAesthetic(theme);
}
