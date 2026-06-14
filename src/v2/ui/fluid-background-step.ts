import {
  FLUID_COLS, FLUID_ROWS, FLUID_SIZE,
  VEL_RETAIN_PER_SEC, DYE_RETAIN_PER_SEC, MAX_GRID_VEL,
  MIN_DYE_MAG_FOR_BLEND,
  PARTICLE_WAKE_SPEED, PARTICLE_FULL_ACT_SPEED,
  PARTICLE_ACTIVATION_POWER, PARTICLE_REWAKE_BOOST,
  PARTICLE_MIN_LIFETIME_SEC, PARTICLE_MAX_LIFETIME_SEC,
  SPEED_SMOOTH_ALPHA, SPEED_FULL_OPACITY,
  SPARSE_RESPAWN_COLS, SPARSE_RESPAWN_ROWS,
  OOB_MARGIN_CELLS, TRAIL_LENGTH,
  _clamp, _hueBucket, _bilerp,
  type FluidParticle,
} from './fluid-background-constants';

function diffuseVelocity(
  mix: number,
  vxGrid: Float32Array,
  vyGrid: Float32Array,
  tmpVx: Float32Array,
  tmpVy: Float32Array,
): void {
  for (let row = 0; row < FLUID_ROWS; row++) {
    for (let col = 0; col < FLUID_COLS; col++) {
      const i = row * FLUID_COLS + col;
      const il = col > 0 ? i - 1 : i;
      const ir = col < FLUID_COLS - 1 ? i + 1 : i;
      const iu = row > 0 ? i - FLUID_COLS : i;
      const id = row < FLUID_ROWS - 1 ? i + FLUID_COLS : i;
      tmpVx[i] = vxGrid[i] * (1 - mix) + (vxGrid[il] + vxGrid[ir] + vxGrid[iu] + vxGrid[id]) * (mix * 0.25);
      tmpVy[i] = vyGrid[i] * (1 - mix) + (vyGrid[il] + vyGrid[ir] + vyGrid[iu] + vyGrid[id]) * (mix * 0.25);
    }
  }
  vxGrid.set(tmpVx);
  vyGrid.set(tmpVy);
}

function findSparseCell(occupancy: Int16Array): number {
  const n = occupancy.length;
  const offset = Math.floor(Math.random() * n);
  let minVal = 32767;
  let minIdx = 0;
  for (let k = 0; k < n; k++) {
    const i = (offset + k) % n;
    if (occupancy[i] < minVal) {
      minVal = occupancy[i];
      minIdx = i;
    }
  }
  return minIdx;
}

export function stepFluidState(
  deltaMs: number,
  vxGrid: Float32Array,
  vyGrid: Float32Array,
  dyeR: Float32Array,
  dyeG: Float32Array,
  dyeB: Float32Array,
  tmpVx: Float32Array,
  tmpVy: Float32Array,
  particles: FluidParticle[],
  occupancy: Int16Array,
  sparseCellW: number,
  sparseCellH: number,
): void {
  const dt = Math.min(deltaMs / 1000.0, 0.1);

  const velFactor = Math.pow(VEL_RETAIN_PER_SEC, dt);
  const dyeFactor = Math.pow(DYE_RETAIN_PER_SEC, dt);
  for (let i = 0; i < FLUID_SIZE; i++) {
    vxGrid[i] *= velFactor;
    vyGrid[i] *= velFactor;
    dyeR[i] *= dyeFactor;
    dyeG[i] *= dyeFactor;
    dyeB[i] *= dyeFactor;
  }

  for (let i = 0; i < FLUID_SIZE; i++) {
    const spd = Math.sqrt(vxGrid[i] * vxGrid[i] + vyGrid[i] * vyGrid[i]);
    if (spd > MAX_GRID_VEL) {
      const inv = MAX_GRID_VEL / spd;
      vxGrid[i] *= inv;
      vyGrid[i] *= inv;
    }
  }

  diffuseVelocity(0.09, vxGrid, vyGrid, tmpVx, tmpVy);

  occupancy.fill(0);
  for (let i = 0; i < particles.length; i++) {
    const oc = _clamp(Math.floor(particles[i].x / sparseCellW), 0, SPARSE_RESPAWN_COLS - 1);
    const oRow = _clamp(Math.floor(particles[i].y / sparseCellH), 0, SPARSE_RESPAWN_ROWS - 1);
    occupancy[oRow * SPARSE_RESPAWN_COLS + oc]++;
  }

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    const vx = _bilerp(vxGrid, p.x, p.y);
    const vy = _bilerp(vyGrid, p.x, p.y);

    p.x += vx * dt;
    p.y += vy * dt;

    const spd = Math.sqrt(vx * vx + vy * vy);
    if (spd > PARTICLE_WAKE_SPEED) {
      const t = _clamp(
        (spd - PARTICLE_WAKE_SPEED) / (PARTICLE_FULL_ACT_SPEED - PARTICLE_WAKE_SPEED),
        0, 1,
      );
      const rawAct = Math.pow(t, PARTICLE_ACTIVATION_POWER);

      if (!p.isActive) {
        p.isActive = true;
        p.ageSec = 0.0;
        p.activation = rawAct;
        const baseLife = PARTICLE_MIN_LIFETIME_SEC +
          rawAct * (PARTICLE_MAX_LIFETIME_SEC - PARTICLE_MIN_LIFETIME_SEC);
        p.lifetimeSec = baseLife * (0.8 + Math.random() * 0.4);
      } else {
        const boosted = _clamp(p.activation + rawAct * PARTICLE_REWAKE_BOOST, 0, 1);
        if (boosted > p.activation) {
          p.activation = boosted;
          const remaining = Math.max(0, p.lifetimeSec - p.ageSec);
          p.lifetimeSec = p.ageSec + Math.min(
            PARTICLE_MAX_LIFETIME_SEC * boosted,
            remaining + PARTICLE_MIN_LIFETIME_SEC,
          );
        }
      }
    }

    if (p.isActive) p.ageSec += dt;

    p.smoothedSpeed += (spd - p.smoothedSpeed) * SPEED_SMOOTH_ALPHA;
    if (spd > PARTICLE_WAKE_SPEED) {
      const sr = _bilerp(dyeR, p.x, p.y);
      const sg = _bilerp(dyeG, p.x, p.y);
      const sb = _bilerp(dyeB, p.x, p.y);
      const mag = Math.sqrt(sr * sr + sg * sg + sb * sb);
      if (mag > MIN_DYE_MAG_FOR_BLEND) {
        const inv = 255.0 / mag;
        const blend = _clamp(spd / (SPEED_FULL_OPACITY * 2.0), 0, 1) * 0.3;
        p.r += (sr * inv - p.r) * blend;
        p.g += (sg * inv - p.g) * blend;
        p.b += (sb * inv - p.b) * blend;
        p.hueIdx = _hueBucket(p.r, p.g, p.b);
      }
    }

    p.trailX[p.trailHead] = p.x;
    p.trailY[p.trailHead] = p.y;
    p.trailHead = (p.trailHead + 1) % TRAIL_LENGTH;
    if (p.trailCount < TRAIL_LENGTH) p.trailCount++;

    const oob = p.x < -OOB_MARGIN_CELLS || p.x > FLUID_COLS + OOB_MARGIN_CELLS ||
      p.y < -OOB_MARGIN_CELLS || p.y > FLUID_ROWS + OOB_MARGIN_CELLS;
    const expired = p.isActive && p.ageSec >= p.lifetimeSec;

    if (oob || expired) {
      const cellIdx = findSparseCell(occupancy);
      const sx = cellIdx % SPARSE_RESPAWN_COLS;
      const sy = Math.floor(cellIdx / SPARSE_RESPAWN_COLS);
      p.x = (sx + 0.1 + Math.random() * 0.8) * sparseCellW;
      p.y = (sy + 0.1 + Math.random() * 0.8) * sparseCellH;
      p.trailCount = 0;
      p.trailHead = 0;
      p.isActive = false;
      p.ageSec = 0.0;
      p.activation = 0.0;
      p.smoothedSpeed = 0.0;
      p.maxAlphaScale = 0.7 + Math.random() * 0.3;
      occupancy[cellIdx]++;
      continue;
    }
  }
}

