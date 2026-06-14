import {
  ALPHA_BUCKETS, HUE_STEPS, TRAIL_LENGTH, TRAIL_LINE_WIDTH, TRAIL_PEAK_ALPHA,
  _batches, _clamp, _smoothstep,
  type FluidParticle,
} from './fluid-background-constants';

export function renderFluidTrails(
  ctx: CanvasRenderingContext2D,
  particles: FluidParticle[],
  cellW: number,
  cellH: number,
): void {
  for (let h = 0; h < HUE_STEPS; h++) {
    for (let a = 0; a < ALPHA_BUCKETS; a++) {
      _batches[h][a].length = 0;
    }
  }

  for (let pi = 0; pi < particles.length; pi++) {
    const p = particles[pi];
    if (!p.isActive || p.trailCount < 2) continue;

    const lifeFrac = _clamp(1.0 - p.ageSec / p.lifetimeSec, 0, 1);
    const opacityScale = p.activation * _smoothstep(lifeFrac) * p.maxAlphaScale;
    if (opacityScale < 0.02) continue;

    const hue = p.hueIdx;
    const n = p.trailCount;

    for (let j = 1; j < n; j++) {
      const ageFrac = j / n;
      const bkt = _clamp(Math.floor(ageFrac * opacityScale * ALPHA_BUCKETS), 0, ALPHA_BUCKETS - 1);
      const prev = (p.trailHead - n + j - 1 + TRAIL_LENGTH) % TRAIL_LENGTH;
      const curr = (p.trailHead - n + j + TRAIL_LENGTH) % TRAIL_LENGTH;
      const arr = _batches[hue][bkt];
      arr.push(
        p.trailX[prev] * cellW, p.trailY[prev] * cellH,
        p.trailX[curr] * cellW, p.trailY[curr] * cellH,
      );
    }
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = TRAIL_LINE_WIDTH;

  for (let h = 0; h < HUE_STEPS; h++) {
    const hueDeg = h * 30;
    for (let b = 0; b < ALPHA_BUCKETS; b++) {
      const arr = _batches[h][b];
      if (arr.length === 0) continue;

      const alpha = ((b + 1) / ALPHA_BUCKETS) * TRAIL_PEAK_ALPHA;
      ctx.strokeStyle = `hsla(${hueDeg},82%,66%,${alpha.toFixed(3)})`;
      ctx.beginPath();
      for (let k = 0; k < arr.length; k += 4) {
        ctx.moveTo(arr[k], arr[k + 1]);
        ctx.lineTo(arr[k + 2], arr[k + 3]);
      }
      ctx.stroke();
    }
  }

  ctx.restore();
}

