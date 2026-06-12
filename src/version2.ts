// ── Version 2: Modular Synth Tower Defense ─────────────────────────────────

import { createRackWiringSystem } from './version2-rack-wiring';
import type { RackWiringHandle, RackWireConnection } from './version2-rack-wiring';
import { rackPlugColor } from './version2-rack-wiring-types';
import type { RackPlugType } from './version2-rack-wiring-types';
import {
  Enemy,
  drawEnemy,
  preloadEnemySprites,
  ENEMY_TYPES,
  FREQ_BAND_COLORS,
} from './version2-enemies';
import type { FrequencyBand } from './version2-enemies';
import { SubdivisionTransport, getAudioSystem } from './version2-audio';
import { WaveManager } from './version2-waves';

// ── Types ──────────────────────────────────────────────────────────────────

type Waveform = 'pulse' | 'sine' | 'square';
type SignalDirection = 'north' | 'south' | 'east' | 'west';
type TowerOrientation = 'north' | 'east' | 'south' | 'west';
type RunState = 'ready' | 'countin' | 'wave' | 'failed';

const CHANNEL_COLORS = ['#00ffee', '#ff33aa', '#ffcc00', '#88ff22', '#ff6600'];
const MAX_BASE_HP = 10;

interface SynthSignal {
  waveform: Waveform;
  amplitude: number;
  /** How many 1/16-note subdivisions between triggers (1=16th,2=8th,4=4th,8=half,16=whole). */
  triggerEverySubdivs: 1 | 2 | 4 | 8 | 16;
  phaseSubdivs: number;
  /** Visual cycle length for sine/square animation only — not related to trigger rate. */
  waveCycleBeats: number;
  color: string;
  directions: SignalDirection[];
  frequencyBand: FrequencyBand;
}

interface EvaluatedRoute {
  signals: SynthSignal[];
  routeLabel: string;
  activeModules: Set<string>;
  hasDelay: boolean;
}

interface ScheduledSignal {
  dueSubdiv: number;
  signals: SynthSignal[];
}

interface SynthLevelConfig {
  id: number;
  name: string;
  bpm: number;
  beatUnitLabel: string;
  gridWidth: number;
  gridHeight: number;
  trackTiles: [number, number][];
}

interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
}

interface SignalProjectile {
  spawnBeat: number;
  originX: number;
  originY: number;
  dirX: number;
  dirY: number;
  waveform: Waveform;
  waveCycleBeats: number;
  amplitude: number;
  color: string;
  frequencyBand: FrequencyBand;
  dead: boolean;
}

interface FloatingText {
  tileX: number;
  tileY: number;
  text: string;
  color: string;
  timer: number;
  duration: number;
  offsetX: number;
}

interface PlacementState {
  active: boolean;
  previewTile: { x: number; y: number } | null;
}

// ── SynthChannel ───────────────────────────────────────────────────────────

class SynthChannel {
  id: number;
  waveform: Waveform;
  /** Visual cycle length for sine/square animation — independent of trigger rate. */
  waveCycleBeats: number;
  amplitude: number;
  readonly color: string;

  constructor(id: number) {
    this.id = id;
    this.color = CHANNEL_COLORS[(id - 1) % CHANNEL_COLORS.length];
    this.waveform = 'pulse';
    this.waveCycleBeats = 1;
    this.amplitude = 1;
  }

  setWaveform(w: Waveform): void {
    this.waveform = w;
    if (w === 'pulse') this.waveCycleBeats = 1;
    else if (w === 'square') this.waveCycleBeats = 4;
    else if (w === 'sine') this.waveCycleBeats = 4;
  }
}

// ── BeatClock ──────────────────────────────────────────────────────────────

class BeatClock {
  private startMs: number;
  readonly bpm: number;

  constructor(bpm: number) {
    this.bpm = bpm;
    this.startMs = performance.now();
  }

  get beatFloat(): number {
    return (performance.now() - this.startMs) / 1000 * this.bpm / 60;
  }

  get beat(): number { return Math.floor(this.beatFloat); }
  get beatFrac(): number { return this.beatFloat % 1; }
}

// ── FrequencyModule ────────────────────────────────────────────────────────

class FrequencyModule {
  band: FrequencyBand = 'mid';
  flashTimer = 0;
  flashIsMatch = false;

  update(dt: number): void {
    if (this.flashTimer > 0) this.flashTimer = Math.max(0, this.flashTimer - dt);
  }

  onHit(isMatch: boolean): void {
    this.flashTimer = 0.35;
    this.flashIsMatch = isMatch;
  }
}

// ── ClockModule ────────────────────────────────────────────────────────────

class ClockModule {
  rate: 1 | 2 | 4 | 8 | 16 = 4;
  phaseSubdivs = 0;
  flashTimer = 0;

  update(dt: number): void {
    if (this.flashTimer > 0) this.flashTimer = Math.max(0, this.flashTimer - dt);
  }

  onTrigger(): void { this.flashTimer = 0.12; }

  advancePhase(): void {
    this.phaseSubdivs = (this.phaseSubdivs + 1) % this.rate;
  }

  get rateLabel(): string {
    const map: Record<number, string> = { 1: '1/16', 2: '1/8', 4: '1/4', 8: '1/2', 16: '1/1' };
    return map[this.rate] ?? '1/4';
  }
}

// ── DelayModule ────────────────────────────────────────────────────────────

class DelayModule {
  delayBeats: 1 | 2 | 4 = 2;
  get delaySubdivs(): number { return this.delayBeats * 4; }
  readonly echoAmplitude = 0.5;
  receiveFlashTimer = 0;
  sendFlashTimer = 0;

  update(dt: number): void {
    if (this.receiveFlashTimer > 0) this.receiveFlashTimer = Math.max(0, this.receiveFlashTimer - dt);
    if (this.sendFlashTimer > 0)    this.sendFlashTimer    = Math.max(0, this.sendFlashTimer    - dt);
  }

  onReceive(): void { this.receiveFlashTimer = 0.35; }
  onSend():    void { this.sendFlashTimer    = 0.35; }
}

// ── SignalScheduler ────────────────────────────────────────────────────────

class SignalScheduler {
  readonly queue: ScheduledSignal[] = [];

  schedule(dueSubdiv: number, signals: SynthSignal[]): void {
    this.queue.push({ dueSubdiv, signals: signals.map(s => ({ ...s })) });
  }

  releaseAt(subdivIdx: number): SynthSignal[] {
    const out: SynthSignal[] = [];
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (subdivIdx >= this.queue[i].dueSubdiv) {
        out.push(...this.queue[i].signals);
        this.queue.splice(i, 1);
      }
    }
    return out;
  }

  clear(): void { this.queue.length = 0; }
}

// ── OutputTower ────────────────────────────────────────────────────────────

class OutputTower {
  tileX: number;
  tileY: number;
  orientation: TowerOrientation = 'north';
  selected = false;

  constructor(tileX = 8, tileY = 4) {
    this.tileX = tileX;
    this.tileY = tileY;
  }

  rotateClockwise(): void {
    const seq: TowerOrientation[] = ['north', 'east', 'south', 'west'];
    this.orientation = seq[(seq.indexOf(this.orientation) + 1) % 4];
  }

  /** Called once per subdivision. Returns true if any projectile was fired. */
  processSubdiv(subdivIdx: number, signals: SynthSignal[], projectiles: SignalProjectile[]): boolean {
    if (signals.length === 0) return false;
    let fired = false;
    for (const sig of signals) {
      const offset = ((subdivIdx - sig.phaseSubdivs) % sig.triggerEverySubdivs + sig.triggerEverySubdivs) % sig.triggerEverySubdivs;
      if (offset !== 0) continue;
      for (const relDir of sig.directions) {
        const [dx, dy] = orientedDirToVector(relDir, this.orientation);
        projectiles.push({
          spawnBeat: subdivIdx / 4,
          originX: this.tileX,
          originY: this.tileY,
          dirX: dx, dirY: dy,
          waveform: sig.waveform,
          waveCycleBeats: sig.waveCycleBeats,
          amplitude: sig.amplitude,
          color: sig.color,
          frequencyBand: sig.frequencyBand,
          dead: false,
        });
        fired = true;
      }
    }
    return fired;
  }

  /** Unconditionally spawn signals (used for delay echoes). */
  spawnSignals(signals: SynthSignal[], subdivIdx: number, projectiles: SignalProjectile[]): void {
    for (const sig of signals) {
      for (const relDir of sig.directions) {
        const [dx, dy] = orientedDirToVector(relDir, this.orientation);
        projectiles.push({
          spawnBeat: subdivIdx / 4,
          originX: this.tileX,
          originY: this.tileY,
          dirX: dx, dirY: dy,
          waveform: sig.waveform,
          waveCycleBeats: sig.waveCycleBeats,
          amplitude: sig.amplitude,
          color: sig.color,
          frequencyBand: sig.frequencyBand,
          dead: false,
        });
      }
    }
  }
}

// ── Signal graph helpers ───────────────────────────────────────────────────

function orientedDirToVector(relDir: SignalDirection, orientation: TowerOrientation): [number, number] {
  const fwd: Record<TowerOrientation, [number, number]> = {
    north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0],
  };
  const rgt: Record<TowerOrientation, [number, number]> = {
    north: [1, 0], east: [0, 1], south: [-1, 0], west: [0, -1],
  };
  const [fx, fy] = fwd[orientation];
  const [rx, ry] = rgt[orientation];
  switch (relDir) {
    case 'north': return [ fx,  fy];
    case 'south': return [-fx, -fy];
    case 'east':  return [ rx,  ry];
    case 'west':  return [-rx, -ry];
  }
}

function signalIsHighAt(sig: SynthSignal, beatFloat: number): boolean {
  const p = sig.waveCycleBeats;
  const phase = (beatFloat % p + p) % p;
  return sig.waveform !== 'square' || phase < p / 2;
}

function evaluateSignalGraph(
  connections: readonly RackWireConnection[],
  channel: SynthChannel,
  freqMod: FrequencyModule,
  clockMod: ClockModule,
): EvaluatedRoute {
  const EMPTY: EvaluatedRoute = { signals: [], routeLabel: 'NO SIGNAL', activeModules: new Set(), hasDelay: false };

  const connMap = new Map<string, string>();
  for (const c of connections) connMap.set(c.fromPlugId, c.toPlugId);

  let waveform: Waveform = 'pulse';
  let amplitude = 1;
  let triggerEverySubdivs: 1 | 2 | 4 | 8 | 16 = 4;  // default quarter note
  let phaseSubdivs = 0;
  let waveCycleBeats = 1;
  let frequencyBand: FrequencyBand = 'mid';
  let hasDelay = false;
  let hasSplit = false;
  const activeModules = new Set<string>(['ch1']);
  const pathLabels: string[] = ['CH1'];
  let cursor = 'ch1-out';
  const visited = new Set<string>();

  for (let hop = 0; hop < 14; hop++) {
    visited.add(cursor);
    const next = connMap.get(cursor);
    if (!next || visited.has(next)) return EMPTY;
    visited.add(next);

    if (next === 'out-in') {
      activeModules.add('out');
      pathLabels.push('OUT');
      const amp = hasSplit ? amplitude / 2 : amplitude;
      const dirs: SignalDirection[] = hasSplit ? ['north', 'south'] : ['north'];
      return {
        signals: [{ waveform, amplitude: amp, triggerEverySubdivs, phaseSubdivs, waveCycleBeats, color: channel.color, frequencyBand, directions: dirs }],
        routeLabel: pathLabels.join(' → '),
        activeModules,
        hasDelay,
      };
    }

    switch (next) {
      case 'clock-in':
        triggerEverySubdivs = clockMod.rate;
        phaseSubdivs = clockMod.phaseSubdivs;
        activeModules.add('clock');
        pathLabels.push('CLOCK');
        cursor = 'clock-out';
        break;
      case 'wf-in':
        waveform = channel.waveform;
        amplitude = channel.amplitude;
        waveCycleBeats = channel.waveCycleBeats;
        activeModules.add('wave');
        pathLabels.push('WAVE');
        cursor = 'wf-out';
        break;
      case 'freq-in':
        frequencyBand = freqMod.band;
        activeModules.add('freq');
        pathLabels.push('FREQ');
        cursor = 'freq-out';
        break;
      case 'delay-in':
        hasDelay = true;
        activeModules.add('delay');
        pathLabels.push('DELAY');
        cursor = 'delay-out';
        break;
      case 'split-in':
        hasSplit = true;
        activeModules.add('split');
        pathLabels.push('SPLIT');
        cursor = 'split-out';
        break;
      default:
        return EMPTY;
    }

    if (visited.has(cursor)) return EMPTY;
  }

  return EMPTY;
}

// ── Level Configs ──────────────────────────────────────────────────────────

const LEVELS: SynthLevelConfig[] = [
  {
    id: 1,
    name: 'Planet One',
    bpm: 60,
    beatUnitLabel: '♩',
    gridWidth: 16,
    gridHeight: 12,
    trackTiles: buildUTrack(16, 12),
  },
  {
    id: 2,
    name: 'Planet Two',
    bpm: 90,
    beatUnitLabel: '♩',
    gridWidth: 18,
    gridHeight: 14,
    trackTiles: [],
  },
  {
    id: 3,
    name: 'Planet Three',
    bpm: 120,
    beatUnitLabel: '♩',
    gridWidth: 20,
    gridHeight: 14,
    trackTiles: [],
  },
];

function buildUTrack(w: number, h: number): [number, number][] {
  const path: [number, number][] = [];
  const topRow = 1, botRow = h - 2, leftCol = 1, rightCol = w - 2;
  for (let x = leftCol; x <= rightCol; x++) path.push([x, topRow]);
  for (let y = topRow + 1; y <= botRow; y++) path.push([rightCol, y]);
  for (let x = rightCol - 1; x >= leftCol; x--) path.push([x, botRow]);
  return path;
}

// ── App State ──────────────────────────────────────────────────────────────

type Screen = { kind: 'worldmap' } | { kind: 'level'; levelId: number };
let currentScreen: Screen = { kind: 'worldmap' };
let rafId = 0;
let levelCleanup: (() => void) | null = null;

function getApp(): HTMLElement { return document.getElementById('app')!; }

function clearApp(): void {
  cancelAnimationFrame(rafId);
  rafId = 0;
  if (levelCleanup) { levelCleanup(); levelCleanup = null; }
  const app = getApp();
  app.innerHTML = '';
  app.style.cssText = '';
}

// ── Rendering constants ────────────────────────────────────────────────────

const BASE_TILE_PX = 40;
const SIGNAL_TAIL_BEATS = 3;

// ── Coordinate helpers ─────────────────────────────────────────────────────

function clientToCanvas(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left) * (canvas.width / rect.width) / devicePixelRatio,
    y: (clientY - rect.top) * (canvas.height / rect.height) / devicePixelRatio,
  };
}

function screenToTile(
  canvasPos: { x: number; y: number },
  view: ViewState,
): { x: number; y: number } {
  const tileZ = BASE_TILE_PX * view.zoom;
  return {
    x: Math.floor((canvasPos.x - view.panX) / tileZ),
    y: Math.floor((canvasPos.y - view.panY) / tileZ),
  };
}

function isValidTowerTile(
  tx: number,
  ty: number,
  level: SynthLevelConfig,
  trackSet: Set<string>,
): boolean {
  if (tx < 0 || tx >= level.gridWidth || ty < 0 || ty >= level.gridHeight) return false;
  return !trackSet.has(`${tx},${ty}`);
}

// ── World Map ──────────────────────────────────────────────────────────────

export function showWorldMap(): void {
  currentScreen = { kind: 'worldmap' };
  clearApp();
  getAudioSystem().suspend();

  const app = getApp();
  app.style.cssText = `display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1rem;`;

  const root = document.createElement('div');
  root.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:1.5rem;width:100%;max-width:560px;`;

  const header = document.createElement('div');
  header.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:0.3rem;`;

  const title = document.createElement('div');
  title.textContent = 'ModSynth TD';
  title.style.cssText = `
    font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;
    font-size:1.6rem;font-weight:800;color:#dff6ff;
    letter-spacing:0.04em;text-shadow:0 0 20px rgba(0,200,255,0.4);
  `;

  const sub = document.createElement('div');
  sub.textContent = 'VERSION 2 · SELECT PLANET';
  sub.style.cssText = `
    font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;
    font-size:0.7rem;color:#5577aa;letter-spacing:0.14em;
  `;
  header.append(title, sub);

  const grid = document.createElement('div');
  grid.style.cssText = `display:flex;flex-wrap:wrap;gap:1rem;justify-content:center;`;
  for (const level of LEVELS) grid.append(makeLevelCard(level));

  const backBtn = document.createElement('button');
  backBtn.textContent = '← Version Select';
  backBtn.style.cssText = `
    font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;
    font-size:0.72rem;color:#5577aa;background:transparent;
    border:1px solid #2a3d65;border-radius:6px;
    padding:0.4rem 1rem;cursor:pointer;letter-spacing:0.06em;
    transition:color 0.12s,border-color 0.12s;
  `;
  backBtn.addEventListener('mouseenter', () => { backBtn.style.color = '#dff6ff'; backBtn.style.borderColor = '#4a8fff'; });
  backBtn.addEventListener('mouseleave', () => { backBtn.style.color = '#5577aa'; backBtn.style.borderColor = '#2a3d65'; });
  backBtn.addEventListener('click', () => {
    import('./legacy-version-select').then(m => { clearApp(); m.showVersionSelect(); });
  });

  root.append(header, grid, backBtn);
  app.append(root);
}

function makeLevelCard(level: SynthLevelConfig): HTMLElement {
  const isUnlocked = level.id === 1;
  const card = document.createElement('button');
  card.disabled = !isUnlocked;
  card.style.cssText = `
    display:flex;flex-direction:column;align-items:center;gap:0.5rem;
    background:#0a0f1c;border:1.5px solid ${isUnlocked ? '#2a3d65' : '#151e30'};
    border-radius:12px;padding:1rem 1.25rem;
    cursor:${isUnlocked ? 'pointer' : 'not-allowed'};
    font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;
    opacity:${isUnlocked ? '1' : '0.45'};
    transition:border-color 0.15s,box-shadow 0.15s;min-width:130px;
  `;
  if (isUnlocked) {
    card.addEventListener('mouseenter', () => { card.style.borderColor = '#00ddcc'; card.style.boxShadow = '0 0 20px rgba(0,200,180,0.2)'; });
    card.addEventListener('mouseleave', () => { card.style.borderColor = '#2a3d65'; card.style.boxShadow = ''; });
  }

  const preview = document.createElement('canvas');
  preview.width = 80; preview.height = 80;
  preview.style.cssText = `width:80px;height:80px;border-radius:50%;display:block;pointer-events:none;`;
  drawPlanetPreview(preview, level.id, isUnlocked);

  const name = document.createElement('div');
  name.textContent = level.name;
  name.style.cssText = `color:${isUnlocked ? '#dff6ff' : '#445566'};font-size:0.88rem;font-weight:800;`;

  const bpmTag = document.createElement('div');
  bpmTag.textContent = `${level.bpm} ${level.beatUnitLabel}`;
  bpmTag.style.cssText = `color:${isUnlocked ? '#00ddcc' : '#2a4444'};font-size:0.72rem;letter-spacing:0.06em;`;

  const lockTag = document.createElement('div');
  lockTag.textContent = isUnlocked ? 'ENTER' : 'LOCKED';
  lockTag.style.cssText = `font-size:0.58rem;letter-spacing:0.12em;color:${isUnlocked ? '#5577aa' : '#2a3a4a'};`;

  card.append(preview, name, bpmTag, lockTag);
  if (isUnlocked) card.addEventListener('click', () => enterLevel(level.id));
  return card;
}

function drawPlanetPreview(canvas: HTMLCanvasElement, levelId: number, bright: boolean): void {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const rng = seededRng(levelId * 137);
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = `rgba(200,220,255,${0.2 + rng() * 0.4})`;
    ctx.fillRect(rng() * w, rng() * h, 1, 1);
  }
  const colors = [['#00ffcc', '#007766'], ['#aa66ff', '#440077'], ['#ff9900', '#883300']];
  const [c1, c2] = colors[(levelId - 1) % colors.length];
  const grad = ctx.createRadialGradient(cx - 8, cy - 8, 4, cx, cy, 28);
  grad.addColorStop(0, bright ? c1 : c2);
  grad.addColorStop(1, '#050810');
  ctx.save();
  ctx.shadowColor = c1;
  ctx.shadowBlur = bright ? 18 : 0;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function seededRng(seed: number): () => number {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

// ── Fastest hi-hat subdiv period ────────────────────────────────────────────

function computeFastestHatPeriod(enemies: Enemy[]): number {
  let fastest = 0;
  for (const e of enemies) {
    if (!e.isSpawned) continue;
    const p = e.typeConfig.moveEverySubdivs;
    if (p === 1) return 1;
    if (p === 2 && fastest !== 1) fastest = 2;
  }
  return fastest;
}

// ── Level View ─────────────────────────────────────────────────────────────

export function enterLevel(levelId: number): void {
  const level = LEVELS.find(l => l.id === levelId);
  if (!level) return;
  currentScreen = { kind: 'level', levelId };
  clearApp();
  preloadEnemySprites();

  const audio = getAudioSystem();
  const ff = `font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;`;

  const app = getApp();
  app.style.cssText = `
    display:flex;flex-direction:column;align-items:center;
    justify-content:center;min-height:100vh;padding:0.5rem;
  `;

  const root = document.createElement('div');
  root.style.cssText = `
    display:flex;flex-direction:column;align-items:center;gap:0.5rem;
    width:100%;max-width:640px;
  `;

  // ── HUD row 1 ─────────────────────────────────────────────────────────────
  const hud = document.createElement('div');
  hud.style.cssText = `
    display:flex;align-items:center;justify-content:space-between;
    width:100%;padding:0 0.25rem;${ff}
  `;

  // Left: level name / bpm / beat
  const levelInfo = document.createElement('div');
  levelInfo.style.cssText = `display:flex;flex-direction:column;gap:0.05rem;min-width:90px;`;

  const levelName = document.createElement('div');
  levelName.textContent = level.name;
  levelName.style.cssText = `color:#dff6ff;font-size:0.85rem;font-weight:800;`;

  const bpmDisplay = document.createElement('div');
  bpmDisplay.textContent = `${level.bpm} ${level.beatUnitLabel}`;
  bpmDisplay.style.cssText = `color:#00ddcc;font-size:0.7rem;letter-spacing:0.06em;`;

  const beatDisplay = document.createElement('div');
  beatDisplay.textContent = `beat 0`;
  beatDisplay.style.cssText = `color:#aa55ff;font-size:0.65rem;letter-spacing:0.06em;`;

  levelInfo.append(levelName, bpmDisplay, beatDisplay);

  // Center: wave number / state / enemy count
  const waveInfo = document.createElement('div');
  waveInfo.style.cssText = `display:flex;flex-direction:column;align-items:center;gap:0.05rem;flex:1;`;

  const waveDisplay = document.createElement('div');
  waveDisplay.style.cssText = `color:#ffcc00;font-size:0.8rem;font-weight:800;letter-spacing:0.06em;`;

  const stateDisplay = document.createElement('div');
  stateDisplay.style.cssText = `font-size:0.6rem;font-weight:800;letter-spacing:0.1em;`;

  const enemyCountDisplay = document.createElement('div');
  enemyCountDisplay.style.cssText = `color:#5577aa;font-size:0.58rem;letter-spacing:0.05em;`;

  waveInfo.append(waveDisplay, stateDisplay, enemyCountDisplay);

  // Right: base HP / mute / exit
  const hudRight = document.createElement('div');
  hudRight.style.cssText = `display:flex;align-items:center;gap:0.5rem;`;

  const baseHpDisplay = document.createElement('div');
  baseHpDisplay.style.cssText = `font-size:0.68rem;font-weight:800;letter-spacing:0.05em;min-width:70px;text-align:right;`;

  const muteBtn = document.createElement('button');
  muteBtn.textContent = '🔊';
  muteBtn.title = 'Mute / Unmute audio';
  muteBtn.style.cssText = `
    ${ff}font-size:0.75rem;background:rgba(8,15,28,0.8);
    border:1px solid #2a3d65;border-radius:6px;
    padding:0.35rem 0.55rem;cursor:pointer;
    transition:color 0.12s,border-color 0.12s;
  `;
  const updateMuteBtn = () => {
    muteBtn.textContent = audio.muted ? '🔇' : '🔊';
    muteBtn.style.borderColor = audio.muted ? '#663333' : '#2a3d65';
  };
  muteBtn.addEventListener('click', () => {
    audio.setMuted(!audio.muted);
    updateMuteBtn();
  });

  const exitBtn = document.createElement('button');
  exitBtn.textContent = '↩ World Map';
  exitBtn.style.cssText = `
    ${ff}font-size:0.7rem;color:#5577aa;background:rgba(8,15,28,0.8);
    border:1px solid #2a3d65;border-radius:6px;
    padding:0.35rem 0.8rem;cursor:pointer;letter-spacing:0.06em;
    transition:color 0.12s,border-color 0.12s;
  `;
  exitBtn.addEventListener('mouseenter', () => { exitBtn.style.color = '#dff6ff'; exitBtn.style.borderColor = '#4a8fff'; });
  exitBtn.addEventListener('mouseleave', () => { exitBtn.style.color = '#5577aa'; exitBtn.style.borderColor = '#2a3d65'; });
  exitBtn.addEventListener('click', () => showWorldMap());

  hudRight.append(baseHpDisplay, muteBtn, exitBtn);
  hud.append(levelInfo, waveInfo, hudRight);

  // ── HUD action row (START WAVE / count-in) ────────────────────────────────
  const actionRow = document.createElement('div');
  actionRow.style.cssText = `
    display:flex;align-items:center;justify-content:center;
    width:100%;min-height:28px;gap:0.75rem;
  `;

  const startWaveBtn = document.createElement('button');
  startWaveBtn.style.cssText = `
    ${ff}font-size:0.72rem;font-weight:800;letter-spacing:0.08em;
    background:#ffcc0022;border:1.5px solid #ffcc00;color:#ffcc00;
    border-radius:8px;padding:0.3rem 1.2rem;cursor:pointer;
    box-shadow:0 0 10px #ffcc0055;
    transition:background 0.1s,box-shadow 0.1s;display:none;
  `;
  startWaveBtn.addEventListener('mouseenter', () => {
    startWaveBtn.style.background = '#ffcc0044';
    startWaveBtn.style.boxShadow = '0 0 18px #ffcc0099';
  });
  startWaveBtn.addEventListener('mouseleave', () => {
    startWaveBtn.style.background = '#ffcc0022';
    startWaveBtn.style.boxShadow = '0 0 10px #ffcc0055';
  });

  const countInDisplay = document.createElement('div');
  countInDisplay.style.cssText = `
    ${ff}font-size:1.4rem;font-weight:800;color:#ffcc00;
    text-shadow:0 0 20px #ffcc00;letter-spacing:0.1em;display:none;
  `;

  actionRow.append(startWaveBtn, countInDisplay);

  // ── Canvas ─────────────────────────────────────────────────────────────────
  const canvasWrapper = document.createElement('div');
  canvasWrapper.style.cssText = `
    width:100%;aspect-ratio:4/3;position:relative;
    border:1.5px solid rgba(0,220,200,0.18);
    border-radius:10px;overflow:hidden;
    box-shadow:0 0 32px rgba(0,200,180,0.08);
    background:#000;
  `;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = `width:100%;height:100%;display:block;cursor:grab;touch-action:none;`;
  canvasWrapper.append(canvas);

  // ── Failure overlay ────────────────────────────────────────────────────────
  const failureOverlay = document.createElement('div');
  failureOverlay.style.cssText = `
    position:absolute;inset:0;
    background:rgba(0,2,8,0.92);
    display:none;flex-direction:column;align-items:center;justify-content:center;
    gap:1rem;z-index:10;${ff}
  `;

  const failTitle = document.createElement('div');
  failTitle.textContent = 'BASE DESTROYED';
  failTitle.style.cssText = `font-size:1.1rem;font-weight:800;color:#ff3344;letter-spacing:0.12em;text-shadow:0 0 24px #ff334488;`;

  const failWaveEl = document.createElement('div');
  failWaveEl.style.cssText = `font-size:0.7rem;color:#5577aa;letter-spacing:0.1em;`;

  const failBtnRow = document.createElement('div');
  failBtnRow.style.cssText = `display:flex;gap:0.75rem;margin-top:0.5rem;`;

  const restartBtn = document.createElement('button');
  restartBtn.textContent = '↺ RESTART';
  restartBtn.style.cssText = `
    ${ff}font-size:0.72rem;font-weight:800;letter-spacing:0.08em;
    background:#33ff8822;border:1.5px solid #33ff88;color:#33ff88;
    border-radius:8px;padding:0.3rem 1rem;cursor:pointer;
    box-shadow:0 0 10px #33ff8855;transition:background 0.1s;
  `;
  restartBtn.addEventListener('click', () => enterLevel(levelId));

  const worldMapBtn = document.createElement('button');
  worldMapBtn.textContent = '↩ WORLD MAP';
  worldMapBtn.style.cssText = `
    ${ff}font-size:0.72rem;font-weight:800;letter-spacing:0.08em;
    background:#5577aa22;border:1.5px solid #5577aa;color:#5577aa;
    border-radius:8px;padding:0.3rem 1rem;cursor:pointer;
    transition:background 0.1s;
  `;
  worldMapBtn.addEventListener('click', () => showWorldMap());

  failBtnRow.append(restartBtn, worldMapBtn);
  failureOverlay.append(failTitle, failWaveEl, failBtnRow);
  canvasWrapper.append(failureOverlay);

  const hint = document.createElement('div');
  hint.textContent = 'Scroll to zoom · Drag to pan · Click tower to select · R to rotate (when selected)';
  hint.style.cssText = `${ff}font-size:0.58rem;color:#2a4055;letter-spacing:0.08em;`;

  // ── Pre-game objects needed by rack callbacks ──────────────────────────────
  const trackSet = new Set(level.trackTiles.map(([x, y]) => `${x},${y}`));
  const tower = new OutputTower();
  const placement: PlacementState = { active: false, previewTile: null };

  // ── Rack Panel ────────────────────────────────────────────────────────────
  const channel = new SynthChannel(1);
  const freqMod = new FrequencyModule();
  const clockMod = new ClockModule();

  const { panel: rackPanel, updatePanel, updateOutputCard, wiring } = buildRackPanel(channel, freqMod, clockMod, {
    onEnterPlacement: () => {
      placement.active = !placement.active;
      if (!placement.active) placement.previewTile = null;
      canvas.style.cursor = placement.active ? 'crosshair' : 'grab';
    },
    onRotate: () => { tower.rotateClockwise(); },
  });

  // ── Wave preview row ──────────────────────────────────────────────────────
  const wavePreviewRow = document.createElement('div');
  wavePreviewRow.style.cssText = `
    display:flex;align-items:center;justify-content:center;
    width:100%;min-height:20px;gap:0.5rem;flex-wrap:wrap;
    transition:opacity 0.3s;
  `;

  root.append(hud, actionRow, wavePreviewRow, canvasWrapper, hint, rackPanel);
  app.append(root);

  // ── Canvas sizing ─────────────────────────────────────────────────────────
  const resizeCanvas = () => {
    const rect = canvasWrapper.getBoundingClientRect();
    canvas.width = Math.round(rect.width * devicePixelRatio);
    canvas.height = Math.round(rect.height * devicePixelRatio);
  };
  resizeCanvas();

  const view: ViewState = { zoom: 1, panX: 0, panY: 0 };

  const centerView = () => {
    const rect = canvasWrapper.getBoundingClientRect();
    view.panX = (rect.width - level.gridWidth * BASE_TILE_PX * view.zoom) / 2;
    view.panY = (rect.height - level.gridHeight * BASE_TILE_PX * view.zoom) / 2;
  };
  centerView();

  // ── Input ──────────────────────────────────────────────────────────────────
  canvas.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width) / devicePixelRatio;
    const my = (e.clientY - rect.top) * (canvas.height / rect.height) / devicePixelRatio;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const newZoom = Math.max(0.3, Math.min(6, view.zoom * factor));
    const scale = newZoom / view.zoom;
    view.panX = mx - (mx - view.panX) * scale;
    view.panY = my - (my - view.panY) * scale;
    view.zoom = newZoom;
  }, { passive: false });

  let pointerDown = false;
  let pointerDownClientX = 0, pointerDownClientY = 0;
  let lastPanClientX = 0, lastPanClientY = 0;
  let didPan = false;

  canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    pointerDown = true;
    pointerDownClientX = e.clientX;
    pointerDownClientY = e.clientY;
    lastPanClientX = e.clientX;
    lastPanClientY = e.clientY;
    didPan = false;
    canvas.style.cursor = placement.active ? 'crosshair' : 'grabbing';
  });

  canvas.addEventListener('pointermove', (e: PointerEvent) => {
    if (placement.active) {
      const pos = clientToCanvas(canvas, e.clientX, e.clientY);
      const tile = screenToTile(pos, view);
      placement.previewTile = { x: tile.x, y: tile.y };
    }

    if (!pointerDown || placement.active) {
      lastPanClientX = e.clientX;
      lastPanClientY = e.clientY;
      return;
    }

    const dx = e.clientX - pointerDownClientX;
    const dy = e.clientY - pointerDownClientY;
    if (Math.sqrt(dx * dx + dy * dy) > 5) didPan = true;

    if (didPan) {
      const rect = canvas.getBoundingClientRect();
      const scale = (canvas.width / rect.width) / devicePixelRatio;
      view.panX += (e.clientX - lastPanClientX) * scale;
      view.panY += (e.clientY - lastPanClientY) * scale;
      canvas.style.cursor = 'grabbing';
    }
    lastPanClientX = e.clientX;
    lastPanClientY = e.clientY;
  });

  const endPointer = (e: PointerEvent) => {
    if (!pointerDown) return;
    pointerDown = false;
    canvas.style.cursor = placement.active ? 'crosshair' : 'grab';

    if (!didPan) {
      const pos = clientToCanvas(canvas, e.clientX, e.clientY);
      const tile = screenToTile(pos, view);

      if (placement.active) {
        if (isValidTowerTile(tile.x, tile.y, level, trackSet)) {
          // Valid tile: place and exit placement mode.
          tower.tileX = tile.x;
          tower.tileY = tile.y;
          placement.active = false;
          placement.previewTile = null;
          canvas.style.cursor = 'grab';
        }
        // Invalid tile: keep placement mode active, preview stays.
      } else {
        if (tile.x === tower.tileX && tile.y === tower.tileY) {
          tower.selected = !tower.selected;
        } else {
          tower.selected = false;
        }
      }
    }
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', () => {
    pointerDown = false;
    placement.active = false;
    placement.previewTile = null;
    canvas.style.cursor = 'grab';
  });
  canvas.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    if (placement.active) {
      placement.active = false;
      placement.previewTile = null;
      canvas.style.cursor = 'grab';
    }
  });

  // ── Keyboard ──────────────────────────────────────────────────────────────
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      placement.active = false;
      placement.previewTile = null;
      tower.selected = false;
      canvas.style.cursor = 'grab';
    } else if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) {
      // R key only rotates when the tower is selected.
      if (tower.selected) tower.rotateClockwise();
    }
  };
  window.addEventListener('keydown', onKey);

  const ro = new ResizeObserver(() => { resizeCanvas(); centerView(); });
  ro.observe(canvasWrapper);
  levelCleanup = () => { ro.disconnect(); window.removeEventListener('keydown', onKey); };

  // ── Game State ─────────────────────────────────────────────────────────────
  const clock = new BeatClock(level.bpm);
  let waveEnemies: Enemy[] = [];
  let runState: RunState = 'ready';
  let baseHp = MAX_BASE_HP;
  let waveStartSubdiv = -1;
  let finishFlashTimer = 0;
  const waveManager = new WaveManager();

  const projectiles: SignalProjectile[] = [];
  const floatingTexts: FloatingText[] = [];
  const delayMod = new DelayModule();
  const scheduler = new SignalScheduler();
  const transport = new SubdivisionTransport();
  let lastPreviewWave = -1;
  let lastSubdivIdx = -1;

  audio.init().then(updateMuteBtn);

  // Default patch: CH1 → CLOCK → WAVE → FREQ → DELAY → SPLIT → OUTPUT
  wiring.connectPlugs('ch1-out', 'clock-in');
  wiring.connectPlugs('clock-out', 'wf-in');
  wiring.connectPlugs('wf-out', 'freq-in');
  wiring.connectPlugs('freq-out', 'delay-in');
  wiring.connectPlugs('delay-out', 'split-in');
  wiring.connectPlugs('split-out', 'out-in');

  // ── START WAVE button ──────────────────────────────────────────────────────
  startWaveBtn.addEventListener('click', () => {
    if (runState !== 'ready') return;
    const currentSubdiv = Math.floor(clock.beatFloat * 4);
    waveStartSubdiv = waveManager.scheduleWave(currentSubdiv);
    runState = 'countin';
  });

  // ── HUD updater ────────────────────────────────────────────────────────────
  const updateHud = () => {
    waveDisplay.textContent = `WAVE ${waveManager.currentWaveNumber}`;

    const totalEnemies = waveEnemies.length + waveManager.pendingSpawnCount;
    enemyCountDisplay.textContent = (runState === 'wave' || runState === 'countin') && totalEnemies > 0
      ? `${totalEnemies} enemies`
      : '';

    const hpColor = baseHp <= 3 ? '#ff3344' : baseHp <= 6 ? '#ffcc00' : '#33ff88';
    baseHpDisplay.style.color = hpColor;
    baseHpDisplay.textContent = `BASE ${baseHp}/${MAX_BASE_HP}`;

    const stateColors: Record<RunState, string> = {
      ready: '#5577aa', countin: '#ffcc00', wave: '#33ff88', failed: '#ff3344',
    };
    const stateLabels: Record<RunState, string> = {
      ready: 'READY', countin: 'COUNT-IN', wave: 'WAVE', failed: 'FAILED',
    };
    stateDisplay.textContent = stateLabels[runState];
    stateDisplay.style.color = stateColors[runState];

    if (runState === 'ready') {
      startWaveBtn.textContent = `▶ START WAVE ${waveManager.currentWaveNumber}`;
      startWaveBtn.style.display = 'block';
      countInDisplay.style.display = 'none';
    } else if (runState === 'countin') {
      startWaveBtn.style.display = 'none';
      const currentSubdivF = clock.beatFloat * 4;
      const beatsLeft = Math.max(1, Math.ceil((waveStartSubdiv - currentSubdivF) / 4));
      countInDisplay.textContent = String(beatsLeft);
      countInDisplay.style.display = 'block';
    } else {
      startWaveBtn.style.display = 'none';
      countInDisplay.style.display = 'none';
    }

    if (runState === 'failed') {
      failureOverlay.style.display = 'flex';
      failWaveEl.textContent = `REACHED WAVE ${waveManager.currentWaveNumber}`;
    } else {
      failureOverlay.style.display = 'none';
    }

    // Wave preview opacity
    if (runState === 'ready' || runState === 'countin') {
      wavePreviewRow.style.opacity = '1';
    } else if (runState === 'wave') {
      wavePreviewRow.style.opacity = '0.3';
    } else {
      wavePreviewRow.style.opacity = '0';
    }

    // Rebuild preview only when wave number changes
    const waveNum = waveManager.currentWaveNumber;
    if (waveNum !== lastPreviewWave) {
      lastPreviewWave = waveNum;
      wavePreviewRow.innerHTML = '';
      const preview = waveManager.getWavePreview();
      if (preview.length > 0) {
        const bandCounts: Record<string, number> = { low: 0, mid: 0, high: 0 };
        for (const entry of preview) {
          const cfg = ENEMY_TYPES[entry.enemyTypeId];
          if (!cfg) continue;
          bandCounts[entry.resonance] += entry.count;

          const chip = document.createElement('div');
          chip.style.cssText = `
            display:inline-flex;align-items:center;gap:0.2rem;
            background:#060c18;border:1px solid ${FREQ_BAND_COLORS[entry.resonance]}44;
            border-radius:5px;padding:0.1rem 0.35rem;
            ${ff}font-size:0.55rem;
          `;
          const sym = document.createElement('span');
          sym.textContent = cfg.fallbackSymbol;
          sym.style.color = cfg.color;
          const cnt = document.createElement('span');
          cnt.textContent = `×${entry.count}`;
          cnt.style.color = '#5577aa';
          const badge = document.createElement('span');
          badge.textContent = entry.resonance === 'low' ? 'L' : entry.resonance === 'mid' ? 'M' : 'H';
          badge.style.cssText = `color:${FREQ_BAND_COLORS[entry.resonance]};font-weight:800;`;
          chip.append(sym, cnt, badge);
          wavePreviewRow.append(chip);
        }

        // Aggregate band counts
        const agg = document.createElement('div');
        agg.style.cssText = `${ff}font-size:0.52rem;color:#2a4060;display:inline-flex;align-items:center;gap:0.2rem;`;
        const bands: Array<'low'|'mid'|'high'> = ['low', 'mid', 'high'];
        let first = true;
        for (const b of bands) {
          if (bandCounts[b] <= 0) continue;
          if (!first) {
            const dot = document.createElement('span');
            dot.textContent = '·';
            dot.style.color = '#2a4060';
            agg.append(dot);
          }
          first = false;
          const s = document.createElement('span');
          s.textContent = `${b === 'low' ? 'L' : b === 'mid' ? 'M' : 'H'}:${bandCounts[b]}`;
          s.style.color = FREQ_BAND_COLORS[b];
          agg.append(s);
        }
        wavePreviewRow.append(agg);
      }
    }
  };

  let lastNow = performance.now();
  const ctx = canvas.getContext('2d')!;

  // ── Game Loop ──────────────────────────────────────────────────────────────
  const tick = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;

    const beatFloat = clock.beatFloat;
    const beat = clock.beat;

    delayMod.update(dt);
    freqMod.update(dt);
    clockMod.update(dt);
    finishFlashTimer = Math.max(0, finishFlashTimer - dt);

    // Tick floating texts
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
      floatingTexts[i].timer -= dt;
      if (floatingTexts[i].timer <= 0) floatingTexts.splice(i, 1);
    }

    const route = evaluateSignalGraph(wiring.getConnections(), channel, freqMod, clockMod);
    let firedThisFrame = false;

    // ── Subdivision transport ──────────────────────────────────────────────
    const secsPerSubdiv = 60 / level.bpm / 4;
    const audioCtxTime = audio.currentTime;
    const subdivEvents = transport.tick(beatFloat, audioCtxTime, secsPerSubdiv);

    for (const { subdivIdx, audioTime } of subdivEvents) {
      lastSubdivIdx = subdivIdx;

      // Count-in → wave transition at the scheduled downbeat.
      if (runState === 'countin' && subdivIdx >= waveStartSubdiv) {
        runState = 'wave';
      }

      // Spawn new enemies (wave state only; count-in keeps them pending).
      if (runState === 'wave') {
        const newEnemies = waveManager.tick(subdivIdx, level.trackTiles);
        waveEnemies.push(...newEnemies);
      }

      // Advance enemies and detect escapes.
      if (runState === 'wave') {
        for (let i = waveEnemies.length - 1; i >= 0; i--) {
          const result = waveEnemies[i].processSubdiv(subdivIdx);
          if (result === 'escaped') {
            waveEnemies.splice(i, 1);
            baseHp = Math.max(0, baseHp - 1);
            finishFlashTimer = 0.55;
            if (baseHp <= 0 && runState !== 'failed') {
              runState = 'failed';
              scheduler.clear();
              projectiles.length = 0;
            }
          }
        }
      }

      // Signal firing (subdivision-accurate, disabled when failed)
      if (runState !== 'failed') {
        // Release delayed echoes scheduled for this subdivision
        const echoSignals = scheduler.releaseAt(subdivIdx);
        if (echoSignals.length > 0) {
          tower.spawnSignals(echoSignals, subdivIdx, projectiles);
          delayMod.onSend();
        }

        // Fire direct signals
        const fired = tower.processSubdiv(subdivIdx, route.signals, projectiles);
        if (fired) {
          firedThisFrame = true;
          clockMod.onTrigger();
          if (route.hasDelay) {
            scheduler.schedule(
              subdivIdx + delayMod.delaySubdivs,
              route.signals.map(s => ({ ...s, amplitude: s.amplitude * delayMod.echoAmplitude })),
            );
            delayMod.onReceive();
          }
        }
      }

      // Percussion — always plays regardless of run state.
      if (subdivIdx % 4 === 0) {
        audio.playKick(subdivIdx / 4, audioTime);
      }
      // Hi-hat cadence driven only by currently active (spawned, living) enemies.
      const hatPeriod = computeFastestHatPeriod(waveEnemies);
      if (hatPeriod > 0 && subdivIdx % hatPeriod === 0) {
        audio.playHihat(audioTime);
      }
    }

    // Per-frame animation
    for (const enemy of waveEnemies) enemy.updateAnimation(dt);

    // Collision and projectile culling (skip when failed)
    if (runState !== 'failed') {
      cullProjectiles(projectiles, level, beatFloat);
      checkCollisions(waveEnemies, projectiles, level, beatFloat, floatingTexts, freqMod);
    }

    // Remove enemies killed by projectiles this frame.
    waveEnemies = waveEnemies.filter(e => !e.isDead);

    // Wave completion: all spawned, none left alive.
    if (runState === 'wave' && waveManager.isAllSpawned && waveEnemies.length === 0) {
      runState = 'ready';
      waveManager.advanceWave();
    }

    beatDisplay.textContent = `beat ${beat}`;
    updateHud();
    updatePanel(dt, route, firedThisFrame, delayMod, scheduler, freqMod, clockMod, lastSubdivIdx);
    updateOutputCard(tower, placement.active);
    wiring.update(now);

    renderLevel(ctx, canvas, level, view, clock, channel, waveEnemies, tower, projectiles, route, placement, trackSet, finishFlashTimer, floatingTexts);
    rafId = requestAnimationFrame(tick);
  };

  // Initial HUD state
  updateHud();
  rafId = requestAnimationFrame(tick);
}

// ── Rack Panel ─────────────────────────────────────────────────────────────

const WAVEFORM_COLORS: Record<Waveform, string> = {
  pulse: '#cc44ff',
  sine: '#00ddcc',
  square: '#ff8800',
};

const MODULE_FLASH_COLORS: Record<string, string> = {
  ch1:   '#00ffee',
  wave:  '#cc44ff',
  delay: '#44aaff',
  split: '#ff8800',
  out:   '#ffcc00',
};

const FACING_LABELS: Record<TowerOrientation, string> = {
  north: '↑ N', east: '→ E', south: '↓ S', west: '← W',
};

function createPlugEl(type: RackPlugType): HTMLElement {
  const color = rackPlugColor(type);
  const el = document.createElement('div');
  el.dataset.color = color;
  const shadow = `0 0 6px ${color}99`;
  el.dataset.defaultShadow = shadow;
  el.style.cssText = `
    width:13px;height:13px;border-radius:50%;flex-shrink:0;
    background:${color}33;border:2px solid ${color};
    box-shadow:${shadow};
    transition:transform 0.1s,box-shadow 0.1s;
    touch-action:none;
  `;
  return el;
}

interface RackModuleSpec {
  title: string;
  titleColor: string;
  inputPlugId?: string;
  inputPlugType?: RackPlugType;
  outputPlugId?: string;
  outputPlugType?: RackPlugType;
  buildContent: (card: HTMLElement) => void;
}

function buildModuleCard(
  spec: RackModuleSpec,
  wiring: RackWiringHandle,
): { card: HTMLElement; inPlugEl?: HTMLElement; outPlugEl?: HTMLElement } {
  const ff = `font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;`;
  const card = document.createElement('div');
  card.style.cssText = `
    ${ff}
    display:flex;flex-direction:column;gap:0.4rem;
    background:#060c18;border:1.5px solid #1a2a44;border-radius:10px;
    padding:0.5rem 0.55rem;min-width:110px;flex:1;
    position:relative;transition:border-color 0.15s,box-shadow 0.15s;
  `;

  const header = document.createElement('div');
  header.style.cssText = `display:flex;align-items:center;gap:0.4rem;`;

  let inPlugEl: HTMLElement | undefined;
  let outPlugEl: HTMLElement | undefined;

  if (spec.inputPlugId && spec.inputPlugType) {
    inPlugEl = createPlugEl(spec.inputPlugType);
    header.append(inPlugEl);
    wiring.registerPlug(spec.inputPlugId, spec.inputPlugType, inPlugEl);
  }

  const titleEl = document.createElement('div');
  titleEl.textContent = spec.title;
  titleEl.style.cssText = `
    color:${spec.titleColor};font-size:0.58rem;font-weight:800;
    letter-spacing:0.1em;flex:1;text-align:center;
  `;
  header.append(titleEl);

  if (spec.outputPlugId && spec.outputPlugType) {
    outPlugEl = createPlugEl(spec.outputPlugType);
    outPlugEl.style.cursor = 'crosshair';
    header.append(outPlugEl);
    wiring.registerPlug(spec.outputPlugId, spec.outputPlugType, outPlugEl);
  }

  card.append(header);
  spec.buildContent(card);

  return { card, inPlugEl, outPlugEl };
}

function buildRackPanel(
  channel: SynthChannel,
  freqModArg: FrequencyModule,
  clockModArg: ClockModule,
  towerCallbacks: { onEnterPlacement: () => void; onRotate: () => void },
): {
  panel: HTMLElement;
  updatePanel: (dt: number, route: EvaluatedRoute, firedThisFrame: boolean, delayMod: DelayModule, scheduler: SignalScheduler, freqMod: FrequencyModule, clockMod: ClockModule, currentSubdivIdx: number) => void;
  updateOutputCard: (tower: OutputTower, placementActive: boolean) => void;
  wiring: RackWiringHandle;
} {
  const ff = `font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;`;

  const panel = document.createElement('div');
  panel.style.cssText = `
    ${ff}
    width:100%;position:relative;
    background:#040912;border:1.5px solid #1a2a44;border-radius:10px;
    padding:0.5rem 0.6rem;
  `;

  const wiring = createRackWiringSystem(panel);

  const labelsRow = document.createElement('div');
  labelsRow.style.cssText = `
    display:flex;align-items:center;justify-content:space-between;
    margin-bottom:0.3rem;
  `;
  const rackLabel = document.createElement('div');
  rackLabel.textContent = 'SYNTH RACK';
  rackLabel.style.cssText = `color:#2a4060;font-size:0.52rem;font-weight:800;letter-spacing:0.14em;`;

  const routeIndicator = document.createElement('div');
  routeIndicator.style.cssText = `font-size:0.52rem;letter-spacing:0.1em;`;
  labelsRow.append(rackLabel, routeIndicator);
  panel.append(labelsRow);

  const modulesRow = document.createElement('div');
  modulesRow.style.cssText = `display:flex;gap:0.4rem;align-items:stretch;overflow-x:auto;`;
  panel.append(modulesRow);

  const waveforms: Waveform[] = ['pulse', 'sine', 'square'];
  const wfButtons: Record<Waveform, HTMLButtonElement> = {} as Record<Waveform, HTMLButtonElement>;
  let previewCanvas: HTMLCanvasElement;

  const refreshButtons = () => {
    for (const wf of waveforms) {
      const btn = wfButtons[wf];
      if (!btn) continue;
      const active = channel.waveform === wf;
      const color = WAVEFORM_COLORS[wf];
      if (active) {
        btn.style.background = `${color}22`;
        btn.style.border = `1.5px solid ${color}`;
        btn.style.color = color;
        btn.style.boxShadow = `0 0 8px ${color}55`;
      } else {
        btn.style.background = '#0a1020';
        btn.style.border = `1.5px solid #1e2e48`;
        btn.style.color = '#334466';
        btn.style.boxShadow = '';
      }
    }
    if (previewCanvas) drawWaveformPreview(previewCanvas, channel.waveform);
  };

  let ch1PeriodEl: HTMLElement;
  let ch1PhaseEl: HTMLElement;

  const { card: ch1Card } = buildModuleCard({
    title: 'CH 1',
    titleColor: '#00ffee',
    outputPlugId: 'ch1-out',
    outputPlugType: 'channelOut',
    buildContent: (card) => {
      ch1PeriodEl = document.createElement('div');
      ch1PeriodEl.style.cssText = `color:#00ffee88;font-size:0.54rem;text-align:center;letter-spacing:0.05em;`;
      ch1PhaseEl = document.createElement('div');
      ch1PhaseEl.style.cssText = `color:#00ffee44;font-size:0.5rem;text-align:center;`;
      card.append(ch1PeriodEl, ch1PhaseEl);
    },
  }, wiring);
  modulesRow.append(ch1Card);

  // ── CLOCK card ─────────────────────────────────────────────────────────────
  const clockRates: Array<1 | 2 | 4 | 8 | 16> = [1, 2, 4, 8, 16];
  const clockRateLabels: Record<number, string> = { 1: '1/16', 2: '1/8', 4: '1/4', 8: '1/2', 16: '1/1' };
  const clockBtnMap = new Map<number, HTMLButtonElement>();
  let clockSubdivDotsEls: HTMLElement[] = [];
  let clockInfoEl: HTMLElement;

  const refreshClockButtons = () => {
    for (const r of clockRates) {
      const btn = clockBtnMap.get(r);
      if (!btn) continue;
      const active = clockModArg.rate === r;
      if (active) {
        btn.style.background = '#33dd8822';
        btn.style.border = '1.5px solid #33dd88';
        btn.style.color = '#33dd88';
        btn.style.boxShadow = '0 0 8px #33dd8855';
      } else {
        btn.style.background = '#0a1020';
        btn.style.border = '1.5px solid #1e2e48';
        btn.style.color = '#334466';
        btn.style.boxShadow = '';
      }
    }
    if (clockInfoEl) {
      clockInfoEl.textContent = `${clockModArg.rateLabel}  φ${clockModArg.phaseSubdivs}`;
    }
  };

  const { card: clockCard } = buildModuleCard({
    title: 'CLOCK',
    titleColor: '#33dd88',
    inputPlugId: 'clock-in',
    inputPlugType: 'clockIn',
    outputPlugId: 'clock-out',
    outputPlugType: 'clockOut',
    buildContent: (card) => {
      const btnRow = document.createElement('div');
      btnRow.style.cssText = `display:flex;gap:0.15rem;justify-content:center;flex-wrap:wrap;`;
      for (const r of clockRates) {
        const btn = document.createElement('button');
        btn.textContent = clockRateLabels[r];
        btn.style.cssText = `
          font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;
          font-size:0.46rem;font-weight:800;letter-spacing:0.03em;
          padding:0.12rem 0.22rem;border-radius:4px;cursor:pointer;
          transition:background 0.1s,border-color 0.1s,color 0.1s,box-shadow 0.1s;
        `;
        clockBtnMap.set(r, btn);
        btn.addEventListener('click', () => {
          clockModArg.rate = r;
          clockModArg.phaseSubdivs = 0;
          refreshClockButtons();
        });
        btnRow.append(btn);
      }

      const phaseRow = document.createElement('div');
      phaseRow.style.cssText = `display:flex;align-items:center;justify-content:space-between;gap:0.3rem;margin-top:0.18rem;`;

      clockInfoEl = document.createElement('div');
      clockInfoEl.style.cssText = `color:#33dd8899;font-size:0.5rem;letter-spacing:0.05em;flex:1;text-align:center;`;

      const phaseBtn = document.createElement('button');
      phaseBtn.textContent = 'φ+';
      phaseBtn.title = 'Advance phase by one subdivision';
      phaseBtn.style.cssText = `
        font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;
        font-size:0.46rem;font-weight:800;letter-spacing:0.04em;
        padding:0.1rem 0.22rem;border-radius:4px;cursor:pointer;
        background:#0a1020;border:1.5px solid #1e2e48;color:#334466;
        transition:background 0.1s,border-color 0.1s,color 0.1s;
      `;
      phaseBtn.addEventListener('click', () => {
        clockModArg.advancePhase();
        refreshClockButtons();
      });

      phaseRow.append(clockInfoEl, phaseBtn);

      // Subdivision position indicator (4 dots = one beat)
      const dotsRow = document.createElement('div');
      dotsRow.style.cssText = `display:flex;gap:0.25rem;justify-content:center;margin-top:0.15rem;`;
      clockSubdivDotsEls = [];
      for (let i = 0; i < 4; i++) {
        const dot = document.createElement('div');
        dot.style.cssText = `
          width:5px;height:5px;border-radius:50%;
          background:#102030;border:1px solid #1e3044;
          transition:background 0.06s,box-shadow 0.06s;
        `;
        clockSubdivDotsEls.push(dot);
        dotsRow.append(dot);
      }

      card.append(btnRow, phaseRow, dotsRow);
    },
  }, wiring);
  modulesRow.append(clockCard);

  let wfIndicatorEl: HTMLElement;

  const { card: wfCard } = buildModuleCard({
    title: 'WAVE',
    titleColor: '#cc44ff',
    inputPlugId: 'wf-in',
    inputPlugType: 'waveformIn',
    outputPlugId: 'wf-out',
    outputPlugType: 'waveformOut',
    buildContent: (card) => {
      const btnRow = document.createElement('div');
      btnRow.style.cssText = `display:flex;gap:0.22rem;flex-wrap:wrap;justify-content:center;`;
      for (const wf of waveforms) {
        const btn = document.createElement('button');
        btn.textContent = wf.slice(0, 3).toUpperCase();
        btn.style.cssText = `
          font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;
          font-size:0.5rem;font-weight:800;letter-spacing:0.05em;
          padding:0.16rem 0.3rem;border-radius:4px;cursor:pointer;
          transition:background 0.1s,border-color 0.1s,color 0.1s,box-shadow 0.1s;
        `;
        wfButtons[wf] = btn;
        btn.addEventListener('click', () => { channel.setWaveform(wf); refreshButtons(); });
        btnRow.append(btn);
      }
      previewCanvas = document.createElement('canvas');
      previewCanvas.width = 60; previewCanvas.height = 18;
      previewCanvas.style.cssText = `
        width:60px;height:18px;border-radius:3px;display:block;
        background:#030609;border:1px solid #1a2a44;margin-top:0.15rem;
      `;
      wfIndicatorEl = document.createElement('div');
      wfIndicatorEl.style.cssText = `color:#9933cc;font-size:0.55rem;font-weight:800;text-align:center;`;
      card.append(btnRow, previewCanvas, wfIndicatorEl);
    },
  }, wiring);
  modulesRow.append(wfCard);

  // ── FREQ card ──────────────────────────────────────────────────────────────
  const freqBands: FrequencyBand[] = ['low', 'mid', 'high'];
  const freqBtnMap = new Map<FrequencyBand, HTMLButtonElement>();
  let freqLedEl: HTMLElement;

  const refreshFreqButtons = () => {
    for (const b of freqBands) {
      const btn = freqBtnMap.get(b);
      if (!btn) continue;
      const active = freqModArg.band === b;
      const fc = FREQ_BAND_COLORS[b];
      if (active) {
        btn.style.background = `${fc}22`;
        btn.style.border = `1.5px solid ${fc}`;
        btn.style.color = fc;
        btn.style.boxShadow = `0 0 8px ${fc}55`;
      } else {
        btn.style.background = '#0a1020';
        btn.style.border = `1.5px solid #1e2e48`;
        btn.style.color = '#334466';
        btn.style.boxShadow = '';
      }
    }
  };

  const { card: freqCard } = buildModuleCard({
    title: 'FREQ',
    titleColor: '#88aacc',
    inputPlugId: 'freq-in',
    inputPlugType: 'frequencyIn',
    outputPlugId: 'freq-out',
    outputPlugType: 'frequencyOut',
    buildContent: (card) => {
      const btnRow = document.createElement('div');
      btnRow.style.cssText = `display:flex;gap:0.2rem;justify-content:center;`;
      for (const b of freqBands) {
        const btn = document.createElement('button');
        btn.textContent = b === 'low' ? 'LO' : b === 'mid' ? 'MI' : 'HI';
        btn.style.cssText = `
          font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;
          font-size:0.5rem;font-weight:800;letter-spacing:0.04em;
          padding:0.15rem 0.28rem;border-radius:4px;cursor:pointer;
          transition:background 0.1s,border-color 0.1s,color 0.1s,box-shadow 0.1s;
        `;
        freqBtnMap.set(b, btn);
        btn.addEventListener('click', () => { freqModArg.band = b; refreshFreqButtons(); });
        btnRow.append(btn);
      }
      freqLedEl = document.createElement('div');
      freqLedEl.style.cssText = `
        width:7px;height:7px;border-radius:50%;
        background:#102030;border:1.5px solid #224466;
        margin:0.2rem auto 0;
        transition:background 0.1s,box-shadow 0.1s;
      `;
      card.append(btnRow, freqLedEl);
    },
  }, wiring);
  modulesRow.append(freqCard);

  let delayLedEl: HTMLElement;
  const delayBtnMap = new Map<number, HTMLButtonElement>();
  let _delayModRef: DelayModule | null = null;

  const refreshDelayButtons = () => {
    if (!_delayModRef) return;
    for (const [b, btn] of delayBtnMap) {
      const active = _delayModRef.delayBeats === b;
      btn.style.background = active ? '#44aaff22' : '#0a1020';
      btn.style.border     = active ? '1.5px solid #44aaff' : '1.5px solid #1e2e48';
      btn.style.color      = active ? '#44aaff' : '#334466';
      btn.style.boxShadow  = active ? '0 0 8px #44aaff55' : '';
    }
  };

  const { card: delayCard } = buildModuleCard({
    title: 'DELAY',
    titleColor: '#44aaff',
    inputPlugId: 'delay-in',
    inputPlugType: 'delayIn',
    outputPlugId: 'delay-out',
    outputPlugType: 'delayOut',
    buildContent: (card) => {
      const beats: Array<1 | 2 | 4> = [1, 2, 4];
      const btnRow = document.createElement('div');
      btnRow.style.cssText = `display:flex;gap:0.2rem;justify-content:center;`;
      for (const b of beats) {
        const btn = document.createElement('button');
        btn.textContent = `${b}♩`;
        btn.style.cssText = `
          font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;
          font-size:0.5rem;font-weight:800;letter-spacing:0.04em;
          padding:0.15rem 0.3rem;border-radius:4px;cursor:pointer;
          transition:background 0.1s,border-color 0.1s,color 0.1s,box-shadow 0.1s;
        `;
        delayBtnMap.set(b, btn);
        btn.addEventListener('click', () => {
          if (_delayModRef) { _delayModRef.delayBeats = b as 1|2|4; refreshDelayButtons(); }
        });
        btnRow.append(btn);
      }
      const echoLabel = document.createElement('div');
      echoLabel.style.cssText = `color:#224466;font-size:0.48rem;letter-spacing:0.07em;text-align:center;margin-top:0.12rem;`;
      echoLabel.textContent = 'ECHO 50%';
      delayLedEl = document.createElement('div');
      delayLedEl.style.cssText = `
        width:7px;height:7px;border-radius:50%;
        background:#102030;border:1.5px solid #224466;
        margin:0.2rem auto 0;
        transition:background 0.1s,box-shadow 0.1s;
      `;
      card.append(btnRow, echoLabel, delayLedEl);
    },
  }, wiring);
  modulesRow.append(delayCard);

  let splitAmpEl: HTMLElement;

  const { card: splitCard } = buildModuleCard({
    title: 'SPLIT',
    titleColor: '#ff8800',
    inputPlugId: 'split-in',
    inputPlugType: 'splitterIn',
    outputPlugId: 'split-out',
    outputPlugType: 'splitterOut',
    buildContent: (card) => {
      const dirLabel = document.createElement('div');
      dirLabel.style.cssText = `color:#ff8800cc;font-size:0.7rem;font-weight:800;text-align:center;`;
      dirLabel.textContent = 'N ↕ S';
      splitAmpEl = document.createElement('div');
      splitAmpEl.style.cssText = `color:#ff880077;font-size:0.5rem;text-align:center;margin-top:0.05rem;`;
      card.append(dirLabel, splitAmpEl);
    },
  }, wiring);
  modulesRow.append(splitCard);

  // ── OUTPUT card ────────────────────────────────────────────────────────────
  const outLed = document.createElement('div');
  outLed.style.cssText = `
    width:10px;height:10px;border-radius:50%;
    background:#332200;border:1.5px solid #664400;
    margin:0.2rem auto 0;
    transition:background 0.08s,box-shadow 0.08s;
  `;

  const smallBtnCss = `
    font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;
    font-size:0.46rem;font-weight:800;letter-spacing:0.04em;
    padding:0.13rem 0.28rem;border-radius:4px;cursor:pointer;
    background:#0a1020;border:1.5px solid #1e2e48;color:#334466;
    transition:background 0.1s,border-color 0.1s,color 0.1s,box-shadow 0.1s;
  `;

  let outTileEl: HTMLElement;
  let outFacingEl: HTMLElement;
  let outPlaceBtn: HTMLButtonElement;

  const { card: outCard } = buildModuleCard({
    title: 'OUTPUT',
    titleColor: '#ffcc00',
    inputPlugId: 'out-in',
    inputPlugType: 'outputIn',
    buildContent: (card) => {
      outTileEl = document.createElement('div');
      outTileEl.style.cssText = `color:#ffcc0077;font-size:0.46rem;text-align:center;letter-spacing:0.04em;`;
      outTileEl.textContent = '8, 4';

      outFacingEl = document.createElement('div');
      outFacingEl.style.cssText = `color:#ffcc0055;font-size:0.46rem;text-align:center;`;
      outFacingEl.textContent = '↑ N';

      const btnRow = document.createElement('div');
      btnRow.style.cssText = `display:flex;gap:0.2rem;justify-content:center;margin-top:0.1rem;`;

      outPlaceBtn = document.createElement('button');
      outPlaceBtn.textContent = 'MOVE';
      outPlaceBtn.title = 'Place / Move tower on grid';
      outPlaceBtn.style.cssText = smallBtnCss;
      outPlaceBtn.addEventListener('click', () => towerCallbacks.onEnterPlacement());

      const rotateBtn = document.createElement('button');
      rotateBtn.textContent = '↻ R';
      rotateBtn.title = 'Rotate tower clockwise';
      rotateBtn.style.cssText = smallBtnCss;
      // Rack ROTATE button always rotates (no selection required).
      rotateBtn.addEventListener('click', () => towerCallbacks.onRotate());

      btnRow.append(outPlaceBtn, rotateBtn);
      card.append(outLed, outTileEl, outFacingEl, btnRow);
    },
  }, wiring);
  modulesRow.append(outCard);

  const moduleCards: Record<string, HTMLElement> = { ch1: ch1Card, clock: clockCard, wave: wfCard, freq: freqCard, delay: delayCard, split: splitCard, out: outCard };
  const flashTimers: Record<string, number> = { ch1: 0, wave: 0, freq: 0, delay: 0, split: 0, out: 0 };

  refreshButtons();
  refreshFreqButtons();
  refreshClockButtons();

  const updatePanel = (dt: number, route: EvaluatedRoute, firedThisFrame: boolean, delayMod: DelayModule, scheduler: SignalScheduler, freqMod: FrequencyModule, clockMod: ClockModule, currentSubdivIdx: number) => {
    _delayModRef = delayMod;
    refreshDelayButtons();
    refreshFreqButtons();
    refreshClockButtons();
    ch1PeriodEl.textContent = `AMP ${channel.amplitude.toFixed(1)}`;
    ch1PhaseEl.textContent = '';

    if (wfIndicatorEl) wfIndicatorEl.textContent = channel.waveform.toUpperCase();

    const splitAmp = (channel.amplitude / 2).toFixed(2);
    if (splitAmpEl) splitAmpEl.textContent = `1→2  ×${splitAmp}`;

    const active = route.signals.length > 0;
    routeIndicator.textContent = route.routeLabel;
    routeIndicator.style.color = active ? '#00ffee' : '#2a4060';

    for (const key of Object.keys(flashTimers)) {
      if (key === 'delay' || key === 'freq') continue;
      if (firedThisFrame && route.activeModules.has(key)) {
        flashTimers[key] = 0.35;
      } else {
        flashTimers[key] = Math.max(0, flashTimers[key] - dt);
      }
      const flashing = flashTimers[key] > 0;
      const fc = MODULE_FLASH_COLORS[key] ?? '#ffffff';
      moduleCards[key].style.borderColor = flashing ? fc : '#1a2a44';
      moduleCards[key].style.boxShadow = flashing ? `0 0 10px ${fc}55` : '';
    }

    // CLOCK card flash + subdiv indicator
    {
      const clocking = clockMod.flashTimer > 0;
      if (clocking) {
        clockCard.style.borderColor = '#33dd88';
        clockCard.style.boxShadow = '0 0 14px #33dd8899';
      } else {
        clockCard.style.borderColor = route.activeModules.has('clock') ? '#33dd8833' : '#1a2a44';
        clockCard.style.boxShadow = '';
      }
      // Subdiv position dots (4 per beat, show beat-local position)
      const beatPos = ((currentSubdivIdx % 4) + 4) % 4;
      for (let i = 0; i < clockSubdivDotsEls.length; i++) {
        const active = route.activeModules.has('clock') && i === beatPos;
        clockSubdivDotsEls[i].style.background = active ? '#33dd88' : '#102030';
        clockSubdivDotsEls[i].style.boxShadow = active ? '0 0 5px #33dd8888' : '';
        clockSubdivDotsEls[i].style.borderColor = active ? '#33dd88' : '#1e3044';
      }
    }

    // FREQ card flash — driven by freqMod.flashTimer
    {
      const fc = FREQ_BAND_COLORS[freqMod.band];
      const flashing = freqMod.flashTimer > 0;
      if (flashing) {
        const flashColor = freqMod.flashIsMatch ? fc : '#667788';
        freqCard.style.borderColor = flashColor;
        freqCard.style.boxShadow = `0 0 12px ${flashColor}88`;
      } else {
        freqCard.style.borderColor = `${fc}55`;
        freqCard.style.boxShadow = '';
      }
      freqLedEl.style.background = route.activeModules.has('freq') ? fc : '#102030';
      freqLedEl.style.boxShadow = route.activeModules.has('freq') ? `0 0 6px ${fc}99` : '';
      freqLedEl.style.borderColor = route.activeModules.has('freq') ? fc : '#224466';
    }

    const drecv = delayMod.receiveFlashTimer > 0;
    const dsend = delayMod.sendFlashTimer > 0;
    if (dsend) {
      delayCard.style.borderColor = '#88ccff';
      delayCard.style.boxShadow   = '0 0 14px #44aaff99';
    } else if (drecv) {
      delayCard.style.borderColor = '#44aaff';
      delayCard.style.boxShadow   = '0 0 8px #44aaff55';
    } else {
      delayCard.style.borderColor = '#1a2a44';
      delayCard.style.boxShadow   = '';
    }

    const queued = scheduler.queue.length > 0;
    delayLedEl.style.background  = queued ? '#44aaff' : '#102030';
    delayLedEl.style.boxShadow   = queued ? '0 0 6px #44aaff99' : '';
    delayLedEl.style.borderColor = queued ? '#44aaff' : '#224466';

    const ledFlashing = flashTimers['out'] > 0;
    if (ledFlashing) {
      outLed.style.background = '#ffffff';
      outLed.style.boxShadow = '0 0 14px #ffcc00cc, 0 0 6px #fff';
      outLed.style.borderColor = '#ffcc00';
    } else if (active) {
      outLed.style.background = '#ffcc00';
      outLed.style.boxShadow = '0 0 8px #ffcc0099';
      outLed.style.borderColor = '#ffcc00';
    } else {
      outLed.style.background = '#332200';
      outLed.style.boxShadow = '';
      outLed.style.borderColor = '#664400';
    }
  };

  const updateOutputCard = (tower: OutputTower, placementActive: boolean) => {
    if (outTileEl) outTileEl.textContent = `${tower.tileX}, ${tower.tileY}`;
    if (outFacingEl) outFacingEl.textContent = FACING_LABELS[tower.orientation];
    if (outPlaceBtn) {
      outPlaceBtn.textContent = placementActive ? 'CANCEL' : 'MOVE';
      outPlaceBtn.style.background = placementActive ? '#ffcc0022' : '#0a1020';
      outPlaceBtn.style.borderColor = placementActive ? '#ffcc00' : '#1e2e48';
      outPlaceBtn.style.color = placementActive ? '#ffcc00' : '#334466';
      outPlaceBtn.style.boxShadow = placementActive ? '0 0 8px #ffcc0055' : '';
    }
  };

  const _emptyDelay = new DelayModule();
  const _emptyScheduler = new SignalScheduler();
  const _emptyFreq = new FrequencyModule();
  const _emptyClock = new ClockModule();
  updatePanel(0, { signals: [], routeLabel: 'NO SIGNAL', activeModules: new Set(), hasDelay: false }, false, _emptyDelay, _emptyScheduler, _emptyFreq, _emptyClock, -1);

  return { panel, updatePanel, updateOutputCard, wiring };
}

function drawWaveformPreview(canvas: HTMLCanvasElement, wf: Waveform): void {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#030609';
  ctx.fillRect(0, 0, W, H);

  const color = WAVEFORM_COLORS[wf];
  ctx.save();
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 4;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const midY = H / 2;
  const amp = H * 0.35;
  const steps = 80;

  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = t * W;
    let y: number;

    if (wf === 'sine') {
      y = midY - Math.sin(t * Math.PI * 2) * amp;
    } else if (wf === 'square') {
      y = t < 0.5 ? midY - amp : midY + amp;
    } else {
      const phase = t % 0.5;
      y = phase < 0.06 ? midY - amp : midY;
    }

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

// ── Projectile Logic ────────────────────────────────────────────────────────

function cullProjectiles(
  projectiles: SignalProjectile[],
  level: SynthLevelConfig,
  beatFloat: number,
): void {
  for (const p of projectiles) {
    if (p.dead) continue;
    const age = beatFloat - p.spawnBeat;
    const tx = p.originX + age * p.dirX;
    const ty = p.originY + age * p.dirY;
    if (tx < -1 || tx > level.gridWidth || ty < -1 || ty > level.gridHeight) {
      p.dead = true;
    }
  }
  if (projectiles.length > 120) {
    const alive = projectiles.filter(p => !p.dead);
    projectiles.length = 0;
    projectiles.push(...alive);
  }
}

function checkCollisions(
  enemies: Enemy[],
  projectiles: SignalProjectile[],
  level: SynthLevelConfig,
  beatFloat: number,
  floatingTexts: FloatingText[],
  freqMod: FrequencyModule,
): void {
  if (level.trackTiles.length === 0) return;

  for (const enemy of enemies) {
    if (!enemy.isSpawned) continue;
    const [etx, ety] = enemy.getLogicalTile();
    for (const p of projectiles) {
      if (p.dead) continue;
      const age = beatFloat - p.spawnBeat;
      const ptx = Math.round(p.originX + age * p.dirX);
      const pty = Math.round(p.originY + age * p.dirY);
      if (ptx === etx && pty === ety) {
        p.dead = true;
        const isMatch = p.frequencyBand === enemy.typeConfig.resonance;
        const multiplier = isMatch ? 2 : 0.5;
        enemy.hit(p.amplitude * multiplier, isMatch);
        if (isMatch) freqMod.onHit(true);
        floatingTexts.push({
          tileX: etx + 0.5,
          tileY: ety,
          text: isMatch ? 'CANCEL ×2' : 'RESIST ×½',
          color: isMatch ? FREQ_BAND_COLORS[p.frequencyBand] : '#667788',
          timer: 1.0,
          duration: 1.0,
          offsetX: Math.random() * 0.6 - 0.3,
        });
      }
    }
  }
}

// ── Rendering ──────────────────────────────────────────────────────────────

function renderLevel(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  level: SynthLevelConfig,
  view: ViewState,
  clock: BeatClock,
  channel: SynthChannel,
  enemies: Enemy[],
  tower: OutputTower,
  projectiles: SignalProjectile[],
  route: EvaluatedRoute,
  placement: PlacementState,
  trackSet: Set<string>,
  finishFlashTimer: number,
  floatingTexts: FloatingText[],
): void {
  const W = canvas.width, H = canvas.height;
  const dpr = devicePixelRatio;
  const tileZ = BASE_TILE_PX * dpr * view.zoom;
  const beatFloat = clock.beatFloat;
  const beatFrac = clock.beatFrac;
  const zDpr = view.zoom * dpr;

  ctx.fillStyle = '#01030a';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(view.panX * dpr, view.panY * dpr);

  const start = level.trackTiles[0];
  const finish = level.trackTiles[level.trackTiles.length - 1];

  // ── Grid tile fills ────────────────────────────────────────────────────────
  for (let ty = 0; ty < level.gridHeight; ty++) {
    for (let tx = 0; tx < level.gridWidth; tx++) {
      const px = tx * tileZ, py = ty * tileZ;
      const isTrack = trackSet.has(`${tx},${ty}`);

      if (isTrack) {
        ctx.fillStyle = '#030a14';
        ctx.fillRect(px, py, tileZ, tileZ);
        ctx.fillStyle = 'rgba(0,160,140,0.04)';
        ctx.fillRect(px + 1, py + 1, tileZ - 2, tileZ - 2);
      } else {
        ctx.fillStyle = '#010409';
        ctx.fillRect(px, py, tileZ, tileZ);
        ctx.strokeStyle = 'rgba(20,38,72,0.6)';
        ctx.lineWidth = Math.max(0.3, 0.5 * dpr);
        ctx.strokeRect(px + 0.5, py + 0.5, tileZ - 1, tileZ - 1);
        if (tx % 4 === 0 && ty % 4 === 0) {
          ctx.fillStyle = 'rgba(30,55,100,0.5)';
          const dotR = Math.max(1, 1.8 * zDpr);
          ctx.beginPath();
          ctx.arc(px, py, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
        if ((tx + ty * 3) % 7 === 0 && !isTrack) {
          ctx.strokeStyle = 'rgba(20,45,80,0.4)';
          ctx.lineWidth = Math.max(0.3, 0.4 * dpr);
          ctx.beginPath();
          ctx.moveTo(px + tileZ * 0.2, py + tileZ / 2);
          ctx.lineTo(px + tileZ * 0.8, py + tileZ / 2);
          ctx.stroke();
        }
      }
    }
  }

  // ── Track circuit traces ───────────────────────────────────────────────────
  const buildTracePath = () => {
    ctx.beginPath();
    for (let i = 0; i < level.trackTiles.length; i++) {
      const [tx, ty] = level.trackTiles[i];
      const px = tx * tileZ + tileZ / 2, py = ty * tileZ + tileZ / 2;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
  };

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.strokeStyle = 'rgba(0,220,200,0.055)';
  ctx.lineWidth = Math.max(4, 10 * zDpr);
  buildTracePath();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0,220,200,0.18)';
  ctx.lineWidth = Math.max(2.5, 5 * zDpr);
  buildTracePath();
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0,240,210,0.75)';
  ctx.lineWidth = Math.max(0.8, 1.4 * zDpr);
  buildTracePath();
  ctx.stroke();

  ctx.restore();

  // ── Track junction dots ────────────────────────────────────────────────────
  ctx.save();
  for (let i = 1; i < level.trackTiles.length - 1; i++) {
    const [ax, ay] = level.trackTiles[i - 1];
    const [bx, by] = level.trackTiles[i];
    const [cx2, cy2] = level.trackTiles[i + 1];
    const dirChanged = (bx - ax !== cx2 - bx) || (by - ay !== cy2 - by);
    if (dirChanged) {
      const px = bx * tileZ + tileZ / 2, py = by * tileZ + tileZ / 2;
      ctx.fillStyle = 'rgba(0,240,210,0.15)';
      ctx.beginPath(); ctx.arc(px, py, Math.max(3, 5 * zDpr), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(0,240,210,0.55)';
      ctx.beginPath(); ctx.arc(px, py, Math.max(1.5, 2.5 * zDpr), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(180,255,245,0.9)';
      ctx.beginPath(); ctx.arc(px, py, Math.max(0.8, 1.2 * zDpr), 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();

  // ── Start marker ──────────────────────────────────────────────────────────
  if (start) drawMarker(ctx, start[0], start[1], tileZ, '#33ff88', '#00cc66', 'S', zDpr);

  // ── Finish marker with damage flash ───────────────────────────────────────
  if (finish) {
    if (finishFlashTimer > 0) {
      const flashAmt = Math.abs(Math.sin(finishFlashTimer * Math.PI * 18)) * finishFlashTimer * 1.5;
      const fpx = finish[0] * tileZ + tileZ / 2;
      const fpy = finish[1] * tileZ + tileZ / 2;
      ctx.save();
      ctx.fillStyle = `rgba(255,50,80,${Math.min(0.55, flashAmt * 0.55)})`;
      ctx.shadowColor = '#ff3366';
      ctx.shadowBlur = tileZ * 0.7 * flashAmt;
      ctx.beginPath();
      ctx.arc(fpx, fpy, tileZ * 0.48, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    drawMarker(ctx, finish[0], finish[1], tileZ, '#ff3366', '#cc0044', 'F', zDpr);
  }

  // ── Placement ghost ────────────────────────────────────────────────────────
  if (placement.active && placement.previewTile) {
    const { x: ptx, y: pty } = placement.previewTile;
    const valid = isValidTowerTile(ptx, pty, level, trackSet);
    const px = ptx * tileZ + tileZ / 2;
    const py = pty * tileZ + tileZ / 2;
    const half = tileZ * 0.3;
    const ghostColor = valid ? '#ffcc00' : '#ff3344';

    ctx.save();
    ctx.translate(px, py);
    ctx.globalAlpha = 0.55;

    ctx.strokeStyle = ghostColor;
    ctx.lineWidth = Math.max(1.5, 2 * zDpr);
    ctx.shadowColor = ghostColor;
    ctx.shadowBlur = 4 * zDpr;
    ctx.rotate(Math.PI / 4);
    ctx.strokeRect(-half * 0.8, -half * 0.8, half * 1.6, half * 1.6);
    ctx.rotate(-Math.PI / 4);
    ctx.shadowBlur = 0;

    if (valid) {
      const [arrowFX, arrowFY] = orientedDirToVector('north', tower.orientation);
      const perpX = -arrowFY, perpY = arrowFX;
      const tip = half * 0.65, base = half * 0.3, hw = half * 0.2;
      ctx.fillStyle = ghostColor;
      ctx.beginPath();
      ctx.moveTo(arrowFX * tip, arrowFY * tip);
      ctx.lineTo(arrowFX * base + perpX * hw, arrowFY * base + perpY * hw);
      ctx.lineTo(arrowFX * base - perpX * hw, arrowFY * base - perpY * hw);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.strokeStyle = ghostColor;
      ctx.lineWidth = Math.max(1.2, 1.8 * zDpr);
      const cross = half * 0.42;
      ctx.beginPath();
      ctx.moveTo(-cross, -cross); ctx.lineTo(cross, cross);
      ctx.moveTo(cross, -cross); ctx.lineTo(-cross, cross);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ── Tower ──────────────────────────────────────────────────────────────────
  const firstSig = route.signals[0];
  const towerWaveform: Waveform = firstSig ? firstSig.waveform : 'pulse';
  const isHigh = firstSig ? signalIsHighAt(firstSig, beatFloat) : false;
  drawTower(ctx, tower.tileX, tower.tileY, tileZ, beatFrac, zDpr, towerWaveform, isHigh, tower.orientation, tower.selected);

  // ── Signal projectiles ─────────────────────────────────────────────────────
  for (const p of projectiles) {
    if (p.dead) continue;
    drawSignalWithTail(ctx, p, beatFloat, tileZ, zDpr);
  }

  // ── Enemies ────────────────────────────────────────────────────────────────
  if (level.trackTiles.length > 0) {
    for (const enemy of enemies) {
      if (enemy.isSpawned) drawEnemy(ctx, enemy, tileZ, zDpr);
    }
  }

  // ── Floating combat text ───────────────────────────────────────────────────
  if (floatingTexts.length > 0) {
    ctx.save();
    const fontSize = Math.max(8, tileZ * 0.22);
    ctx.font = `bold ${fontSize}px 'Pixelify Sans',sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const ft of floatingTexts) {
      const progress = 1 - ft.timer / ft.duration;
      const alpha = ft.timer / ft.duration;
      const rise = progress * tileZ * 1.2;
      const fx = (ft.tileX + ft.offsetX) * tileZ;
      const fy = ft.tileY * tileZ - rise;
      ctx.globalAlpha = alpha;
      ctx.shadowColor = ft.color;
      ctx.shadowBlur = 6 * zDpr;
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, fx, fy);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  ctx.restore();
}

// ── Draw helpers ───────────────────────────────────────────────────────────

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function signalVizPos(p: SignalProjectile, age: number): { x: number; y: number } {
  const intAge = Math.floor(age);
  const frac = smoothstep(age - intAge);

  let vx = p.originX + (intAge + frac) * p.dirX;
  let vy = p.originY + (intAge + frac) * p.dirY;

  if (p.waveform === 'sine') {
    const perpX = -p.dirY, perpY = p.dirX;
    const sineOff = Math.sin(age / p.waveCycleBeats * Math.PI * 2) * 0.38;
    vx += perpX * sineOff;
    vy += perpY * sineOff;
  }

  return { x: vx, y: vy };
}

function drawSignalWithTail(
  ctx: CanvasRenderingContext2D,
  p: SignalProjectile,
  beatFloat: number,
  tileZ: number,
  zoomDpr: number,
): void {
  const color = p.color;
  const age = beatFloat - p.spawnBeat;
  const head = signalVizPos(p, age);
  const hpx = head.x * tileZ + tileZ / 2;
  const hpy = head.y * tileZ + tileZ / 2;

  const tailBeats = Math.min(age, SIGNAL_TAIL_BEATS);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (p.waveform === 'sine' && tailBeats > 0) {
    const SAMPLES = 24;
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const t = age - tailBeats * (i / SAMPLES);
      if (t < 0) break;
      const pt = signalVizPos(p, t);
      points.push({ x: pt.x * tileZ + tileZ / 2, y: pt.y * tileZ + tileZ / 2 });
    }
    for (let i = 0; i < points.length - 1; i++) {
      const alpha = (1 - i / points.length) * 0.7;
      ctx.strokeStyle = hexAlpha(color, alpha);
      ctx.lineWidth = Math.max(0.8, (1.5 - i / points.length) * 1.8 * zoomDpr);
      ctx.beginPath();
      ctx.moveTo(points[i].x, points[i].y);
      ctx.lineTo(points[i + 1].x, points[i + 1].y);
      ctx.stroke();
    }
  } else if (tailBeats > 0) {
    const tailAge = age - tailBeats;
    const tail = signalVizPos(p, Math.max(0, tailAge));
    const tpx = tail.x * tileZ + tileZ / 2;
    const tpy = tail.y * tileZ + tileZ / 2;

    const dx = hpx - tpx, dy = hpy - tpy;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      const gradOuter = ctx.createLinearGradient(hpx, hpy, tpx, tpy);
      gradOuter.addColorStop(0, hexAlpha(color, 0.25));
      gradOuter.addColorStop(1, hexAlpha(color, 0));
      ctx.strokeStyle = gradOuter;
      ctx.lineWidth = Math.max(2, 4 * zoomDpr);
      ctx.beginPath(); ctx.moveTo(hpx, hpy); ctx.lineTo(tpx, tpy); ctx.stroke();

      const gradCore = ctx.createLinearGradient(hpx, hpy, tpx, tpy);
      gradCore.addColorStop(0, hexAlpha(color, 0.85));
      gradCore.addColorStop(0.4, hexAlpha(color, 0.4));
      gradCore.addColorStop(1, hexAlpha(color, 0));
      ctx.strokeStyle = gradCore;
      ctx.lineWidth = Math.max(0.8, 1.4 * zoomDpr);
      ctx.beginPath(); ctx.moveTo(hpx, hpy); ctx.lineTo(tpx, tpy); ctx.stroke();
    }
  }

  ctx.restore();

  const ampScale = 0.8 + p.amplitude * 0.2;
  const r = Math.max(2.5, tileZ * 0.11) * ampScale;
  ctx.save();

  if (p.waveform === 'pulse') {
    ctx.strokeStyle = hexAlpha(color, 0.5);
    ctx.lineWidth = Math.max(0.8, 1.2 * zoomDpr);
    ctx.beginPath(); ctx.arc(hpx, hpy, r * 2.0, 0, Math.PI * 2); ctx.stroke();

    const cg = ctx.createRadialGradient(hpx, hpy, 0, hpx, hpy, r);
    cg.addColorStop(0, '#ffffff');
    cg.addColorStop(0.35, color);
    cg.addColorStop(1, hexAlpha(color, 0.4));
    ctx.fillStyle = cg;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8 * zoomDpr;
    ctx.beginPath(); ctx.arc(hpx, hpy, r, 0, Math.PI * 2); ctx.fill();

  } else if (p.waveform === 'sine') {
    const halo = ctx.createRadialGradient(hpx, hpy, 0, hpx, hpy, r * 2.8);
    halo.addColorStop(0, hexAlpha(color, 0.4));
    halo.addColorStop(0.5, hexAlpha(color, 0.15));
    halo.addColorStop(1, hexAlpha(color, 0));
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(hpx, hpy, r * 2.8, 0, Math.PI * 2); ctx.fill();

    const cg = ctx.createRadialGradient(hpx, hpy, 0, hpx, hpy, r);
    cg.addColorStop(0, '#ffffff');
    cg.addColorStop(0.5, color);
    cg.addColorStop(1, hexAlpha(color, 0.5));
    ctx.fillStyle = cg;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10 * zoomDpr;
    ctx.beginPath(); ctx.arc(hpx, hpy, r * 0.85, 0, Math.PI * 2); ctx.fill();

  } else {
    const sz = r * 1.3;
    ctx.strokeStyle = hexAlpha(color, 0.7);
    ctx.lineWidth = Math.max(1, 1.6 * zoomDpr);
    ctx.shadowColor = color;
    ctx.shadowBlur = 8 * zoomDpr;
    ctx.strokeRect(hpx - sz, hpy - sz, sz * 2, sz * 2);

    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    const core = r * 0.38;
    ctx.fillRect(hpx - core, hpy - core, core * 2, core * 2);

    if ((age % 1) < 0.4) {
      ctx.fillStyle = '#ffffff';
      const fc = core * 0.5;
      ctx.fillRect(hpx - fc, hpy - fc, fc * 2, fc * 2);
    }
  }

  // Frequency band visual cue
  const bandColor = FREQ_BAND_COLORS[p.frequencyBand];
  ctx.save();
  switch (p.frequencyBand) {
    case 'low': {
      const pulse = 0.5 + 0.5 * Math.sin(beatFloat * Math.PI * 2);
      const haloR = r * (2.4 + pulse * 0.6);
      ctx.strokeStyle = hexAlpha(bandColor, 0.2 + pulse * 0.15);
      ctx.lineWidth = Math.max(1, 1.8 * zoomDpr);
      ctx.shadowColor = bandColor;
      ctx.shadowBlur = 4 * zoomDpr;
      ctx.beginPath(); ctx.arc(hpx, hpy, haloR, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'mid': {
      ctx.strokeStyle = hexAlpha(bandColor, 0.55);
      ctx.lineWidth = Math.max(0.8, 1.2 * zoomDpr);
      ctx.shadowColor = bandColor;
      ctx.shadowBlur = 3 * zoomDpr;
      ctx.beginPath(); ctx.arc(hpx, hpy, r * 1.8, 0, Math.PI * 2); ctx.stroke();
      break;
    }
    case 'high': {
      ctx.strokeStyle = hexAlpha(bandColor, 0.5);
      ctx.lineWidth = Math.max(0.7, 1 * zoomDpr);
      ctx.shadowColor = bandColor;
      ctx.shadowBlur = 3 * zoomDpr;
      ctx.beginPath(); ctx.arc(hpx, hpy, r * 1.4, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(hpx, hpy, r * 1.85, 0, Math.PI * 2); ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  tx: number, ty: number, tileZ: number,
  color: string, glow: string, label: string,
  zoomDpr: number,
): void {
  const px = tx * tileZ + tileZ / 2, py = ty * tileZ + tileZ / 2;
  const r = tileZ * 0.22;
  ctx.save();
  ctx.fillStyle = hexAlpha(glow, 0.15);
  ctx.beginPath(); ctx.arc(px, py, r * 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = hexAlpha(glow, 0.3);
  ctx.beginPath(); ctx.arc(px, py, r * 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
  if (tileZ > 18) {
    ctx.font = `bold ${Math.max(8, Math.round(tileZ * 0.2))}px 'Pixelify Sans',system-ui,sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000'; ctx.fillText(label, px, py);
  }
  ctx.restore();
}

function drawTower(
  ctx: CanvasRenderingContext2D,
  tx: number, ty: number, tileZ: number,
  beatFrac: number, zoomDpr: number,
  waveform: Waveform, isHigh: boolean,
  orientation: TowerOrientation, selected: boolean,
): void {
  const px = tx * tileZ + tileZ / 2, py = ty * tileZ + tileZ / 2;
  const half = tileZ * 0.3;
  const pulse = Math.pow(1 - beatFrac, 2) * 0.6;
  const color = WAVEFORM_COLORS[waveform];

  ctx.save();
  ctx.translate(px, py);

  if (selected) {
    ctx.strokeStyle = hexAlpha('#ffcc00', 0.5);
    ctx.lineWidth = Math.max(1.5, 2.5 * zoomDpr);
    ctx.shadowColor = '#ffcc00';
    ctx.shadowBlur = 6 * zoomDpr;
    ctx.beginPath();
    ctx.arc(0, 0, half * 1.35, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  if (!isHigh) {
    ctx.fillStyle = hexAlpha(color, 0.04);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-half * 0.9, -half * 0.9, half * 1.8, half * 1.8);
    ctx.rotate(-Math.PI / 4);
  }

  const glowAmt = isHigh ? (6 + pulse * 16) : 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = glowAmt * zoomDpr;
  ctx.strokeStyle = isHigh ? hexAlpha(color, 0.85 + pulse * 0.15) : hexAlpha(color, 0.2);
  ctx.lineWidth = Math.max(1, 1.4 * zoomDpr);
  ctx.rotate(Math.PI / 4);
  ctx.strokeRect(-half * 0.8, -half * 0.8, half * 1.6, half * 1.6);
  ctx.rotate(-Math.PI / 4);

  ctx.shadowBlur = 0;
  ctx.strokeStyle = isHigh ? hexAlpha(color, 0.5 + pulse * 0.4) : hexAlpha(color, 0.12);
  ctx.lineWidth = Math.max(0.7, 0.9 * zoomDpr);
  ctx.beginPath();
  ctx.moveTo(-half * 0.52, 0); ctx.lineTo(half * 0.52, 0);
  ctx.moveTo(0, -half * 0.52); ctx.lineTo(0, half * 0.52);
  ctx.stroke();

  const cr = Math.max(2, tileZ * 0.065);
  if (isHigh) {
    ctx.fillStyle = hexAlpha(color, 0.25 + pulse * 0.15);
    ctx.beginPath(); ctx.arc(0, 0, cr * 2.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = isHigh ? hexAlpha(color, 0.9) : hexAlpha(color, 0.2);
  ctx.beginPath(); ctx.arc(0, 0, cr, 0, Math.PI * 2); ctx.fill();
  if (isHigh && pulse > 0.1) {
    ctx.fillStyle = `rgba(255,255,255,${pulse * 0.8})`;
    ctx.beginPath(); ctx.arc(0, 0, cr * 0.5, 0, Math.PI * 2); ctx.fill();
  }

  const [arrowFX, arrowFY] = orientedDirToVector('north', orientation);
  const perpX = -arrowFY, perpY = arrowFX;
  const tip = half * 0.65, base = half * 0.3, hw = half * 0.2;
  ctx.fillStyle = isHigh ? hexAlpha(color, 0.9 + pulse * 0.1) : hexAlpha(color, 0.5);
  ctx.shadowColor = isHigh ? color : 'transparent';
  ctx.shadowBlur = isHigh ? 4 * zoomDpr : 0;
  ctx.beginPath();
  ctx.moveTo(arrowFX * tip, arrowFY * tip);
  ctx.lineTo(arrowFX * base + perpX * hw, arrowFY * base + perpY * hw);
  ctx.lineTo(arrowFX * base - perpX * hw, arrowFY * base - perpY * hw);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.restore();
}

// ── Public entry point ─────────────────────────────────────────────────────

export function startVersion2(): void {
  showWorldMap();
}
