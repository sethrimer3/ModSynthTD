// ── Version 2: Modular Synth Tower Defense ─────────────────────────────────

// ── Types / Interfaces ─────────────────────────────────────────────────────

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
  spawnBeat: number;   // float beat when spawned
  originX: number;     // spawn tile (grid coords)
  originY: number;
  dirX: number;
  dirY: number;
  dead: boolean;
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

  get beat(): number {
    return Math.floor(this.beatFloat);
  }

  get beatFrac(): number {
    return this.beatFloat % 1;
  }
}

// ── Enemy ──────────────────────────────────────────────────────────────────

class Enemy {
  hp = 5;
  maxHp = 5;
  flashTimer = 0; // seconds remaining for hit flash

  constructor(private track: [number, number][]) {}

  // Returns smooth floating-point tile position. Enemy advances 1 tile / 2 beats.
  getFloatPos(beatFloat: number): { x: number; y: number } {
    const track = this.track;
    if (track.length === 0) return { x: 0, y: 0 };
    const progress = (beatFloat / 2) % track.length;
    const idx = Math.floor(progress);
    const t = progress - idx;
    const from = track[idx];
    const to = track[(idx + 1) % track.length];
    return {
      x: from[0] + (to[0] - from[0]) * t,
      y: from[1] + (to[1] - from[1]) * t,
    };
  }

  // Returns the logical tile index (used for collision)
  getLogicalTileIdx(beatFloat: number): number {
    return Math.floor(beatFloat / 2) % this.track.length;
  }

  getTile(beatFloat: number): [number, number] {
    return this.track[this.getLogicalTileIdx(beatFloat)];
  }

  hit(): void {
    this.hp = Math.max(0, this.hp - 1);
    this.flashTimer = 0.25;
  }

  update(dt: number): void {
    if (this.flashTimer > 0) this.flashTimer = Math.max(0, this.flashTimer - dt);
  }

  get isFlashing(): boolean { return this.flashTimer > 0; }
}

// ── OutputTower ────────────────────────────────────────────────────────────

class OutputTower {
  // Inside the U, fires upward — column 8, row 4 → shoots toward [8,1] on track
  readonly tileX = 8;
  readonly tileY = 4;
  readonly dirX = 0;
  readonly dirY = -1;

  private lastFiredBeat = -1;

  update(beat: number, projectiles: SignalProjectile[]): void {
    if (beat <= this.lastFiredBeat) return;
    this.lastFiredBeat = beat;
    projectiles.push({
      spawnBeat: beat,
      originX: this.tileX,
      originY: this.tileY,
      dirX: this.dirX,
      dirY: this.dirY,
      dead: false,
    });
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

  // ── HUD ──────────────────────────────────────────────────────────────────
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

  // ── Canvas ────────────────────────────────────────────────────────────────
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

  root.append(hud, canvasWrapper, hint);
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
    const tileSize = BASE_TILE_PX;
    view.panX = (rect.width - level.gridWidth * tileSize * view.zoom) / 2;
    view.panY = (rect.height - level.gridHeight * tileSize * view.zoom) / 2;
  };
  centerView();

  // ── Input ─────────────────────────────────────────────────────────────────
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

  // ── Game State ────────────────────────────────────────────────────────────
  const clock = new BeatClock(level.bpm);
  const enemy = new Enemy(level.trackTiles);
  const tower = new OutputTower();
  const projectiles: SignalProjectile[] = [];

  let lastNow = performance.now();
  const ctx = canvas.getContext('2d')!;

  // ── Game Loop ─────────────────────────────────────────────────────────────
  const tick = () => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;

    const beatFloat = clock.beatFloat;
    const beat = clock.beat;

    // Update game entities
    enemy.update(dt);
    tower.update(beat, projectiles);

    // Cull dead/off-grid projectiles
    cullProjectiles(projectiles, level, beatFloat);

    // Collision detection
    checkCollisions(enemy, projectiles, level, beatFloat);

    // Update HUD
    beatDisplay.textContent = `beat ${beat}`;

    // Render
    renderLevel(ctx, canvas, level, view, clock, enemy, tower, projectiles);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

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
  // Compact array periodically
  if (projectiles.length > 60) {
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

function renderLevel(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  level: SynthLevelConfig,
  view: ViewState,
  clock: BeatClock,
  enemy: Enemy,
  tower: OutputTower,
  projectiles: SignalProjectile[],
): void {
  const W = canvas.width;
  const H = canvas.height;
  const dpr = devicePixelRatio;
  const tileZ = BASE_TILE_PX * dpr * view.zoom;
  const beatFloat = clock.beatFloat;
  const beatFrac = clock.beatFrac;

  // ── Background ────────────────────────────────────────────────────────────
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Subtle vignette
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.8);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,10,0.7)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(view.panX * dpr, view.panY * dpr);

  const trackSet = new Set(level.trackTiles.map(([x, y]) => `${x},${y}`));
  const start = level.trackTiles[0];
  const finish = level.trackTiles[level.trackTiles.length - 1];

  // ── Grid tiles ────────────────────────────────────────────────────────────
  for (let ty = 0; ty < level.gridHeight; ty++) {
    for (let tx = 0; tx < level.gridWidth; tx++) {
      const px = tx * tileZ;
      const py = ty * tileZ;
      const key = `${tx},${ty}`;
      const isTrack = trackSet.has(key);

      // Base fill
      ctx.fillStyle = isTrack ? '#060f1a' : '#03060e';
      ctx.fillRect(px, py, tileZ, tileZ);

      if (isTrack) {
        // Glowing circuit-trace border
        ctx.save();
        ctx.shadowColor = '#00ddcc';
        ctx.shadowBlur = 6 * view.zoom * dpr;
        ctx.strokeStyle = 'rgba(0,200,180,0.55)';
        ctx.lineWidth = Math.max(0.8, 1.2 * view.zoom * dpr);
        ctx.strokeRect(px + 1, py + 1, tileZ - 2, tileZ - 2);
        ctx.restore();

        // Inner fill tint
        ctx.fillStyle = 'rgba(0,180,160,0.06)';
        ctx.fillRect(px + 2, py + 2, tileZ - 4, tileZ - 4);
      } else {
        // Grid lines (circuit board look)
        ctx.strokeStyle = 'rgba(30,50,90,0.55)';
        ctx.lineWidth = Math.max(0.4, 0.5 * dpr);
        ctx.strokeRect(px + 0.5, py + 0.5, tileZ - 1, tileZ - 1);

        // Corner dots at alternating tiles for circuit-board texture
        if ((tx + ty) % 3 === 0) {
          ctx.fillStyle = 'rgba(40,70,120,0.35)';
          const dotR = Math.max(0.8, 1.2 * view.zoom * dpr);
          ctx.beginPath();
          ctx.arc(px + tileZ / 2, py + tileZ / 2, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // ── Track edge glow traces ────────────────────────────────────────────────
  // Draw connecting lines between adjacent track tile centers for "trace" look
  ctx.save();
  ctx.strokeStyle = 'rgba(0,220,200,0.15)';
  ctx.lineWidth = Math.max(1.5, 3 * view.zoom * dpr);
  ctx.shadowColor = '#00ddcc';
  ctx.shadowBlur = 4 * view.zoom * dpr;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < level.trackTiles.length; i++) {
    const [tx, ty] = level.trackTiles[i];
    const px = tx * tileZ + tileZ / 2;
    const py = ty * tileZ + tileZ / 2;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();

  // ── Start / Finish markers ────────────────────────────────────────────────
  if (start) drawMarker(ctx, start[0], start[1], tileZ, '#33ff88', '#00cc66', 'S');
  if (finish) drawMarker(ctx, finish[0], finish[1], tileZ, '#ff3366', '#cc0044', 'F');

  // ── Output Tower ──────────────────────────────────────────────────────────
  drawTower(ctx, tower.tileX, tower.tileY, tileZ, beatFrac, view.zoom * dpr);

  // ── Signal Projectiles ────────────────────────────────────────────────────
  for (const p of projectiles) {
    if (p.dead) continue;
    const age = beatFloat - p.spawnBeat;
    const px = (p.originX + age * p.dirX) * tileZ + tileZ / 2;
    const py = (p.originY + age * p.dirY) * tileZ + tileZ / 2;
    drawSignalMote(ctx, px, py, tileZ, beatFrac, view.zoom * dpr);
  }

  // ── Enemy ─────────────────────────────────────────────────────────────────
  if (level.trackTiles.length > 0) {
    const pos = enemy.getFloatPos(beatFloat);
    const px = pos.x * tileZ + tileZ / 2;
    const py = pos.y * tileZ + tileZ / 2;
    drawEnemy(ctx, px, py, tileZ, enemy, beatFrac, view.zoom * dpr);
  }

  ctx.restore();
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  tx: number, ty: number, tileZ: number,
  color: string, glow: string, label: string,
): void {
  const px = tx * tileZ + tileZ / 2;
  const py = ty * tileZ + tileZ / 2;
  const r = tileZ * 0.24;
  ctx.save();
  ctx.shadowColor = glow;
  ctx.shadowBlur = 12;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fill();
  if (tileZ > 18) {
    ctx.shadowBlur = 0;
    ctx.font = `bold ${Math.max(8, Math.round(tileZ * 0.22))}px 'Pixelify Sans',system-ui,sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(label, px, py);
  }
  ctx.restore();
}

function drawTower(
  ctx: CanvasRenderingContext2D,
  tx: number, ty: number, tileZ: number,
  beatFrac: number, zoomDpr: number,
): void {
  const px = tx * tileZ + tileZ / 2;
  const py = ty * tileZ + tileZ / 2;
  const half = tileZ * 0.3;
  // Pulse glow on beat
  const pulse = Math.pow(1 - beatFrac, 2) * 0.6;

  ctx.save();
  ctx.shadowColor = '#cc44ff';
  ctx.shadowBlur = (8 + pulse * 20) * zoomDpr;
  ctx.strokeStyle = `rgba(200,80,255,${0.7 + pulse * 0.3})`;
  ctx.lineWidth = Math.max(1, 1.5 * zoomDpr);

  // Outer square (rotated 45°)
  ctx.translate(px, py);
  ctx.rotate(Math.PI / 4);
  ctx.strokeRect(-half * 0.8, -half * 0.8, half * 1.6, half * 1.6);
  ctx.rotate(-Math.PI / 4);

  // Inner cross
  ctx.shadowBlur = (4 + pulse * 8) * zoomDpr;
  ctx.strokeStyle = `rgba(220,120,255,${0.5 + pulse * 0.5})`;
  ctx.lineWidth = Math.max(0.8, zoomDpr);
  ctx.beginPath();
  ctx.moveTo(-half * 0.55, 0); ctx.lineTo(half * 0.55, 0);
  ctx.moveTo(0, -half * 0.55); ctx.lineTo(0, half * 0.55);
  ctx.stroke();

  // Center dot
  ctx.shadowBlur = (6 + pulse * 12) * zoomDpr;
  ctx.fillStyle = `rgba(230,140,255,${0.8 + pulse * 0.2})`;
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(2, tileZ * 0.06), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawSignalMote(
  ctx: CanvasRenderingContext2D,
  px: number, py: number, tileZ: number,
  beatFrac: number, zoomDpr: number,
): void {
  const r = Math.max(2, tileZ * 0.1);
  // Bright pulse trail
  ctx.save();
  ctx.shadowColor = '#00ffee';
  ctx.shadowBlur = 12 * zoomDpr;

  // Outer glow ring
  ctx.strokeStyle = 'rgba(0,240,220,0.4)';
  ctx.lineWidth = Math.max(0.8, 1.5 * zoomDpr);
  ctx.beginPath();
  ctx.arc(px, py, r * 2.2, 0, Math.PI * 2);
  ctx.stroke();

  // Core dot
  ctx.fillStyle = '#b0fff8';
  ctx.shadowBlur = 18 * zoomDpr;
  ctx.beginPath();
  ctx.arc(px, py, r, 0, Math.PI * 2);
  ctx.fill();

  // Bright center
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 6 * zoomDpr;
  ctx.beginPath();
  ctx.arc(px, py, r * 0.4, 0, Math.PI * 2);
  ctx.fill();

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

  // Hit flash: bright white overlay
  const fillColor = isFlash ? '#ffffff' : `hsl(${30 + hpFrac * 10},100%,62%)`;
  const glowColor = isFlash ? '#ffffff' : '#ff8800';

  ctx.shadowColor = glowColor;
  ctx.shadowBlur = (isFlash ? 24 : 10) * zoomDpr;
  ctx.strokeStyle = fillColor;
  ctx.fillStyle = `${fillColor}22`;
  ctx.lineWidth = Math.max(1.2, 1.8 * zoomDpr);

  // Diamond shape
  ctx.rotate(Math.PI / 4);
  ctx.strokeRect(-size, -size, size * 2, size * 2);
  ctx.fillRect(-size, -size, size * 2, size * 2);
  ctx.rotate(-Math.PI / 4);

  // HP pip row
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
