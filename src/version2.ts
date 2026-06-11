// ── Version 2: Modular Synth Tower Defense ─────────────────────────────────

// ── Types ──────────────────────────────────────────────────────────────────

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

// Build a U-shaped track: across top row, down right side, back across bottom row
function buildUTrack(w: number, h: number): [number, number][] {
  const path: [number, number][] = [];
  const topRow = 1;
  const botRow = h - 2;
  const leftCol = 1;
  const rightCol = w - 2;
  // Top row left→right
  for (let x = leftCol; x <= rightCol; x++) path.push([x, topRow]);
  // Right col down
  for (let y = topRow + 1; y <= botRow; y++) path.push([rightCol, y]);
  // Bottom row right→left
  for (let x = rightCol - 1; x >= leftCol; x--) path.push([x, botRow]);
  return path;
}

// ── App State ──────────────────────────────────────────────────────────────

type Screen = { kind: 'worldmap' } | { kind: 'level'; levelId: number };

let currentScreen: Screen = { kind: 'worldmap' };
let rafId = 0;

// ── DOM Helpers ────────────────────────────────────────────────────────────

function getApp(): HTMLElement {
  return document.getElementById('app')!;
}

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
  app.style.cssText = `
    display:flex; align-items:center; justify-content:center;
    min-height:100vh; padding:1rem;
  `;

  const root = document.createElement('div');
  root.style.cssText = `
    display:flex; flex-direction:column; align-items:center; gap:1.5rem;
    width:100%; max-width:560px;
  `;

  // Header
  const header = document.createElement('div');
  header.style.cssText = `display:flex; flex-direction:column; align-items:center; gap:0.3rem;`;

  const title = document.createElement('div');
  title.textContent = 'Tiny Base Idle';
  title.style.cssText = `
    font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;
    font-size:1.6rem; font-weight:800; color:#dff6ff;
    letter-spacing:0.04em; text-shadow:0 0 20px rgba(0,200,255,0.4);
  `;

  const sub = document.createElement('div');
  sub.textContent = 'VERSION 2 · SELECT PLANET';
  sub.style.cssText = `
    font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;
    font-size:0.7rem; color:#5577aa; letter-spacing:0.14em;
  `;

  header.append(title, sub);

  // Planet grid
  const grid = document.createElement('div');
  grid.style.cssText = `
    display:flex; flex-wrap:wrap; gap:1rem; justify-content:center;
  `;

  for (const level of LEVELS) {
    const card = makeLevelCard(level);
    grid.append(card);
  }

  // Back button
  const backBtn = document.createElement('button');
  backBtn.textContent = '← Version Select';
  backBtn.style.cssText = `
    font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;
    font-size:0.72rem; color:#5577aa; background:transparent;
    border:1px solid #2a3d65; border-radius:6px;
    padding:0.4rem 1rem; cursor:pointer; letter-spacing:0.06em;
    transition:color 0.12s, border-color 0.12s;
  `;
  backBtn.addEventListener('mouseenter', () => {
    backBtn.style.color = '#dff6ff';
    backBtn.style.borderColor = '#4a8fff';
  });
  backBtn.addEventListener('mouseleave', () => {
    backBtn.style.color = '#5577aa';
    backBtn.style.borderColor = '#2a3d65';
  });
  backBtn.addEventListener('click', () => {
    import('./versionSelect').then(m => {
      clearApp();
      m.showVersionSelect();
    });
  });

  root.append(header, grid, backBtn);
  app.append(root);
}

function makeLevelCard(level: SynthLevelConfig): HTMLElement {
  const isUnlocked = level.id === 1;

  const card = document.createElement('button');
  card.disabled = !isUnlocked;
  card.style.cssText = `
    display:flex; flex-direction:column; align-items:center; gap:0.5rem;
    background:#0a0f1c; border:1.5px solid ${isUnlocked ? '#2a3d65' : '#151e30'};
    border-radius:12px; padding:1rem 1.25rem;
    cursor:${isUnlocked ? 'pointer' : 'not-allowed'};
    font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;
    opacity:${isUnlocked ? '1' : '0.45'};
    transition:border-color 0.15s, box-shadow 0.15s;
    min-width:130px;
  `;

  if (isUnlocked) {
    card.addEventListener('mouseenter', () => {
      card.style.borderColor = '#00ddcc';
      card.style.boxShadow = '0 0 20px rgba(0,200,180,0.2)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.borderColor = '#2a3d65';
      card.style.boxShadow = '';
    });
  }

  // Planet icon (canvas)
  const preview = document.createElement('canvas');
  preview.width = 80;
  preview.height = 80;
  preview.style.cssText = `width:80px;height:80px;border-radius:50%;display:block;pointer-events:none;`;
  drawPlanetPreview(preview, level.id, isUnlocked);

  const name = document.createElement('div');
  name.textContent = level.name;
  name.style.cssText = `color:${isUnlocked ? '#dff6ff' : '#445566'};font-size:0.88rem;font-weight:800;`;

  const bpmTag = document.createElement('div');
  bpmTag.textContent = `${level.bpm} ${level.beatUnitLabel}`;
  bpmTag.style.cssText = `
    color:${isUnlocked ? '#00ddcc' : '#2a4444'};
    font-size:0.72rem; letter-spacing:0.06em;
  `;

  const lockTag = document.createElement('div');
  lockTag.textContent = isUnlocked ? 'ENTER' : 'LOCKED';
  lockTag.style.cssText = `
    font-size:0.58rem; letter-spacing:0.12em;
    color:${isUnlocked ? '#5577aa' : '#2a3a4a'};
  `;

  card.append(preview, name, bpmTag, lockTag);

  if (isUnlocked) {
    card.addEventListener('click', () => enterLevel(level.id));
  }

  return card;
}

function drawPlanetPreview(canvas: HTMLCanvasElement, levelId: number, bright: boolean): void {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  // Starfield
  const rng = seededRng(levelId * 137);
  for (let i = 0; i < 30; i++) {
    const sx = rng() * w;
    const sy = rng() * h;
    ctx.fillStyle = `rgba(200,220,255,${0.2 + rng() * 0.4})`;
    ctx.fillRect(sx, sy, 1, 1);
  }

  const colors = [
    ['#00ffcc', '#007766'],
    ['#aa66ff', '#440077'],
    ['#ff9900', '#883300'],
  ];
  const [bright1, dark1] = colors[(levelId - 1) % colors.length];

  const grad = ctx.createRadialGradient(cx - 8, cy - 8, 4, cx, cy, 28);
  grad.addColorStop(0, bright ? bright1 : dark1);
  grad.addColorStop(1, '#050810');
  ctx.save();
  ctx.shadowColor = bright1;
  ctx.shadowBlur = bright ? 18 : 0;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Simple seeded pseudo-random for stable previews
function seededRng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// ── Level View ─────────────────────────────────────────────────────────────

export function enterLevel(levelId: number): void {
  const level = LEVELS.find(l => l.id === levelId);
  if (!level) return;
  currentScreen = { kind: 'level', levelId };
  clearApp();

  const app = getApp();
  app.style.cssText = `
    display:flex; flex-direction:column; align-items:center;
    justify-content:center; min-height:100vh; padding:0.5rem;
  `;

  const root = document.createElement('div');
  root.style.cssText = `
    display:flex; flex-direction:column; align-items:center; gap:0.5rem;
    width:100%; max-width:640px;
  `;

  // HUD bar
  const hud = document.createElement('div');
  hud.style.cssText = `
    display:flex; align-items:center; justify-content:space-between;
    width:100%; padding:0 0.25rem;
    font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;
  `;

  const levelInfo = document.createElement('div');
  levelInfo.style.cssText = `display:flex; flex-direction:column; gap:0.05rem;`;

  const levelName = document.createElement('div');
  levelName.textContent = level.name;
  levelName.style.cssText = `color:#dff6ff; font-size:0.85rem; font-weight:800;`;

  const bpmDisplay = document.createElement('div');
  bpmDisplay.textContent = `${level.bpm} ${level.beatUnitLabel}`;
  bpmDisplay.style.cssText = `color:#00ddcc; font-size:0.7rem; letter-spacing:0.06em;`;

  levelInfo.append(levelName, bpmDisplay);

  const exitBtn = document.createElement('button');
  exitBtn.textContent = '↩ World Map';
  exitBtn.style.cssText = `
    font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;
    font-size:0.7rem; color:#5577aa; background:rgba(8,15,28,0.8);
    border:1px solid #2a3d65; border-radius:6px;
    padding:0.35rem 0.8rem; cursor:pointer; letter-spacing:0.06em;
    transition:color 0.12s, border-color 0.12s;
  `;
  exitBtn.addEventListener('mouseenter', () => {
    exitBtn.style.color = '#dff6ff';
    exitBtn.style.borderColor = '#4a8fff';
  });
  exitBtn.addEventListener('mouseleave', () => {
    exitBtn.style.color = '#5577aa';
    exitBtn.style.borderColor = '#2a3d65';
  });
  exitBtn.addEventListener('click', () => showWorldMap());

  hud.append(levelInfo, exitBtn);

  // Canvas
  const canvasWrapper = document.createElement('div');
  canvasWrapper.style.cssText = `
    width:100%; aspect-ratio:4/3; position:relative;
    border:1.5px solid rgba(0,220,200,0.18);
    border-radius:10px; overflow:hidden;
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
    font-size:0.58rem; color:#2a4055; letter-spacing:0.08em;
  `;

  root.append(hud, canvasWrapper, hint);
  app.append(root);

  // Size canvas to physical pixels
  const resizeCanvas = () => {
    const rect = canvasWrapper.getBoundingClientRect();
    canvas.width = Math.round(rect.width * devicePixelRatio);
    canvas.height = Math.round(rect.height * devicePixelRatio);
  };
  resizeCanvas();

  const view: ViewState = {
    zoom: 1,
    panX: 0,
    panY: 0,
    isPanning: false,
    lastPanX: 0,
    lastPanY: 0,
  };

  // Center the grid initially
  const centerView = () => {
    const rect = canvasWrapper.getBoundingClientRect();
    const tileSize = baseTileSize(canvas);
    const gridPxW = level.gridWidth * tileSize * view.zoom;
    const gridPxH = level.gridHeight * tileSize * view.zoom;
    view.panX = (rect.width - gridPxW) / 2;
    view.panY = (rect.height - gridPxH) / 2;
  };
  centerView();

  // ── Input ──────────────────────────────────────────────────────────────

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
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    view.panX += (e.clientX - view.lastPanX) * scaleX / devicePixelRatio;
    view.panY += (e.clientY - view.lastPanY) * scaleY / devicePixelRatio;
    view.lastPanX = e.clientX;
    view.lastPanY = e.clientY;
  });

  canvas.addEventListener('pointerup', () => {
    view.isPanning = false;
    canvas.style.cursor = 'grab';
  });

  canvas.addEventListener('pointercancel', () => {
    view.isPanning = false;
    canvas.style.cursor = 'grab';
  });

  const ro = new ResizeObserver(() => {
    resizeCanvas();
    centerView();
  });
  ro.observe(canvasWrapper);

  // ── Render Loop ────────────────────────────────────────────────────────

  const ctx = canvas.getContext('2d')!;

  const tick = () => {
    renderLevel(ctx, canvas, level, view);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function baseTileSize(canvas: HTMLCanvasElement): number {
  // Base tile in logical (CSS) pixels — scale with DPR inside render
  return 40;
}

function renderLevel(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  level: SynthLevelConfig,
  view: ViewState,
): void {
  const W = canvas.width;
  const H = canvas.height;
  const dpr = devicePixelRatio;
  const ts = baseTileSize(canvas) * dpr; // tile size in physical px
  const zoom = view.zoom;
  const tileZ = ts * zoom;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  // Build track set for O(1) lookup
  const trackSet = new Set(level.trackTiles.map(([x, y]) => `${x},${y}`));
  const start = level.trackTiles[0];
  const finish = level.trackTiles[level.trackTiles.length - 1];

  ctx.save();
  // Apply pan & zoom (view.panX/Y are in logical px, convert to physical)
  ctx.translate(view.panX * dpr, view.panY * dpr);

  // ── Grid tiles ──────────────────────────────────────────────────────────

  for (let ty = 0; ty < level.gridHeight; ty++) {
    for (let tx = 0; tx < level.gridWidth; tx++) {
      const px = tx * tileZ;
      const py = ty * tileZ;
      const key = `${tx},${ty}`;

      if (trackSet.has(key)) {
        // Track tile
        ctx.fillStyle = '#0d1a28';
        ctx.fillRect(px, py, tileZ, tileZ);

        // Glowing track highlight
        ctx.save();
        ctx.shadowColor = '#00ddcc';
        ctx.shadowBlur = 8 * zoom;
        ctx.strokeStyle = '#00ddcc';
        ctx.lineWidth = Math.max(1, 1.5 * zoom * dpr);
        ctx.strokeRect(px + 1, py + 1, tileZ - 2, tileZ - 2);
        ctx.restore();

        // Track fill
        ctx.fillStyle = 'rgba(0,200,180,0.07)';
        ctx.fillRect(px + 2, py + 2, tileZ - 4, tileZ - 4);
      } else {
        // Empty tile
        ctx.fillStyle = '#050810';
        ctx.fillRect(px, py, tileZ, tileZ);

        // Grid line
        ctx.strokeStyle = 'rgba(42,61,101,0.4)';
        ctx.lineWidth = Math.max(0.5, 0.5 * dpr);
        ctx.strokeRect(px + 0.5, py + 0.5, tileZ - 1, tileZ - 1);
      }
    }
  }

  // ── Start marker ────────────────────────────────────────────────────────
  if (start) {
    const [sx, sy] = start;
    const px = sx * tileZ + tileZ / 2;
    const py = sy * tileZ + tileZ / 2;
    const r = tileZ * 0.28;
    ctx.save();
    ctx.shadowColor = '#33ff88';
    ctx.shadowBlur = 12 * zoom;
    ctx.fillStyle = '#33ff88';
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    if (tileZ > 20) {
      ctx.font = `bold ${Math.max(8, 11 * zoom * dpr)}px 'Pixelify Sans',system-ui,sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#000';
      ctx.shadowBlur = 0;
      ctx.fillText('S', px, py);
    }
    ctx.restore();
  }

  // ── Finish marker ───────────────────────────────────────────────────────
  if (finish) {
    const [fx, fy] = finish;
    const px = fx * tileZ + tileZ / 2;
    const py = fy * tileZ + tileZ / 2;
    const r = tileZ * 0.28;
    ctx.save();
    ctx.shadowColor = '#ff3366';
    ctx.shadowBlur = 12 * zoom;
    ctx.fillStyle = '#ff3366';
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
    if (tileZ > 20) {
      ctx.font = `bold ${Math.max(8, 11 * zoom * dpr)}px 'Pixelify Sans',system-ui,sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.shadowBlur = 0;
      ctx.fillText('F', px, py);
    }
    ctx.restore();
  }

  ctx.restore();
}

// ── Public entry point ─────────────────────────────────────────────────────

export function startVersion2(): void {
  showWorldMap();
}
