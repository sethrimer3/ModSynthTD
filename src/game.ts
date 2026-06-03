type Structure = 'empty' | 'wall' | 'turret' | 'radar' | 'crusher' | 'gatling' | 'conveyor' | 'extractor' | 'splitter' | 'cannon' | 'repairer';
type Tool = 'wall' | 'turret' | 'radar' | 'erase' | 'repair' | 'crusher' | 'gatling' | 'conveyor' | 'extractor' | 'splitter' | 'cannon' | 'repairer';
type BuildCategory = 'mining' | 'turrets' | 'defense' | 'tech' | 'repair' | 'erase' | 'logistics';

interface BuildItemDef {
  id: Tool;
  label: string;
  hotkey: string;
  cost: number;
  color: string;
}

interface BuildCategoryDef {
  id: BuildCategory;
  label: string;
  color: string;
  directTool?: Tool;
  items: BuildItemDef[];
}

interface Enemy {
  xTile: number;
  yTile: number;
  hp: number;
  maxHp: number;
  speedTilePerSec: number;
  isBreaker: boolean;
  wallAttackCooldownSec: number;
  isScuttler?: boolean;
}

interface Mote {
  progress: number;
}

interface ShotFlash {
  fromXPx: number;
  fromYPx: number;
  toXPx: number;
  toYPx: number;
  ageSec: number;
  flashColor?: string;
}

interface GunpowderMote {
  progress: number;
  fromXTile: number;
  fromYTile: number;
}

// A mote that follows a player-built conveyor chain from an extractor to a destination.
interface RoutedMote {
  pathXTile: number[];
  pathYTile: number[];
  segIndex: number;
  progress: number;  // 0..1 along current segment
  resourceType: 'ore' | 'coal';
}

interface MuzzleFlash {
  xPx: number;
  yPx: number;
  ageSec: number;
}

interface RepairSparkle {
  xPx: number;
  yPx: number;
  vxPx: number;
  vyPx: number;
  ageSec: number;
  maxAgeSec: number;
  r: number;
  g: number;
  b: number;
}

interface ShellCasing {
  xPx: number;
  yPx: number;
  vxPx: number;
  vyPx: number;
  ageSec: number;
  maxAgeSec: number;
}

interface WormSegment {
  xTile: number;
  yTile: number;
  hp: number;
  maxHp: number;
  hitFlashTimerSec?: number;
}

interface Worm {
  segments: WormSegment[];
  speedTilePerSec: number;
  wallAttackCooldownSec: number;
  isArmored?: boolean;
}

type WeatherType = 'clear' | 'rain' | 'snow';

interface EnvironmentState {
  dayNightTimeSec: number;
  weatherType: WeatherType;
  weatherIntensity: number;
}

interface SunState {
  phase: number;
  altitude: number;
  dirX: number;
  dirY: number;
  daylightAmount: number;
  warmthAmount: number;
  isNight: boolean;
}

type MetaUpgradeKey = 'coreArmor' | 'turretPower' | 'oreBonus';

interface MetaUpgradeConfig {
  label: string;
  costPerLevel: number;
  maxLevel: number;
  stat: (level: number) => string;
}

// ── Constants ──────────────────────────────────────────────────────────────
const tileSizePx = 12;
const gridWidthTile = 20;
const gridHeightTile = 20;
const nativeWidthPx = gridWidthTile * tileSizePx;
const nativeHeightPx = gridHeightTile * tileSizePx;
const coreTile = { x: Math.floor(gridWidthTile / 2), y: Math.floor(gridHeightTile / 2) };
const depositTile = { x: 5, y: 10 };          // Moved closer to base (was {3,2})
const coalDepositTile = { x: 15, y: 10 };      // coal deposit on the right side of base
const deposit3Tile = { x: 5, y: 16 };          // 3rd ore deposit — revealed at high radar
const entranceTile = { x: 6, y: coreTile.y };
const breakerTargetTile = { x: coreTile.x, y: 3 };
const currentBuildNumber = 19;
const turretRangeTile = 4.5;

// ── Conveyor/Extractor constants ─────────────────────────────────────────────
// Direction encoding: 0=East(+x), 1=South(+y), 2=West(-x), 3=North(-y)
const DIR_OFFSETS: readonly [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const DIR_SYMBOLS = ['→', '↓', '←', '↑'];
const CONVEYOR_MOTE_SPEED = 0.55; // conveyor-segments per second
const EXTRACTOR_ORE_SPAWN_SEC = 0.75;  // ore mote spawn interval from ore extractor
const EXTRACTOR_COAL_SPAWN_SEC = 1.0;  // coal mote spawn interval from coal extractor
const TURRET_AMMO_MAX = 10;
const TURRET_AMMO_STARTING = 4;  // initial ammo so first wave is survivable
const BASE_STARTING_ORE = 20;    // ore given at run start; player must build first route
const shotFlashDurationSec = 0.12;
const breakerArrivalDistanceTile = 0.2;
const BREAKER_WARN_DIST_TILE = 6; // distance at which the pre-breach warning activates
const BREACH_FLASH_DURATION_SEC = 0.65; // full-screen magenta flash duration on breach
const coreHpHealthyThreshold = 60;
const coreHpDamagedThreshold = 30;
const secondEntranceTile = { x: coreTile.x, y: 0 };
const deposit2Tile = { x: 16, y: 17 };
const META_SYMBOL = '◆';
const DEPOSIT2_MIN_REVEAL_RADIUS_TILE = 6;
const DEPOSIT3_MIN_REVEAL_RADIUS_TILE = 8;  // 3rd deposit requires higher radar
const TURRET_BASE_DAMAGE = 10;
const TURRET_POWER_DAMAGE_PER_LEVEL = 3;
const ORE_BONUS_PER_LEVEL = 30;
const CORE_ARMOR_HP_PER_LEVEL = 20;
const BASE_CORE_HP = 100;

// Gatling turret constants
const GATLING_FIRE_COOLDOWN_SEC = 0.12;
const GATLING_BASE_DAMAGE = 7;
const GATLING_MAX_AMMO = 20;
const GATLING_SHOTS_PER_POWDER = 5;

// Cannon turret constants
const CANNON_FIRE_COOLDOWN_SEC = 1.4;
const CANNON_BASE_DAMAGE = 35;
const CANNON_AMMO_MAX = 5;
const CANNON_AMMO_STARTING = 2;
const CANNON_RANGE_TILE = 5.5;

// Crusher constants
const CRUSHER_CONVERSION_SEC = 2.5;

// Auto-repair building constants
const REPAIRER_REPAIR_INTERVAL_SEC = 2.5;    // seconds between repair pulses
const REPAIRER_REPAIR_AMOUNT_HP = 8;          // HP restored per pulse
const REPAIRER_ORE_PER_PULSE = 1;             // ore consumed per repair pulse
const REPAIRER_RANGE_TILE = 1.6;              // range in tiles (covers adjacent tiles)

// Coal / gunpowder mote constants
const COAL_MOTE_SPAWN_SEC = 0.9;
const COAL_MOTE_SPEED = 0.35;
const GUNPOWDER_MOTE_SPEED = 0.35;

// Visual effect constants
const MUZZLE_FLASH_DURATION_SEC = 0.07;
const REPAIR_SPARKLE_MAX_AGE_SEC = 0.45;
const EXPLOSION_RANGE_TILE = 2.5;
const EXPLOSION_DAMAGE_PER_GUNPOWDER = 12;
const MAX_GUNPOWDER_PER_EXPLOSION = 5;
const GATLING_BARREL_OFFSET_PX = 6;
const SHELL_EJECT_ANGLE_VARIANCE_RAD = 0.6;
const SHELL_EJECT_BASE_SPEED_PX = 22;
const SHELL_EJECT_SPEED_VARIANCE_PX = 22;
const SHELL_CASING_MIN_LIFETIME_SEC = 0.28;
const SHELL_CASING_LIFETIME_VARIANCE_SEC = 0.2;
const SHELL_CASING_BOUNCE_RESTITUTION = -0.55;
const SHELL_CASING_GRAVITY_PX_PER_SEC2 = 18;
const REPAIR_SPARKLE_GRAVITY_PX_PER_SEC2 = 30;
const SHELL_CASING_FRICTION = 0.96;

const STRUCTURE_MAX_HP: Partial<Record<Structure, number>> = { wall: 50, turret: 30, radar: 25, crusher: 35, gatling: 25, conveyor: 10, extractor: 20, splitter: 15, cannon: 35, repairer: 25 };
const STRUCTURE_ORE_COST: Partial<Record<Structure, number>> = { wall: 0, turret: 12, radar: 25, crusher: 18, gatling: 18, conveyor: 0, extractor: 0, splitter: 8, cannon: 20, repairer: 18 };
const STRUCTURE_REBUILD_COST: Partial<Record<Structure, number>> = { wall: 0, turret: 6, radar: 12, crusher: 9, gatling: 9, conveyor: 0, extractor: 0, splitter: 4, cannon: 10, repairer: 9 };
const ENEMY_WALL_DAMAGE = 8;
const ENEMY_WALL_ATTACK_COOLDOWN_SEC = 1.5;
const SECOND_ENTRANCE_ACTIVATION_WAVE = 7;
const SECOND_ENTRANCE_SPAWN_RATIO = 0.4;
const MIN_RADAR_LEVEL = 1;
const MIN_REVEAL_RADIUS_TILE = 5;
const STRUCTURE_HP_BAR_WARN_THRESHOLD = 0.5;
const HP_BAR_COLOR_HEALTHY = '#ffcc44';
const HP_BAR_COLOR_CRITICAL = '#ff4422';
const ORE_SYMBOL = '⊕';
const ORE_RATE_DISPLAY_DELAY_SEC = 4; // seconds before showing ore/s rate in HUD
// Orthogonal neighbor offsets used in wall-damage and adjacency checks
const ADJ_OFFSETS: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const META_UPGRADE_KEYS: MetaUpgradeKey[] = ['coreArmor', 'turretPower', 'oreBonus'];
const META_UPGRADE_CONFIGS: Record<MetaUpgradeKey, MetaUpgradeConfig> = {
  coreArmor:   { label: 'Core Armor',   costPerLevel: 5,  maxLevel: 3, stat: (l) => `+${l * CORE_ARMOR_HP_PER_LEVEL} max HP`    },
  turretPower: { label: 'Turret Power', costPerLevel: 8,  maxLevel: 3, stat: (l) => `+${l * TURRET_POWER_DAMAGE_PER_LEVEL} dmg` },
  oreBonus:    { label: 'Ore Start',    costPerLevel: 6,  maxLevel: 3, stat: (l) => `+${l * ORE_BONUS_PER_LEVEL} start ore`     },
};
const WORM_SEGMENT_HP_BASE = 10;
const WORM_SEGMENT_HP_PER_WAVE = 1.5;
const WORM_SEGMENT_SPACING_TILE = 0.6;
const WORM_MIN_SURVIVE_SEGMENTS = 3;
const WORM_SPAWN_START_WAVE = 2;
const TURRET_FIRE_COOLDOWN_SEC = 0.35;

// Scuttler enemy constants – fast, low-HP enemy that targets logistics structures
const SCUTTLER_SPAWN_START_WAVE = 3;
const SCUTTLER_BASE_HP = 14;
const SCUTTLER_HP_PER_WAVE = 2;
const SCUTTLER_SPEED_TILE_PER_SEC = 2.2;
const SCUTTLER_ATTACK_DAMAGE = 6;

// Armored Worm constants – high-HP variant that appears on later waves
const ARMORED_WORM_SPAWN_START_WAVE = 6;
const ARMORED_WORM_SPAWN_INTERVAL = 2; // spawn every N waves
const ARMORED_WORM_HP_MULTIPLIER = 2.0;
const ARMORED_WORM_SPEED_BASE = 0.55; // slower than regular worm
const WORM_SEGMENT_HIT_FLASH_SEC = 0.14; // how long a hit flash lasts on a segment

// ── Day/night cycle constants ──────────────────────────────────────────────
const DAY_NIGHT_CYCLE_SEC  = 3600;   // 1 real-time hour per full cycle
const SUNRISE_START_PHASE  = 0.18;   // fraction of cycle where sunrise begins
const SUNRISE_END_PHASE    = 0.28;   // fraction where sunrise is complete (full day)
const SUNSET_START_PHASE   = 0.68;   // fraction where sunset begins
const SUNSET_END_PHASE     = 0.78;   // fraction where sunset is complete (full night)
const SHADOW_MAX_ALPHA     = 0.38;   // maximum tile shadow opacity
const BEAM_MAX_ALPHA       = 0.09;   // maximum sunbeam streak opacity
const NIGHT_OVERLAY_ALPHA  = 0.72;   // darkness overlay at full night
const DUSK_DAWN_TINT_ALPHA = 0.22;   // warm-colour tint during sunrise/sunset
const DAY_NIGHT_DEBUG_STEP_SEC = 300; // 5-minute keyboard jump for lighting review
const DAY_NIGHT_PREVIEW_SPEED = 60;   // 1 full cycle per minute when debug preview is enabled

// ── Helpers ────────────────────────────────────────────────────────────────
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function loadUpgrades(): Record<MetaUpgradeKey, number> {
  try {
    const raw = localStorage.getItem('tiny-base-idle-upg');
    if (!raw) return { coreArmor: 0, turretPower: 0, oreBonus: 0 };
    const saved = JSON.parse(raw) as Partial<Record<MetaUpgradeKey, number>>;
    return {
      coreArmor:   clamp(saved.coreArmor   ?? 0, 0, META_UPGRADE_CONFIGS.coreArmor.maxLevel),
      turretPower: clamp(saved.turretPower  ?? 0, 0, META_UPGRADE_CONFIGS.turretPower.maxLevel),
      oreBonus:    clamp(saved.oreBonus     ?? 0, 0, META_UPGRADE_CONFIGS.oreBonus.maxLevel),
    };
  } catch {
    return { coreArmor: 0, turretPower: 0, oreBonus: 0 };
  }
}

function saveUpgrades(): void {
  localStorage.setItem('tiny-base-idle-upg', JSON.stringify(upgradeLevel));
}

// ── DOM ────────────────────────────────────────────────────────────────────
const appElement = document.getElementById('app');
if (!appElement) {
  throw new Error('Missing app root');
}

const rootElement = document.createElement('div');
rootElement.className = 'gameRoot';

const gameViewElement = document.createElement('div');
gameViewElement.className = 'gameView';

const gameFieldElement = document.createElement('div');
gameFieldElement.className = 'gameField';

const hudElement = document.createElement('div');
hudElement.className = 'hud';

const hudLeftElement = document.createElement('div');
hudLeftElement.className = 'hudLeft';
const hudRightElement = document.createElement('div');
hudRightElement.className = 'hudRight';

const hudRow1 = document.createElement('div');
hudRow1.className = 'hudRow';
const hpSpan = document.createElement('span');
hpSpan.className = 'statChip';
const oreSpan = document.createElement('span');
oreSpan.className = 'statChip';
hudRow1.append(hpSpan, document.createTextNode(' · '), oreSpan);

const hudRow2 = document.createElement('div');
hudRow2.className = 'hudRow';
const waveSpan = document.createElement('span');
waveSpan.className = 'statChip';
const radarSpan = document.createElement('span');
radarSpan.className = 'statChip';
hudRow2.append(waveSpan, document.createTextNode(' · '), radarSpan);

hudLeftElement.append(hudRow1, hudRow2);

const hudRow5 = document.createElement('div');
hudRow5.className = 'hudRow';
const coalGpSpan = document.createElement('span');
coalGpSpan.className = 'statChip';
hudRow5.append(coalGpSpan);
hudLeftElement.append(hudRow5);

const hudRow3 = document.createElement('div');
hudRow3.className = 'hudRow';
const metaButtonElement = document.createElement('button');
metaButtonElement.type = 'button';
metaButtonElement.className = 'metaButton statChip';
hudRow3.append(metaButtonElement);

const hudRow4 = document.createElement('div');
hudRow4.className = 'hudRow';
const nextWaveSpan = document.createElement('span');
nextWaveSpan.className = 'statChip';
hudRow4.append(nextWaveSpan);

hudRightElement.append(hudRow3, hudRow4);
hudElement.append(hudLeftElement, hudRightElement);

const canvasElement = document.createElement('canvas');
canvasElement.width = nativeWidthPx;
canvasElement.height = nativeHeightPx;
canvasElement.className = 'gameCanvas';
canvasElement.setAttribute('aria-label', 'Tiny Base Idle game board');

const toolbarElement = document.createElement('div');
toolbarElement.className = 'buildPalette';

const paletteCategoriesElement = document.createElement('div');
paletteCategoriesElement.className = 'paletteCategories';

const paletteItemsElement = document.createElement('div');
paletteItemsElement.className = 'paletteItems';

toolbarElement.append(paletteCategoriesElement, paletteItemsElement);

// Upgrade panel DOM
const upgradePanelElement = document.createElement('div');
upgradePanelElement.className = 'upgradesPanel';

const metaMenuHeaderElement = document.createElement('div');
metaMenuHeaderElement.className = 'metaMenuHeader';

const metaMenuTitleElement = document.createElement('div');
metaMenuTitleElement.className = 'metaMenuTitle';
metaMenuTitleElement.textContent = 'Meta Upgrades';

const metaMenuCurrencyElement = document.createElement('div');
metaMenuCurrencyElement.className = 'metaMenuCurrency';

const closeMetaButtonElement = document.createElement('button');
closeMetaButtonElement.type = 'button';
closeMetaButtonElement.className = 'closeMetaButton';
closeMetaButtonElement.textContent = 'Back to Base';

metaMenuHeaderElement.append(metaMenuTitleElement, metaMenuCurrencyElement, closeMetaButtonElement);

const upgradesPanelLabelElement = document.createElement('div');
upgradesPanelLabelElement.className = 'upgradesPanelLabel';
upgradesPanelLabelElement.textContent = `META UPGRADES  ${META_SYMBOL}`;

const upgradeButtonsContainerElement = document.createElement('div');
upgradeButtonsContainerElement.className = 'upgradeButtonsContainer';

interface UpgradeButtonParts {
  button: HTMLButtonElement;
  labelSpan: HTMLSpanElement;
  levelSpan: HTMLSpanElement;
  descSpan: HTMLSpanElement;
}
const upgradeButtonParts = new Map<MetaUpgradeKey, UpgradeButtonParts>();

for (const key of META_UPGRADE_KEYS) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'upgradeButton';
  btn.addEventListener('click', () => { buyUpgrade(key); });

  const labelSpan = document.createElement('span');
  labelSpan.className = 'upgLabel';
  const levelSpan = document.createElement('span');
  levelSpan.className = 'upgLevel';
  const descSpan = document.createElement('span');
  descSpan.className = 'upgDesc';
  btn.append(labelSpan, levelSpan, descSpan);

  upgradeButtonsContainerElement.append(btn);
  upgradeButtonParts.set(key, { button: btn, labelSpan, levelSpan, descSpan });
}

upgradePanelElement.append(metaMenuHeaderElement, upgradesPanelLabelElement, upgradeButtonsContainerElement);

// Status bar DOM (context-sensitive cost hint, shown below toolbar)
const statusBarElement = document.createElement('div');
statusBarElement.className = 'statusBar';

// Nine-slot placeholder DOM
const slotsPanelElement = document.createElement('div');
slotsPanelElement.className = 'slotsPanel';

const slotsPanelLabelElement = document.createElement('div');
slotsPanelLabelElement.className = 'slotsPanelLabel';
slotsPanelLabelElement.textContent = 'BASE SLOTS';

const slotsGridElement = document.createElement('div');
slotsGridElement.className = 'slotsGrid';

for (let slotIndex = 0; slotIndex < 9; slotIndex += 1) {
  const slotBtn = document.createElement('div');
  slotBtn.className = slotIndex === 0 ? 'slotButton slotActive' : 'slotButton slotLocked';
  const slotNameSpan = document.createElement('span');
  slotNameSpan.className = 'slotName';
  slotNameSpan.textContent = `Slot ${slotIndex + 1}`;
  const slotStatusSpan = document.createElement('span');
  slotStatusSpan.className = 'slotStatus';
  slotStatusSpan.textContent = slotIndex === 0 ? 'ACTIVE' : 'LOCKED';
  slotBtn.append(slotNameSpan, slotStatusSpan);
  slotsGridElement.append(slotBtn);
}

slotsPanelElement.append(slotsPanelLabelElement, slotsGridElement);

gameFieldElement.append(canvasElement, hudElement);
gameViewElement.append(gameFieldElement, toolbarElement, statusBarElement);
rootElement.append(gameViewElement, upgradePanelElement, slotsPanelElement);
appElement.append(rootElement);

// ── Canvas context ─────────────────────────────────────────────────────────
const ctxValue = canvasElement.getContext('2d');
if (!ctxValue) {
  throw new Error('Could not create canvas context');
}
const ctx: CanvasRenderingContext2D = ctxValue;
ctx.imageSmoothingEnabled = false;

// ── Game state ─────────────────────────────────────────────────────────────
const terrainIsDebris: boolean[] = new Array(gridWidthTile * gridHeightTile).fill(false);
const structures: Structure[] = new Array(gridWidthTile * gridHeightTile).fill('empty');
const turretAngleRad = new Map<number, number>();

let metaCurrency = Number(localStorage.getItem('tiny-base-idle-meta') ?? '0');
let ore = 0;
let coal = 0;
let gunpowder = 0;
let coreHp = 100;
let radarLevel = 1;
let revealRadiusTile = 5;
let elapsedSec = 0;
let waveIndex = 0;
let turretFireCooldownSec = 3;
let moteSpawnCooldownSec = 0.8;
let waveTimerSec = 8;
let isRunOver = false;
let gameOverDelaySec = 0;
let lastMetaEarned = 0;
let breakerTriggered = false;

let totalOreEarned = 0;

let upgradeLevel = loadUpgrades();
let enemies: Enemy[] = [];
let motes: Mote[] = [];
let motes2: Mote[] = [];
let coalMotes: Mote[] = [];
let coalMoteSpawnCooldownSec = COAL_MOTE_SPAWN_SEC;
let gunpowderMotes: GunpowderMote[] = [];
let shotFlashes: ShotFlash[] = [];
let muzzleFlashes: MuzzleFlash[] = [];
let shellCasings: ShellCasing[] = [];
let mote2SpawnCooldownSec = 0.8;
let worms: Worm[] = [];

const structureHp = new Map<number, number>();
const blueprintGhosts = new Map<number, Structure>();
const gatlingAmmo = new Map<number, number>();
const gatlingFireCooldowns = new Map<number, number>();
const crusherConversionTimers = new Map<number, number>();
const cannonAmmo = new Map<number, number>();
const cannonFireCooldowns = new Map<number, number>();
const splitterToggle = new Map<number, boolean>();
const repairerTimers = new Map<number, number>();
let repairSparkles: RepairSparkle[] = [];
let breachOpened = false;
// True once the Breaker is within BREAKER_WARN_DIST_TILE tiles of its debris target
let breakerWarningActive = false;
// Counts down after breach triggers; drives the full-screen magenta flash
let breachFlashTimerSec = 0;

// ── Conveyor/Extractor/Routed-mote state ─────────────────────────────────────
// Direction each conveyor/extractor tile outputs (0=E,1=S,2=W,3=N)
const conveyorDirection = new Map<number, number>();
// Per-turret ammo supplied via the logistics network
const turretAmmo = new Map<number, number>();
// Motes travelling along player-built conveyor chains
let routedMotes: RoutedMote[] = [];
// Countdown timer per extractor tile before next mote spawn
const extractorSpawnCooldowns = new Map<number, number>();
// Cached route-validity per extractor; false → show "no route" indicator
const extractorHasRoute = new Map<number, boolean>();
// Direction chosen while the conveyor/extractor tool is active (0=E,1=S,2=W,3=N)
let conveyorPlacementDir = 0;

// Rebuild filter mode: which ghost types are targeted by the A/Z rebuild shortcuts
type RebuildFilterMode = 'all' | 'walls' | 'combat' | 'logistics';
let rebuildFilterMode: RebuildFilterMode = 'all';

let overlayText = '';
let overlayColor = '#ffee44';
let overlayTimerSec = 0;

// ── Per-run statistics for run summary ────────────────────────────────────────
let totalEnemiesKilled = 0;
let totalStructuresBuilt = 0;

// ── Tutorial hint flags (reset each run) ──────────────────────────────────────
let shownMiningHint = false;
let shownRouteHint = false;
let shownWallHint = false;
let shownTurretHint = false;
let shownRadarHint = false;

let hoveredXTile = -1;
let hoveredYTile = -1;
let isPointerHeld = false;
let isMetaMenuOpen = false;

const environment: EnvironmentState = {
  dayNightTimeSec: DAY_NIGHT_CYCLE_SEC * 0.35, // start mid-morning (full daylight)
  weatherType: 'clear',
  weatherIntensity: 0,
};
let isDayNightPreviewFast = false;
let isDayNightDebugActive = false;

// ── Build palette setup ────────────────────────────────────────────────────
const BUILD_CATEGORIES: BuildCategoryDef[] = [
  {
    id: 'mining',  label: 'Mining',  color: '#f0a600',
    items: [
      { id: 'extractor', label: 'Extractor', hotkey: 'X', cost: 0, color: '#f0a600' },
      { id: 'crusher',   label: 'Crusher',   hotkey: 'C', cost: 18, color: '#b87000' },
    ],
  },
  {
    id: 'logistics', label: 'Logistics', color: '#22ddbb',
    items: [
      { id: 'conveyor', label: 'Conveyor', hotkey: 'V', cost: 0, color: '#22ddbb' },
      { id: 'splitter', label: 'Splitter', hotkey: 'S', cost: 8, color: '#ff88ff' },
    ],
  },
  {
    id: 'turrets', label: 'Turrets', color: '#27e0ff',
    items: [
      { id: 'turret',  label: 'Turret',  hotkey: 'T', cost: 12, color: '#27e0ff' },
      { id: 'gatling', label: 'Gatling', hotkey: 'G', cost: 18, color: '#ffcc44' },
      { id: 'cannon',  label: 'Cannon',  hotkey: 'N', cost: 20, color: '#ff7733' },
    ],
  },
  {
    id: 'defense', label: 'Defense', color: '#6a8faf',
    items: [{ id: 'wall', label: 'Wall', hotkey: 'W', cost: 0, color: '#6a8faf' }],
  },
  {
    id: 'tech', label: 'Tech', color: '#8d68ff',
    items: [{ id: 'radar', label: 'Radar', hotkey: 'R', cost: 25, color: '#8d68ff' }],
  },
  { id: 'repair', label: 'Repair', color: '#44ff88', directTool: 'repair', items: [
    { id: 'repairer', label: 'Auto-Repair', hotkey: 'B', cost: 18, color: '#44ff88' },
  ] },
  { id: 'erase',  label: 'Erase',  color: '#ff7060', directTool: 'erase',  items: [] },
];

const TOOL_TO_CATEGORY: Record<Tool, BuildCategory> = {
  wall: 'defense', turret: 'turrets', radar: 'tech', erase: 'erase', repair: 'repair',
  crusher: 'mining', gatling: 'turrets', extractor: 'mining', conveyor: 'logistics',
  splitter: 'logistics', cannon: 'turrets', repairer: 'repair',
};

const categoryButtons = new Map<BuildCategory, HTMLButtonElement>();
let selectedTool: Tool = 'wall';
let selectedCategory: BuildCategory = 'defense';

for (const catDef of BUILD_CATEGORIES) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'categoryButton';
  btn.style.setProperty('--cat-color', catDef.color);
  btn.textContent = catDef.label;
  btn.addEventListener('click', () => { selectCategory(catDef.id); });
  paletteCategoriesElement.append(btn);
  categoryButtons.set(catDef.id, btn);
}

updatePaletteState();

function setMetaMenuOpen(shouldOpen: boolean): void {
  isMetaMenuOpen = shouldOpen;
  gameViewElement.hidden = shouldOpen;
  upgradePanelElement.hidden = !shouldOpen;
  slotsPanelElement.hidden = shouldOpen;
  if (shouldOpen) {
    hoveredXTile = -1;
    hoveredYTile = -1;
    isPointerHeld = false;
  }
}

metaButtonElement.addEventListener('click', () => {
  setMetaMenuOpen(true);
});

closeMetaButtonElement.addEventListener('click', () => {
  setMetaMenuOpen(false);
});

setMetaMenuOpen(false);

// ── Keyboard shortcuts ─────────────────────────────────────────────────────
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && isMetaMenuOpen) {
    setMetaMenuOpen(false);
    return;
  }
  if (isMetaMenuOpen) {
    return;
  }
  if (event.key === '[' || event.key === ']') {
    const dir = event.key === '[' ? -1 : 1;
    environment.dayNightTimeSec = (environment.dayNightTimeSec + DAY_NIGHT_CYCLE_SEC + dir * DAY_NIGHT_DEBUG_STEP_SEC) % DAY_NIGHT_CYCLE_SEC;
    isDayNightDebugActive = true;
    event.preventDefault();
    return;
  }
  if (event.key === '\\') {
    isDayNightPreviewFast = !isDayNightPreviewFast;
    isDayNightDebugActive = true;
    showOverlay(isDayNightPreviewFast ? 'DAY PREVIEW FAST' : 'DAY PREVIEW NORMAL', '#ffcc88', 0.8);
    event.preventDefault();
    return;
  }
  const keyMap: Record<string, Tool> = {
    'w': 'wall',    '1': 'wall',
    't': 'turret',  '2': 'turret',
    'r': 'radar',   '3': 'radar',
    'e': 'erase',   '4': 'erase',
    'f': 'repair',  '5': 'repair',
    'g': 'gatling', '6': 'gatling',
    'c': 'crusher', '7': 'crusher',
    'x': 'extractor',
    'v': 'conveyor',
    's': 'splitter',
    'n': 'cannon',
    'b': 'repairer',
  };
  const tool = keyMap[event.key.toLowerCase()];
  if (tool) {
    selectedTool = tool;
    selectedCategory = TOOL_TO_CATEGORY[tool];
    updatePaletteState();
  }
  // Q – rotate conveyor/extractor/splitter placement direction, or cycle rebuild filter for repair
  if (event.key.toLowerCase() === 'q' && (selectedTool === 'conveyor' || selectedTool === 'extractor' || selectedTool === 'splitter')) {
    conveyorPlacementDir = (conveyorPlacementDir + 1) % 4;
    showOverlay(`DIR ${DIR_SYMBOLS[conveyorPlacementDir]}`, '#22ddbb', 0.6);
  }
  if (event.key.toLowerCase() === 'q' && selectedTool === 'repair') {
    const filterOrder: RebuildFilterMode[] = ['all', 'walls', 'combat', 'logistics'];
    const currentIdx = filterOrder.indexOf(rebuildFilterMode);
    rebuildFilterMode = filterOrder[(currentIdx + 1) % filterOrder.length];
    const filterLabel: Record<RebuildFilterMode, string> = { all: 'ALL', walls: 'WALLS', combat: 'COMBAT', logistics: 'LOGISTICS' };
    showOverlay(`FILTER: ${filterLabel[rebuildFilterMode]}`, '#44ff88', 0.8);
  }
  // A – rebuild affordable (cheapest first); Z – rebuild all
  if (event.key.toLowerCase() === 'a' && selectedTool === 'repair') {
    rebuildAffordableGhosts();
  }
  if (event.key.toLowerCase() === 'z' && selectedTool === 'repair') {
    rebuildAllGhosts();
  }
});

// ── Upgrade panel logic ───────────────────────────────────────────────────

function updateUpgradePanelState(): void {
  for (const key of META_UPGRADE_KEYS) {
    const cfg = META_UPGRADE_CONFIGS[key];
    const level = upgradeLevel[key];
    const parts = upgradeButtonParts.get(key)!;
    const isMaxed = level >= cfg.maxLevel;
    const cost = cfg.costPerLevel;
    const canAfford = !isMaxed && metaCurrency >= cost;

    parts.button.disabled = isMaxed;
    parts.button.classList.toggle('affordable', canAfford);
    parts.button.classList.toggle('unaffordable', !canAfford && !isMaxed);
    parts.button.classList.toggle('maxed', isMaxed);

    parts.labelSpan.textContent = cfg.label;
    parts.levelSpan.textContent = isMaxed
      ? `Lv ${level}/${cfg.maxLevel} · MAX`
      : `Lv ${level}/${cfg.maxLevel} · ${cost}${META_SYMBOL}`;
    parts.descSpan.textContent = isMaxed
      ? cfg.stat(level)
      : level > 0
        ? cfg.stat(level)
        : cfg.stat(1) + '/lv';
  }
}

function buyUpgrade(key: MetaUpgradeKey): void {
  const cfg = META_UPGRADE_CONFIGS[key];
  const level = upgradeLevel[key];
  if (level >= cfg.maxLevel) { return; }
  if (metaCurrency < cfg.costPerLevel) {
    if (!isRunOver) { showOverlay(`NEED META ${META_SYMBOL}`, '#c0e8ff', 1.5); }
    return;
  }
  metaCurrency -= cfg.costPerLevel;
  upgradeLevel[key] += 1;
  localStorage.setItem('tiny-base-idle-meta', String(metaCurrency));
  saveUpgrades();

  // Apply immediate effect on the current run
  if (key === 'coreArmor') {
    const newMax = BASE_CORE_HP + upgradeLevel.coreArmor * CORE_ARMOR_HP_PER_LEVEL;
    coreHp = Math.min(coreHp + CORE_ARMOR_HP_PER_LEVEL, newMax);
  } else if (key === 'oreBonus') {
    ore += ORE_BONUS_PER_LEVEL;
  }
  // turretPower is applied dynamically in updateTurrets

  updateUpgradePanelState();
}

updateUpgradePanelState();

// ── Terrain ────────────────────────────────────────────────────────────────
buildStarterTerrain();
let distanceField = computeDistanceField();

// ── Logic helpers ──────────────────────────────────────────────────────────

function selectCategory(catId: BuildCategory): void {
  selectedCategory = catId;
  const catDef = BUILD_CATEGORIES.find(c => c.id === catId)!;
  if (catDef.directTool !== undefined) {
    selectedTool = catDef.directTool;
  } else if (catDef.items.length > 0) {
    const currentInCat = catDef.items.find(item => item.id === selectedTool);
    if (!currentInCat) {
      selectedTool = catDef.items[0].id;
    }
  }
  updatePaletteState();
}

function updatePaletteState(): void {
  for (const [catId, btn] of categoryButtons) {
    btn.classList.toggle('active', catId === selectedCategory);
  }

  while (paletteItemsElement.firstChild) {
    paletteItemsElement.removeChild(paletteItemsElement.firstChild);
  }

  const catDef = BUILD_CATEGORIES.find(c => c.id === selectedCategory)!;
  for (const itemDef of catDef.items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'itemButton';
    btn.style.setProperty('--item-color', itemDef.color);
    btn.classList.toggle('active', itemDef.id === selectedTool);

    const labelSpan = document.createElement('span');
    labelSpan.textContent = itemDef.label;
    const keySpan = document.createElement('span');
    keySpan.className = 'itemKey';
    keySpan.textContent = itemDef.cost > 0
      ? `[${itemDef.hotkey}] ${itemDef.cost}${ORE_SYMBOL}`
      : `[${itemDef.hotkey}]`;
    btn.append(labelSpan, keySpan);

    btn.addEventListener('click', () => {
      selectedTool = itemDef.id;
      updatePaletteState();
    });

    paletteItemsElement.append(btn);
  }
}

function tileIndex(xTile: number, yTile: number): number {
  return yTile * gridWidthTile + xTile;
}

function buildStarterTerrain(): void {
  terrainIsDebris.fill(false);
  const minX = coreTile.x - 4;
  const maxX = coreTile.x + 4;
  const minY = coreTile.y - 3;
  const maxY = coreTile.y + 3;

  for (let yTile = minY; yTile <= maxY; yTile += 1) {
    for (let xTile = minX; xTile <= maxX; xTile += 1) {
      const isBorder = xTile === minX || xTile === maxX || yTile === minY || yTile === maxY;
      if (!isBorder) {
        continue;
      }
      const isOpening = xTile === entranceTile.x && yTile === entranceTile.y;
      if (!isOpening) {
        terrainIsDebris[tileIndex(xTile, yTile)] = true;
      }
    }
  }
}

function isInBounds(xTile: number, yTile: number): boolean {
  return xTile >= 0 && yTile >= 0 && xTile < gridWidthTile && yTile < gridHeightTile;
}

function isWalkableForEnemy(xTile: number, yTile: number): boolean {
  if (!isInBounds(xTile, yTile)) {
    return false;
  }
  const index = tileIndex(xTile, yTile);
  if (terrainIsDebris[index]) {
    return false;
  }
  return structures[index] === 'empty';
}

function computeDistanceField(): Int16Array {
  const distances = new Int16Array(gridWidthTile * gridHeightTile);
  distances.fill(-1);
  const queueXTile: number[] = [coreTile.x];
  const queueYTile: number[] = [coreTile.y];
  distances[tileIndex(coreTile.x, coreTile.y)] = 0;

  for (let queueIndex = 0; queueIndex < queueXTile.length; queueIndex += 1) {
    const xTile = queueXTile[queueIndex];
    const yTile = queueYTile[queueIndex];
    const currentDistance = distances[tileIndex(xTile, yTile)];

    const neighbors: [number, number][] = [
      [xTile + 1, yTile], [xTile - 1, yTile],
      [xTile, yTile + 1], [xTile, yTile - 1]
    ];

    for (const [nxTile, nyTile] of neighbors) {
      if (!isWalkableForEnemy(nxTile, nyTile)) {
        continue;
      }
      const neighborIndex = tileIndex(nxTile, nyTile);
      if (distances[neighborIndex] !== -1) {
        continue;
      }
      distances[neighborIndex] = (currentDistance + 1) as number;
      queueXTile.push(nxTile);
      queueYTile.push(nyTile);
    }
  }

  return distances;
}

function attemptRepair(xTile: number, yTile: number): void {
  if (!isInBounds(xTile, yTile)) { return; }
  if (xTile === coreTile.x && yTile === coreTile.y) { return; }
  if (xTile === depositTile.x && yTile === depositTile.y) { return; }
  if (xTile === deposit2Tile.x && yTile === deposit2Tile.y) { return; }
  if (xTile === coalDepositTile.x && yTile === coalDepositTile.y) { return; }

  const index = tileIndex(xTile, yTile);
  if (terrainIsDebris[index]) { return; }

  const ghost = blueprintGhosts.get(index);
  const structure = structures[index];

  // Case 1: rebuild a blueprint ghost (enemy-destroyed structure)
  if (ghost !== undefined && structure === 'empty') {
    const cost = STRUCTURE_REBUILD_COST[ghost] ?? 0;
    if (ore < cost) {
      showOverlay('NEED ORE', '#ff8844', 1.5);
      return;
    }
    structures[index] = ghost;
    if (ghost === 'radar') {
      radarLevel += 1;
      revealRadiusTile = Math.min(10, revealRadiusTile + 1);
    }
    ore -= cost;
    structureHp.set(index, STRUCTURE_MAX_HP[ghost] ?? STRUCTURE_MAX_HP.wall!);
    blueprintGhosts.delete(index);
    distanceField = computeDistanceField();
    spawnRepairSparkles((xTile + 0.5) * tileSizePx, (yTile + 0.5) * tileSizePx, '#44ff88', 6);
    return;
  }

  // Case 2: repair a damaged (but not destroyed) structure
  if (structure === 'empty') { return; }
  const currentHp = structureHp.get(index);
  const maxHp = STRUCTURE_MAX_HP[structure];
  if (currentHp === undefined || maxHp === undefined || currentHp >= maxHp) { return; }

  const missingHp = maxHp - currentHp;
  const rebuildCost = STRUCTURE_REBUILD_COST[structure] ?? 0;
  const repairCost = Math.ceil(missingHp * rebuildCost / maxHp);

  if (ore < repairCost) {
    if (repairCost > 0) { showOverlay('NEED ORE', '#ff8844', 1.5); }
    return;
  }

  ore -= repairCost;
  structureHp.set(index, maxHp);
  spawnRepairSparkles((xTile + 0.5) * tileSizePx, (yTile + 0.5) * tileSizePx, '#44ff88', 6);
}

function attemptPlaceStructure(xTile: number, yTile: number): void {
  if (!isInBounds(xTile, yTile)) {
    return;
  }

  if (selectedTool === 'repair') {
    attemptRepair(xTile, yTile);
    return;
  }

  if (xTile === coreTile.x && yTile === coreTile.y) {
    return;
  }
  if (xTile === depositTile.x && yTile === depositTile.y) {
    return;
  }
  if (xTile === deposit2Tile.x && yTile === deposit2Tile.y) {
    return;
  }
  if (xTile === deposit3Tile.x && yTile === deposit3Tile.y) {
    return;
  }
  if (xTile === coalDepositTile.x && yTile === coalDepositTile.y) {
    return;
  }

  const index = tileIndex(xTile, yTile);
  if (terrainIsDebris[index]) {
    return;
  }

  if (selectedTool === 'erase') {
    if (structures[index] !== 'empty') {
      structures[index] = 'empty';
      structureHp.delete(index);
      turretAngleRad.delete(index);
      distanceField = computeDistanceField();
    }
    blueprintGhosts.delete(index);
    return;
  }

  if (structures[index] !== 'empty') {
    return;
  }

  const isRebuild = blueprintGhosts.get(index) === selectedTool;
  const costTable = isRebuild ? STRUCTURE_REBUILD_COST : STRUCTURE_ORE_COST;
  const cost = costTable[selectedTool] ?? 0;
  if (ore < cost) {
    showOverlay('NEED ORE', '#ff8844', 1.5);
    return;
  }

  structures[index] = selectedTool;
  totalStructuresBuilt += 1;
  if (selectedTool === 'radar') {
    radarLevel += 1;
    revealRadiusTile = Math.min(10, revealRadiusTile + 1);
    // Show stage-specific message so players understand what each radar level adds
    const newRadius = revealRadiusTile;
    let radarMsg: string;
    if (newRadius === DEPOSIT2_MIN_REVEAL_RADIUS_TILE) {
      radarMsg = `RADAR LV${radarLevel} · NEW DEPOSIT REVEALED`;
    } else if (newRadius === DEPOSIT3_MIN_REVEAL_RADIUS_TILE) {
      radarMsg = `RADAR LV${radarLevel} · NEW DEPOSIT REVEALED`;
    } else if (newRadius >= 10) {
      radarMsg = `RADAR LV${radarLevel} · MAX RANGE`;
    } else {
      radarMsg = `RADAR LV${radarLevel} · RANGE ${newRadius}`;
    }
    showOverlay(radarMsg, '#8d68ff', 2.5);
  }
  if (selectedTool === 'conveyor' || selectedTool === 'extractor' || selectedTool === 'splitter') {
    conveyorDirection.set(index, conveyorPlacementDir);
  }
  if (selectedTool === 'turret') {
    turretAmmo.set(index, TURRET_AMMO_STARTING);
  }
  if (selectedTool === 'cannon') {
    cannonAmmo.set(index, CANNON_AMMO_STARTING);
  }

  ore -= cost;
  // selectedTool is never 'erase' or 'repair' here (both returned early above); fallback covers future Structure additions
  structureHp.set(index, STRUCTURE_MAX_HP[selectedTool] ?? STRUCTURE_MAX_HP.wall!);
  blueprintGhosts.delete(index);
  distanceField = computeDistanceField();
}

function getCanvasTile(clientX: number, clientY: number): [number, number] {
  const rect = canvasElement.getBoundingClientRect();
  const xPx = ((clientX - rect.left) / rect.width) * nativeWidthPx;
  const yPx = ((clientY - rect.top) / rect.height) * nativeHeightPx;
  return [Math.floor(xPx / tileSizePx), Math.floor(yPx / tileSizePx)];
}

canvasElement.addEventListener('pointerdown', (event) => {
  if (isMetaMenuOpen) { return; }
  event.preventDefault();
  isPointerHeld = true;
  canvasElement.setPointerCapture(event.pointerId);
  const [xTile, yTile] = getCanvasTile(event.clientX, event.clientY);
  hoveredXTile = xTile;
  hoveredYTile = yTile;
  attemptPlaceStructure(xTile, yTile);
});

canvasElement.addEventListener('pointermove', (event) => {
  if (isMetaMenuOpen) { return; }
  const [xTile, yTile] = getCanvasTile(event.clientX, event.clientY);
  hoveredXTile = xTile;
  hoveredYTile = yTile;
  if (isPointerHeld) {
    attemptPlaceStructure(xTile, yTile);
  }
});

canvasElement.addEventListener('pointerup', () => {
  isPointerHeld = false;
});

canvasElement.addEventListener('pointercancel', () => {
  isPointerHeld = false;
});

canvasElement.addEventListener('pointerleave', () => {
  if (!isPointerHeld) {
    hoveredXTile = -1;
    hoveredYTile = -1;
  }
});

// Right-click on a conveyor or extractor tile rotates its direction
canvasElement.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  if (isMetaMenuOpen) { return; }
  const [xTile, yTile] = getCanvasTile(event.clientX, event.clientY);
  const index = tileIndex(xTile, yTile);
  const s = structures[index];
  if (s === 'conveyor' || s === 'extractor' || s === 'splitter') {
    const cur = conveyorDirection.get(index) ?? 0;
    const next = (cur + 1) % 4;
    conveyorDirection.set(index, next);
    extractorHasRoute.delete(index); // force route re-evaluation
  }
});

function showOverlay(text: string, color: string, durationSec: number): void {
  overlayText = text;
  overlayColor = color;
  overlayTimerSec = durationSec;
}

function damageStructure(index: number, amount: number): void {
  const current = structureHp.get(index);
  if (current === undefined) {
    return;
  }
  const next = current - amount;
  if (next <= 0) {
    const ghostType = structures[index];
    if (ghostType !== 'empty') {
      blueprintGhosts.set(index, ghostType);
    }
    structures[index] = 'empty';
    structureHp.delete(index);
    if (ghostType === 'radar') {
      // radarLevel is always ≥ 2 when a radar exists (placing one increments it), so
      // decrementing here correctly restores the previous level; MIN_RADAR_LEVEL is a safety clamp.
      radarLevel = Math.max(MIN_RADAR_LEVEL, radarLevel - 1);
      revealRadiusTile = Math.max(MIN_REVEAL_RADIUS_TILE, revealRadiusTile - 1);
    }
    if (ghostType === 'crusher' && gunpowder > 0) {
      const explosionGunpowder = Math.min(gunpowder, MAX_GUNPOWDER_PER_EXPLOSION);
      gunpowder -= explosionGunpowder;
      const totalDamage = explosionGunpowder * EXPLOSION_DAMAGE_PER_GUNPOWDER;
      const xTile = index % gridWidthTile;
      const yTile = Math.floor(index / gridWidthTile);
      const xPx = (xTile + 0.5) * tileSizePx;
      const yPx = (yTile + 0.5) * tileSizePx;
      spawnRepairSparkles(xPx, yPx, '#ff8800', 12);
      showOverlay(`BOOM! -${totalDamage}hp`, '#ff8800', 2.0);
      for (const worm of worms) {
        for (const seg of worm.segments) {
          const distTile = Math.hypot(seg.xTile - xTile, seg.yTile - yTile);
          if (distTile <= EXPLOSION_RANGE_TILE) {
            const dmg = Math.round(totalDamage * (1 - distTile / EXPLOSION_RANGE_TILE));
            seg.hp = Math.max(0, seg.hp - dmg);
          }
        }
      }
    }
    turretAngleRad.delete(index);
    repairerTimers.delete(index);
    distanceField = computeDistanceField();
  } else {
    structureHp.set(index, next);
  }
}

// BFS from the enemy's position through walkable tiles to find the nearest damageable structure
// that borders the walkable region. Among all such candidates, pick the one closest to the core.
// Returns -1 if no candidate is found.
function findAttackableBlockingBuilding(startXTile: number, startYTile: number): number {
  const startXTileRounded = Math.round(startXTile);
  const startYTileRounded = Math.round(startYTile);
  if (!isInBounds(startXTileRounded, startYTileRounded)) { return -1; }

  const visited = new Set<number>();
  const queue: [number, number][] = [];
  const startIdx = tileIndex(startXTileRounded, startYTileRounded);

  if (!terrainIsDebris[startIdx] && structures[startIdx] === 'empty') {
    queue.push([startXTileRounded, startYTileRounded]);
    visited.add(startIdx);
  }

  const candidates: number[] = [];

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const [x, y] = queue[queueIndex];
    for (const [dx, dy] of ADJ_OFFSETS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isInBounds(nx, ny)) { continue; }
      const ni = tileIndex(nx, ny);
      if (visited.has(ni)) { continue; }
      visited.add(ni);
      if (terrainIsDebris[ni]) { continue; }
      if (structures[ni] !== 'empty') {
        if (structureHp.has(ni)) {
          candidates.push(ni);
        }
        // Do not BFS through buildings
      } else {
        queue.push([nx, ny]);
      }
    }
  }

  if (candidates.length === 0) { return -1; }

  // Pick the candidate closest (Euclidean) to the core — the most strategically relevant blocker
  let bestBlockingIndex = -1;
  let bestDistanceToCore = Infinity;
  for (const idx of candidates) {
    const cx = idx % gridWidthTile;
    const cy = Math.floor(idx / gridWidthTile);
    const d = Math.hypot(cx - coreTile.x, cy - coreTile.y);
    if (d < bestDistanceToCore) {
      bestDistanceToCore = d;
      bestBlockingIndex = idx;
    }
  }
  return bestBlockingIndex;
}

// Move an enemy toward a blocking building and attack it when in range.
function moveAndAttackBlockingBuilding(
  entity: { xTile: number; yTile: number; speedTilePerSec: number; wallAttackCooldownSec: number },
  blockIdx: number,
  dtSec: number
): void {
  const bx = blockIdx % gridWidthTile;
  const by = Math.floor(blockIdx / gridWidthTile);
  const dxTile = bx - entity.xTile;
  const dyTile = by - entity.yTile;
  const dist = Math.hypot(dxTile, dyTile);
  if (dist > 1.0) {
    const step = (entity.speedTilePerSec * dtSec) / dist;
    entity.xTile += dxTile * Math.min(1, step);
    entity.yTile += dyTile * Math.min(1, step);
  }
  entity.wallAttackCooldownSec -= dtSec;
  if (entity.wallAttackCooldownSec <= 0 && dist <= 1.5) {
    damageStructure(blockIdx, ENEMY_WALL_DAMAGE);
    entity.wallAttackCooldownSec = ENEMY_WALL_ATTACK_COOLDOWN_SEC;
  } else if (entity.wallAttackCooldownSec < 0) {
    entity.wallAttackCooldownSec = 0;
  }
}

// Move a worm head toward a blocking building; attack is tracked on the worm (not the segment).
function moveWormHeadAndAttackBlockingBuilding(
  head: WormSegment,
  worm: Worm,
  blockIdx: number,
  dtSec: number
): void {
  const bx = blockIdx % gridWidthTile;
  const by = Math.floor(blockIdx / gridWidthTile);
  const dxTile = bx - head.xTile;
  const dyTile = by - head.yTile;
  const dist = Math.hypot(dxTile, dyTile);
  if (dist > 1.0) {
    const step = (worm.speedTilePerSec * dtSec) / dist;
    head.xTile += dxTile * Math.min(1, step);
    head.yTile += dyTile * Math.min(1, step);
  }
  worm.wallAttackCooldownSec -= dtSec;
  if (worm.wallAttackCooldownSec <= 0 && dist <= 1.5) {
    damageStructure(blockIdx, ENEMY_WALL_DAMAGE);
    worm.wallAttackCooldownSec = ENEMY_WALL_ATTACK_COOLDOWN_SEC;
  } else if (worm.wallAttackCooldownSec < 0) {
    worm.wallAttackCooldownSec = 0;
  }
}

// Returns a random walkable tile on the edge of the current spawn area (grows with radar).
// Enemies spawn on the perimeter of the visible square so they approach from all sides.
function getRandomSpawnTile(): [number, number] {
  const half = Math.min(Math.floor(revealRadiusTile) - 1, Math.floor(gridWidthTile / 2) - 1);
  const minX = Math.max(0, coreTile.x - half);
  const maxX = Math.min(gridWidthTile - 1, coreTile.x + half);
  const minY = Math.max(0, coreTile.y - half);
  const maxY = Math.min(gridHeightTile - 1, coreTile.y + half);
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const perim = Math.max(1, 2 * (width + height - 2));

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const r = Math.floor(Math.random() * perim);
    let x: number;
    let y: number;
    if (r < width) {
      x = minX + r; y = minY;
    } else if (r < width * 2) {
      x = minX + (r - width); y = maxY;
    } else if (r < width * 2 + height - 2) {
      x = minX; y = minY + 1 + (r - width * 2);
    } else {
      x = maxX; y = minY + 1 + (r - width * 2 - (height - 2));
    }
    if (isWalkableForEnemy(x, y)) { return [x, y]; }
  }
  return [entranceTile.x, entranceTile.y];
}

function spawnWave(): void {
  waveIndex += 1;
  const enemyCount = 3 + Math.floor(waveIndex * 0.5);

  for (let i = 0; i < enemyCount; i += 1) {
    const maxHp = 18 + waveIndex * 3;
    const [sx, sy] = getRandomSpawnTile();
    enemies.push({
      xTile: sx,
      yTile: sy,
      hp: maxHp,
      maxHp,
      speedTilePerSec: 1.2 + waveIndex * 0.05,
      isBreaker: false,
      wallAttackCooldownSec: 0,
    });
  }

  if (!breakerTriggered && waveIndex >= 5) {
    breakerTriggered = true;
    const [bsx, bsy] = getRandomSpawnTile();
    enemies.push({
      xTile: bsx,
      yTile: bsy,
      hp: 45,
      maxHp: 45,
      speedTilePerSec: 0.85,
      isBreaker: true,
      wallAttackCooldownSec: 0,
    });
  }

  if (breachOpened && waveIndex >= SECOND_ENTRANCE_ACTIVATION_WAVE) {
    const topCount = Math.min(Math.floor(enemyCount * SECOND_ENTRANCE_SPAWN_RATIO) + 1, enemyCount);
    for (let i = 0; i < topCount; i += 1) {
      const maxHp = 20 + waveIndex * 3;
      const [sx, sy] = getRandomSpawnTile();
      enemies.push({
        xTile: sx,
        yTile: sy,
        hp: maxHp,
        maxHp,
        speedTilePerSec: 1.1 + waveIndex * 0.05,
        isBreaker: false,
        wallAttackCooldownSec: 0,
      });
    }
  }

  // Spawn one worm per wave starting at WORM_SPAWN_START_WAVE
  if (waveIndex >= WORM_SPAWN_START_WAVE) {
    const segmentCount = Math.min(14, 6 + Math.floor((waveIndex - WORM_SPAWN_START_WAVE) / 2));
    const segmentHp = Math.floor(WORM_SEGMENT_HP_BASE + waveIndex * WORM_SEGMENT_HP_PER_WAVE);
    const segs: WormSegment[] = [];
    const [wx, wy] = getRandomSpawnTile();
    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
      segs.push({
        xTile: wx - segmentIndex * WORM_SEGMENT_SPACING_TILE,
        yTile: wy,
        hp: segmentHp,
        maxHp: segmentHp,
      });
    }
    worms.push({ segments: segs, speedTilePerSec: 0.75 + waveIndex * 0.04, wallAttackCooldownSec: 0 });
  }

  // After breach: also spawn a worm from a random edge every other wave
  if (breachOpened && waveIndex >= SECOND_ENTRANCE_ACTIVATION_WAVE && (waveIndex - SECOND_ENTRANCE_ACTIVATION_WAVE) % 2 === 0) {
    const segmentCount = Math.min(10, 4 + Math.floor((waveIndex - WORM_SPAWN_START_WAVE) / 3));
    const segmentHp = Math.floor(WORM_SEGMENT_HP_BASE + waveIndex * WORM_SEGMENT_HP_PER_WAVE);
    const segs: WormSegment[] = [];
    const [wx2, wy2] = getRandomSpawnTile();
    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
      segs.push({
        xTile: wx2,
        yTile: wy2 - segmentIndex * WORM_SEGMENT_SPACING_TILE,
        hp: segmentHp,
        maxHp: segmentHp,
      });
    }
    worms.push({ segments: segs, speedTilePerSec: 0.75 + waveIndex * 0.04, wallAttackCooldownSec: 0 });
  }

  // Spawn an Armored Worm on later waves — high-HP, slower, grey-green
  if (waveIndex >= ARMORED_WORM_SPAWN_START_WAVE && waveIndex % ARMORED_WORM_SPAWN_INTERVAL === 0) {
    const segmentCount = Math.min(10, 4 + Math.floor((waveIndex - ARMORED_WORM_SPAWN_START_WAVE) / 2));
    const segmentHpBase = Math.floor((WORM_SEGMENT_HP_BASE + waveIndex * WORM_SEGMENT_HP_PER_WAVE) * ARMORED_WORM_HP_MULTIPLIER);
    const armorSegs: WormSegment[] = [];
    const [awx, awy] = getRandomSpawnTile();
    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
      armorSegs.push({
        xTile: awx - segmentIndex * WORM_SEGMENT_SPACING_TILE,
        yTile: awy,
        hp: segmentHpBase,
        maxHp: segmentHpBase,
      });
    }
    const armorSpeed = Math.max(0.35, ARMORED_WORM_SPEED_BASE + waveIndex * 0.02);
    worms.push({ segments: armorSegs, speedTilePerSec: armorSpeed, wallAttackCooldownSec: 0, isArmored: true });
  }

  // Spawn scuttlers starting at SCUTTLER_SPAWN_START_WAVE; count grows with waves
  if (waveIndex >= SCUTTLER_SPAWN_START_WAVE) {
    const scuttlerCount = 1 + Math.floor((waveIndex - SCUTTLER_SPAWN_START_WAVE) / 3);
    for (let si = 0; si < scuttlerCount; si += 1) {
      const maxHp = SCUTTLER_BASE_HP + waveIndex * SCUTTLER_HP_PER_WAVE;
      const [ssx, ssy] = getRandomSpawnTile();
      enemies.push({
        xTile: ssx,
        yTile: ssy,
        hp: maxHp,
        maxHp,
        speedTilePerSec: SCUTTLER_SPEED_TILE_PER_SEC,
        isBreaker: false,
        wallAttackCooldownSec: 0,
        isScuttler: true,
      });
    }
  }

  showOverlay(`WAVE ${waveIndex}`, '#ffee44', 2);
}

function resetRun(): void {
  metaCurrency += Math.max(1, lastMetaEarned);
  localStorage.setItem('tiny-base-idle-meta', String(metaCurrency));

  ore = BASE_STARTING_ORE + upgradeLevel.oreBonus * ORE_BONUS_PER_LEVEL;
  coal = 0;
  gunpowder = 0;
  coreHp = BASE_CORE_HP + upgradeLevel.coreArmor * CORE_ARMOR_HP_PER_LEVEL;
  radarLevel = 1;
  revealRadiusTile = 5;
  elapsedSec = 0;
  waveIndex = 0;
  waveTimerSec = 8;
  turretFireCooldownSec = 3;
  moteSpawnCooldownSec = 0.8;
  isRunOver = false;
  gameOverDelaySec = 0;
  enemies = [];
  motes = [];
  motes2 = [];
  coalMotes = [];
  coalMoteSpawnCooldownSec = COAL_MOTE_SPAWN_SEC;
  gunpowderMotes = [];
  mote2SpawnCooldownSec = 0.8;
  worms = [];
  shotFlashes = [];
  muzzleFlashes = [];
  shellCasings = [];
  structureHp.clear();
  blueprintGhosts.clear();
  gatlingAmmo.clear();
  gatlingFireCooldowns.clear();
  crusherConversionTimers.clear();
  cannonAmmo.clear();
  cannonFireCooldowns.clear();
  splitterToggle.clear();
  conveyorDirection.clear();
  turretAmmo.clear();
  routedMotes = [];
  extractorSpawnCooldowns.clear();
  extractorHasRoute.clear();
  repairerTimers.clear();
  repairSparkles = [];
  conveyorPlacementDir = 0;
  rebuildFilterMode = 'all';
  breakerTriggered = false;
  breachOpened = false;
  breakerWarningActive = false;
  breachFlashTimerSec = 0;
  structures.fill('empty');
  turretAngleRad.clear();
  totalOreEarned = 0;
  totalEnemiesKilled = 0;
  totalStructuresBuilt = 0;
  shownMiningHint = false;
  shownRouteHint = false;
  shownWallHint = false;
  shownTurretHint = false;
  shownRadarHint = false;
  buildStarterTerrain();
  distanceField = computeDistanceField();
  showOverlay('', '', 0);
  updateUpgradePanelState();
}

function updateEnemies(dtSec: number): void {
  for (let enemyIndex = enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
    const enemy = enemies[enemyIndex];

    if (enemy.isBreaker && terrainIsDebris[tileIndex(breakerTargetTile.x, breakerTargetTile.y)]) {
      const dxTile = breakerTargetTile.x - enemy.xTile;
      const dyTile = breakerTargetTile.y - enemy.yTile;
      const breakerDistance = Math.hypot(dxTile, dyTile);
      // Activate pre-breach warning when breaker closes in
      if (breakerDistance < BREAKER_WARN_DIST_TILE) {
        breakerWarningActive = true;
      }
      if (breakerDistance < breakerArrivalDistanceTile) {
        terrainIsDebris[tileIndex(breakerTargetTile.x, breakerTargetTile.y)] = false;
        distanceField = computeDistanceField();
        breachOpened = true;
        breakerWarningActive = false;
        breachFlashTimerSec = BREACH_FLASH_DURATION_SEC;
        enemies.splice(enemyIndex, 1);
        showOverlay('BREACH!', '#ff42d2', 4);
        continue;
      }
      const stepTile = (enemy.speedTilePerSec * dtSec) / Math.max(0.0001, breakerDistance);
      enemy.xTile += dxTile * stepTile;
      enemy.yTile += dyTile * stepTile;
      continue;
    }

    // Scuttler: prioritize attacking adjacent conveyor/extractor structures over moving to core
    if (enemy.isScuttler) {
      const scEx = Math.round(enemy.xTile);
      const scEy = Math.round(enemy.yTile);
      let attackedLogistics = false;
      for (const [ddx, ddy] of ADJ_OFFSETS) {
        const ax = scEx + ddx;
        const ay = scEy + ddy;
        if (!isInBounds(ax, ay)) { continue; }
        const aIdx = tileIndex(ax, ay);
        const s = structures[aIdx];
        if ((s === 'conveyor' || s === 'extractor') && structureHp.has(aIdx)) {
          attackedLogistics = true;
          enemy.wallAttackCooldownSec -= dtSec;
          if (enemy.wallAttackCooldownSec <= 0) {
            damageStructure(aIdx, SCUTTLER_ATTACK_DAMAGE);
            enemy.wallAttackCooldownSec = ENEMY_WALL_ATTACK_COOLDOWN_SEC;
          }
          break;
        }
      }
      if (attackedLogistics) { continue; }
      // No adjacent logistics – fall through to regular BFS movement
    }

    const xTile = Math.round(enemy.xTile);
    const yTile = Math.round(enemy.yTile);
    if (!isInBounds(xTile, yTile)) {
      enemies.splice(enemyIndex, 1);
      continue;
    }

    if (xTile === coreTile.x && yTile === coreTile.y) {
      coreHp -= 8;
      enemies.splice(enemyIndex, 1);
      if (coreHp <= 0 && !isRunOver) {
        isRunOver = true;
        lastMetaEarned = Math.max(1, Math.floor(ore / 8 + waveIndex * 2 + elapsedSec / 12));
        gameOverDelaySec = 5;
        showOverlay('GAME OVER', '#ff5533', 999);
      }
      continue;
    }

    const currentIndex = tileIndex(xTile, yTile);
    const currentDistance = distanceField[currentIndex];
    if (currentDistance === 0) {
      continue;
    }

    if (currentDistance < 0) {
      // No walkable path to core: find the nearest damageable blocking building and attack it
      const blockIdx = findAttackableBlockingBuilding(enemy.xTile, enemy.yTile);
      if (blockIdx >= 0) {
        moveAndAttackBlockingBuilding(enemy, blockIdx, dtSec);
      }
      continue;
    }

    let bestXTile = xTile;
    let bestYTile = yTile;
    let bestDistance = currentDistance;

    const neighbors: [number, number][] = [
      [xTile + 1, yTile], [xTile - 1, yTile],
      [xTile, yTile + 1], [xTile, yTile - 1]
    ];

    for (const [nxTile, nyTile] of neighbors) {
      if (!isInBounds(nxTile, nyTile)) {
        continue;
      }
      const neighborDistance = distanceField[tileIndex(nxTile, nyTile)];
      if (neighborDistance >= 0 && neighborDistance < bestDistance) {
        bestDistance = neighborDistance;
        bestXTile = nxTile;
        bestYTile = nyTile;
      }
    }

    const dxTile = bestXTile - enemy.xTile;
    const dyTile = bestYTile - enemy.yTile;
    const distance = Math.hypot(dxTile, dyTile);
    if (distance > 0.001) {
      const moveStep = (enemy.speedTilePerSec * dtSec) / distance;
      enemy.xTile += dxTile * Math.min(1, moveStep);
      enemy.yTile += dyTile * Math.min(1, moveStep);
    }

    // Chip damage to adjacent structures
    enemy.wallAttackCooldownSec -= dtSec;
    if (enemy.wallAttackCooldownSec <= 0) {
      const ex = Math.round(enemy.xTile);
      const ey = Math.round(enemy.yTile);
      for (const [dx, dy] of ADJ_OFFSETS) {
        const ax = ex + dx;
        const ay = ey + dy;
        if (!isInBounds(ax, ay)) {
          continue;
        }
        const aIdx = tileIndex(ax, ay);
        if (structureHp.has(aIdx)) {
          damageStructure(aIdx, ENEMY_WALL_DAMAGE);
          enemy.wallAttackCooldownSec = ENEMY_WALL_ATTACK_COOLDOWN_SEC;
          break;
        }
      }
    }
  }
}

function updateWorms(dtSec: number): void {
  for (let wi = worms.length - 1; wi >= 0; wi -= 1) {
    const worm = worms[wi];
    if (worm.segments.length === 0) {
      worms.splice(wi, 1);
      continue;
    }

    const head = worm.segments[0];

    // Head reached the core
    if (Math.abs(head.xTile - coreTile.x) < 0.5 && Math.abs(head.yTile - coreTile.y) < 0.5) {
      coreHp -= 6;
      worms.splice(wi, 1);
      if (coreHp <= 0 && !isRunOver) {
        isRunOver = true;
        lastMetaEarned = Math.max(1, Math.floor(ore / 8 + waveIndex * 2 + elapsedSec / 12));
        gameOverDelaySec = 5;
        showOverlay('GAME OVER', '#ff5533', 999);
      }
      continue;
    }

    // Move head via BFS distance field
    const headXTile = Math.round(head.xTile);
    const headYTile = Math.round(head.yTile);
    if (!isInBounds(headXTile, headYTile)) {
      worms.splice(wi, 1);
      continue;
    }

    const currentDist = distanceField[tileIndex(headXTile, headYTile)];
    if (currentDist < 0) {
      // No walkable path to core: find the nearest damageable blocking building and attack it
      const blockIdx = findAttackableBlockingBuilding(head.xTile, head.yTile);
      if (blockIdx >= 0) {
        moveWormHeadAndAttackBlockingBuilding(head, worm, blockIdx, dtSec);
      }
    } else if (currentDist > 0) {
      let bestXTile = headXTile;
      let bestYTile = headYTile;
      let bestDist = currentDist;
      for (const [dx, dy] of ADJ_OFFSETS) {
        const nx = headXTile + dx;
        const ny = headYTile + dy;
        if (!isInBounds(nx, ny)) { continue; }
        const d = distanceField[tileIndex(nx, ny)];
        if (d >= 0 && d < bestDist) { bestDist = d; bestXTile = nx; bestYTile = ny; }
      }
      const dxTile = bestXTile - head.xTile;
      const dyTile = bestYTile - head.yTile;
      const dist = Math.hypot(dxTile, dyTile);
      if (dist > 0.001) {
        const step = (worm.speedTilePerSec * dtSec) / dist;
        head.xTile += dxTile * Math.min(1, step);
        head.yTile += dyTile * Math.min(1, step);
      }
    }

    // Each body segment follows the one in front, maintaining max spacing
    for (let segmentIndex = 1; segmentIndex < worm.segments.length; segmentIndex += 1) {
      const prev = worm.segments[segmentIndex - 1];
      const seg = worm.segments[segmentIndex];
      const dxTile = prev.xTile - seg.xTile;
      const dyTile = prev.yTile - seg.yTile;
      const dist = Math.hypot(dxTile, dyTile);
      if (dist > WORM_SEGMENT_SPACING_TILE) {
        const pull = (dist - WORM_SEGMENT_SPACING_TILE) / dist;
        seg.xTile += dxTile * pull;
        seg.yTile += dyTile * pull;
      }
    }

    // Decay hit flash timers on all segments
    for (const seg of worm.segments) {
      if ((seg.hitFlashTimerSec ?? 0) > 0) {
        seg.hitFlashTimerSec = Math.max(0, (seg.hitFlashTimerSec ?? 0) - dtSec);
      }
    }

    // Head attacks adjacent structures
    worm.wallAttackCooldownSec -= dtSec;
    if (worm.wallAttackCooldownSec <= 0) {
      const ex = Math.round(head.xTile);
      const ey = Math.round(head.yTile);
      for (const [dx, dy] of ADJ_OFFSETS) {
        const ax = ex + dx;
        const ay = ey + dy;
        if (!isInBounds(ax, ay)) { continue; }
        const aIdx = tileIndex(ax, ay);
        if (structureHp.has(aIdx)) {
          damageStructure(aIdx, ENEMY_WALL_DAMAGE);
          worm.wallAttackCooldownSec = ENEMY_WALL_ATTACK_COOLDOWN_SEC;
          break;
        }
      }
      if (worm.wallAttackCooldownSec <= 0) { worm.wallAttackCooldownSec = 0; }
    }
  }
}

function cleanDeadWormSegments(): void {
  const nextWorms: Worm[] = [];
  for (const worm of worms) {
    if (!worm.segments.some(s => s.hp <= 0)) {
      nextWorms.push(worm);
      continue;
    }
    // Split the worm at each dead segment; award ore for each kill
    let fragment: WormSegment[] = [];
    for (const seg of worm.segments) {
      if (seg.hp <= 0) {
        ore += 1;
        totalOreEarned += 1;
        totalEnemiesKilled += 1;
        if (fragment.length >= WORM_MIN_SURVIVE_SEGMENTS) {
          nextWorms.push({ segments: fragment, speedTilePerSec: worm.speedTilePerSec, wallAttackCooldownSec: 0, isArmored: worm.isArmored });
        }
        fragment = [];
      } else {
        fragment.push(seg);
      }
    }
    if (fragment.length >= WORM_MIN_SURVIVE_SEGMENTS) {
      nextWorms.push({ segments: fragment, speedTilePerSec: worm.speedTilePerSec, wallAttackCooldownSec: worm.wallAttackCooldownSec, isArmored: worm.isArmored });
    }
  }
  worms = nextWorms;
}

function updateTurrets(dtSec: number): void {
  turretFireCooldownSec -= dtSec;
  if (turretFireCooldownSec <= 0) {
    turretFireCooldownSec = TURRET_FIRE_COOLDOWN_SEC;
    const damage = TURRET_BASE_DAMAGE + upgradeLevel.turretPower * TURRET_POWER_DAMAGE_PER_LEVEL;

    for (let yTile = 0; yTile < gridHeightTile; yTile += 1) {
      for (let xTile = 0; xTile < gridWidthTile; xTile += 1) {
        const idx = tileIndex(xTile, yTile);
        if (structures[idx] !== 'turret') {
          continue;
        }

        // Resource-fed: turret only fires when it has ammo supplied via logistics
        const ammo = turretAmmo.get(idx) ?? 0;
        if (ammo <= 0) { continue; }

        let targetEnemy: Enemy | undefined;
        let targetWorm: Worm | undefined;
        let targetWormSegIdx = -1;
        let bestDistance = Number.POSITIVE_INFINITY;

        for (const enemy of enemies) {
          const dxTile = enemy.xTile - xTile;
          const dyTile = enemy.yTile - yTile;
          const dist = Math.hypot(dxTile, dyTile);
          if (dist < turretRangeTile && dist < bestDistance) {
            bestDistance = dist;
            targetEnemy = enemy;
            targetWorm = undefined;
          }
        }

        for (const worm of worms) {
          for (let si = 0; si < worm.segments.length; si += 1) {
            const seg = worm.segments[si];
            const dist = Math.hypot(seg.xTile - xTile, seg.yTile - yTile);
            if (dist < turretRangeTile && dist < bestDistance) {
              bestDistance = dist;
              targetWorm = worm;
              targetWormSegIdx = si;
              targetEnemy = undefined;
            }
          }
        }

        if (!targetEnemy && targetWorm === undefined) {
          continue;
        }

        // Consume one ammo on fire
        turretAmmo.set(idx, ammo - 1);

        let targetXTile: number;
        let targetYTile: number;
        if (targetEnemy) {
          targetEnemy.hp -= damage;
          targetXTile = targetEnemy.xTile;
          targetYTile = targetEnemy.yTile;
        } else {
          const targetSegment = targetWorm!.segments[targetWormSegIdx];
          targetSegment.hp -= damage;
          targetSegment.hitFlashTimerSec = WORM_SEGMENT_HIT_FLASH_SEC;
          targetXTile = targetSegment.xTile;
          targetYTile = targetSegment.yTile;
        }

        turretAngleRad.set(idx, Math.atan2(targetYTile - yTile, targetXTile - xTile));

        const half = tileSizePx / 2;
        shotFlashes.push({
          fromXPx: xTile * tileSizePx + half,
          fromYPx: yTile * tileSizePx + half,
          toXPx: Math.round(targetXTile * tileSizePx + half),
          toYPx: Math.round(targetYTile * tileSizePx + half),
          ageSec: 0,
        });
      }
    }
  }

  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    if (enemies[i].hp <= 0) {
      enemies.splice(i, 1);
      ore += 2;
      totalOreEarned += 2;
      totalEnemiesKilled += 1;
    }
  }

  cleanDeadWormSegments();

  for (let i = shotFlashes.length - 1; i >= 0; i -= 1) {
    shotFlashes[i].ageSec += dtSec;
    if (shotFlashes[i].ageSec > shotFlashDurationSec) {
      shotFlashes.splice(i, 1);
    }
  }
}

function updateMotes(dtSec: number): void {
  // Auto-spawning from deposits is now gated behind extractors (updateExtractors/updateRoutedMotes).
  // Drain any in-flight motes that were already spawned before the extractor system was introduced.
  for (let i = motes.length - 1; i >= 0; i -= 1) {
    motes[i].progress += dtSec * 0.4;
    if (motes[i].progress >= 1) {
      motes.splice(i, 1);
      ore += 1;
      totalOreEarned += 1;
    }
  }

  for (let i = motes2.length - 1; i >= 0; i -= 1) {
    motes2[i].progress += dtSec * 0.35;
    if (motes2[i].progress >= 1) {
      motes2.splice(i, 1);
      ore += 1;
      totalOreEarned += 1;
    }
  }

  for (let i = coalMotes.length - 1; i >= 0; i -= 1) {
    coalMotes[i].progress += dtSec * COAL_MOTE_SPEED;
    if (coalMotes[i].progress >= 1) {
      coalMotes.splice(i, 1);
      coal += 1;
    }
  }
}

// Returns true when a canvas pixel coordinate lands inside debris, a structure, or out of bounds.
// Used for shell-casing bounce detection.
function isSolidPixel(xPx: number, yPx: number): boolean {
  if (xPx < 0 || yPx < 0 || xPx >= nativeWidthPx || yPx >= nativeHeightPx) { return true; }
  const xTile = Math.floor(xPx / tileSizePx);
  const yTile = Math.floor(yPx / tileSizePx);
  const idx = tileIndex(xTile, yTile);
  return terrainIsDebris[idx] || structures[idx] !== 'empty';
}

// Crusher: convert coal → gunpowder at a timed rate. Gunpowder motes travel from the
// crusher tile to the core, delivering one gunpowder on arrival.
function updateCrushers(dtSec: number): void {
  for (let yTile = 0; yTile < gridHeightTile; yTile += 1) {
    for (let xTile = 0; xTile < gridWidthTile; xTile += 1) {
      const idx = tileIndex(xTile, yTile);
      if (structures[idx] !== 'crusher') { continue; }
      let timer = crusherConversionTimers.get(idx) ?? 0;
      timer += dtSec;
      if (timer >= CRUSHER_CONVERSION_SEC && coal >= 1) {
        timer -= CRUSHER_CONVERSION_SEC;
        coal -= 1;
        gunpowderMotes.push({ progress: 0, fromXTile: xTile, fromYTile: yTile });
      }
      crusherConversionTimers.set(idx, timer);
    }
  }

  for (let i = gunpowderMotes.length - 1; i >= 0; i -= 1) {
    gunpowderMotes[i].progress += dtSec * GUNPOWDER_MOTE_SPEED;
    if (gunpowderMotes[i].progress >= 1) {
      gunpowderMotes.splice(i, 1);
      gunpowder += 1;
    }
  }
}

// Gatling turret: per-tile independent fire cycle. Loads shots from global gunpowder supply.
// On each shot: spawns a muzzle flash and a shell casing particle.
function updateGatlingTurrets(dtSec: number): void {
  const half = tileSizePx / 2;

  for (let yTile = 0; yTile < gridHeightTile; yTile += 1) {
    for (let xTile = 0; xTile < gridWidthTile; xTile += 1) {
      const idx = tileIndex(xTile, yTile);
      if (structures[idx] !== 'gatling') { continue; }

      // Auto-load from gunpowder supply when ammo is low
      let ammo = gatlingAmmo.get(idx) ?? 0;
      if (ammo < GATLING_MAX_AMMO && gunpowder >= 1) {
        gunpowder -= 1;
        ammo = Math.min(ammo + GATLING_SHOTS_PER_POWDER, GATLING_MAX_AMMO);
        gatlingAmmo.set(idx, ammo);
      }

      if (ammo <= 0) { continue; }

      let cooldown = gatlingFireCooldowns.get(idx) ?? 0;
      cooldown -= dtSec;
      if (cooldown > 0) { gatlingFireCooldowns.set(idx, cooldown); continue; }

      // Find nearest target within range
      const damage = GATLING_BASE_DAMAGE;
      let targetEnemy: Enemy | undefined;
      let targetWorm: Worm | undefined;
      let targetWormSegIdx = -1;
      let bestDist = Number.POSITIVE_INFINITY;

      for (const enemy of enemies) {
        const dist = Math.hypot(enemy.xTile - xTile, enemy.yTile - yTile);
        if (dist < turretRangeTile && dist < bestDist) {
          bestDist = dist;
          targetEnemy = enemy;
          targetWorm = undefined;
        }
      }
      for (const worm of worms) {
        for (let si = 0; si < worm.segments.length; si += 1) {
          const seg = worm.segments[si];
          const dist = Math.hypot(seg.xTile - xTile, seg.yTile - yTile);
          if (dist < turretRangeTile && dist < bestDist) {
            bestDist = dist;
            targetWorm = worm;
            targetWormSegIdx = si;
            targetEnemy = undefined;
          }
        }
      }

      if (!targetEnemy && targetWorm === undefined) { continue; }

      // Fire
      cooldown = GATLING_FIRE_COOLDOWN_SEC;
      gatlingFireCooldowns.set(idx, cooldown);
      ammo -= 1;
      gatlingAmmo.set(idx, ammo);

      let tx: number;
      let ty: number;
      if (targetEnemy) {
        targetEnemy.hp -= damage;
        tx = targetEnemy.xTile;
        ty = targetEnemy.yTile;
      } else {
        const seg = targetWorm!.segments[targetWormSegIdx];
        seg.hp -= damage;
        seg.hitFlashTimerSec = WORM_SEGMENT_HIT_FLASH_SEC;
        tx = seg.xTile;
        ty = seg.yTile;
      }

      const angle = Math.atan2(ty - yTile, tx - xTile);
      turretAngleRad.set(idx, angle);

      const fromX = xTile * tileSizePx + half;
      const fromY = yTile * tileSizePx + half;
      shotFlashes.push({
        fromXPx: fromX,
        fromYPx: fromY,
        toXPx: Math.round(tx * tileSizePx + half),
        toYPx: Math.round(ty * tileSizePx + half),
        ageSec: 0,
      });

      // Muzzle flash at barrel tip
      muzzleFlashes.push({ xPx: fromX + Math.cos(angle) * GATLING_BARREL_OFFSET_PX, yPx: fromY + Math.sin(angle) * GATLING_BARREL_OFFSET_PX, ageSec: 0 });

      // Shell casing ejected at ~90° from firing direction with randomness
      const ejectAngle = angle + Math.PI / 2 + (Math.random() - 0.5) * SHELL_EJECT_ANGLE_VARIANCE_RAD;
      const ejectSpeed = SHELL_EJECT_BASE_SPEED_PX + Math.random() * SHELL_EJECT_SPEED_VARIANCE_PX;
      shellCasings.push({
        xPx: fromX,
        yPx: fromY,
        vxPx: Math.cos(ejectAngle) * ejectSpeed,
        vyPx: Math.sin(ejectAngle) * ejectSpeed,
        ageSec: 0,
        maxAgeSec: SHELL_CASING_MIN_LIFETIME_SEC + Math.random() * SHELL_CASING_LIFETIME_VARIANCE_SEC,
      });
    }
  }

  // Remove gatling-killed enemies and award ore
  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    if (enemies[i].hp <= 0) {
      enemies.splice(i, 1);
      ore += 2;
      totalOreEarned += 2;
      totalEnemiesKilled += 1;
    }
  }
  cleanDeadWormSegments();

  // Advance muzzle flashes
  for (let i = muzzleFlashes.length - 1; i >= 0; i -= 1) {
    muzzleFlashes[i].ageSec += dtSec;
    if (muzzleFlashes[i].ageSec > MUZZLE_FLASH_DURATION_SEC) { muzzleFlashes.splice(i, 1); }
  }

  // Update shell casings: move, bounce off solids, apply gravity, age out
  for (let i = shellCasings.length - 1; i >= 0; i -= 1) {
    const c = shellCasings[i];
    c.ageSec += dtSec;
    if (c.ageSec >= c.maxAgeSec) { shellCasings.splice(i, 1); continue; }
    const newX = c.xPx + c.vxPx * dtSec;
    const newY = c.yPx + c.vyPx * dtSec;
    if (isSolidPixel(newX, c.yPx)) { c.vxPx *= SHELL_CASING_BOUNCE_RESTITUTION; } else { c.xPx = newX; }
    if (isSolidPixel(c.xPx, newY)) { c.vyPx *= SHELL_CASING_BOUNCE_RESTITUTION; } else { c.yPx = newY; }
    c.vyPx += SHELL_CASING_GRAVITY_PX_PER_SEC2 * dtSec;
    c.vxPx *= SHELL_CASING_FRICTION;
  }
}

// ── Cannon turret – slow, high-damage, ore-fed ────────────────────────────────
function spawnRepairSparkles(xPx: number, yPx: number, color: string, count: number = 6): void {
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    const speed = 8 + Math.random() * 12;
    repairSparkles.push({
      xPx, yPx,
      vxPx: Math.cos(angle) * speed,
      vyPx: Math.sin(angle) * speed,
      ageSec: 0,
      maxAgeSec: REPAIR_SPARKLE_MAX_AGE_SEC,
      r, g, b,
    });
  }
}

// ── Auto-Repair building ──────────────────────────────────────────────────────
function updateRepairers(dtSec: number): void {
  for (let yTile = 0; yTile < gridHeightTile; yTile += 1) {
    for (let xTile = 0; xTile < gridWidthTile; xTile += 1) {
      const idx = tileIndex(xTile, yTile);
      if (structures[idx] !== 'repairer') { continue; }
      if (ore < REPAIRER_ORE_PER_PULSE) { continue; }

      let timer = repairerTimers.get(idx) ?? 0;
      timer -= dtSec;
      if (timer > 0) { repairerTimers.set(idx, timer); continue; }

      // Find an adjacent damaged structure within range
      let bestIdx = -1;
      let bestMissing = 0;
      const rangeCell = Math.ceil(REPAIRER_RANGE_TILE);
      for (let dy = -rangeCell; dy <= rangeCell; dy += 1) {
        for (let dx = -rangeCell; dx <= rangeCell; dx += 1) {
          if (dx === 0 && dy === 0) { continue; }
          if (Math.hypot(dx, dy) > REPAIRER_RANGE_TILE) { continue; }
          const nx = xTile + dx;
          const ny = yTile + dy;
          if (!isInBounds(nx, ny)) { continue; }
          const ni = tileIndex(nx, ny);
          const hp = structureHp.get(ni);
          if (hp === undefined) { continue; }
          const s = structures[ni];
          const maxHp = STRUCTURE_MAX_HP[s] ?? 0;
          const missing = maxHp - hp;
          if (missing > bestMissing) {
            bestMissing = missing;
            bestIdx = ni;
          }
        }
      }

      if (bestIdx < 0) { repairerTimers.set(idx, REPAIRER_REPAIR_INTERVAL_SEC); continue; }

      ore -= REPAIRER_ORE_PER_PULSE;
      const currentHp = structureHp.get(bestIdx)!;
      const s = structures[bestIdx];
      const maxHp = STRUCTURE_MAX_HP[s] ?? 0;
      structureHp.set(bestIdx, Math.min(maxHp, currentHp + REPAIRER_REPAIR_AMOUNT_HP));

      const targetX = (bestIdx % gridWidthTile + 0.5) * tileSizePx;
      const targetY = (Math.floor(bestIdx / gridWidthTile) + 0.5) * tileSizePx;
      spawnRepairSparkles(targetX, targetY, '#44ff88', 4);
      repairerTimers.set(idx, REPAIRER_REPAIR_INTERVAL_SEC);
    }
  }
}


function updateCannonTurrets(dtSec: number): void {
  const half = tileSizePx / 2;
  const damage = CANNON_BASE_DAMAGE;

  for (let yTile = 0; yTile < gridHeightTile; yTile += 1) {
    for (let xTile = 0; xTile < gridWidthTile; xTile += 1) {
      const idx = tileIndex(xTile, yTile);
      if (structures[idx] !== 'cannon') { continue; }

      const ammo = cannonAmmo.get(idx) ?? 0;
      if (ammo <= 0) { continue; }

      let cooldown = cannonFireCooldowns.get(idx) ?? 0;
      cooldown -= dtSec;
      if (cooldown > 0) { cannonFireCooldowns.set(idx, cooldown); continue; }

      // Find nearest target within cannon range
      let targetEnemy: Enemy | undefined;
      let targetWorm: Worm | undefined;
      let targetWormSegIdx = -1;
      let bestDist = Number.POSITIVE_INFINITY;

      for (const enemy of enemies) {
        const dist = Math.hypot(enemy.xTile - xTile, enemy.yTile - yTile);
        if (dist < CANNON_RANGE_TILE && dist < bestDist) {
          bestDist = dist;
          targetEnemy = enemy;
          targetWorm = undefined;
        }
      }
      for (const worm of worms) {
        for (let si = 0; si < worm.segments.length; si += 1) {
          const seg = worm.segments[si];
          const dist = Math.hypot(seg.xTile - xTile, seg.yTile - yTile);
          if (dist < CANNON_RANGE_TILE && dist < bestDist) {
            bestDist = dist;
            targetWorm = worm;
            targetWormSegIdx = si;
            targetEnemy = undefined;
          }
        }
      }

      if (!targetEnemy && targetWorm === undefined) { continue; }

      cooldown = CANNON_FIRE_COOLDOWN_SEC;
      cannonFireCooldowns.set(idx, cooldown);
      cannonAmmo.set(idx, ammo - 1);

      let tx: number;
      let ty: number;
      if (targetEnemy) {
        targetEnemy.hp -= damage;
        tx = targetEnemy.xTile;
        ty = targetEnemy.yTile;
      } else {
        const seg = targetWorm!.segments[targetWormSegIdx];
        seg.hp -= damage;
        seg.hitFlashTimerSec = WORM_SEGMENT_HIT_FLASH_SEC;
        tx = seg.xTile;
        ty = seg.yTile;
      }

      const angle = Math.atan2(ty - yTile, tx - xTile);
      turretAngleRad.set(idx, angle);

      // Orange shot flash for cannon
      const fromX = xTile * tileSizePx + half;
      const fromY = yTile * tileSizePx + half;
      shotFlashes.push({
        fromXPx: fromX,
        fromYPx: fromY,
        toXPx: Math.round(tx * tileSizePx + half),
        toYPx: Math.round(ty * tileSizePx + half),
        ageSec: 0,
        flashColor: '#ff7733',
      });

      // Muzzle flash at barrel tip
      muzzleFlashes.push({
        xPx: fromX + Math.cos(angle) * (GATLING_BARREL_OFFSET_PX + 2),
        yPx: fromY + Math.sin(angle) * (GATLING_BARREL_OFFSET_PX + 2),
        ageSec: 0,
      });
    }
  }

  // Remove cannon-killed enemies
  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    if (enemies[i].hp <= 0) {
      enemies.splice(i, 1);
      ore += 2;
      totalOreEarned += 2;
      totalEnemiesKilled += 1;
    }
  }
  cleanDeadWormSegments();
}

// ── Rebuild utilities ──────────────────────────────────────────────────────────

/** Returns true if the given structure type matches the current rebuild filter. */
function ghostMatchesFilter(ghost: Structure): boolean {
  if (rebuildFilterMode === 'all') { return true; }
  if (rebuildFilterMode === 'walls') { return ghost === 'wall'; }
  if (rebuildFilterMode === 'combat') { return ghost === 'turret' || ghost === 'gatling' || ghost === 'cannon'; }
  // 'logistics'
  return ghost === 'conveyor' || ghost === 'extractor' || ghost === 'splitter' || ghost === 'crusher' || ghost === 'radar';
}

/** Rebuild all blueprint ghosts the player can currently afford (cheapest first). */
function rebuildAffordableGhosts(): void {
  // Collect all ghosts and sort by rebuild cost
  const ghosts: { idx: number; ghost: Structure; cost: number }[] = [];
  for (const [idx, ghost] of blueprintGhosts) {
    const s = structures[idx];
    if (s !== 'empty') { continue; }
    if (!ghostMatchesFilter(ghost)) { continue; }
    const cost = STRUCTURE_REBUILD_COST[ghost] ?? 0;
    ghosts.push({ idx, ghost, cost });
  }
  ghosts.sort((a, b) => a.cost - b.cost);

  let rebuilt = 0;
  for (const { idx, ghost, cost } of ghosts) {
    if (ore < cost) { continue; }
    structures[idx] = ghost;
    if (ghost === 'radar') {
      radarLevel += 1;
      revealRadiusTile = Math.min(10, revealRadiusTile + 1);
    }
    ore -= cost;
    structureHp.set(idx, STRUCTURE_MAX_HP[ghost] ?? STRUCTURE_MAX_HP.wall!);
    blueprintGhosts.delete(idx);
    rebuilt += 1;
  }
  if (rebuilt > 0) {
    distanceField = computeDistanceField();
    showOverlay(`REBUILT ${rebuilt}`, '#44ff88', 1.5);
  } else {
    showOverlay('NEED ORE', '#ff8844', 1.5);
  }
}

/** Rebuild ALL blueprint ghosts at once (requires enough ore for all). */
function rebuildAllGhosts(): void {
  const ghosts: { idx: number; ghost: Structure; cost: number }[] = [];
  let totalCost = 0;
  for (const [idx, ghost] of blueprintGhosts) {
    if (structures[idx] !== 'empty') { continue; }
    if (!ghostMatchesFilter(ghost)) { continue; }
    const cost = STRUCTURE_REBUILD_COST[ghost] ?? 0;
    ghosts.push({ idx, ghost, cost });
    totalCost += cost;
  }
  if (ghosts.length === 0) {
    showOverlay('NO GHOSTS', '#88ccff', 1.2);
    return;
  }
  if (ore < totalCost) {
    showOverlay(`NEED ${totalCost}${ORE_SYMBOL}`, '#ff8844', 1.5);
    return;
  }
  for (const { idx, ghost, cost } of ghosts) {
    structures[idx] = ghost;
    if (ghost === 'radar') {
      radarLevel += 1;
      revealRadiusTile = Math.min(10, revealRadiusTile + 1);
    }
    ore -= cost;
    structureHp.set(idx, STRUCTURE_MAX_HP[ghost] ?? STRUCTURE_MAX_HP.wall!);
    blueprintGhosts.delete(idx);
  }
  distanceField = computeDistanceField();
  showOverlay(`REBUILT ALL ${ghosts.length}`, '#44ff88', 1.5);
}

// ── Conveyor/Extractor/RoutedMote logic ──────────────────────────────────────

/** Returns true if any adjacent tile contains an extractor structure. */
function hasAdjacentExtractor(xTile: number, yTile: number): boolean {
  for (const [ddx, ddy] of ADJ_OFFSETS) {
    const nx = xTile + ddx;
    const ny = yTile + ddy;
    if (isInBounds(nx, ny) && structures[tileIndex(nx, ny)] === 'extractor') { return true; }
  }
  return false;
}

/** Returns true if (x,y) is one of the four ore/coal deposit tiles. */
function isDeposit(xTile: number, yTile: number): boolean {
  return (xTile === depositTile.x && yTile === depositTile.y)
    || (xTile === deposit2Tile.x && yTile === deposit2Tile.y)
    || (xTile === deposit3Tile.x && yTile === deposit3Tile.y)
    || (xTile === coalDepositTile.x && yTile === coalDepositTile.y);
}

/** True when tile (x,y) is a valid mote destination: core, turret, crusher, gatling, cannon, or splitter. */
function isRouteDest(xTile: number, yTile: number): boolean {
  if (xTile === coreTile.x && yTile === coreTile.y) { return true; }
  const idx = tileIndex(xTile, yTile);
  const s = structures[idx];
  return s === 'turret' || s === 'crusher' || s === 'gatling' || s === 'cannon' || s === 'splitter';
}

/**
 * Follow conveyor output directions starting from the tile adjacent to the
 * start tile in its output direction.  Returns the full tile path (including
 * start tile) if a valid destination is reached, or null if the route is
 * broken/cyclic/too long.
 * Pass dirOverride to use a specific output direction instead of looking it up
 * (used by splitters to compute their two onward routes).
 */
function findConveyorRoute(startX: number, startY: number, dirOverride?: number): { pathXTile: number[]; pathYTile: number[] } | null {
  const MAX_PATH = 64;
  const visited = new Set<number>();
  const pathX: number[] = [startX];
  const pathY: number[] = [startY];
  visited.add(tileIndex(startX, startY));

  const startIdx = tileIndex(startX, startY);
  const dir = dirOverride ?? (conveyorDirection.get(startIdx) ?? 0);
  const [dx, dy] = DIR_OFFSETS[dir];
  let cx = startX + dx;
  let cy = startY + dy;

  while (pathX.length < MAX_PATH) {
    if (!isInBounds(cx, cy)) { return null; }
    if (isDeposit(cx, cy)) { return null; }

    const idx = tileIndex(cx, cy);
    if (visited.has(idx)) { return null; } // cycle

    pathX.push(cx);
    pathY.push(cy);

    if (isRouteDest(cx, cy)) {
      return { pathXTile: pathX, pathYTile: pathY };
    }

    if (structures[idx] !== 'conveyor') { return null; }

    visited.add(idx);
    const nextDir = conveyorDirection.get(idx) ?? 0;
    const [ndx, ndy] = DIR_OFFSETS[nextDir];
    cx += ndx;
    cy += ndy;
  }
  return null; // too long
}

/** Detect ore type produced by an extractor based on the adjacent deposit. */
function extractorResourceType(extX: number, extY: number): 'ore' | 'coal' | null {
  for (const [ddx, ddy] of ADJ_OFFSETS) {
    const nx = extX + ddx;
    const ny = extY + ddy;
    if (nx === depositTile.x && ny === depositTile.y) { return 'ore'; }
    if (nx === deposit2Tile.x && ny === deposit2Tile.y) { return 'ore'; }
    if (nx === deposit3Tile.x && ny === deposit3Tile.y) { return 'ore'; }
    if (nx === coalDepositTile.x && ny === coalDepositTile.y) { return 'coal'; }
  }
  return null; // no adjacent deposit
}

/** Spawn and move routed motes from each extractor tile. */
function updateExtractors(dtSec: number): void {
  for (let yTile = 0; yTile < gridHeightTile; yTile += 1) {
    for (let xTile = 0; xTile < gridWidthTile; xTile += 1) {
      const idx = tileIndex(xTile, yTile);
      if (structures[idx] !== 'extractor') { continue; }

      const resType = extractorResourceType(xTile, yTile);
      if (!resType) {
        extractorHasRoute.set(idx, false);
        continue;
      }

      const route = findConveyorRoute(xTile, yTile);
      extractorHasRoute.set(idx, route !== null);
      if (!route) { continue; }

      const spawnInterval = resType === 'ore' ? EXTRACTOR_ORE_SPAWN_SEC : EXTRACTOR_COAL_SPAWN_SEC;
      let cd = extractorSpawnCooldowns.get(idx) ?? spawnInterval;
      cd -= dtSec;
      if (cd <= 0) {
        cd = spawnInterval;
        routedMotes.push({
          pathXTile: route.pathXTile,
          pathYTile: route.pathYTile,
          segIndex: 0,
          progress: 0,
          resourceType: resType,
        });
      }
      extractorSpawnCooldowns.set(idx, cd);
    }
  }
}

/** Deliver a mote that has reached the end of its route to its destination. */
function deliverMote(mote: RoutedMote): void {
  const destX = mote.pathXTile[mote.pathXTile.length - 1];
  const destY = mote.pathYTile[mote.pathYTile.length - 1];

  if (destX === coreTile.x && destY === coreTile.y) {
    if (mote.resourceType === 'ore') {
      ore += 1;
      totalOreEarned += 1;
    } else {
      coal += 1;
    }
    return;
  }

  const idx = tileIndex(destX, destY);
  const s = structures[idx];

  if (s === 'splitter') {
    // Splitter: alternately forward the mote down the primary or secondary onward route.
    // Primary output = conveyorDirection for this splitter.
    // Secondary output = primary + 1 (mod 4), i.e. 90° clockwise.
    const primaryDir = conveyorDirection.get(idx) ?? 0;
    const secondaryDir = (primaryDir + 1) % 4;
    const usePrimary = !(splitterToggle.get(idx) ?? false);
    splitterToggle.set(idx, !usePrimary); // toggle: store the opposite so next mote uses the other output

    const firstDir = usePrimary ? primaryDir : secondaryDir;
    const fallbackDir = usePrimary ? secondaryDir : primaryDir;
    let route = findConveyorRoute(destX, destY, firstDir);
    if (!route) {
      route = findConveyorRoute(destX, destY, fallbackDir);
    }
    if (route) {
      routedMotes.push({
        pathXTile: route.pathXTile,
        pathYTile: route.pathYTile,
        segIndex: 0,
        progress: 0,
        resourceType: mote.resourceType,
      });
    }
    return;
  }

  if (s === 'turret' && mote.resourceType === 'ore') {
    const cur = turretAmmo.get(idx) ?? 0;
    // Silently cap at max ammo; the extractor simply stops spawning while route is valid,
    // but over-delivery just wastes the mote — no separate feedback needed for MVP.
    turretAmmo.set(idx, Math.min(cur + 1, TURRET_AMMO_MAX));
  } else if (s === 'cannon' && mote.resourceType === 'ore') {
    const cur = cannonAmmo.get(idx) ?? 0;
    cannonAmmo.set(idx, Math.min(cur + 1, CANNON_AMMO_MAX));
  } else if (s === 'crusher' && mote.resourceType === 'coal') {
    // Coal arrives in the global coal pool; updateCrushers() drains it into gunpowder.
    // Routing coal to a crusher tile is identical to routing it to the core for now —
    // both feed the same pool — but destination choice matters when per-building
    // storage is added (future: crusher has its own coal buffer).
    coal += 1;
  } else if (s === 'crusher' && mote.resourceType === 'ore') {
    // Ore into crusher has no meaningful conversion yet; credit it as raw ore (fallback).
    ore += 1;
    totalOreEarned += 1;
  }
}

/** Advance all in-flight routed motes along their conveyor chains. */
function updateRoutedMotes(dtSec: number): void {
  const speedPerSec = CONVEYOR_MOTE_SPEED; // segments per second
  for (let i = routedMotes.length - 1; i >= 0; i -= 1) {
    const m = routedMotes[i];
    m.progress += dtSec * speedPerSec;
    while (m.progress >= 1) {
      m.progress -= 1;
      m.segIndex += 1;
      if (m.segIndex >= m.pathXTile.length - 1) {
        // Reached destination
        deliverMote(m);
        routedMotes.splice(i, 1);
        break;
      }
    }
  }
}

function updateTutorialHints(): void {
  // Don't interrupt a visible overlay
  if (overlayTimerSec > 0.5) { return; }

  // Mining hint: no extractors placed after 15s
  if (!shownMiningHint && elapsedSec > 15 && extractorHasRoute.size === 0) {
    shownMiningHint = true;
    showOverlay('PLACE EXTRACTOR [X] NEXT TO DEPOSIT', '#99ffcc', 4.5);
    return;
  }

  // Routing hint: extractor placed but not connected to core (only after extractors exist)
  if (!shownRouteHint && elapsedSec > 20 && extractorHasRoute.size > 0) {
    let hasUnrouted = false;
    for (const [, routed] of extractorHasRoute) {
      if (!routed) { hasUnrouted = true; break; }
    }
    if (hasUnrouted) {
      shownRouteHint = true;
      showOverlay('ROUTE CONVEYORS [V] TO THE CORE', '#99ffcc', 4.5);
      return;
    }
  }

  if (!shownWallHint && waveIndex >= 1) {
    let hasWall = false;
    for (let i = 0; i < structures.length; i += 1) {
      if (structures[i] === 'wall') { hasWall = true; break; }
    }
    if (!hasWall) {
      shownWallHint = true;
      showOverlay('BUILD WALLS [W] TO SLOW ENEMIES', '#99ffcc', 4.5);
      return;
    }
  }

  if (!shownTurretHint && waveIndex >= 2) {
    let hasCombat = false;
    for (let i = 0; i < structures.length; i += 1) {
      const s = structures[i];
      if (s === 'turret' || s === 'gatling' || s === 'cannon') { hasCombat = true; break; }
    }
    if (!hasCombat) {
      shownTurretHint = true;
      showOverlay('BUILD TURRET [T] TO DEFEND CORE', '#99ffcc', 4.5);
      return;
    }
  }

  if (!shownRadarHint && waveIndex >= 3) {
    let hasRadar = false;
    for (let i = 0; i < structures.length; i += 1) {
      if (structures[i] === 'radar') { hasRadar = true; break; }
    }
    if (!hasRadar) {
      shownRadarHint = true;
      showOverlay('BUILD RADAR [R] TO EXPAND AREA', '#99ffcc', 4.5);
    }
  }
}

function update(dtSec: number): void {
  // Advance day/night cycle (real-time, independent of wave timing)
  const environmentDtSec = dtSec * (isDayNightPreviewFast ? DAY_NIGHT_PREVIEW_SPEED : 1);
  environment.dayNightTimeSec = (environment.dayNightTimeSec + environmentDtSec) % DAY_NIGHT_CYCLE_SEC;
  updateWeather(dtSec);

  if (isRunOver) {
    if (gameOverDelaySec > 0) {
      gameOverDelaySec -= dtSec;
      if (gameOverDelaySec <= 0) {
        resetRun();
      }
    }
    return;
  }

  if (overlayTimerSec > 0) {
    overlayTimerSec -= dtSec;
  }

  if (breachFlashTimerSec > 0) {
    breachFlashTimerSec = Math.max(0, breachFlashTimerSec - dtSec);
  }

  elapsedSec += dtSec;
  waveTimerSec -= dtSec;
  if (waveTimerSec <= 0) {
    waveTimerSec = Math.max(3.5, 8 - waveIndex * 0.2);
    spawnWave();
  }

  updateEnemies(dtSec);
  updateWorms(dtSec);
  updateTurrets(dtSec);
  updateGatlingTurrets(dtSec);
  updateCannonTurrets(dtSec);
  updateCrushers(dtSec);
  updateRepairers(dtSec);
  updateMotes(dtSec);
  updateExtractors(dtSec);
  updateRoutedMotes(dtSec);
  updateTutorialHints();

  // Advance repair sparkles
  for (let i = repairSparkles.length - 1; i >= 0; i -= 1) {
    const sp = repairSparkles[i];
    sp.ageSec += dtSec;
    if (sp.ageSec >= REPAIR_SPARKLE_MAX_AGE_SEC) { repairSparkles.splice(i, 1); continue; }
    sp.xPx += sp.vxPx * dtSec;
    sp.yPx += sp.vyPx * dtSec;
    sp.vyPx += REPAIR_SPARKLE_GRAVITY_PX_PER_SEC2 * dtSec; // gravity
  }
}

// ── Draw helpers ───────────────────────────────────────────────────────────

function isTileVisible(xTile: number, yTile: number): boolean {
  const dxTile = xTile - coreTile.x;
  const dyTile = yTile - coreTile.y;
  return Math.hypot(dxTile, dyTile) <= revealRadiusTile;
}

function fillPx(xPx: number, yPx: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(xPx, yPx, w, h);
}

function drawGroundTile(xPx: number, yPx: number): void {
  fillPx(xPx, yPx, tileSizePx, tileSizePx, '#101829');
  fillPx(xPx + tileSizePx - 1, yPx, 1, tileSizePx, '#1b2a45');
  fillPx(xPx, yPx + tileSizePx - 1, tileSizePx, 1, '#1b2a45');
}

function drawDebrisTile(xPx: number, yPx: number): void {
  fillPx(xPx, yPx, tileSizePx, tileSizePx, '#242e3d');
  fillPx(xPx + 1, yPx + 1, 10, 10, '#2e3a4e');
  fillPx(xPx + 2, yPx + 2, 3, 1, '#49536e');
  fillPx(xPx + 6, yPx + 3, 3, 1, '#49536e');
  fillPx(xPx + 3, yPx + 7, 4, 1, '#49536e');
  fillPx(xPx + 8, yPx + 8, 2, 1, '#49536e');
  fillPx(xPx + 4, yPx + 5, 4, 1, '#1a2030');
  fillPx(xPx + 2, yPx + 9, 3, 1, '#1a2030');
}

function drawWallTile(xPx: number, yPx: number): void {
  fillPx(xPx, yPx, tileSizePx, tileSizePx, '#3d556a');
  fillPx(xPx + 1, yPx + 1, 10, 10, '#4f6a82');
  fillPx(xPx + 1, yPx + 1, 10, 1, '#72909e');
  fillPx(xPx + 1, yPx + 1, 1, 9, '#72909e');
  fillPx(xPx + 1, yPx + 10, 10, 1, '#1e3040');
  fillPx(xPx + 10, yPx + 1, 1, 10, '#1e3040');
}

function drawTurretTile(xPx: number, yPx: number, idx: number): void {
  fillPx(xPx, yPx, tileSizePx, tileSizePx, '#091c28');
  fillPx(xPx + 3, yPx + 3, 6, 6, '#155a6a');
  fillPx(xPx + 5, yPx + 5, 2, 2, '#27e0ff');
  const angle = turretAngleRad.get(idx) ?? 0;
  ctx.fillStyle = '#27e0ff';
  for (let step = 2; step <= 6; step += 1) {
    const bxOff = Math.round(5 + Math.cos(angle) * step);
    const byOff = Math.round(5 + Math.sin(angle) * step);
    if (bxOff >= 0 && bxOff < tileSizePx && byOff >= 0 && byOff < tileSizePx) {
      ctx.fillRect(xPx + bxOff, yPx + byOff, 1, 1);
    }
  }
  const tipXOff = Math.round(5 + Math.cos(angle) * 6);
  const tipYOff = Math.round(5 + Math.sin(angle) * 6);
  if (tipXOff >= 0 && tipXOff < tileSizePx && tipYOff >= 0 && tipYOff < tileSizePx) {
    fillPx(xPx + tipXOff, yPx + tipYOff, 1, 1, '#aaf8ff');
  }

  // Ammo bar: fraction of TURRET_AMMO_MAX.  Red when empty (starved), cyan when loaded.
  const ammo = turretAmmo.get(idx) ?? 0;
  const ammoRatio = ammo / TURRET_AMMO_MAX;
  const barMaxW = tileSizePx - 2;
  const ammoW = Math.round(ammoRatio * barMaxW);
  ctx.fillStyle = '#0a2030';
  ctx.fillRect(xPx + 1, yPx + 1, barMaxW, 1);
  if (ammo <= 0) {
    // Starvation indicator: red empty bar
    ctx.fillStyle = '#ff2200';
    ctx.fillRect(xPx + 1, yPx + 1, 2, 1);
  } else {
    ctx.fillStyle = ammoRatio >= 0.5 ? '#27e0ff' : '#0e6680';
    ctx.fillRect(xPx + 1, yPx + 1, ammoW, 1);
  }
}

function drawRadarTile(xPx: number, yPx: number): void {
  fillPx(xPx, yPx, tileSizePx, tileSizePx, '#0e0828');
  fillPx(xPx + 1, yPx + 6, 10, 1, '#2a1870');
  fillPx(xPx + 6, yPx + 1, 1, 10, '#2a1870');
  const ringPixels: [number, number][] = [
    [5, 3], [6, 3], [7, 3], [3, 5], [3, 6], [3, 7],
    [5, 9], [6, 9], [7, 9], [9, 5], [9, 6], [9, 7],
  ];
  ctx.fillStyle = '#4d30b0';
  for (const [rx, ry] of ringPixels) {
    ctx.fillRect(xPx + rx, yPx + ry, 1, 1);
  }
  fillPx(xPx + 5, yPx + 5, 2, 2, '#8d68ff');
  ctx.fillStyle = '#5d40d0';
  ctx.fillRect(xPx + 1, yPx + 1, 2, 1);
  ctx.fillRect(xPx + 1, yPx + 1, 1, 2);
  ctx.fillRect(xPx + 9, yPx + 1, 2, 1);
  ctx.fillRect(xPx + 10, yPx + 1, 1, 2);
  ctx.fillRect(xPx + 1, yPx + 10, 2, 1);
  ctx.fillRect(xPx + 1, yPx + 9, 1, 2);
  ctx.fillRect(xPx + 9, yPx + 10, 2, 1);
  ctx.fillRect(xPx + 10, yPx + 9, 1, 2);
}

function drawCoreTile(xPx: number, yPx: number): void {
  const maxCoreHpForColor = BASE_CORE_HP + upgradeLevel.coreArmor * CORE_ARMOR_HP_PER_LEVEL;
  const hpFracCore = coreHp / maxCoreHpForColor;
  const coreColor = hpFracCore > coreHpHealthyThreshold / 100 ? '#33ffbb' : hpFracCore > coreHpDamagedThreshold / 100 ? '#ffee44' : '#ff5533';
  fillPx(xPx, yPx, tileSizePx, tileSizePx, '#050f0a');

  // Pulsing alarm glow when critically damaged
  if (!isRunOver && hpFracCore <= coreHpDamagedThreshold / 100) {
    const pulseAlpha = (Math.sin(elapsedSec * Math.PI * 4) * 0.5 + 0.5) * 0.35;
    ctx.fillStyle = `rgba(255,60,30,${pulseAlpha.toFixed(3)})`;
    ctx.fillRect(xPx, yPx, tileSizePx, tileSizePx);
  }

  ctx.fillStyle = coreColor;
  ctx.fillRect(xPx + 4, yPx + 4, 4, 4);
  ctx.fillRect(xPx + 5, yPx + 2, 2, 2);
  ctx.fillRect(xPx + 5, yPx + 8, 2, 2);
  ctx.fillRect(xPx + 2, yPx + 5, 2, 2);
  ctx.fillRect(xPx + 8, yPx + 5, 2, 2);
}

function drawDepositTile(xPx: number, yPx: number): void {
  fillPx(xPx, yPx, tileSizePx, tileSizePx, '#1a1000');
  fillPx(xPx + 2, yPx + 3, 3, 3, '#b87000');
  fillPx(xPx + 6, yPx + 2, 3, 3, '#b87000');
  fillPx(xPx + 4, yPx + 7, 3, 3, '#b87000');
  fillPx(xPx + 2, yPx + 3, 1, 1, '#ffd677');
  fillPx(xPx + 6, yPx + 2, 1, 1, '#ffd677');
  fillPx(xPx + 4, yPx + 7, 1, 1, '#ffd677');
}

function drawDeposit2Tile(xPx: number, yPx: number): void {
  fillPx(xPx, yPx, tileSizePx, tileSizePx, '#100a00');
  fillPx(xPx + 2, yPx + 3, 3, 3, '#7a4010');
  fillPx(xPx + 6, yPx + 2, 3, 3, '#7a4010');
  fillPx(xPx + 4, yPx + 7, 3, 3, '#7a4010');
  fillPx(xPx + 2, yPx + 3, 1, 1, '#ee8833');
  fillPx(xPx + 6, yPx + 2, 1, 1, '#ee8833');
  fillPx(xPx + 4, yPx + 7, 1, 1, '#ee8833');
  // orange tint highlight
  fillPx(xPx + 4, yPx + 4, 1, 1, '#ff9944');
}

function drawCoalDepositTile(xPx: number, yPx: number): void {
  fillPx(xPx, yPx, tileSizePx, tileSizePx, '#0d0d0e');
  fillPx(xPx + 2, yPx + 3, 3, 3, '#3a3a44');
  fillPx(xPx + 6, yPx + 2, 3, 3, '#3a3a44');
  fillPx(xPx + 4, yPx + 7, 3, 3, '#3a3a44');
  fillPx(xPx + 2, yPx + 3, 1, 1, '#7a7a88');
  fillPx(xPx + 6, yPx + 2, 1, 1, '#7a7a88');
  fillPx(xPx + 4, yPx + 7, 1, 1, '#7a7a88');
}

function drawCrusherTile(xPx: number, yPx: number): void {
  fillPx(xPx, yPx, tileSizePx, tileSizePx, '#1a1410');
  // body
  fillPx(xPx + 1, yPx + 2, 10, 8, '#5a4830');
  // top plate
  fillPx(xPx + 2, yPx + 2, 8, 2, '#7a6040');
  // crusher slots (dark openings)
  fillPx(xPx + 2, yPx + 4, 3, 3, '#1a1410');
  fillPx(xPx + 7, yPx + 4, 3, 3, '#1a1410');
  // highlights
  fillPx(xPx + 2, yPx + 2, 1, 1, '#cca060');
  fillPx(xPx + 9, yPx + 2, 1, 1, '#cca060');
}

function drawGatlingTile(xPx: number, yPx: number, idx: number): void {
  const half = tileSizePx / 2;
  const barMaxW = tileSizePx - 2;

  // ammo bar (top 1px, gold)
  const ammo = gatlingAmmo.get(idx) ?? 0;
  fillPx(xPx + 1, yPx, barMaxW, 1, '#333');
  const ammoW = Math.round(barMaxW * (ammo / GATLING_MAX_AMMO));
  if (ammoW > 0) { fillPx(xPx + 1, yPx, ammoW, 1, '#ffcc44'); }

  // fire cooldown bar (second row, amber)
  const cd = gatlingFireCooldowns.get(idx) ?? 0;
  fillPx(xPx + 1, yPx + 1, barMaxW, 1, '#222');
  const cdW = Math.round(barMaxW * Math.max(0, cd / GATLING_FIRE_COOLDOWN_SEC));
  if (cdW > 0) { fillPx(xPx + 1, yPx + 1, cdW, 1, '#cc7700'); }

  // base plate
  fillPx(xPx + 2, yPx + 2, 8, 8, '#403020');
  fillPx(xPx + 4, yPx + 4, 4, 4, '#604830');
  fillPx(xPx + 4, yPx + 4, 1, 1, '#ffcc44');

  // barrel pointing in turretAngleRad direction
  const angle = turretAngleRad.get(idx) ?? 0;
  const cx = xPx + half;
  const cy = yPx + half;
  ctx.save();
  ctx.strokeStyle = '#ffcc44';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(angle) * GATLING_BARREL_OFFSET_PX, cy + Math.sin(angle) * GATLING_BARREL_OFFSET_PX);
  ctx.stroke();
  ctx.restore();
}

// ── Cannon tile – heavy armored barrel, slow-fire, ore-fed ───────────────────
function drawCannonTile(xPx: number, yPx: number, idx: number): void {
  const half = tileSizePx / 2;
  const barMaxW = tileSizePx - 2;

  // Ammo bar (top, orange)
  const ammo = cannonAmmo.get(idx) ?? 0;
  fillPx(xPx + 1, yPx, barMaxW, 1, '#333');
  const ammoW = Math.round(barMaxW * (ammo / CANNON_AMMO_MAX));
  if (ammo <= 0) {
    ctx.fillStyle = '#ff2200';
    ctx.fillRect(xPx + 1, yPx, 2, 1);
  } else {
    fillPx(xPx + 1, yPx, ammoW, 1, '#ff7733');
  }

  // Cooldown bar (second row, dark orange)
  const cd = cannonFireCooldowns.get(idx) ?? 0;
  fillPx(xPx + 1, yPx + 1, barMaxW, 1, '#222');
  const cdW = Math.round(barMaxW * Math.max(0, cd / CANNON_FIRE_COOLDOWN_SEC));
  if (cdW > 0) { fillPx(xPx + 1, yPx + 1, cdW, 1, '#993300'); }

  // Heavy base (darker, more armored look than gatling)
  fillPx(xPx + 1, yPx + 2, 10, 8, '#302010');
  fillPx(xPx + 2, yPx + 3, 8, 6, '#4a3020');
  fillPx(xPx + 4, yPx + 4, 4, 4, '#603820');
  fillPx(xPx + 5, yPx + 5, 2, 2, '#ff7733');
  // Corner bolts
  fillPx(xPx + 2, yPx + 3, 1, 1, '#804020');
  fillPx(xPx + 9, yPx + 3, 1, 1, '#804020');
  fillPx(xPx + 2, yPx + 8, 1, 1, '#804020');
  fillPx(xPx + 9, yPx + 8, 1, 1, '#804020');

  // Barrel (thicker than gatling: 2px line)
  const angle = turretAngleRad.get(idx) ?? 0;
  const cx = xPx + half;
  const cy = yPx + half;
  ctx.save();
  ctx.strokeStyle = '#ff7733';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(angle) * (GATLING_BARREL_OFFSET_PX + 2), cy + Math.sin(angle) * (GATLING_BARREL_OFFSET_PX + 2));
  ctx.stroke();
  ctx.restore();
}

// ── Splitter tile – Y-fork shape, shows primary and secondary outputs ─────────
function drawSplitterTile(xPx: number, yPx: number, idx: number): void {
  const dir = conveyorDirection.get(idx) ?? 0;
  const secDir = (dir + 1) % 4;

  // Dark body
  fillPx(xPx, yPx, tileSizePx, tileSizePx, '#1a0a1a');
  fillPx(xPx + 1, yPx + 1, 10, 10, '#280a28');
  // Central junction
  fillPx(xPx + 4, yPx + 4, 4, 4, '#441144');
  fillPx(xPx + 5, yPx + 5, 2, 2, '#ff88ff');

  // Primary output arrow (magenta)
  const pColor = '#ff88ff';
  if (dir === 0) { fillPx(xPx + 8, yPx + 5, 3, 1, pColor); fillPx(xPx + 10, yPx + 4, 1, 3, pColor); }
  else if (dir === 1) { fillPx(xPx + 5, yPx + 8, 1, 3, pColor); fillPx(xPx + 4, yPx + 10, 3, 1, pColor); }
  else if (dir === 2) { fillPx(xPx + 1, yPx + 5, 3, 1, pColor); fillPx(xPx + 1, yPx + 4, 1, 3, pColor); }
  else { fillPx(xPx + 5, yPx + 1, 1, 3, pColor); fillPx(xPx + 4, yPx + 1, 3, 1, pColor); }

  // Secondary output arrow (dim magenta, 90° CW of primary)
  const sColor = '#994499';
  if (secDir === 0) { fillPx(xPx + 8, yPx + 5, 3, 1, sColor); }
  else if (secDir === 1) { fillPx(xPx + 5, yPx + 8, 1, 3, sColor); }
  else if (secDir === 2) { fillPx(xPx + 1, yPx + 5, 3, 1, sColor); }
  else { fillPx(xPx + 5, yPx + 1, 1, 3, sColor); }
}

// ── Conveyor belt tile – directional arrow on dark track background ───────────
function drawRepairerTile(xPx: number, yPx: number): void {
  // Dark green body
  fillPx(xPx, yPx, tileSizePx, tileSizePx, '#071a0d');
  fillPx(xPx + 1, yPx + 1, 10, 10, '#0e2a17');
  // Cross symbol (green)
  fillPx(xPx + 5, yPx + 2, 2, 8, '#22cc66');
  fillPx(xPx + 2, yPx + 5, 8, 2, '#22cc66');
  // Highlight center
  fillPx(xPx + 5, yPx + 5, 2, 2, '#88ffaa');
}

function drawConveyorTile(xPx: number, yPx: number, idx: number): void {
  const dir = conveyorDirection.get(idx) ?? 0;
  // dark belt body
  fillPx(xPx, yPx, tileSizePx, tileSizePx, '#0d1a1a');
  fillPx(xPx + 1, yPx + 1, 10, 10, '#112222');
  // belt tracks (two parallel lines)
  if (dir === 0 || dir === 2) {
    // horizontal
    fillPx(xPx + 1, yPx + 3, 10, 1, '#1a3a3a');
    fillPx(xPx + 1, yPx + 8, 10, 1, '#1a3a3a');
  } else {
    // vertical
    fillPx(xPx + 3, yPx + 1, 1, 10, '#1a3a3a');
    fillPx(xPx + 8, yPx + 1, 1, 10, '#1a3a3a');
  }
  // directional arrow pixel art (5×5 centred)
  const arrowColor = '#22ddbb';
  if (dir === 0) { // East →
    fillPx(xPx + 4, yPx + 5, 4, 1, arrowColor);
    fillPx(xPx + 6, yPx + 4, 1, 3, arrowColor);
    fillPx(xPx + 7, yPx + 5, 1, 1, arrowColor);
  } else if (dir === 2) { // West ←
    fillPx(xPx + 4, yPx + 5, 4, 1, arrowColor);
    fillPx(xPx + 4, yPx + 4, 1, 3, arrowColor);
    fillPx(xPx + 3, yPx + 5, 1, 1, arrowColor);
  } else if (dir === 1) { // South ↓
    fillPx(xPx + 5, yPx + 4, 1, 4, arrowColor);
    fillPx(xPx + 4, yPx + 6, 3, 1, arrowColor);
    fillPx(xPx + 5, yPx + 7, 1, 1, arrowColor);
  } else { // North ↑
    fillPx(xPx + 5, yPx + 4, 1, 4, arrowColor);
    fillPx(xPx + 4, yPx + 4, 3, 1, arrowColor);
    fillPx(xPx + 5, yPx + 3, 1, 1, arrowColor);
  }
}

// ── Extractor tile – gear-like body, directional output indicator ─────────────
function drawExtractorTile(xPx: number, yPx: number, idx: number): void {
  const dir = conveyorDirection.get(idx) ?? 0;
  const hasRoute = extractorHasRoute.get(idx) ?? true; // assume OK until first route eval
  // body
  fillPx(xPx, yPx, tileSizePx, tileSizePx, '#1a0f00');
  fillPx(xPx + 2, yPx + 2, 8, 8, '#5a3800');
  fillPx(xPx + 3, yPx + 3, 6, 6, '#7a5200');
  fillPx(xPx + 5, yPx + 5, 2, 2, '#f0a600');
  // gear teeth
  fillPx(xPx + 5, yPx + 1, 2, 2, '#5a3800');
  fillPx(xPx + 5, yPx + 9, 2, 2, '#5a3800');
  fillPx(xPx + 1, yPx + 5, 2, 2, '#5a3800');
  fillPx(xPx + 9, yPx + 5, 2, 2, '#5a3800');
  // output direction indicator (small cyan arrow on edge)
  const arrowColor = hasRoute ? '#22ddbb' : '#ff3300';
  if (dir === 0) { fillPx(xPx + 10, yPx + 5, 2, 1, arrowColor); }
  else if (dir === 1) { fillPx(xPx + 5, yPx + 10, 1, 2, arrowColor); }
  else if (dir === 2) { fillPx(xPx, yPx + 5, 2, 1, arrowColor); }
  else { fillPx(xPx + 5, yPx, 1, 2, arrowColor); }
}

function drawEnemyHpBar(xPx: number, yPx: number, hp: number, maxHp: number): void {
  const barW = tileSizePx - 2;
  const barXPx = xPx + 1;
  const barYPx = yPx - 3;
  ctx.fillStyle = '#300000';
  ctx.fillRect(barXPx, barYPx, barW, 2);
  const fillW = Math.max(0, Math.round(barW * (hp / maxHp)));
  if (fillW > 0) {
    ctx.fillStyle = hp / maxHp > 0.5 ? '#44ff88' : '#ff8844';
    ctx.fillRect(barXPx, barYPx, fillW, 2);
  }
}

function drawStructureHpBar(xPx: number, yPx: number, hp: number, maxHp: number): void {
  const ratio = hp / maxHp;
  if (ratio >= 1) {
    return;
  }
  const barW = tileSizePx - 2;
  ctx.fillStyle = '#1a0505';
  ctx.fillRect(xPx + 1, yPx + tileSizePx - 2, barW, 1);
  const fillW = Math.max(1, Math.round(barW * ratio));
  ctx.fillStyle = ratio > STRUCTURE_HP_BAR_WARN_THRESHOLD ? HP_BAR_COLOR_HEALTHY : HP_BAR_COLOR_CRITICAL;
  ctx.fillRect(xPx + 1, yPx + tileSizePx - 2, fillW, 1);
}

function drawBlueprintGhost(xPx: number, yPx: number, ghostType: Structure): void {
  if (ghostType === 'wall') {
    ctx.fillStyle = 'rgba(106,143,175,0.18)';
    ctx.fillRect(xPx + 1, yPx + 1, tileSizePx - 2, tileSizePx - 2);
    ctx.strokeStyle = 'rgba(106,143,175,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(xPx + 0.5, yPx + 0.5, tileSizePx - 1, tileSizePx - 1);
  } else if (ghostType === 'turret') {
    ctx.fillStyle = 'rgba(39,224,255,0.12)';
    ctx.fillRect(xPx + 1, yPx + 1, tileSizePx - 2, tileSizePx - 2);
    ctx.strokeStyle = 'rgba(39,224,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(xPx + 0.5, yPx + 0.5, tileSizePx - 1, tileSizePx - 1);
    ctx.fillStyle = 'rgba(39,224,255,0.3)';
    ctx.fillRect(xPx + 4, yPx + 4, 4, 4);
  } else if (ghostType === 'radar') {
    ctx.fillStyle = 'rgba(141,104,255,0.12)';
    ctx.fillRect(xPx + 1, yPx + 1, tileSizePx - 2, tileSizePx - 2);
    ctx.strokeStyle = 'rgba(141,104,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(xPx + 0.5, yPx + 0.5, tileSizePx - 1, tileSizePx - 1);
    ctx.fillStyle = 'rgba(141,104,255,0.3)';
    ctx.fillRect(xPx + 5, yPx + 5, 2, 2);
  } else if (ghostType === 'crusher') {
    ctx.fillStyle = 'rgba(200,160,80,0.12)';
    ctx.fillRect(xPx + 1, yPx + 1, tileSizePx - 2, tileSizePx - 2);
    ctx.strokeStyle = 'rgba(200,160,80,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(xPx + 0.5, yPx + 0.5, tileSizePx - 1, tileSizePx - 1);
  } else if (ghostType === 'gatling') {
    ctx.fillStyle = 'rgba(255,204,68,0.12)';
    ctx.fillRect(xPx + 1, yPx + 1, tileSizePx - 2, tileSizePx - 2);
    ctx.strokeStyle = 'rgba(255,204,68,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(xPx + 0.5, yPx + 0.5, tileSizePx - 1, tileSizePx - 1);
    ctx.fillStyle = 'rgba(255,204,68,0.3)';
    ctx.fillRect(xPx + 4, yPx + 4, 4, 4);
  } else if (ghostType === 'cannon') {
    ctx.fillStyle = 'rgba(255,119,51,0.12)';
    ctx.fillRect(xPx + 1, yPx + 1, tileSizePx - 2, tileSizePx - 2);
    ctx.strokeStyle = 'rgba(255,119,51,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(xPx + 0.5, yPx + 0.5, tileSizePx - 1, tileSizePx - 1);
    ctx.fillStyle = 'rgba(255,119,51,0.3)';
    ctx.fillRect(xPx + 4, yPx + 4, 4, 4);
  } else if (ghostType === 'splitter') {
    ctx.fillStyle = 'rgba(255,136,255,0.12)';
    ctx.fillRect(xPx + 1, yPx + 1, tileSizePx - 2, tileSizePx - 2);
    ctx.strokeStyle = 'rgba(255,136,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(xPx + 0.5, yPx + 0.5, tileSizePx - 1, tileSizePx - 1);
  }
}

function drawWorm(worm: Worm): void {
  const segs = worm.segments;
  if (segs.length === 0) { return; }
  const half = tileSizePx / 2;
  const isArmored = worm.isArmored === true;

  // Draw smooth body skin using midpoint quadratic bezier
  if (segs.length >= 2) {
    ctx.save();
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = isArmored ? '#4a5c44' : '#7a3310';
    ctx.beginPath();
    ctx.moveTo(segs[0].xTile * tileSizePx + half, segs[0].yTile * tileSizePx + half);
    for (let i = 1; i < segs.length - 1; i += 1) {
      const cpX = segs[i].xTile * tileSizePx + half;
      const cpY = segs[i].yTile * tileSizePx + half;
      const nextX = segs[i + 1].xTile * tileSizePx + half;
      const nextY = segs[i + 1].yTile * tileSizePx + half;
      ctx.quadraticCurveTo(cpX, cpY, (cpX + nextX) / 2, (cpY + nextY) / 2);
    }
    ctx.lineTo(segs[segs.length - 1].xTile * tileSizePx + half, segs[segs.length - 1].yTile * tileSizePx + half);
    ctx.stroke();
    ctx.restore();
  }

  // Draw segments tail-to-head so head renders on top
  for (let i = segs.length - 1; i >= 0; i -= 1) {
    const seg = segs[i];
    const cx = seg.xTile * tileSizePx + half;
    const cy = seg.yTile * tileSizePx + half;
    const hpRatio = seg.hp / seg.maxHp;
    const isFlashing = (seg.hitFlashTimerSec ?? 0) > 0;
    let segColor: string;
    if (isFlashing) {
      segColor = '#ffffff';
    } else if (i === 0) {
      segColor = isArmored ? '#8ab080' : '#ff9944';
    } else {
      if (isArmored) {
        segColor = hpRatio > 0.5 ? '#5a7050' : '#6e3a2a';
      } else {
        segColor = hpRatio > 0.5 ? '#cc5522' : '#dd3300';
      }
    }
    ctx.fillStyle = segColor;
    ctx.beginPath();
    ctx.arc(cx, cy, i === 0 ? 3 : 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw eyes on the worm head, oriented toward movement direction
  if (segs.length >= 2) {
    const dx = segs[0].xTile - segs[1].xTile;
    const dy = segs[0].yTile - segs[1].yTile;
    const len = Math.hypot(dx, dy);
    if (len > 0.001) {
      const forwardX = dx / len;
      const forwardY = dy / len;
      const rightX = -forwardY; // rightward perpendicular
      const rightY = forwardX;
      const headCenterXPx = segs[0].xTile * tileSizePx + half;
      const headCenterYPx = segs[0].yTile * tileSizePx + half;
      ctx.fillStyle = '#1a0800';
      ctx.fillRect(Math.round(headCenterXPx + rightX * 1.4 + forwardX * 1.4), Math.round(headCenterYPx + rightY * 1.4 + forwardY * 1.4), 1, 1);
      ctx.fillRect(Math.round(headCenterXPx - rightX * 1.4 + forwardX * 1.4), Math.round(headCenterYPx - rightY * 1.4 + forwardY * 1.4), 1, 1);
    }
  }
}

// ── Environment helpers ────────────────────────────────────────────────────

/** Returns how strongly a transition window is active: 1 at its midpoint, 0 outside. */
function phaseWindowPeak(phase: number, start: number, end: number): number {
  if (phase < start || phase > end) return 0;
  const half = (end - start) / 2;
  return 1 - Math.abs(phase - (start + half)) / half;
}

function getSunState(env: EnvironmentState): SunState {
  const phase = env.dayNightTimeSec / DAY_NIGHT_CYCLE_SEC;

  // Raw daylight 0..1 across sunrise/sunset windows
  let raw: number;
  if (phase < SUNRISE_START_PHASE || phase > SUNSET_END_PHASE) {
    raw = 0;
  } else if (phase < SUNRISE_END_PHASE) {
    raw = (phase - SUNRISE_START_PHASE) / (SUNRISE_END_PHASE - SUNRISE_START_PHASE);
  } else if (phase < SUNSET_START_PHASE) {
    raw = 1;
  } else {
    raw = 1 - (phase - SUNSET_START_PHASE) / (SUNSET_END_PHASE - SUNSET_START_PHASE);
  }
  const daylightAmount = raw * raw * (3 - 2 * raw); // smoothstep
  const isNight = daylightAmount < 0.01;

  // Sun sweeps east→west during the day; altitude peaks at noon
  const dayFrac = clamp(
    (phase - SUNRISE_END_PHASE) / (SUNSET_START_PHASE - SUNRISE_END_PHASE),
    0, 1,
  );
  const altitude = Math.sin(dayFrac * Math.PI); // 0 at horizon, 1 at noon
  const sweepAngle = dayFrac * Math.PI;
  const dirX = Math.cos(sweepAngle);          // +1=east(dawn), 0=noon, -1=west(dusk)
  const dirY = -Math.sin(sweepAngle) * 0.35;  // slight north-tilt shadow at noon

  // Warmth peaks at midpoint of each sunrise/sunset window
  const warmthAmount = Math.max(
    phaseWindowPeak(phase, SUNRISE_START_PHASE, SUNRISE_END_PHASE),
    phaseWindowPeak(phase, SUNSET_START_PHASE,  SUNSET_END_PHASE),
  );

  return { phase, altitude, dirX, dirY, daylightAmount, warmthAmount, isNight };
}

function drawTileShadows(sunState: SunState): void {
  if (sunState.daylightAmount < 0.05 || sunState.isNight) return;
  const { dirX, dirY, daylightAmount, altitude } = sunState;
  const lowSunAmount = clamp(1 - altitude, 0, 1);
  if (lowSunAmount < 0.12) return;
  const shadowStepCount = Math.floor(lowSunAmount * 6);
  const shadowDirLen = Math.hypot(dirX, dirY);
  if (shadowDirLen <= 0.001) return;
  const stepX = -dirX / shadowDirLen;
  const stepY = -dirY / shadowDirLen;
  const baseAlpha = SHADOW_MAX_ALPHA * daylightAmount * lowSunAmount * lowSunAmount;
  if (shadowStepCount <= 0 || baseAlpha <= 0.01) return;

  ctx.save();
  ctx.fillStyle = '#000000';

  for (let yTile = 0; yTile < gridHeightTile; yTile += 1) {
    for (let xTile = 0; xTile < gridWidthTile; xTile += 1) {
      const index = tileIndex(xTile, yTile);
      if (!isTileVisible(xTile, yTile)) continue;
      const isCaster = terrainIsDebris[index]
        || structures[index] !== 'empty'
        || (xTile === coreTile.x && yTile === coreTile.y);
      if (!isCaster) continue;
      for (let stepIndex = 1; stepIndex <= shadowStepCount; stepIndex += 1) {
        const destXTile = Math.round(xTile + stepX * stepIndex);
        const destYTile = Math.round(yTile + stepY * stepIndex);
        if (!isInBounds(destXTile, destYTile) || !isTileVisible(destXTile, destYTile)) continue;
        if (destXTile === xTile && destYTile === yTile) continue;
        const destIndex = tileIndex(destXTile, destYTile);
        if (structures[destIndex] !== 'empty') continue;
        if (terrainIsDebris[destIndex]) continue;
        if (destXTile === coreTile.x && destYTile === coreTile.y) continue;
        const alpha = baseAlpha * (1 - (stepIndex - 1) / (shadowStepCount + 1));
        ctx.globalAlpha = alpha;
        const shrinkPx = Math.min(4, stepIndex);
        ctx.fillRect(
          destXTile * tileSizePx + shrinkPx,
          destYTile * tileSizePx + shrinkPx,
          tileSizePx - shrinkPx * 2,
          tileSizePx - shrinkPx * 2,
        );
      }
    }
  }
  ctx.restore();
}

// Each entry: [x-offset from canvas centre (px), beam width (px)]
const SUNBEAM_DEFS: readonly [number, number][] = [
  [-65, 5], [-42, 8], [-18, 3], [12, 9], [38, 5], [62, 4],
];

function drawSunBeams(sunState: SunState): void {
  if (sunState.daylightAmount < 0.05 || sunState.warmthAmount < 0.02) return;
  const alpha = sunState.warmthAmount * BEAM_MAX_ALPHA * (0.45 + sunState.daylightAmount * 0.55);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#ffcc88';
  ctx.translate(nativeWidthPx / 2, nativeHeightPx / 2);
  ctx.rotate(Math.atan2(sunState.dirY, sunState.dirX) + Math.PI / 2);
  const halfDiag = Math.sqrt(nativeWidthPx * nativeWidthPx + nativeHeightPx * nativeHeightPx) / 2 + 4;
  for (const [xOff, w] of SUNBEAM_DEFS) {
    ctx.fillRect(xOff - w / 2, -halfDiag, w, halfDiag * 2);
  }
  ctx.restore();
}

function drawDaylightOverlay(sunState: SunState): void {
  ctx.save();
  // Night darkness (no moonlight)
  const nightAlpha = (1 - sunState.daylightAmount) * NIGHT_OVERLAY_ALPHA;
  if (nightAlpha > 0.01) {
    ctx.globalAlpha = nightAlpha;
    ctx.fillStyle = '#000810';
    ctx.fillRect(0, 0, nativeWidthPx, nativeHeightPx);
  }
  // Dawn/dusk warm tint
  if (sunState.warmthAmount > 0.01) {
    ctx.globalAlpha = sunState.warmthAmount * DUSK_DAWN_TINT_ALPHA * (0.35 + sunState.daylightAmount * 0.65);
    ctx.fillStyle = sunState.phase < 0.5 ? '#ff8a32' : '#ff5a5f';
    ctx.fillRect(0, 0, nativeWidthPx, nativeHeightPx);
  }
  ctx.restore();
}

// Light colour / base-radius config per structure type (r, g, b, radius-px at full intensity)
const STRUCTURE_LIGHT_CONFIG: Partial<Record<Structure, [number, number, number, number]>> = {
  turret:    [39,  224, 255, 12],
  gatling:   [255, 204, 68,  10],
  cannon:    [255, 119, 51,  10],
  radar:     [141, 104, 255, 12],
  crusher:   [200, 160, 80,  8],
  extractor: [240, 166, 0,   7],
  repairer:  [68,  255, 136, 7],
  conveyor:  [34,  221, 187, 4],
  splitter:  [34,  221, 187, 4],
};
const CORE_LIGHT_CFG: [number, number, number, number] = [32, 255, 160, 20];

function drawNightLights(sunState: SunState): void {
  const intensity = Math.pow(1 - sunState.daylightAmount, 1.4);
  if (intensity < 0.02) return;
  const centerAlpha = 0.68 * intensity;

  ctx.save();
  ctx.beginPath();
  for (let yTile = 0; yTile < gridHeightTile; yTile += 1) {
    for (let xTile = 0; xTile < gridWidthTile; xTile += 1) {
      if (isTileVisible(xTile, yTile)) {
        ctx.rect(xTile * tileSizePx, yTile * tileSizePx, tileSizePx, tileSizePx);
      }
    }
  }
  ctx.clip();
  ctx.globalCompositeOperation = 'source-over';

  function emitLight(cxPx: number, cyPx: number, cfg: [number, number, number, number]): void {
    const r = cfg[3] * (0.55 + intensity * 0.75);
    const grad = ctx.createRadialGradient(cxPx, cyPx, 0, cxPx, cyPx, r);
    grad.addColorStop(0, `rgba(${cfg[0]},${cfg[1]},${cfg[2]},${centerAlpha.toFixed(3)})`);
    grad.addColorStop(0.35, `rgba(${cfg[0]},${cfg[1]},${cfg[2]},${(centerAlpha * 0.34).toFixed(3)})`);
    grad.addColorStop(1, `rgba(${cfg[0]},${cfg[1]},${cfg[2]},0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(cxPx - r, cyPx - r, r * 2, r * 2);
    ctx.fillStyle = `rgba(${cfg[0]},${cfg[1]},${cfg[2]},${(0.16 * intensity).toFixed(3)})`;
    ctx.fillRect(Math.round(cxPx) - 2, Math.round(cyPx) - 2, 4, 4);
  }

  // Core light
  if (isTileVisible(coreTile.x, coreTile.y)) {
    emitLight(
      coreTile.x * tileSizePx + tileSizePx / 2,
      coreTile.y * tileSizePx + tileSizePx / 2,
      CORE_LIGHT_CFG,
    );
  }

  // Structure lights
  for (let yTile = 0; yTile < gridHeightTile; yTile += 1) {
    for (let xTile = 0; xTile < gridWidthTile; xTile += 1) {
      if (!isTileVisible(xTile, yTile)) continue;
      const index = tileIndex(xTile, yTile);
      const st = structures[index];
      if (st === 'empty') continue;
      const cfg = STRUCTURE_LIGHT_CONFIG[st];
      if (!cfg) continue;
      emitLight(
        xTile * tileSizePx + tileSizePx / 2,
        yTile * tileSizePx + tileSizePx / 2,
        cfg,
      );
    }
  }

  ctx.restore();
}

// ── Weather stubs (scaffolding for future rain / snow) ─────────────────────
function updateWeather(_dtSec: number): void {
  if (environment.weatherType === 'clear') return;
  // Future rain: advance streak positions; direction can combine wind + sun direction.
  // Future snow: drift particles and optionally accumulate a visual snow layer.
}

function drawWeatherBackground(env: EnvironmentState): void {
  if (env.weatherType === 'clear' || env.weatherIntensity <= 0) return;
  // Future weather can add background tint before terrain is drawn.
}

function drawWeatherForeground(env: EnvironmentState): void {
  if (env.weatherType === 'clear' || env.weatherIntensity <= 0) return;
  // Future rain/snow can add foreground particles after lighting, before HUD overlays.
}

// ── Render ─────────────────────────────────────────────────────────────────
function drawPostLightBuildPreview(): void {
  if (hoveredXTile < 0 || !isInBounds(hoveredXTile, hoveredYTile) || !isTileVisible(hoveredXTile, hoveredYTile)) return;
  const cx = hoveredXTile * tileSizePx + tileSizePx / 2;
  const cy = hoveredYTile * tileSizePx + tileSizePx / 2;

  if (selectedTool === 'turret' || selectedTool === 'gatling' || selectedTool === 'cannon') {
    const color = selectedTool === 'turret'
      ? 'rgba(88,235,255,0.68)'
      : selectedTool === 'gatling'
        ? 'rgba(255,220,90,0.68)'
        : 'rgba(255,140,80,0.70)';
    const rangeTile = selectedTool === 'cannon' ? CANNON_RANGE_TILE : turretRangeTile;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.arc(cx, cy, rangeTile * tileSizePx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  if (isPointerHeld) return;
  const xPx = hoveredXTile * tileSizePx;
  const yPx = hoveredYTile * tileSizePx;
  const hoverIndex = tileIndex(hoveredXTile, hoveredYTile);
  const isRebuildHover = blueprintGhosts.get(hoverIndex) === selectedTool;
  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = isRebuildHover
    ? 'rgba(130,255,180,0.95)'
    : selectedTool === 'erase'
      ? 'rgba(255,120,100,0.95)'
      : selectedTool === 'repair'
        ? 'rgba(90,255,150,0.95)'
        : 'rgba(130,220,255,0.9)';
  ctx.strokeRect(xPx + 0.5, yPx + 0.5, tileSizePx - 1, tileSizePx - 1);

  if (selectedTool === 'conveyor' || selectedTool === 'extractor' || selectedTool === 'splitter') {
    const arrowColor = 'rgba(80,255,220,0.95)';
    const d = conveyorPlacementDir;
    if (d === 0) {
      fillPx(xPx + 4, yPx + 5, 4, 1, arrowColor);
      fillPx(xPx + 6, yPx + 4, 1, 3, arrowColor);
      fillPx(xPx + 7, yPx + 5, 1, 1, arrowColor);
    } else if (d === 2) {
      fillPx(xPx + 4, yPx + 5, 4, 1, arrowColor);
      fillPx(xPx + 4, yPx + 4, 1, 3, arrowColor);
      fillPx(xPx + 3, yPx + 5, 1, 1, arrowColor);
    } else if (d === 1) {
      fillPx(xPx + 5, yPx + 4, 1, 4, arrowColor);
      fillPx(xPx + 4, yPx + 6, 3, 1, arrowColor);
      fillPx(xPx + 5, yPx + 7, 1, 1, arrowColor);
    } else {
      fillPx(xPx + 5, yPx + 4, 1, 4, arrowColor);
      fillPx(xPx + 4, yPx + 4, 3, 1, arrowColor);
      fillPx(xPx + 5, yPx + 3, 1, 1, arrowColor);
    }
  }
  ctx.restore();
}

function render(): void {
  ctx.fillStyle = '#07090f';
  ctx.fillRect(0, 0, nativeWidthPx, nativeHeightPx);

  const sunState = getSunState(environment);
  drawWeatherBackground(environment);

  for (let yTile = 0; yTile < gridHeightTile; yTile += 1) {
    for (let xTile = 0; xTile < gridWidthTile; xTile += 1) {
      const xPx = xTile * tileSizePx;
      const yPx = yTile * tileSizePx;
      const index = tileIndex(xTile, yTile);

      if (!isTileVisible(xTile, yTile)) {
        fillPx(xPx, yPx, tileSizePx, tileSizePx, '#010206');
        continue;
      }

      if (terrainIsDebris[index]) {
        drawDebrisTile(xPx, yPx);
        continue;
      }

      drawGroundTile(xPx, yPx);

      const ghost = blueprintGhosts.get(index);
      if (ghost !== undefined) {
        drawBlueprintGhost(xPx, yPx, ghost);
      }

      const structure = structures[index];
      if (structure === 'wall') {
        drawWallTile(xPx, yPx);
      } else if (structure === 'turret') {
        drawTurretTile(xPx, yPx, index);
      } else if (structure === 'radar') {
        drawRadarTile(xPx, yPx);
      } else if (structure === 'crusher') {
        drawCrusherTile(xPx, yPx);
      } else if (structure === 'gatling') {
        drawGatlingTile(xPx, yPx, index);
      } else if (structure === 'conveyor') {
        drawConveyorTile(xPx, yPx, index);
      } else if (structure === 'extractor') {
        drawExtractorTile(xPx, yPx, index);
      } else if (structure === 'splitter') {
        drawSplitterTile(xPx, yPx, index);
      } else if (structure === 'cannon') {
        drawCannonTile(xPx, yPx, index);
      } else if (structure === 'repairer') {
        drawRepairerTile(xPx, yPx);
      }
      if (structure !== 'empty') {
        const hp = structureHp.get(index);
        const maxHp = STRUCTURE_MAX_HP[structure];
        if (hp !== undefined && maxHp !== undefined) {
          drawStructureHpBar(xPx, yPx, hp, maxHp);
        }
      }
    }
  }

  drawTileShadows(sunState);
  drawSunBeams(sunState);

  drawCoreTile(coreTile.x * tileSizePx, coreTile.y * tileSizePx);
  drawDepositTile(depositTile.x * tileSizePx, depositTile.y * tileSizePx);

  // "Build extractor" hint on deposit tiles that have no adjacent extractor
  if (isTileVisible(depositTile.x, depositTile.y) && !hasAdjacentExtractor(depositTile.x, depositTile.y)) {
    const hxPx = depositTile.x * tileSizePx;
    const hyPx = depositTile.y * tileSizePx;
    ctx.fillStyle = 'rgba(255,160,0,0.5)';
    ctx.fillRect(hxPx + 5, hyPx + 2, 2, 7);
    ctx.fillRect(hxPx + 4, hyPx + 8, 4, 2);
  }

  // Coal deposit
  if (isTileVisible(coalDepositTile.x, coalDepositTile.y)) {
    drawCoalDepositTile(coalDepositTile.x * tileSizePx, coalDepositTile.y * tileSizePx);
    if (!hasAdjacentExtractor(coalDepositTile.x, coalDepositTile.y)) {
      const hxPx = coalDepositTile.x * tileSizePx;
      const hyPx = coalDepositTile.y * tileSizePx;
      ctx.fillStyle = 'rgba(180,140,255,0.5)';
      ctx.fillRect(hxPx + 5, hyPx + 2, 2, 7);
      ctx.fillRect(hxPx + 4, hyPx + 8, 4, 2);
    }
    // Legacy coal motes draining to core (from before extractor system)
    if (coalMotes.length > 0) {
      const cdxTile = coreTile.x - coalDepositTile.x;
      const cdyTile = coreTile.y - coalDepositTile.y;
      ctx.fillStyle = '#555566';
      for (const mote of coalMotes) {
        const mxPx = Math.round((coalDepositTile.x + cdxTile * mote.progress) * tileSizePx + tileSizePx / 2 - 1);
        const myPx = Math.round((coalDepositTile.y + cdyTile * mote.progress) * tileSizePx + tileSizePx / 2 - 1);
        ctx.fillRect(mxPx, myPx, 2, 2);
      }
    }
  }

  // Gunpowder motes from crushers to core (1×3 vertical pixel = distinct shape vs coal/ore 2×2)
  ctx.fillStyle = '#c8a850';
  for (const mote of gunpowderMotes) {
    const dxTile = coreTile.x - mote.fromXTile;
    const dyTile = coreTile.y - mote.fromYTile;
    const mxPx = Math.round((mote.fromXTile + dxTile * mote.progress) * tileSizePx + tileSizePx / 2 - 1);
    const myPx = Math.round((mote.fromYTile + dyTile * mote.progress) * tileSizePx + tileSizePx / 2 - 1);
    ctx.fillRect(mxPx, myPx, 1, 3);
  }

  // Second deposit (visible when radar has expanded enough)
  if (revealRadiusTile >= DEPOSIT2_MIN_REVEAL_RADIUS_TILE && isTileVisible(deposit2Tile.x, deposit2Tile.y)) {
    drawDeposit2Tile(deposit2Tile.x * tileSizePx, deposit2Tile.y * tileSizePx);
    if (!hasAdjacentExtractor(deposit2Tile.x, deposit2Tile.y)) {
      const hxPx = deposit2Tile.x * tileSizePx;
      const hyPx = deposit2Tile.y * tileSizePx;
      ctx.fillStyle = 'rgba(255,160,0,0.5)';
      ctx.fillRect(hxPx + 5, hyPx + 2, 2, 7);
      ctx.fillRect(hxPx + 4, hyPx + 8, 4, 2);
    }
    // Legacy motes2 draining
    if (motes2.length > 0) {
      const d2xTile = coreTile.x - deposit2Tile.x;
      const d2yTile = coreTile.y - deposit2Tile.y;
      ctx.fillStyle = '#ffaa33';
      for (const mote of motes2) {
        const mxPx = Math.round((deposit2Tile.x + d2xTile * mote.progress) * tileSizePx + tileSizePx / 2 - 1);
        const myPx = Math.round((deposit2Tile.y + d2yTile * mote.progress) * tileSizePx + tileSizePx / 2 - 1);
        ctx.fillRect(mxPx, myPx, 2, 2);
      }
    }
  }

  // Third ore deposit (visible at max radar level)
  if (revealRadiusTile >= DEPOSIT3_MIN_REVEAL_RADIUS_TILE && isTileVisible(deposit3Tile.x, deposit3Tile.y)) {
    drawDeposit2Tile(deposit3Tile.x * tileSizePx, deposit3Tile.y * tileSizePx);
    if (!hasAdjacentExtractor(deposit3Tile.x, deposit3Tile.y)) {
      const hxPx = deposit3Tile.x * tileSizePx;
      const hyPx = deposit3Tile.y * tileSizePx;
      ctx.fillStyle = 'rgba(255,160,0,0.5)';
      ctx.fillRect(hxPx + 5, hyPx + 2, 2, 7);
      ctx.fillRect(hxPx + 4, hyPx + 8, 4, 2);
    }
  }

  // Legacy ore motes draining
  if (motes.length > 0) {
    const dxTile = coreTile.x - depositTile.x;
    const dyTile = coreTile.y - depositTile.y;
    ctx.fillStyle = '#ffd677';
    for (const mote of motes) {
      const mxPx = Math.round((depositTile.x + dxTile * mote.progress) * tileSizePx + tileSizePx / 2 - 1);
      const myPx = Math.round((depositTile.y + dyTile * mote.progress) * tileSizePx + tileSizePx / 2 - 1);
      ctx.fillRect(mxPx, myPx, 2, 2);
    }
  }

  // Routed motes travelling along conveyor chains
  for (const mote of routedMotes) {
    const si = mote.segIndex;
    if (si >= mote.pathXTile.length - 1) { continue; }
    const ax = mote.pathXTile[si] * tileSizePx + tileSizePx / 2;
    const ay = mote.pathYTile[si] * tileSizePx + tileSizePx / 2;
    const bx = mote.pathXTile[si + 1] * tileSizePx + tileSizePx / 2;
    const by = mote.pathYTile[si + 1] * tileSizePx + tileSizePx / 2;
    const mxPx = Math.round(ax + (bx - ax) * mote.progress) - 1;
    const myPx = Math.round(ay + (by - ay) * mote.progress) - 1;
    ctx.fillStyle = mote.resourceType === 'ore' ? '#ffd677' : '#8866bb';
    ctx.fillRect(mxPx, myPx, 2, 2);
  }

  // Radar reveal-radius ring
  {
    const cx = coreTile.x * tileSizePx + tileSizePx / 2;
    const cy = coreTile.y * tileSizePx + tileSizePx / 2;
    ctx.strokeStyle = 'rgba(141,104,255,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, revealRadiusTile * tileSizePx, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Faint grid lines while hovering on canvas
  if (hoveredXTile >= 0) {
    ctx.strokeStyle = 'rgba(40,80,140,0.12)';
    ctx.lineWidth = 0.5;
    for (let gx = 0; gx <= gridWidthTile; gx += 1) {
      ctx.beginPath();
      ctx.moveTo(gx * tileSizePx, 0);
      ctx.lineTo(gx * tileSizePx, nativeHeightPx);
      ctx.stroke();
    }
    for (let gy = 0; gy <= gridHeightTile; gy += 1) {
      ctx.beginPath();
      ctx.moveTo(0, gy * tileSizePx);
      ctx.lineTo(nativeWidthPx, gy * tileSizePx);
      ctx.stroke();
    }
  }

  // Turret range preview ring when turret tool is selected
  if (selectedTool === 'turret' && hoveredXTile >= 0 && isInBounds(hoveredXTile, hoveredYTile) && isTileVisible(hoveredXTile, hoveredYTile)) {
    const cx = hoveredXTile * tileSizePx + tileSizePx / 2;
    const cy = hoveredYTile * tileSizePx + tileSizePx / 2;
    ctx.strokeStyle = 'rgba(39,224,255,0.28)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.arc(cx, cy, turretRangeTile * tileSizePx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Gatling range preview ring
  if (selectedTool === 'gatling' && hoveredXTile >= 0 && isInBounds(hoveredXTile, hoveredYTile) && isTileVisible(hoveredXTile, hoveredYTile)) {
    const cx = hoveredXTile * tileSizePx + tileSizePx / 2;
    const cy = hoveredYTile * tileSizePx + tileSizePx / 2;
    ctx.strokeStyle = 'rgba(255,204,68,0.28)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.arc(cx, cy, turretRangeTile * tileSizePx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Cannon range preview ring
  if (selectedTool === 'cannon' && hoveredXTile >= 0 && isInBounds(hoveredXTile, hoveredYTile) && isTileVisible(hoveredXTile, hoveredYTile)) {
    const cx = hoveredXTile * tileSizePx + tileSizePx / 2;
    const cy = hoveredYTile * tileSizePx + tileSizePx / 2;
    ctx.strokeStyle = 'rgba(255,119,51,0.30)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.arc(cx, cy, CANNON_RANGE_TILE * tileSizePx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Shot flashes
  for (const flash of shotFlashes) {
    const alpha = Math.max(0, 1 - flash.ageSec / shotFlashDurationSec);
    if (flash.flashColor) {
      const r = parseInt(flash.flashColor.slice(1, 3), 16);
      const g = parseInt(flash.flashColor.slice(3, 5), 16);
      const b = parseInt(flash.flashColor.slice(5, 7), 16);
      ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = `rgba(39,224,255,${alpha})`;
      ctx.lineWidth = 1;
    }
    ctx.beginPath();
    ctx.moveTo(flash.fromXPx, flash.fromYPx);
    ctx.lineTo(flash.toXPx, flash.toYPx);
    ctx.stroke();
  }

  // Muzzle flashes (bright white-yellow burst at barrel tip)
  for (const flash of muzzleFlashes) {
    const alpha = Math.max(0, 1 - flash.ageSec / MUZZLE_FLASH_DURATION_SEC);
    ctx.fillStyle = `rgba(255,240,120,${alpha})`;
    ctx.fillRect(Math.round(flash.xPx) - 1, Math.round(flash.yPx) - 1, 3, 3);
  }

  // Shell casings (2×1 yellow rectangles that fade as they age)
  for (const c of shellCasings) {
    const alpha = Math.max(0, 1 - c.ageSec / c.maxAgeSec);
    ctx.fillStyle = `rgba(220,190,50,${alpha})`;
    ctx.fillRect(Math.round(c.xPx), Math.round(c.yPx), 2, 1);
  }

  // Repair/explosion sparkles
  for (const sp of repairSparkles) {
    const alpha = Math.max(0, 1 - sp.ageSec / REPAIR_SPARKLE_MAX_AGE_SEC);
    ctx.fillStyle = `rgba(${sp.r},${sp.g},${sp.b},${alpha})`;
    ctx.fillRect(Math.round(sp.xPx), Math.round(sp.yPx), 2, 2);
  }

  // Enemies and their HP bars
  for (const enemy of enemies) {
    const xPx = Math.round(enemy.xTile * tileSizePx);
    const yPx = Math.round(enemy.yTile * tileSizePx);
    const cx = xPx + tileSizePx / 2;
    const cy = yPx + tileSizePx / 2;
    if (enemy.isScuttler) {
      // Scuttler: yellow-green diamond shape (logistics hunter)
      ctx.fillStyle = '#aaff44';
      ctx.fillRect(cx - 1, cy - 2, 2, 1);  // top point
      ctx.fillRect(cx - 2, cy - 1, 5, 2);  // wide middle
      ctx.fillRect(cx - 1, cy + 1, 2, 1);  // bottom point
    } else if (enemy.isBreaker) {
      ctx.fillStyle = '#ff42d2';
      ctx.fillRect(cx - 2, cy - 2, 4, 4);
    } else {
      ctx.fillStyle = '#ff5656';
      ctx.fillRect(cx - 2, cy - 2, 4, 4);
    }
    if (enemy.hp < enemy.maxHp) {
      drawEnemyHpBar(xPx, yPx, enemy.hp, enemy.maxHp);
    }
  }

  // Worm enemies
  for (const worm of worms) {
    drawWorm(worm);
  }

  // Hover ghost tile
  if (!isPointerHeld && hoveredXTile >= 0 && isInBounds(hoveredXTile, hoveredYTile)) {
    const xPx = hoveredXTile * tileSizePx;
    const yPx = hoveredYTile * tileSizePx;
    const hoverIndex = tileIndex(hoveredXTile, hoveredYTile);
    const isRebuildHover = blueprintGhosts.get(hoverIndex) === selectedTool;
    if (isRebuildHover) {
      ctx.fillStyle = 'rgba(100,255,160,0.22)';
      ctx.strokeStyle = 'rgba(100,255,160,0.6)';
    } else if (selectedTool === 'erase') {
      ctx.fillStyle = 'rgba(255,100,80,0.28)';
      ctx.strokeStyle = 'rgba(255,100,80,0.55)';
    } else if (selectedTool === 'repair') {
      // Tint green if affordable, amber if not
      const hoveredTileIndex = tileIndex(hoveredXTile, hoveredYTile);
      const hovStructure = structures[hoveredTileIndex];
      const hovHp = structureHp.get(hoveredTileIndex);
      const hovMaxHp = hovStructure !== undefined ? (STRUCTURE_MAX_HP[hovStructure] ?? undefined) : undefined;
      let canAffordRepair = true;
      if (hovStructure !== undefined && hovStructure !== 'empty' && hovHp !== undefined && hovMaxHp !== undefined) {
        const missingHp = hovMaxHp - hovHp;
        const rebuildCost = (STRUCTURE_REBUILD_COST as Partial<Record<string, number>>)[hovStructure] ?? 0;
        const repairCost = Math.ceil(missingHp * rebuildCost / hovMaxHp);
        canAffordRepair = ore >= repairCost;
      }
      if (canAffordRepair) {
        ctx.fillStyle = 'rgba(68,255,136,0.22)';
        ctx.strokeStyle = 'rgba(68,255,136,0.6)';
      } else {
        ctx.fillStyle = 'rgba(255,160,40,0.28)';
        ctx.strokeStyle = 'rgba(255,160,40,0.75)';
      }
    } else {
      ctx.fillStyle = 'rgba(100,180,255,0.18)';
      ctx.strokeStyle = 'rgba(100,200,255,0.45)';
    }
    ctx.fillRect(xPx, yPx, tileSizePx, tileSizePx);
    ctx.lineWidth = 1;
    ctx.strokeRect(xPx + 0.5, yPx + 0.5, tileSizePx - 1, tileSizePx - 1);
    // Direction arrow preview for directional placement tools
    if (selectedTool === 'conveyor' || selectedTool === 'extractor' || selectedTool === 'splitter') {
      const arrowColor = 'rgba(34,221,187,0.9)';
      const d = conveyorPlacementDir;
      if (d === 0) { // East →
        fillPx(xPx + 4, yPx + 5, 4, 1, arrowColor);
        fillPx(xPx + 6, yPx + 4, 1, 3, arrowColor);
        fillPx(xPx + 7, yPx + 5, 1, 1, arrowColor);
      } else if (d === 2) { // West ←
        fillPx(xPx + 4, yPx + 5, 4, 1, arrowColor);
        fillPx(xPx + 4, yPx + 4, 1, 3, arrowColor);
        fillPx(xPx + 3, yPx + 5, 1, 1, arrowColor);
      } else if (d === 1) { // South ↓
        fillPx(xPx + 5, yPx + 4, 1, 4, arrowColor);
        fillPx(xPx + 4, yPx + 6, 3, 1, arrowColor);
        fillPx(xPx + 5, yPx + 7, 1, 1, arrowColor);
      } else { // North ↑
        fillPx(xPx + 5, yPx + 4, 1, 4, arrowColor);
        fillPx(xPx + 4, yPx + 4, 3, 1, arrowColor);
        fillPx(xPx + 5, yPx + 3, 1, 1, arrowColor);
      }
    }
  }

  // ── Breaker warning glow on target tile ──────────────────────────────────────
  drawDaylightOverlay(sunState);
  drawNightLights(sunState);
  drawWeatherForeground(environment);
  drawPostLightBuildPreview();

  if (breakerWarningActive && !breachOpened) {
    const pulse = 0.45 + 0.35 * Math.sin(elapsedSec * 7.7);
    const wxPx = breakerTargetTile.x * tileSizePx;
    const wyPx = breakerTargetTile.y * tileSizePx;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ff42d2';
    ctx.fillRect(wxPx, wyPx, tileSizePx, tileSizePx);
    ctx.restore();
  }

  // ── Enemy approach warning at newly revealed north entrance ──────────────────
  if (breachOpened && !isRunOver) {
    const pulse = 0.55 + 0.35 * Math.sin(elapsedSec * 5.0);
    const exPx = secondEntranceTile.x * tileSizePx + Math.floor(tileSizePx / 2);
    ctx.save();
    ctx.globalAlpha = pulse;
    // Downward arrow (↓) above top edge, pointing into the grid
    const arrowColor = '#ff3344';
    fillPx(exPx - 1, 1, 3, 1, arrowColor); // top bar of arrow
    fillPx(exPx, 1, 1, 5, arrowColor);      // shaft
    fillPx(exPx - 2, 5, 5, 1, arrowColor);  // wide bar
    fillPx(exPx - 1, 6, 3, 1, arrowColor);  // taper
    fillPx(exPx, 7, 1, 1, arrowColor);       // tip
    ctx.restore();
  }

  // ── Full-screen magenta flash on breach ───────────────────────────────────────
  if (breachFlashTimerSec > 0) {
    const alpha = (breachFlashTimerSec / BREACH_FLASH_DURATION_SEC) * 0.55;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#ff42d2';
    ctx.fillRect(0, 0, nativeWidthPx, nativeHeightPx);
    ctx.restore();
  }

  // Overlay (WAVE / BREACH / GAME OVER)
  if (overlayText && overlayTimerSec > 0) {
    const cx = nativeWidthPx / 2;
    ctx.save();
    if (overlayText === 'GAME OVER') {
      const panelH = 84;
      const panelY = nativeHeightPx / 2 - panelH / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.fillRect(0, panelY, nativeWidthPx, panelH);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const lineY = (offset: number) => panelY + panelH / 2 + offset;

      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = overlayColor;
      ctx.fillText('GAME OVER', cx, lineY(-27));

      ctx.font = '7px monospace';
      ctx.fillStyle = '#aaccee';
      ctx.fillText(`Wave ${waveIndex} · ${Math.floor(elapsedSec)}s · +${lastMetaEarned}${META_SYMBOL} meta`, cx, lineY(-12));
      ctx.fillText(`Killed: ${totalEnemiesKilled} · Built: ${totalStructuresBuilt} structures`, cx, lineY(0));
      ctx.fillText(`Ore mined: ${totalOreEarned}`, cx, lineY(12));

      ctx.font = '6px monospace';
      ctx.fillStyle = '#667799';
      const remainingDelaySec = Math.max(0, gameOverDelaySec);
      ctx.fillText(`restarting in ${remainingDelaySec.toFixed(1)}s…`, cx, lineY(26));
    } else {
      const fadeAlpha = Math.min(1, overlayTimerSec) * 0.9;
      ctx.fillStyle = `rgba(0,0,0,${fadeAlpha * 0.5})`;
      ctx.fillRect(cx - 42, 25, 84, 16);
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = fadeAlpha;
      ctx.fillStyle = overlayColor;
      ctx.fillText(overlayText, cx, 33);
    }
    ctx.restore();
  }

  // Build number (bottom-left corner)
  ctx.save();
  ctx.font = '5px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#2a3a50';
  let buildLabel = `b${currentBuildNumber}`;
  if (isDayNightDebugActive || isDayNightPreviewFast) {
    const timeSec = Math.floor(environment.dayNightTimeSec);
    const hour = Math.floor(timeSec / 150) % 24;
    const minute = Math.floor((timeSec % 150) / 2.5);
    buildLabel += ` ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    if (isDayNightPreviewFast) { buildLabel += ' FAST'; }
  }
  ctx.fillText(buildLabel, 2, nativeHeightPx - 1);
  ctx.restore();

  // HUD spans
  const maxCoreHp = BASE_CORE_HP + upgradeLevel.coreArmor * CORE_ARMOR_HP_PER_LEVEL;
  const hpRatio = Math.max(0, coreHp) / maxCoreHp;
  hpSpan.textContent = `HP ${Math.max(0, Math.ceil(coreHp))}/${maxCoreHp}`;
  hpSpan.style.color = hpRatio > coreHpHealthyThreshold / 100 ? '#33ffbb' : hpRatio > coreHpDamagedThreshold / 100 ? '#ffaa44' : '#ff4444';

  oreSpan.textContent = elapsedSec > ORE_RATE_DISPLAY_DELAY_SEC
    ? `Ore ${ore} · ${(totalOreEarned / elapsedSec).toFixed(1)}/s`
    : `Ore ${ore}`;
  oreSpan.style.color = '#f0a600';

  const activeThreats = enemies.length + worms.reduce((sum, w) => sum + w.segments.length, 0);
  waveSpan.textContent = activeThreats > 0 ? `Wave ${waveIndex} · ${activeThreats}` : `Wave ${waveIndex}`;
  waveSpan.style.color = '#ff8844';

  // Turret starvation readout: count turrets/gatlings/cannons with zero ammo
  {
    let starvedCount = 0;
    for (let sy = 0; sy < gridHeightTile; sy += 1) {
      for (let sx = 0; sx < gridWidthTile; sx += 1) {
        const sidx = tileIndex(sx, sy);
        const ss = structures[sidx];
        if (ss === 'turret' && (turretAmmo.get(sidx) ?? 0) <= 0) { starvedCount += 1; }
        if (ss === 'gatling' && (gatlingAmmo.get(sidx) ?? 0) <= 0) { starvedCount += 1; }
        if (ss === 'cannon' && (cannonAmmo.get(sidx) ?? 0) <= 0) { starvedCount += 1; }
      }
    }
    if (starvedCount > 0) {
      waveSpan.textContent += ` · ⚠${starvedCount}`;
    }
  }

  // Radar threat direction indicators (requires radarLevel >= 2)
  if (radarLevel >= 2 && activeThreats > 0) {
    const cx = coreTile.x;
    const cy = coreTile.y;
    let north = false; let south = false; let west = false; let east = false;
    for (const e of enemies) {
      if (e.yTile < cy - 2) { north = true; }
      if (e.yTile > cy + 2) { south = true; }
      if (e.xTile < cx - 2) { west = true; }
      if (e.xTile > cx + 2) { east = true; }
    }
    for (const w of worms) {
      if (w.segments.length === 0) { continue; }
      const h = w.segments[0];
      if (h.yTile < cy - 2) { north = true; }
      if (h.yTile > cy + 2) { south = true; }
      if (h.xTile < cx - 2) { west = true; }
      if (h.xTile > cx + 2) { east = true; }
    }
    const arrowParts: string[] = [];
    if (north) { arrowParts.push('↑'); }
    if (south) { arrowParts.push('↓'); }
    if (west) { arrowParts.push('←'); }
    if (east) { arrowParts.push('→'); }
    if (arrowParts.length > 0) {
      waveSpan.textContent += ` ${arrowParts.join('')}`;
    }
  }

  radarSpan.textContent = `Radar ${radarLevel}`;
  radarSpan.style.color = '#8d68ff';

  metaButtonElement.textContent = `Meta ${metaCurrency}`;
  metaButtonElement.style.color = '#c0e8ff';
  metaMenuCurrencyElement.textContent = `${metaCurrency}${META_SYMBOL}`;

  nextWaveSpan.textContent = isRunOver ? `restarting ${Math.max(0, gameOverDelaySec).toFixed(1)}s` : `Next ${waveTimerSec.toFixed(1)}s`;
  nextWaveSpan.style.color = waveTimerSec < 2 && !isRunOver ? '#ff5522' : '#ffcc44';

  coalGpSpan.textContent = `Coal ${coal} · GP ${gunpowder}`;
  coalGpSpan.style.color = '#c8a850';

  updateUpgradePanelState();

  // Status bar: context-sensitive hints for the selected tool
  {
    let statusText = '';
    let statusCost = 0;
    let hasPositiveCost = false;

    if (isInBounds(hoveredXTile, hoveredYTile)) {
      const hovIndex = tileIndex(hoveredXTile, hoveredYTile);
      const ghost = blueprintGhosts.get(hovIndex);
      const hovStructure = structures[hovIndex];

      if (selectedTool === 'repair') {
        if (ghost !== undefined && hovStructure === 'empty') {
          statusCost = STRUCTURE_REBUILD_COST[ghost] ?? 0;
          statusText = statusCost === 0 ? 'Rebuild: free' : `Rebuild: ${statusCost}${ORE_SYMBOL}`;
          hasPositiveCost = statusCost > 0;
        } else if (hovStructure !== 'empty') {
          const currentHp = structureHp.get(hovIndex);
          const maxHp = STRUCTURE_MAX_HP[hovStructure];
          if (currentHp !== undefined && maxHp !== undefined && currentHp < maxHp) {
            const missingHp = maxHp - currentHp;
            const rebuildCost = STRUCTURE_REBUILD_COST[hovStructure] ?? 0;
            statusCost = Math.ceil(missingHp * rebuildCost / maxHp);
            statusText = statusCost === 0 ? 'Repair: free' : `Repair: ${statusCost}${ORE_SYMBOL}`;
            hasPositiveCost = statusCost > 0;
          }
        }
      } else if (selectedTool === 'erase') {
        if (hovStructure !== 'empty') {
          statusText = `Erase: ${hovStructure}`;
        }
      } else if (selectedTool === 'turret' || selectedTool === 'radar' || selectedTool === 'crusher' || selectedTool === 'gatling' || selectedTool === 'cannon') {
        const isValidTile = !terrainIsDebris[hovIndex]
          && hovStructure === 'empty'
          && !(hoveredXTile === coreTile.x && hoveredYTile === coreTile.y)
          && !(hoveredXTile === depositTile.x && hoveredYTile === depositTile.y)
          && !(hoveredXTile === deposit2Tile.x && hoveredYTile === deposit2Tile.y)
          && !(hoveredXTile === coalDepositTile.x && hoveredYTile === coalDepositTile.y)
          && isTileVisible(hoveredXTile, hoveredYTile);
        if (isValidTile) {
          const isRebuild = ghost === selectedTool;
          const costTable = isRebuild ? STRUCTURE_REBUILD_COST : STRUCTURE_ORE_COST;
          statusCost = costTable[selectedTool] ?? 0;
          statusText = isRebuild ? `Rebuild: ${statusCost}${ORE_SYMBOL}` : `Cost: ${statusCost}${ORE_SYMBOL}`;
          hasPositiveCost = true;
        }
      } else if (selectedTool === 'conveyor' || selectedTool === 'extractor' || selectedTool === 'splitter') {
        const dirSymbol = DIR_SYMBOLS[conveyorPlacementDir];
        const isValidTile = !terrainIsDebris[hovIndex]
          && hovStructure === 'empty'
          && !(hoveredXTile === coreTile.x && hoveredYTile === coreTile.y)
          && !(hoveredXTile === depositTile.x && hoveredYTile === depositTile.y)
          && !(hoveredXTile === deposit2Tile.x && hoveredYTile === deposit2Tile.y)
          && !(hoveredXTile === coalDepositTile.x && hoveredYTile === coalDepositTile.y)
          && isTileVisible(hoveredXTile, hoveredYTile);
        const isRebuild = ghost === selectedTool;
        const costTable = isRebuild ? STRUCTURE_REBUILD_COST : STRUCTURE_ORE_COST;
        statusCost = costTable[selectedTool] ?? 0;
        const costPart = isValidTile ? (isRebuild ? ` · Rebuild: ${statusCost}${ORE_SYMBOL}` : ` · Cost: ${statusCost}${ORE_SYMBOL}`) : '';
        statusText = `Dir [${dirSymbol}] · Q: rotate${costPart}`;
        hasPositiveCost = isValidTile;
      } else if (hovStructure === 'extractor') {
        // Show extractor flow rate when hovering an existing extractor with any tool
        const resType = extractorResourceType(hoveredXTile, hoveredYTile);
        const hasRoute = extractorHasRoute.get(hovIndex) ?? false;
        if (resType !== null) {
          const spawnInterval = resType === 'ore' ? EXTRACTOR_ORE_SPAWN_SEC : EXTRACTOR_COAL_SPAWN_SEC;
          const flowRate = hasRoute ? (1 / spawnInterval).toFixed(2) : '0.00';
          const resSymbol = resType === 'ore' ? ORE_SYMBOL : '▪';
          statusText = `Extractor [${resType}] · ${flowRate}/s ${resSymbol}`;
        }
      }
    }

    // Always show filter hint for repair tool even when not hovering
    if (selectedTool === 'repair') {
      const filterLabel = rebuildFilterMode.toUpperCase();
      const filterHint = `Filter: ${filterLabel} · Q: cycle`;
      statusText = statusText !== '' ? `${statusText} · ${filterHint}` : filterHint;
    }

    // Always show direction hint for directional tools even when not hovering
    if (statusText === '' && (selectedTool === 'conveyor' || selectedTool === 'extractor' || selectedTool === 'splitter')) {
      statusText = `Dir [${DIR_SYMBOLS[conveyorPlacementDir]}] · Q: rotate`;
    }

    statusBarElement.textContent = statusText;
    if (statusText === '') {
      statusBarElement.style.color = '';
    } else if (!hasPositiveCost) {
      statusBarElement.style.color = '#ff7060'; // erase or free actions
    } else {
      statusBarElement.style.color = ore >= statusCost ? '#44ff88' : '#ff6655';
    }
  }
}

export function startGame(): void {
  let lastTimeMs = performance.now();

  const loop = (timeMs: number): void => {
    const dtSec = Math.min(0.05, (timeMs - lastTimeMs) / 1000);
    lastTimeMs = timeMs;
    update(dtSec);
    render();
    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
}
