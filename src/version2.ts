// ── Version 2: Neon Lines ─────────────────────────────────────────────────
// A free-placement, neon aesthetic game mode. No grid. Black background.
// Base = bright cyan glowing circle. Ore deposits = pale orange diamonds.

const V2_W = 480;
const V2_H = 480;

interface NeonBase {
  x: number;
  y: number;
  radius: number;
}

interface NeonOre {
  x: number;
  y: number;
  size: number;
}

// ── State ─────────────────────────────────────────────────────────────────

const base: NeonBase = { x: V2_W / 2, y: V2_H / 2, radius: 22 };

const oreDeposits: NeonOre[] = [
  { x: 130, y: 240, size: 26 },
  { x: 118, y: 255, size: 18 },
  { x: 145, y: 258, size: 14 },
  { x: 350, y: 240, size: 24 },
  { x: 338, y: 256, size: 16 },
  { x: 362, y: 256, size: 20 },
  { x: 130, y: 380, size: 22 },
  { x: 115, y: 394, size: 14 },
];

// ── DOM ───────────────────────────────────────────────────────────────────

function buildV2DOM(): { canvas: HTMLCanvasElement; root: HTMLElement } {
  const appEl = document.getElementById('app')!;
  appEl.innerHTML = '';

  const root = document.createElement('div');
  root.style.cssText = `
    display:flex; flex-direction:column; align-items:center;
    justify-content:center; width:100%; min-height:100vh; gap:0.75rem;
  `;

  const canvas = document.createElement('canvas');
  canvas.width = V2_W;
  canvas.height = V2_H;
  canvas.style.cssText = `
    width:min(100vw,480px); height:min(100vw,480px);
    display:block; background:#000;
    border:1px solid rgba(0,255,220,0.18);
    border-radius:10px;
    box-shadow:0 0 32px rgba(0,255,200,0.08);
  `;
  canvas.setAttribute('aria-label', 'Tiny Base Idle – Version 2');

  const label = document.createElement('div');
  label.textContent = 'Version 2 — Neon Lines (coming soon)';
  label.style.cssText = `
    color:rgba(0,255,200,0.6); font-size:0.75rem; letter-spacing:0.08em;
    font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;
  `;

  root.append(canvas, label);
  appEl.append(root);
  return { canvas, root };
}

// ── Render ────────────────────────────────────────────────────────────────

function drawNeonCircle(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number,
  color: string, glowColor: string, lineWidth = 2,
): void {
  ctx.save();
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 18;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  // Second pass for stronger glow core
  ctx.shadowBlur = 8;
  ctx.lineWidth = lineWidth * 0.6;
  ctx.stroke();
  ctx.restore();
}

function drawNeonDiamond(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, size: number,
  color: string, glowColor: string,
): void {
  ctx.save();
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  const half = size / 2;
  ctx.strokeRect(-half, -half, size, size);
  ctx.shadowBlur = 5;
  ctx.lineWidth = 0.8;
  ctx.strokeRect(-half, -half, size, size);
  ctx.restore();
}

function renderV2(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, V2_W, V2_H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, V2_W, V2_H);

  // Ore deposits
  for (const ore of oreDeposits) {
    drawNeonDiamond(ctx, ore.x, ore.y, ore.size, '#ffb87a', '#ff8833');
  }

  // Base
  drawNeonCircle(ctx, base.x, base.y, base.radius, '#00ffcc', '#00ffaa');
}

// ── Loop ──────────────────────────────────────────────────────────────────

export function startVersion2(): void {
  const { canvas } = buildV2DOM();
  const ctx = canvas.getContext('2d')!;

  let lastMs = performance.now();
  const loop = (ms: number): void => {
    const _dt = Math.min(0.05, (ms - lastMs) / 1000);
    lastMs = ms;
    renderV2(ctx);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
