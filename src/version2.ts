// ── Version 2: Modular Synth Tower Defense ─────────────────────────────────

// ── Types ──────────────────────────────────────────────────────────────────

type Waveform = 'pulse' | 'sine' | 'square';

// One neon color per channel (CH1, CH2, ...). Only CH1 used currently.
const CHANNEL_COLORS = ['#00ffee', '#ff33aa', '#ffcc00', '#88ff22', '#ff6600'];

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
  periodBeats: number;  // for sine oscillation period
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
    // Set sensible default period when switching
    if (w === 'pulse') this.periodBeats = 1;
    else if (w === 'square') this.periodBeats = 4;
    else if (w === 'sine') this.periodBeats = 4;
  }

  // Returns true if the tower should fire on this integer beat
  shouldFireOnBeat(beat: number): boolean {
    const p = this.periodBeats;
    const beatInCycle = ((beat - this.phaseBeats) % p + p) % p;

    switch (this.waveform) {
      case 'pulse':
        return beatInCycle === 0;
      case 'square':
        // High phase = first half of period
        return beatInCycle < p / 2;
      case 'sine':
        return true; // fires every beat; visual offset applied at render
    }
  }

  // Visual high/low state for square wave tower indicator
  isHighAt(beatFloat: number): boolean {
    const p = this.periodBeats;
    const phase = ((beatFloat - this.phaseBeats) % p + p) % p;
    return this.waveform !== 'square' || phase < p / 2;
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

// ── Enemy ──────────────────────────────────────────────────────────────────

class Enemy {
  hp = 5;
  maxHp = 5;
  flashTimer = 0;

  constructor(private track: [number, number][]) {}

  getFloatPos(beatFloat: number): { x: number; y: number } {
    const track = this.track;
    if (track.length === 0) return { x: 0, y: 0 };
    const progress = (beatFloat / 2) % track.length;
    const idx = Math.floor(progress);
    const t = progress - idx;
    const from = track[idx];
    const to = track[(idx + 1) % track.length];
    return { x: from[0] + (to[0] - from[0]) * t, y: from[1] + (to[1] - from[1]) * t };
  }

  getTile(beatFloat: number): [number, number] {
    const idx = Math.floor(beatFloat / 2) % this.track.length;
    return this.track[idx];
  }

  hit(): void { this.hp = Math.max(0, this.hp - 1); this.flashTimer = 0.25; }
  update(dt: number): void { if (this.flashTimer > 0) this.flashTimer = Math.max(0, this.flashTimer - dt); }
  get isFlashing(): boolean { return this.flashTimer > 0; }
}

// ── OutputTower ────────────────────────────────────────────────────────────

class OutputTower {
  readonly tileX = 8;
  readonly tileY = 4;
  readonly dirX = 0;
  readonly dirY = -1;

  private lastCheckedBeat = -1;

  update(beat: number, channel: SynthChannel, projectiles: SignalProjectile[]): void {
    if (beat <= this.lastCheckedBeat) return;
    this.lastCheckedBeat = beat;

    if (channel.shouldFireOnBeat(beat)) {
      projectiles.push({
        spawnBeat: beat,
        originX: this.tileX,
        originY: this.tileY,
        dirX: this.dirX,
        dirY: this.dirY,
        waveform: channel.waveform,
        periodBeats: channel.periodBeats,
        dead: false,
      });
    }
  }
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

// ── Level View ─────────────────────────────────────────────────────────────

export function enterLevel(levelId: number): void {
  const level = LEVELS.find(l => l.id === levelId);
  if (!level) return;
  currentScreen = { kind: 'level', levelId };
  clearApp();

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

  hud.append(levelInfo, exitBtn);

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

  // ── Synth Panel ───────────────────────────────────────────────────────────
  const channel = new SynthChannel(1);
  const { panel: synthPanel, updatePanel } = buildSynthPanel(channel);

  root.append(hud, canvasWrapper, hint, synthPanel);
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
  const enemy = new Enemy(level.trackTiles);
  const tower = new OutputTower();
  const projectiles: SignalProjectile[] = [];

  let lastNow = performance.now();
  const ctx = canvas.getContext('2d')!;

  // ── Game Loop ──────────────────────────────────────────────────────────────
  const tick = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;

    const beatFloat = clock.beatFloat;
    const beat = clock.beat;

    enemy.update(dt);
    tower.update(beat, channel, projectiles);
    cullProjectiles(projectiles, level, beatFloat);
    checkCollisions(enemy, projectiles, level, beatFloat);

    beatDisplay.textContent = `beat ${beat}`;
    updatePanel();

    renderLevel(ctx, canvas, level, view, clock, channel, enemy, tower, projectiles);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

// ── Synth Panel ────────────────────────────────────────────────────────────

const WAVEFORM_COLORS: Record<Waveform, string> = {
  pulse: '#cc44ff',
  sine: '#00ddcc',
  square: '#ff8800',
};

function buildSynthPanel(channel: SynthChannel): {
  panel: HTMLElement;
  updatePanel: () => void;
} {
  const ff = `font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;`;

  const panel = document.createElement('div');
  panel.style.cssText = `
    width:100%;
    background:#060c18;
    border:1.5px solid #1a2a44;
    border-radius:10px;
    padding:0.6rem 0.8rem;
    display:flex;
    flex-direction:column;
    gap:0.4rem;
    ${ff}
  `;

  // Row 1: label + waveform buttons
  const row1 = document.createElement('div');
  row1.style.cssText = `display:flex;align-items:center;gap:0.6rem;`;

  const chLabel = document.createElement('div');
  chLabel.textContent = `CH ${channel.id}`;
  chLabel.style.cssText = `color:#5577aa;font-size:0.62rem;font-weight:800;letter-spacing:0.1em;min-width:2.2rem;`;

  const btnRow = document.createElement('div');
  btnRow.style.cssText = `display:flex;gap:0.3rem;`;

  const waveforms: Waveform[] = ['pulse', 'sine', 'square'];
  const wfButtons: Record<Waveform, HTMLButtonElement> = {} as Record<Waveform, HTMLButtonElement>;

  for (const wf of waveforms) {
    const btn = document.createElement('button');
    btn.textContent = wf.toUpperCase();
    btn.style.cssText = `
      ${ff}
      font-size:0.6rem;font-weight:800;letter-spacing:0.07em;
      padding:0.25rem 0.55rem;border-radius:5px;cursor:pointer;
      transition:background 0.1s,border-color 0.1s,color 0.1s,box-shadow 0.1s;
    `;
    wfButtons[wf] = btn;

    btn.addEventListener('click', () => {
      channel.setWaveform(wf);
      refreshButtons();
    });
    btnRow.append(btn);
  }

  // Row 2: channel params text
  const row2 = document.createElement('div');
  row2.style.cssText = `display:flex;gap:1rem;color:#3a5070;font-size:0.58rem;letter-spacing:0.06em;`;

  const paramPeriod = document.createElement('span');
  const paramAmp = document.createElement('span');
  const paramPhase = document.createElement('span');
  row2.append(paramPeriod, paramAmp, paramPhase);

  // Waveform preview minicanvas
  const previewCanvas = document.createElement('canvas');
  previewCanvas.width = 80;
  previewCanvas.height = 28;
  previewCanvas.style.cssText = `
    width:80px;height:28px;border-radius:4px;
    background:#030609;border:1px solid #1a2a44;
    display:block;margin-left:auto;
  `;

  row1.append(chLabel, btnRow, previewCanvas);
  panel.append(row1, row2);

  const refreshButtons = () => {
    for (const wf of waveforms) {
      const btn = wfButtons[wf];
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
    drawWaveformPreview(previewCanvas, channel.waveform);
  };
  refreshButtons();

  const updatePanel = () => {
    paramPeriod.textContent = `period: ${channel.periodBeats}♩`;
    paramAmp.textContent = `amp: ${channel.amplitude}`;
    paramPhase.textContent = `φ: ${channel.phaseBeats}`;
  };
  updatePanel();

  return { panel, updatePanel };
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
    const t = i / steps;          // 0..1 = one full cycle
    const x = t * W;
    let y: number;

    if (wf === 'sine') {
      y = midY - Math.sin(t * Math.PI * 2) * amp;
    } else if (wf === 'square') {
      y = t < 0.5 ? midY - amp : midY + amp;
    } else {
      // pulse: thin spike at 0 and 0.5
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
  if (projectiles.length > 80) {
    const alive = projectiles.filter(p => !p.dead);
    projectiles.length = 0;
    projectiles.push(...alive);
  }
}

function checkCollisions(
  enemy: Enemy,
  projectiles: SignalProjectile[],
  level: SynthLevelConfig,
  beatFloat: number,
): void {
  if (level.trackTiles.length === 0) return;
  const [etx, ety] = enemy.getTile(beatFloat);
  for (const p of projectiles) {
    if (p.dead) continue;
    const age = beatFloat - p.spawnBeat;
    // Collision uses logical (straight-line) tile position only, ignoring sine offset
    const ptx = Math.round(p.originX + age * p.dirX);
    const pty = Math.round(p.originY + age * p.dirY);
    if (ptx === etx && pty === ety) {
      p.dead = true;
      enemy.hit();
    }
  }
}

// ── Rendering ──────────────────────────────────────────────────────────────

const BASE_TILE_PX = 40;
const SIGNAL_TAIL_BEATS = 3; // how many beats of trail to draw

function renderLevel(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  level: SynthLevelConfig,
  view: ViewState,
  clock: BeatClock,
  channel: SynthChannel,
  enemy: Enemy,
  tower: OutputTower,
  projectiles: SignalProjectile[],
): void {
  const W = canvas.width, H = canvas.height;
  const dpr = devicePixelRatio;
  const tileZ = BASE_TILE_PX * dpr * view.zoom;
  const beatFloat = clock.beatFloat;
  const beatFrac = clock.beatFrac;
  const zDpr = view.zoom * dpr;

  // ── Background ─────────────────────────────────────────────────────────────
  ctx.fillStyle = '#01030a';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(view.panX * dpr, view.panY * dpr);

  const trackSet = new Set(level.trackTiles.map(([x, y]) => `${x},${y}`));
  const start = level.trackTiles[0];
  const finish = level.trackTiles[level.trackTiles.length - 1];

  // ── Grid tile fills (no shadowBlur here) ──────────────────────────────────
  for (let ty = 0; ty < level.gridHeight; ty++) {
    for (let tx = 0; tx < level.gridWidth; tx++) {
      const px = tx * tileZ, py = ty * tileZ;
      const isTrack = trackSet.has(`${tx},${ty}`);

      if (isTrack) {
        // Darker backing for track — circuit channel groove
        ctx.fillStyle = '#030a14';
        ctx.fillRect(px, py, tileZ, tileZ);
        // Subtle inner tint
        ctx.fillStyle = 'rgba(0,160,140,0.04)';
        ctx.fillRect(px + 1, py + 1, tileZ - 2, tileZ - 2);
      } else {
        ctx.fillStyle = '#010409';
        ctx.fillRect(px, py, tileZ, tileZ);
        // Dim grid lines — no blur
        ctx.strokeStyle = 'rgba(20,38,72,0.6)';
        ctx.lineWidth = Math.max(0.3, 0.5 * dpr);
        ctx.strokeRect(px + 0.5, py + 0.5, tileZ - 1, tileZ - 1);
        // Circuit via dots at grid intersections (every 4th tile)
        if (tx % 4 === 0 && ty % 4 === 0) {
          ctx.fillStyle = 'rgba(30,55,100,0.5)';
          const dotR = Math.max(1, 1.8 * zDpr);
          ctx.beginPath();
          ctx.arc(px, py, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
        // Horizontal trace stubs on empty tiles for circuit flavor
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

  // ── Track circuit traces — 3 passes, NO per-pass shadowBlur ──────────────
  // Build the path once, reuse for each pass
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

  // Pass 1 — wide soft outer glow (thick, very dim — simulates blur without blur)
  ctx.strokeStyle = 'rgba(0,220,200,0.055)';
  ctx.lineWidth = Math.max(4, 10 * zDpr);
  buildTracePath();
  ctx.stroke();

  // Pass 2 — medium inner glow
  ctx.strokeStyle = 'rgba(0,220,200,0.18)';
  ctx.lineWidth = Math.max(2.5, 5 * zDpr);
  buildTracePath();
  ctx.stroke();

  // Pass 3 — bright thin core line
  ctx.strokeStyle = 'rgba(0,240,210,0.75)';
  ctx.lineWidth = Math.max(0.8, 1.4 * zDpr);
  buildTracePath();
  ctx.stroke();

  ctx.restore();

  // ── Track direction-change junction dots ───────────────────────────────────
  ctx.save();
  for (let i = 1; i < level.trackTiles.length - 1; i++) {
    const [ax, ay] = level.trackTiles[i - 1];
    const [bx, by] = level.trackTiles[i];
    const [cx2, cy2] = level.trackTiles[i + 1];
    const dirChanged = (bx - ax !== cx2 - bx) || (by - ay !== cy2 - by);
    if (dirChanged) {
      const px = bx * tileZ + tileZ / 2, py = by * tileZ + tileZ / 2;
      // Filled dot at corner — no shadowBlur, achieved by stacked circles
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
  const isHigh = channel.isHighAt(beatFloat);
  drawTower(ctx, tower.tileX, tower.tileY, tileZ, beatFrac, zDpr, channel.waveform, isHigh);

  // ── Signal projectiles — tail + node head ──────────────────────────────────
  for (const p of projectiles) {
    if (p.dead) continue;
    drawSignalWithTail(ctx, p, beatFloat, tileZ, zDpr, channel.color);
  }

  // ── Enemy ──────────────────────────────────────────────────────────────────
  if (level.trackTiles.length > 0) {
    const pos = enemy.getFloatPos(beatFloat);
    drawEnemy(ctx, pos.x * tileZ + tileZ / 2, pos.y * tileZ + tileZ / 2,
      tileZ, enemy, beatFrac, zDpr);
  }

  ctx.restore();
}

// ── Draw helpers ───────────────────────────────────────────────────────────

// Smoothstep easing — gives signals a "settle into tile" feel on beat ticks
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

// Compute visual (x, y) in tile-space for a projectile at a given age
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
  channelColor: string,
): void {
  const age = beatFloat - p.spawnBeat;
  const head = signalVizPos(p, age);
  const hpx = head.x * tileZ + tileZ / 2;
  const hpy = head.y * tileZ + tileZ / 2;

  // ── Tail ─────────────────────────────────────────────────────────────────
  // For straight waveforms: gradient line backward along travel direction.
  // For sine: sampled polyline following oscillating path.
  const tailBeats = Math.min(age, SIGNAL_TAIL_BEATS);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (p.waveform === 'sine' && tailBeats > 0) {
    // Sample the sine path at intervals back in time
    const SAMPLES = 24;
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const t = age - tailBeats * (i / SAMPLES);
      if (t < 0) break;
      const pt = signalVizPos(p, t);
      points.push({ x: pt.x * tileZ + tileZ / 2, y: pt.y * tileZ + tileZ / 2 });
    }
    // Draw with fading opacity using multiple short segments
    for (let i = 0; i < points.length - 1; i++) {
      const alpha = (1 - i / points.length) * 0.7;
      ctx.strokeStyle = hexAlpha(channelColor, alpha);
      ctx.lineWidth = Math.max(0.8, (1.5 - i / points.length) * 1.8 * zoomDpr);
      ctx.beginPath();
      ctx.moveTo(points[i].x, points[i].y);
      ctx.lineTo(points[i + 1].x, points[i + 1].y);
      ctx.stroke();
    }
  } else if (tailBeats > 0) {
    // Straight tail: linear gradient from head back along -dir
    const tailAge = age - tailBeats;
    const tail = signalVizPos(p, Math.max(0, tailAge));
    const tpx = tail.x * tileZ + tileZ / 2;
    const tpy = tail.y * tileZ + tileZ / 2;

    const dx = hpx - tpx, dy = hpy - tpy;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      // Outer soft tail — thick dim
      const gradOuter = ctx.createLinearGradient(hpx, hpy, tpx, tpy);
      gradOuter.addColorStop(0, hexAlpha(channelColor, 0.25));
      gradOuter.addColorStop(1, hexAlpha(channelColor, 0));
      ctx.strokeStyle = gradOuter;
      ctx.lineWidth = Math.max(2, 4 * zoomDpr);
      ctx.beginPath(); ctx.moveTo(hpx, hpy); ctx.lineTo(tpx, tpy); ctx.stroke();

      // Inner bright core tail
      const gradCore = ctx.createLinearGradient(hpx, hpy, tpx, tpy);
      gradCore.addColorStop(0, hexAlpha(channelColor, 0.85));
      gradCore.addColorStop(0.4, hexAlpha(channelColor, 0.4));
      gradCore.addColorStop(1, hexAlpha(channelColor, 0));
      ctx.strokeStyle = gradCore;
      ctx.lineWidth = Math.max(0.8, 1.4 * zoomDpr);
      ctx.beginPath(); ctx.moveTo(hpx, hpy); ctx.lineTo(tpx, tpy); ctx.stroke();
    }
  }

  ctx.restore();

  // ── Node head ──────────────────────────────────────────────────────────────
  const r = Math.max(2.5, tileZ * 0.11);
  ctx.save();

  if (p.waveform === 'pulse') {
    // Sharp circuit node: outer ring + radial-gradient core
    ctx.strokeStyle = hexAlpha(channelColor, 0.5);
    ctx.lineWidth = Math.max(0.8, 1.2 * zoomDpr);
    ctx.beginPath(); ctx.arc(hpx, hpy, r * 2.0, 0, Math.PI * 2); ctx.stroke();

    const cg = ctx.createRadialGradient(hpx, hpy, 0, hpx, hpy, r);
    cg.addColorStop(0, '#ffffff');
    cg.addColorStop(0.35, channelColor);
    cg.addColorStop(1, hexAlpha(channelColor, 0.4));
    ctx.fillStyle = cg;
    // Single shadowBlur pass, small radius — localized cost
    ctx.shadowColor = channelColor;
    ctx.shadowBlur = 8 * zoomDpr;
    ctx.beginPath(); ctx.arc(hpx, hpy, r, 0, Math.PI * 2); ctx.fill();

  } else if (p.waveform === 'sine') {
    // Soft glowing orb
    const halo = ctx.createRadialGradient(hpx, hpy, 0, hpx, hpy, r * 2.8);
    halo.addColorStop(0, hexAlpha(channelColor, 0.4));
    halo.addColorStop(0.5, hexAlpha(channelColor, 0.15));
    halo.addColorStop(1, hexAlpha(channelColor, 0));
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(hpx, hpy, r * 2.8, 0, Math.PI * 2); ctx.fill();

    const cg = ctx.createRadialGradient(hpx, hpy, 0, hpx, hpy, r);
    cg.addColorStop(0, '#ffffff');
    cg.addColorStop(0.5, channelColor);
    cg.addColorStop(1, hexAlpha(channelColor, 0.5));
    ctx.fillStyle = cg;
    ctx.shadowColor = channelColor;
    ctx.shadowBlur = 10 * zoomDpr;
    ctx.beginPath(); ctx.arc(hpx, hpy, r * 0.85, 0, Math.PI * 2); ctx.fill();

  } else {
    // Square: square ring + inner pixel
    const sz = r * 1.3;
    ctx.strokeStyle = hexAlpha(channelColor, 0.7);
    ctx.lineWidth = Math.max(1, 1.6 * zoomDpr);
    ctx.shadowColor = channelColor;
    ctx.shadowBlur = 8 * zoomDpr;
    ctx.strokeRect(hpx - sz, hpy - sz, sz * 2, sz * 2);

    ctx.shadowBlur = 0;
    ctx.fillStyle = channelColor;
    const core = r * 0.38;
    ctx.fillRect(hpx - core, hpy - core, core * 2, core * 2);

    // Bright center flash on beat boundary (first 40% of beat)
    if ((age % 1) < 0.4) {
      ctx.fillStyle = '#ffffff';
      const fc = core * 0.5;
      ctx.fillRect(hpx - fc, hpy - fc, fc * 2, fc * 2);
    }
  }

  ctx.restore();
}

// Convert a 6-char hex color + alpha 0..1 → rgba string (avoids repeated hex manipulation)
function hexAlpha(hex: string, alpha: number): string {
  // hex is '#rrggbb' or '#rrggbbaa'
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
  // Stacked circles for glow — no shadowBlur
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

  // Low-state dim background fill
  if (!isHigh) {
    ctx.fillStyle = hexAlpha(color, 0.04);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-half * 0.9, -half * 0.9, half * 1.8, half * 1.8);
    ctx.rotate(-Math.PI / 4);
  }

  // Outer diamond — single shadowBlur allowed here (tower is one element)
  const glowAmt = isHigh ? (6 + pulse * 16) : 2;
  ctx.shadowColor = color;
  ctx.shadowBlur = glowAmt * zoomDpr;
  ctx.strokeStyle = isHigh ? hexAlpha(color, 0.85 + pulse * 0.15) : hexAlpha(color, 0.2);
  ctx.lineWidth = Math.max(1, 1.4 * zoomDpr);
  ctx.rotate(Math.PI / 4);
  ctx.strokeRect(-half * 0.8, -half * 0.8, half * 1.6, half * 1.6);
  ctx.rotate(-Math.PI / 4);

  // Inner cross (no extra blur pass)
  ctx.shadowBlur = 0;
  ctx.strokeStyle = isHigh ? hexAlpha(color, 0.5 + pulse * 0.4) : hexAlpha(color, 0.12);
  ctx.lineWidth = Math.max(0.7, 0.9 * zoomDpr);
  ctx.beginPath();
  ctx.moveTo(-half * 0.52, 0); ctx.lineTo(half * 0.52, 0);
  ctx.moveTo(0, -half * 0.52); ctx.lineTo(0, half * 0.52);
  ctx.stroke();

  // Center node — stacked circles instead of more shadowBlur
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

function drawEnemy(
  ctx: CanvasRenderingContext2D,
  px: number, py: number, tileZ: number,
  enemy: Enemy, beatFrac: number, zoomDpr: number,
): void {
  const size = tileZ * 0.32;
  const isFlash = enemy.isFlashing;
  const hpFrac = enemy.hp / enemy.maxHp;

  ctx.save();
  ctx.translate(px, py);

  const fillColor = isFlash ? '#ffffff' : `hsl(${30 + hpFrac * 10},100%,62%)`;
  const glowColor = isFlash ? '#ffffff' : '#ff8800';

  ctx.shadowColor = glowColor;
  ctx.shadowBlur = (isFlash ? 24 : 10) * zoomDpr;
  ctx.strokeStyle = fillColor;
  ctx.fillStyle = `${fillColor}22`;
  ctx.lineWidth = Math.max(1.2, 1.8 * zoomDpr);
  ctx.rotate(Math.PI / 4);
  ctx.strokeRect(-size, -size, size * 2, size * 2);
  ctx.fillRect(-size, -size, size * 2, size * 2);
  ctx.rotate(-Math.PI / 4);

  if (tileZ > 22 && enemy.maxHp > 0) {
    const pipW = Math.max(2, tileZ * 0.07);
    const pipH = Math.max(1.5, tileZ * 0.045);
    const totalW = pipW * enemy.maxHp + (pipW * 0.3) * (enemy.maxHp - 1);
    let startX = -totalW / 2;
    const pipY = size + pipH * 1.5;
    ctx.shadowBlur = 0;
    for (let i = 0; i < enemy.maxHp; i++) {
      ctx.fillStyle = i < enemy.hp ? '#ff8800' : '#331100';
      ctx.fillRect(startX, pipY, pipW, pipH);
      startX += pipW + pipW * 0.3;
    }
  }

  ctx.restore();
}

// ── Public entry point ─────────────────────────────────────────────────────

export function startVersion2(): void {
  showWorldMap();
}
