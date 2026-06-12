// ── Version 2: Modular Synth Tower Defense ─────────────────────────────────

import { createRackWiringSystem } from './version2-rack-wiring';
import type { RackWiringHandle, RackWireConnection } from './version2-rack-wiring';
import { rackPlugColor } from './version2-rack-wiring-types';
import type { RackPlugType } from './version2-rack-wiring-types';
import {
  Enemy,
  createEnemies,
  drawEnemy,
  preloadEnemySprites,
} from './version2-enemies';
import { SubdivisionTransport, getAudioSystem } from './version2-audio';

// ── Types ──────────────────────────────────────────────────────────────────

type Waveform = 'pulse' | 'sine' | 'square';
type SignalDirection = 'north' | 'south' | 'east' | 'west';

const CHANNEL_COLORS = ['#00ffee', '#ff33aa', '#ffcc00', '#88ff22', '#ff6600'];

interface SynthSignal {
  waveform: Waveform;
  amplitude: number;
  periodBeats: number;
  phaseBeats: number;
  color: string;
  directions: SignalDirection[];
}

interface EvaluatedRoute {
  signals: SynthSignal[];
  routeLabel: string;
  activeModules: Set<string>;
  hasDelay: boolean;
}

interface ScheduledEcho {
  dueBeat: number;
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
  isPanning: boolean;
  lastPanX: number;
  lastPanY: number;
}

interface SignalProjectile {
  spawnBeat: number;
  originX: number;
  originY: number;
  dirX: number;
  dirY: number;
  waveform: Waveform;
  periodBeats: number;
  amplitude: number;
  color: string;
  dead: boolean;
}

// ── SynthChannel ───────────────────────────────────────────────────────────

class SynthChannel {
  id: number;
  waveform: Waveform;
  periodBeats: number;
  amplitude: number;
  phaseBeats: number;
  readonly color: string;

  constructor(id: number) {
    this.id = id;
    this.color = CHANNEL_COLORS[(id - 1) % CHANNEL_COLORS.length];
    this.waveform = 'pulse';
    this.periodBeats = 1;
    this.amplitude = 1;
    this.phaseBeats = 0;
  }

  setWaveform(w: Waveform): void {
    this.waveform = w;
    if (w === 'pulse') this.periodBeats = 1;
    else if (w === 'square') this.periodBeats = 4;
    else if (w === 'sine') this.periodBeats = 4;
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

// ── DelayModule ────────────────────────────────────────────────────────────

class DelayModule {
  delayBeats: 1 | 2 | 4 = 2;
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
  readonly queue: ScheduledEcho[] = [];

  schedule(dueBeat: number, signals: SynthSignal[]): void {
    this.queue.push({ dueBeat, signals: signals.map(s => ({ ...s })) });
  }

  releaseAt(beat: number): SynthSignal[] {
    const out: SynthSignal[] = [];
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (beat >= this.queue[i].dueBeat) {
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
  readonly tileX = 8;
  readonly tileY = 4;
  private lastCheckedBeat = -1;

  update(beat: number, signals: SynthSignal[], projectiles: SignalProjectile[]): boolean {
    if (beat <= this.lastCheckedBeat) return false;
    this.lastCheckedBeat = beat;
    if (signals.length === 0) return false;

    let fired = false;
    for (const sig of signals) {
      if (!signalShouldFireOnBeat(sig, beat)) continue;
      for (const dir of sig.directions) {
        const [dx, dy] = dirToVector(dir);
        projectiles.push({
          spawnBeat: beat,
          originX: this.tileX,
          originY: this.tileY,
          dirX: dx, dirY: dy,
          waveform: sig.waveform,
          periodBeats: sig.periodBeats,
          amplitude: sig.amplitude,
          color: sig.color,
          dead: false,
        });
        fired = true;
      }
    }
    return fired;
  }

  spawnEchoes(signals: SynthSignal[], beat: number, projectiles: SignalProjectile[]): void {
    for (const sig of signals) {
      for (const dir of sig.directions) {
        const [dx, dy] = dirToVector(dir);
        projectiles.push({
          spawnBeat: beat,
          originX: this.tileX,
          originY: this.tileY,
          dirX: dx, dirY: dy,
          waveform: sig.waveform,
          periodBeats: sig.periodBeats,
          amplitude: sig.amplitude,
          color: sig.color,
          dead: false,
        });
      }
    }
  }
}

// ── Signal graph helpers ───────────────────────────────────────────────────

function dirToVector(dir: SignalDirection): [number, number] {
  switch (dir) {
    case 'north': return [0, -1];
    case 'south': return [0,  1];
    case 'east':  return [1,  0];
    case 'west':  return [-1, 0];
  }
}

function signalShouldFireOnBeat(sig: SynthSignal, beat: number): boolean {
  const p = sig.periodBeats;
  const beatInCycle = ((beat - sig.phaseBeats) % p + p) % p;
  switch (sig.waveform) {
    case 'pulse':  return beatInCycle === 0;
    case 'square': return beatInCycle < p / 2;
    case 'sine':   return true;
  }
}

function signalIsHighAt(sig: SynthSignal, beatFloat: number): boolean {
  const p = sig.periodBeats;
  const phase = ((beatFloat - sig.phaseBeats) % p + p) % p;
  return sig.waveform !== 'square' || phase < p / 2;
}

function evaluateSignalGraph(
  connections: readonly RackWireConnection[],
  channel: SynthChannel,
): EvaluatedRoute {
  const EMPTY: EvaluatedRoute = { signals: [], routeLabel: 'NO SIGNAL', activeModules: new Set(), hasDelay: false };

  function next(fromId: string): string | null {
    const c = connections.find(conn => conn.fromPlugId === fromId);
    return c ? c.toPlugId : null;
  }

  const afterCh1 = next('ch1-out');
  if (!afterCh1) return EMPTY;

  if (afterCh1 === 'out-in') {
    return {
      signals: [{
        waveform: 'pulse', amplitude: 1, periodBeats: 1, phaseBeats: 0,
        color: channel.color, directions: ['north'],
      }],
      routeLabel: 'CH1 → OUT',
      activeModules: new Set(['ch1', 'out']),
      hasDelay: false,
    };
  }

  if (afterCh1 === 'wf-in') {
    const afterWf = next('wf-out');
    if (!afterWf) return EMPTY;

    const wfSig = {
      waveform: channel.waveform,
      amplitude: channel.amplitude,
      periodBeats: channel.periodBeats,
      phaseBeats: channel.phaseBeats,
      color: channel.color,
    };

    if (afterWf === 'out-in') {
      return {
        signals: [{ ...wfSig, directions: ['north'] as SignalDirection[] }],
        routeLabel: 'CH1 → WAVE → OUT',
        activeModules: new Set(['ch1', 'wave', 'out']),
        hasDelay: false,
      };
    }

    if (afterWf === 'split-in') {
      const afterSplit = next('split-out');
      if (afterSplit !== 'out-in') return EMPTY;
      return {
        signals: [{ ...wfSig, amplitude: channel.amplitude / 2, directions: ['north', 'south'] as SignalDirection[] }],
        routeLabel: 'CH1 → WAVE → SPLIT → OUT',
        activeModules: new Set(['ch1', 'wave', 'split', 'out']),
        hasDelay: false,
      };
    }

    if (afterWf === 'delay-in') {
      const afterDelay = next('delay-out');
      if (!afterDelay) return EMPTY;

      if (afterDelay === 'out-in') {
        return {
          signals: [{ ...wfSig, directions: ['north'] as SignalDirection[] }],
          routeLabel: 'CH1 → WAVE → DELAY → OUT',
          activeModules: new Set(['ch1', 'wave', 'delay', 'out']),
          hasDelay: true,
        };
      }

      if (afterDelay === 'split-in') {
        const afterSplit = next('split-out');
        if (afterSplit !== 'out-in') return EMPTY;
        return {
          signals: [{ ...wfSig, amplitude: channel.amplitude / 2, directions: ['north', 'south'] as SignalDirection[] }],
          routeLabel: 'CH1 → WAVE → DELAY → SPLIT → OUT',
          activeModules: new Set(['ch1', 'wave', 'delay', 'split', 'out']),
          hasDelay: true,
        };
      }

      return EMPTY;
    }

    return EMPTY;
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

function getApp(): HTMLElement { return document.getElementById('app')!; }

function clearApp(): void {
  cancelAnimationFrame(rafId);
  rafId = 0;
  const app = getApp();
  app.innerHTML = '';
  app.style.cssText = '';
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
  title.textContent = 'Tiny Base Idle';
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
    import('./versionSelect').then(m => { clearApp(); m.showVersionSelect(); });
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

/**
 * Returns the hi-hat subdivision period in subdiv units (1 = 0.25 beats, 2 = 0.5 beats).
 * 0 means no hat.
 */
function computeFastestHatPeriod(enemies: Enemy[], beatFloat: number): number {
  let fastest = 0;
  for (const e of enemies) {
    if (e.isDead) continue;
    if (beatFloat < e.spawnSubdiv / 4) continue;
    const p = e.typeConfig.moveEverySubdivs;
    if (p === 1) return 1; // sixteenth — can't be faster
    if (p === 2 && fastest !== 1) fastest = 2; // eighth
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

  // ── HUD ───────────────────────────────────────────────────────────────────
  const hud = document.createElement('div');
  hud.style.cssText = `
    display:flex;align-items:center;justify-content:space-between;
    width:100%;padding:0 0.25rem;
    font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;
  `;

  const levelInfo = document.createElement('div');
  levelInfo.style.cssText = `display:flex;flex-direction:column;gap:0.05rem;`;

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

  // Right-side HUD buttons
  const hudRight = document.createElement('div');
  hudRight.style.cssText = `display:flex;align-items:center;gap:0.5rem;`;

  // Mute button
  const muteBtn = document.createElement('button');
  muteBtn.textContent = '🔊';
  muteBtn.title = 'Mute / Unmute audio';
  muteBtn.style.cssText = `
    font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;
    font-size:0.75rem;background:rgba(8,15,28,0.8);
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
    font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;
    font-size:0.7rem;color:#5577aa;background:rgba(8,15,28,0.8);
    border:1px solid #2a3d65;border-radius:6px;
    padding:0.35rem 0.8rem;cursor:pointer;letter-spacing:0.06em;
    transition:color 0.12s,border-color 0.12s;
  `;
  exitBtn.addEventListener('mouseenter', () => { exitBtn.style.color = '#dff6ff'; exitBtn.style.borderColor = '#4a8fff'; });
  exitBtn.addEventListener('mouseleave', () => { exitBtn.style.color = '#5577aa'; exitBtn.style.borderColor = '#2a3d65'; });
  exitBtn.addEventListener('click', () => showWorldMap());

  hudRight.append(muteBtn, exitBtn);
  hud.append(levelInfo, hudRight);

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

  const hint = document.createElement('div');
  hint.textContent = 'Scroll to zoom · Drag to pan';
  hint.style.cssText = `
    font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;
    font-size:0.58rem;color:#2a4055;letter-spacing:0.08em;
  `;

  // ── Rack Panel ────────────────────────────────────────────────────────────
  const channel = new SynthChannel(1);
  const { panel: rackPanel, updatePanel, wiring } = buildRackPanel(channel);

  root.append(hud, canvasWrapper, hint, rackPanel);
  app.append(root);

  // ── Canvas sizing ─────────────────────────────────────────────────────────
  const resizeCanvas = () => {
    const rect = canvasWrapper.getBoundingClientRect();
    canvas.width = Math.round(rect.width * devicePixelRatio);
    canvas.height = Math.round(rect.height * devicePixelRatio);
  };
  resizeCanvas();

  const view: ViewState = {
    zoom: 1, panX: 0, panY: 0,
    isPanning: false, lastPanX: 0, lastPanY: 0,
  };

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

  canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    view.isPanning = true;
    view.lastPanX = e.clientX;
    view.lastPanY = e.clientY;
    canvas.style.cursor = 'grabbing';
  });

  canvas.addEventListener('pointermove', (e: PointerEvent) => {
    if (!view.isPanning) return;
    const rect = canvas.getBoundingClientRect();
    view.panX += (e.clientX - view.lastPanX) * (canvas.width / rect.width) / devicePixelRatio;
    view.panY += (e.clientY - view.lastPanY) * (canvas.height / rect.height) / devicePixelRatio;
    view.lastPanX = e.clientX;
    view.lastPanY = e.clientY;
  });

  canvas.addEventListener('pointerup', () => { view.isPanning = false; canvas.style.cursor = 'grab'; });
  canvas.addEventListener('pointercancel', () => { view.isPanning = false; canvas.style.cursor = 'grab'; });

  const ro = new ResizeObserver(() => { resizeCanvas(); centerView(); });
  ro.observe(canvasWrapper);

  // ── Game State ─────────────────────────────────────────────────────────────
  const clock = new BeatClock(level.bpm);
  const enemies = createEnemies(level.trackTiles);
  const tower = new OutputTower();
  const projectiles: SignalProjectile[] = [];
  const delayMod = new DelayModule();
  const scheduler = new SignalScheduler();
  const transport = new SubdivisionTransport();

  // Initialize audio from this user-gesture-triggered path
  audio.init().then(updateMuteBtn);

  // Default patch: CH1 → WAVE → DELAY → SPLIT → OUTPUT
  wiring.connectPlugs('ch1-out', 'wf-in');
  wiring.connectPlugs('wf-out', 'delay-in');
  wiring.connectPlugs('delay-out', 'split-in');
  wiring.connectPlugs('split-out', 'out-in');

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

    const echoSignals = scheduler.releaseAt(beat);
    if (echoSignals.length > 0) {
      tower.spawnEchoes(echoSignals, beat, projectiles);
      delayMod.onSend();
    }

    const route = evaluateSignalGraph(wiring.getConnections(), channel);
    const justFired = tower.update(beat, route.signals, projectiles);

    if (justFired && route.hasDelay) {
      scheduler.schedule(
        beat + delayMod.delayBeats,
        route.signals.map(s => ({ ...s, amplitude: s.amplitude * delayMod.echoAmplitude })),
      );
      delayMod.onReceive();
    }

    // ── Subdivision transport: movement + audio ──────────────────────────────
    const subdivEvents = transport.tick(beatFloat);
    const hatPeriod = computeFastestHatPeriod(enemies, beatFloat);

    for (const subdivIdx of subdivEvents) {
      // Enemy movement
      for (const enemy of enemies) {
        enemy.processSubdiv(subdivIdx);
      }

      // Kick on integer beats
      if (subdivIdx % 4 === 0) {
        audio.playKick(subdivIdx / 4);
      }

      // Hi-hat on fastest active subdivision
      if (hatPeriod > 0 && subdivIdx % hatPeriod === 0) {
        audio.playHihat();
      }
    }

    // ── Per-frame enemy animation + respawn ─────────────────────────────────
    for (const enemy of enemies) {
      enemy.updateAnimation(dt);
      if (enemy.isDead) enemy.respawn();
    }

    cullProjectiles(projectiles, level, beatFloat);
    checkCollisions(enemies, projectiles, level, beatFloat);

    beatDisplay.textContent = `beat ${beat}`;
    updatePanel(dt, route, justFired, delayMod, scheduler);
    wiring.update(now);

    renderLevel(ctx, canvas, level, view, clock, channel, enemies, tower, projectiles, route);
    rafId = requestAnimationFrame(tick);
  };
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

function buildRackPanel(channel: SynthChannel): {
  panel: HTMLElement;
  updatePanel: (dt: number, route: EvaluatedRoute, justFired: boolean, delayMod: DelayModule, scheduler: SignalScheduler) => void;
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

  const outLed = document.createElement('div');
  outLed.style.cssText = `
    width:10px;height:10px;border-radius:50%;
    background:#332200;border:1.5px solid #664400;
    margin:0.2rem auto 0;
    transition:background 0.08s,box-shadow 0.08s;
  `;

  const { card: outCard } = buildModuleCard({
    title: 'OUTPUT',
    titleColor: '#ffcc00',
    inputPlugId: 'out-in',
    inputPlugType: 'outputIn',
    buildContent: (card) => {
      card.append(outLed);
    },
  }, wiring);
  modulesRow.append(outCard);

  const moduleCards: Record<string, HTMLElement> = { ch1: ch1Card, wave: wfCard, delay: delayCard, split: splitCard, out: outCard };
  const flashTimers: Record<string, number> = { ch1: 0, wave: 0, delay: 0, split: 0, out: 0 };

  refreshButtons();

  const updatePanel = (dt: number, route: EvaluatedRoute, justFired: boolean, delayMod: DelayModule, scheduler: SignalScheduler) => {
    _delayModRef = delayMod;
    refreshDelayButtons();
    ch1PeriodEl.textContent = `${channel.periodBeats}♩`;
    ch1PhaseEl.textContent = `φ ${channel.phaseBeats}`;

    if (wfIndicatorEl) wfIndicatorEl.textContent = channel.waveform.toUpperCase();

    const splitAmp = (channel.amplitude / 2).toFixed(2);
    if (splitAmpEl) splitAmpEl.textContent = `1→2  ×${splitAmp}`;

    const active = route.signals.length > 0;
    routeIndicator.textContent = route.routeLabel;
    routeIndicator.style.color = active ? '#00ffee' : '#2a4060';

    for (const key of Object.keys(flashTimers)) {
      if (key === 'delay') continue;
      if (justFired && route.activeModules.has(key)) {
        flashTimers[key] = 0.35;
      } else {
        flashTimers[key] = Math.max(0, flashTimers[key] - dt);
      }
      const flashing = flashTimers[key] > 0;
      const fc = MODULE_FLASH_COLORS[key] ?? '#ffffff';
      moduleCards[key].style.borderColor = flashing ? fc : '#1a2a44';
      moduleCards[key].style.boxShadow = flashing ? `0 0 10px ${fc}55` : '';
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

  const _emptyDelay = new DelayModule();
  const _emptyScheduler = new SignalScheduler();
  updatePanel(0, { signals: [], routeLabel: 'NO SIGNAL', activeModules: new Set(), hasDelay: false }, false, _emptyDelay, _emptyScheduler);

  return { panel, updatePanel, wiring };
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
): void {
  if (level.trackTiles.length === 0) return;

  for (const enemy of enemies) {
    if (enemy.isDead) continue;
    const [etx, ety] = enemy.getLogicalTile();
    for (const p of projectiles) {
      if (p.dead) continue;
      const age = beatFloat - p.spawnBeat;
      const ptx = Math.round(p.originX + age * p.dirX);
      const pty = Math.round(p.originY + age * p.dirY);
      if (ptx === etx && pty === ety) {
        p.dead = true;
        enemy.hit(p.amplitude);
      }
    }
  }
}

// ── Rendering ──────────────────────────────────────────────────────────────

const BASE_TILE_PX = 40;
const SIGNAL_TAIL_BEATS = 3;

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

  const trackSet = new Set(level.trackTiles.map(([x, y]) => `${x},${y}`));
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

  // ── Start / Finish markers ─────────────────────────────────────────────────
  if (start) drawMarker(ctx, start[0], start[1], tileZ, '#33ff88', '#00cc66', 'S', zDpr);
  if (finish) drawMarker(ctx, finish[0], finish[1], tileZ, '#ff3366', '#cc0044', 'F', zDpr);

  // ── Tower ──────────────────────────────────────────────────────────────────
  const firstSig = route.signals[0];
  const towerWaveform: Waveform = firstSig ? firstSig.waveform : 'pulse';
  const isHigh = firstSig ? signalIsHighAt(firstSig, beatFloat) : false;
  drawTower(ctx, tower.tileX, tower.tileY, tileZ, beatFrac, zDpr, towerWaveform, isHigh);

  // ── Signal projectiles ─────────────────────────────────────────────────────
  for (const p of projectiles) {
    if (p.dead) continue;
    drawSignalWithTail(ctx, p, beatFloat, tileZ, zDpr);
  }

  // ── Enemies ────────────────────────────────────────────────────────────────
  if (level.trackTiles.length > 0) {
    for (const enemy of enemies) {
      drawEnemy(ctx, enemy, tileZ, zDpr);
    }
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
    const sineOff = Math.sin(age / p.periodBeats * Math.PI * 2) * 0.38;
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
): void {
  const px = tx * tileZ + tileZ / 2, py = ty * tileZ + tileZ / 2;
  const half = tileZ * 0.3;
  const pulse = Math.pow(1 - beatFrac, 2) * 0.6;
  const color = WAVEFORM_COLORS[waveform];

  ctx.save();
  ctx.translate(px, py);

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

  ctx.restore();
}

// ── Public entry point ─────────────────────────────────────────────────────

export function startVersion2(): void {
  showWorldMap();
}
