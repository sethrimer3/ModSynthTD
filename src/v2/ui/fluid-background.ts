/**
 * rpg-fluid.ts â€” Euler fluid background for RPG mode.
 *
 * Ported and adapted from Chapter 3 EulerFluidEffect.js in
 * sethrimer3/Thero_Idle_TD. The core particle advection and batched trail
 * rendering approach are preserved; the analytical velocity field has been
 * replaced with a grid-based accumulation model driven entirely by gameplay.
 *
 * Constants, shared types, and math helpers are in fluid-background-constants.ts.
 * Per-frame simulation and rendering loops are in:
 * - fluid-background-step.ts
 * - fluid-background-render.ts
 */

import {
  FLUID_COLS, FLUID_ROWS, FLUID_SIZE,
  PARTICLE_COUNT_LOW, PARTICLE_COUNT_HIGH,
  FORCE_SIGMA_CELLS, FORCE_TWO_SIGMA_SQ, MAX_INJECT_VEL,
  SPARSE_RESPAWN_COLS, SPARSE_RESPAWN_ROWS,
  RESIZE_THRESHOLD_FR,
  _clamp, _makeParticle,
  type FluidParticle,
} from './fluid-background-constants';
import { stepFluidState } from './fluid-background-step';
import { renderFluidTrails } from './fluid-background-render';

/**
 * A single directional force and colour impulse to inject this frame.
 * All positions are in canvas-pixel world space.
 */
export interface FluidImpulse {
  /** World-space position (canvas pixels). */
  x: number;
  y: number;
  /**
   * Velocity in canvas pixels per second.
   * Convert from px/frame by multiplying by (1000 / TARGET_FRAME_MS).
   */
  vx: number;
  vy: number;
  /** Source colour (0â€“255 per channel). */
  r: number;
  g: number;
  b: number;
  /** Force multiplier â€” 1.0 for normal entity motion; higher for impacts. */
  strength?: number;
}

export interface LevelFluidBackground {
  /** Update internal cell-size when the canvas dimensions change. */
  resize(widthPx: number, heightPx: number): void;
  /**
   * Inject a directional force and colour impulse at a world-space position.
   * Call once per active entity per frame.
   */
  addForce(impulse: FluidImpulse): void;
  /**
   * Inject a radial outward explosion at world-space (x, y).
   * Used for AoE attacks, enemy deaths, and impact events.
   */
  addExplosion(
    x: number,
    y: number,
    strength: number,
    r: number,
    g: number,
    b: number,
  ): void;
  /** Advance the simulation by deltaMs milliseconds. */
  step(deltaMs: number): void;
  /**
   * Render the fluid as a background layer.
   * Must be called after the canvas has been cleared and before entities are drawn.
   */
  render(ctx: CanvasRenderingContext2D): void;
  /** Clear all grid and particle state (call on restart). */
  reset(): void;
  /**
   * Toggle low-graphics mode.
   * High graphics uses 3Ã— more particles for a denser fluid background.
   */
  setLowGraphicsMode(enabled: boolean): void;
}

export function createLevelFluidBackground(): LevelFluidBackground {
  let widthPx = 320;
  let heightPx = 568;
  let cellW = widthPx / FLUID_COLS;
  let cellH = heightPx / FLUID_ROWS;

  const vxGrid = new Float32Array(FLUID_SIZE);
  const vyGrid = new Float32Array(FLUID_SIZE);
  const dyeR = new Float32Array(FLUID_SIZE);
  const dyeG = new Float32Array(FLUID_SIZE);
  const dyeB = new Float32Array(FLUID_SIZE);
  const tmpVx = new Float32Array(FLUID_SIZE);
  const tmpVy = new Float32Array(FLUID_SIZE);

  let currentParticleCount = PARTICLE_COUNT_HIGH;
  let particles: FluidParticle[] = [];
  for (let i = 0; i < currentParticleCount; i++) particles.push(_makeParticle());

  const occupancy = new Int16Array(SPARSE_RESPAWN_COLS * SPARSE_RESPAWN_ROWS);
  const sparseCellW = FLUID_COLS / SPARSE_RESPAWN_COLS;
  const sparseCellH = FLUID_ROWS / SPARSE_RESPAWN_ROWS;

  function toGX(wx: number): number { return wx / cellW; }
  function toGY(wy: number): number { return wy / cellH; }

  function splat(
    gx: number, gy: number,
    gvx: number, gvy: number,
    gr: number, gg: number, gb: number,
    strength: number,
  ): void {
    const span = Math.ceil(FORCE_SIGMA_CELLS * 1.6);
    const col0 = Math.max(0, Math.floor(gx) - span);
    const col1 = Math.min(FLUID_COLS - 1, Math.ceil(gx) + span);
    const row0 = Math.max(0, Math.floor(gy) - span);
    const row1 = Math.min(FLUID_ROWS - 1, Math.ceil(gy) + span);

    for (let row = row0; row <= row1; row++) {
      for (let col = col0; col <= col1; col++) {
        const dx = col - gx;
        const dy = row - gy;
        const w = Math.exp(-(dx * dx + dy * dy) / FORCE_TWO_SIGMA_SQ) * strength;
        const idx = row * FLUID_COLS + col;
        vxGrid[idx] += gvx * w;
        vyGrid[idx] += gvy * w;
        dyeR[idx] += gr * w;
        dyeG[idx] += gg * w;
        dyeB[idx] += gb * w;
      }
    }
  }

  function resize(w: number, h: number): void {
    const prevW = widthPx;
    const prevH = heightPx;
    widthPx = w;
    heightPx = h;
    cellW = w / FLUID_COLS;
    cellH = h / FLUID_ROWS;
    const rw = Math.abs(w - prevW) / (prevW + 1);
    const rh = Math.abs(h - prevH) / (prevH + 1);
    if (rw > RESIZE_THRESHOLD_FR || rh > RESIZE_THRESHOLD_FR) {
      reset();
    }
  }

  function addForce(impulse: FluidImpulse): void {
    const gx = toGX(impulse.x);
    const gy = toGY(impulse.y);
    const str = impulse.strength ?? 1.0;
    const gvxRaw = impulse.vx / cellW;
    const gvyRaw = impulse.vy / cellH;
    const gspd = Math.sqrt(gvxRaw * gvxRaw + gvyRaw * gvyRaw);
    const scale = gspd > MAX_INJECT_VEL ? MAX_INJECT_VEL / gspd : 1.0;
    const normSpd = _clamp(gspd / MAX_INJECT_VEL, 0, 1);
    const speedFactor = normSpd * normSpd;
    splat(gx, gy, gvxRaw * scale, gvyRaw * scale, impulse.r, impulse.g, impulse.b, str * speedFactor);
  }

  function addExplosion(
    x: number,
    y: number,
    strength: number,
    r: number,
    g: number,
    b: number,
  ): void {
    const gx = toGX(x);
    const gy = toGY(y);
    const blastR = FORCE_SIGMA_CELLS * 1.8;
    for (let k = 0; k < 8; k++) {
      const angle = (k / 8) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const ox = gx + cos * blastR * 0.35;
      const oy = gy + sin * blastR * 0.35;
      splat(ox, oy, cos * MAX_INJECT_VEL * 0.75, sin * MAX_INJECT_VEL * 0.75, r, g, b, strength * 0.45);
    }
    splat(gx, gy, 0, 0, r, g, b, strength);
  }

  function step(deltaMs: number): void {
    stepFluidState(
      deltaMs,
      vxGrid,
      vyGrid,
      dyeR,
      dyeG,
      dyeB,
      tmpVx,
      tmpVy,
      particles,
      occupancy,
      sparseCellW,
      sparseCellH,
    );
  }

  function render(ctx: CanvasRenderingContext2D): void {
    renderFluidTrails(ctx, particles, cellW, cellH);
  }

  function reset(): void {
    vxGrid.fill(0);
    vyGrid.fill(0);
    dyeR.fill(0);
    dyeG.fill(0);
    dyeB.fill(0);
    particles = [];
    for (let i = 0; i < currentParticleCount; i++) particles.push(_makeParticle());
  }

  function setLowGraphicsMode(enabled: boolean): void {
    const newCount = enabled ? PARTICLE_COUNT_LOW : PARTICLE_COUNT_HIGH;
    if (newCount === currentParticleCount) return;
    currentParticleCount = newCount;
    if (newCount > particles.length) {
      const source = particles[0];
      for (let i = particles.length; i < newCount; i++) {
        const np = _makeParticle();
        if (source) {
          np.r = source.r;
          np.g = source.g;
          np.b = source.b;
          np.hueIdx = source.hueIdx;
        }
        particles.push(np);
      }
    } else {
      particles.length = newCount;
    }
  }

  return { resize, addForce, addExplosion, step, render, reset, setLowGraphicsMode };
}

