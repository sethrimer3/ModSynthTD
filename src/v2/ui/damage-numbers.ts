/**
 * Floating damage numbers — ported from Equatoria Idle's RPG rendering system.
 *
 * Coordinates are stored in tile-space so they're resolution-independent.
 * Convert to canvas px in draw() by multiplying by tileZ.
 */

const DURATION_S         = 0.9;
const MIN_FONT_TILE      = 0.18;  // font size in tile units at minimum damage
const MAX_FONT_TILE      = 0.55;  // font size in tile units at full hp damage
const INITIAL_SPEED      = 1.8;   // tiles/second at ratio=1
const DECEL              = 0.88;  // velocity multiplier per 1/60 s frame
const VECTOR_VARIATION   = Math.PI / 12;
const FONT_FAMILY        = '"Pixelify Sans", monospace';

export interface DamageNumber {
  x: number;   // tile-space
  y: number;
  vx: number;  // tiles/second
  vy: number;
  text: string;
  fontTile: number;  // font size in tile units
  color: string;
  timerS: number;
}

/** Spawn a damage number at a tile-space position. ratio = damage / maxHp, clamped [0,1]. */
export function spawnDamageNumber(
  numbers: DamageNumber[],
  tx: number, ty: number,
  damage: number, maxHp: number,
  color: string,
): void {
  const ratio = Math.min(1, Math.max(0, damage / Math.max(1, maxHp)));
  const fontTile = MIN_FONT_TILE + ratio * (MAX_FONT_TILE - MIN_FONT_TILE);
  const deviation = (Math.random() + Math.random() - 1) * VECTOR_VARIATION;
  const cosD = Math.cos(deviation), sinD = Math.sin(deviation);
  // Base direction: straight up (0, -1). Apply ±15° rotation.
  const dirX =  sinD;  // 0*cosD - (-1)*sinD
  const dirY = -cosD;  // 0*sinD + (-1)*cosD
  const speed = INITIAL_SPEED * (0.5 + ratio * 0.5);
  numbers.push({ x: tx, y: ty, vx: dirX * speed, vy: dirY * speed, text: String(Math.round(damage)), fontTile, color, timerS: DURATION_S });
}

/** Advance positions and prune expired numbers. dt in seconds. */
export function updateDamageNumbers(numbers: DamageNumber[], dt: number, bounds: { x: number; y: number; w: number; h: number }): void {
  // Decel is tuned for 60fps (1/60 s ticks). Scale to actual dt.
  const decelFactor = Math.pow(DECEL, dt * 60);
  for (let i = numbers.length - 1; i >= 0; i--) {
    const dn = numbers[i];
    dn.timerS -= dt;
    if (dn.timerS <= 0) { numbers.splice(i, 1); continue; }
    dn.x += dn.vx * dt;
    dn.y += dn.vy * dt;
    dn.vx *= decelFactor;
    dn.vy *= decelFactor;
    // Bounce off battlefield edges (in tile space).
    const halfFont = dn.fontTile * 0.5;
    if      (dn.x < bounds.x + halfFont)             { dn.x = bounds.x + halfFont;             dn.vx =  Math.abs(dn.vx); }
    else if (dn.x > bounds.x + bounds.w - halfFont)  { dn.x = bounds.x + bounds.w - halfFont;  dn.vx = -Math.abs(dn.vx); }
    if      (dn.y < bounds.y + halfFont)             { dn.y = bounds.y + halfFont;             dn.vy =  Math.abs(dn.vy); }
    else if (dn.y > bounds.y + bounds.h - halfFont)  { dn.y = bounds.y + bounds.h - halfFont;  dn.vy = -Math.abs(dn.vy); }
  }
}

/** Draw all damage numbers. Call inside the camera-translated ctx, passing tileZ (px per tile). */
export function drawDamageNumbers(ctx: CanvasRenderingContext2D, numbers: DamageNumber[], tileZ: number): void {
  if (numbers.length === 0) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const dn of numbers) {
    const t = dn.timerS / DURATION_S;
    // Sharp fade-in for first third, then hold, then fade out in final third.
    const alpha = t > 0.33 ? 1.0 : t / 0.33;
    ctx.globalAlpha = alpha;
    const fontPx = Math.max(1, Math.round(dn.fontTile * tileZ));
    ctx.font = `bold ${fontPx}px ${FONT_FAMILY}`;
    ctx.shadowBlur  = fontPx * 2;
    ctx.shadowColor = dn.color;
    ctx.lineWidth   = Math.max(2, Math.round(fontPx * 0.16));
    ctx.strokeStyle = '#000000';
    ctx.fillStyle   = dn.color;
    const px = Math.round(dn.x * tileZ);
    const py = Math.round(dn.y * tileZ);
    ctx.strokeText(dn.text, px, py);
    ctx.fillText(dn.text, px, py);
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.restore();
}
