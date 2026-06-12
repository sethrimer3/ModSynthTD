// ── version2-waves.ts ──────────────────────────────────────────────────────
// Wave definitions and manager for scheduled enemy spawning.

import { Enemy, ENEMY_TYPES } from './version2-enemies';

// ── Types ──────────────────────────────────────────────────────────────────

export interface WaveSpawn {
  enemyTypeId: string;
  /** Offset in sixteenth-note subdivisions (0.25-beat units) from wave start. */
  offsetSubdiv: number;
}

export interface WaveDefinition {
  spawns: WaveSpawn[];
}

// ── Seeded RNG ─────────────────────────────────────────────────────────────

function seededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

// ── Handcrafted waves ──────────────────────────────────────────────────────

const HANDCRAFTED_WAVES: WaveDefinition[] = [
  // Wave 1 – Quarter notes only; one every 1.5 beats.
  {
    spawns: [
      { enemyTypeId: 'quarter', offsetSubdiv: 0  },
      { enemyTypeId: 'quarter', offsetSubdiv: 6  },
      { enemyTypeId: 'quarter', offsetSubdiv: 12 },
      { enemyTypeId: 'quarter', offsetSubdiv: 18 },
      { enemyTypeId: 'quarter', offsetSubdiv: 24 },
    ],
  },
  // Wave 2 – Quarter notes anchoring, eighth notes filling gaps.
  {
    spawns: [
      { enemyTypeId: 'quarter', offsetSubdiv: 0  },
      { enemyTypeId: 'eighth',  offsetSubdiv: 4  },
      { enemyTypeId: 'eighth',  offsetSubdiv: 8  },
      { enemyTypeId: 'quarter', offsetSubdiv: 12 },
      { enemyTypeId: 'eighth',  offsetSubdiv: 18 },
      { enemyTypeId: 'quarter', offsetSubdiv: 24 },
      { enemyTypeId: 'eighth',  offsetSubdiv: 28 },
    ],
  },
  // Wave 3 – Quarter notes up front, slow half notes trailing.
  {
    spawns: [
      { enemyTypeId: 'quarter', offsetSubdiv: 0  },
      { enemyTypeId: 'quarter', offsetSubdiv: 6  },
      { enemyTypeId: 'half',    offsetSubdiv: 12 },
      { enemyTypeId: 'quarter', offsetSubdiv: 18 },
      { enemyTypeId: 'half',    offsetSubdiv: 28 },
      { enemyTypeId: 'quarter', offsetSubdiv: 34 },
    ],
  },
  // Wave 4 – Eighth-note groups punctuated by sixteenth bursts.
  {
    spawns: [
      { enemyTypeId: 'eighth',    offsetSubdiv: 0  },
      { enemyTypeId: 'eighth',    offsetSubdiv: 4  },
      { enemyTypeId: 'eighth',    offsetSubdiv: 8  },
      { enemyTypeId: 'sixteenth', offsetSubdiv: 12 },
      { enemyTypeId: 'sixteenth', offsetSubdiv: 14 },
      { enemyTypeId: 'sixteenth', offsetSubdiv: 16 },
      { enemyTypeId: 'eighth',    offsetSubdiv: 22 },
      { enemyTypeId: 'eighth',    offsetSubdiv: 26 },
      { enemyTypeId: 'sixteenth', offsetSubdiv: 30 },
      { enemyTypeId: 'sixteenth', offsetSubdiv: 32 },
    ],
  },
  // Wave 5 – Full mix of all five note values.
  {
    spawns: [
      { enemyTypeId: 'quarter',   offsetSubdiv: 0  },
      { enemyTypeId: 'eighth',    offsetSubdiv: 6  },
      { enemyTypeId: 'eighth',    offsetSubdiv: 10 },
      { enemyTypeId: 'sixteenth', offsetSubdiv: 14 },
      { enemyTypeId: 'sixteenth', offsetSubdiv: 15 },
      { enemyTypeId: 'half',      offsetSubdiv: 18 },
      { enemyTypeId: 'quarter',   offsetSubdiv: 26 },
      { enemyTypeId: 'whole',     offsetSubdiv: 34 },
      { enemyTypeId: 'eighth',    offsetSubdiv: 38 },
      { enemyTypeId: 'quarter',   offsetSubdiv: 44 },
      { enemyTypeId: 'half',      offsetSubdiv: 50 },
    ],
  },
];

// ── Endless wave generation ────────────────────────────────────────────────

function generateWave(waveIndex: number): WaveDefinition {
  const rng = seededRng(waveIndex * 2654435761 + 1013904223);

  // Gradually unlock heavier note types and increase enemy count.
  const relative = waveIndex - 5; // 0-based beyond handcrafted
  const count = Math.min(5 + Math.floor(relative * 1.3), 22);

  const ALL_TYPES   = ['quarter', 'eighth', 'sixteenth', 'half', 'whole'];
  const THRESHOLDS  = [0, 0, 2, 1, 4]; // relative-wave unlock thresholds
  const available = ALL_TYPES.filter((_, i) => relative >= THRESHOLDS[i]);
  if (available.length === 0) available.push('quarter');

  // Bias pool: quarter always has double weight to avoid all-sixteenth chaos.
  const pool: string[] = [];
  for (let i = 0; i < available.length; i++) {
    pool.push(available[i]);
    if (available[i] === 'quarter') pool.push('quarter');
  }

  const spawns: WaveSpawn[] = [];
  let offset = 0;
  for (let i = 0; i < count; i++) {
    const typeId = pool[Math.floor(rng() * pool.length)];
    spawns.push({ enemyTypeId: typeId, offsetSubdiv: offset });
    // Gap: 2–8 subdivs, always even (quantized to 0.5-beat increments).
    offset += 2 + Math.floor(rng() * 4) * 2;
  }

  return { spawns };
}

// ── WaveManager ────────────────────────────────────────────────────────────

interface PendingSpawn {
  enemyTypeId: string;
  absoluteSubdiv: number;
  done: boolean;
}

export class WaveManager {
  private waveIndex = 0;
  private waveStartSubdiv = -1;
  private pending: PendingSpawn[] = [];
  private _allSpawned = false;

  get currentWaveNumber(): number { return this.waveIndex + 1; }
  get waveStartSubdivValue(): number { return this.waveStartSubdiv; }

  /**
   * Schedule the next wave to begin on the first 4-beat downbeat that is at
   * least one full bar (16 subdivs) ahead of currentSubdiv.
   * Returns the absolute subdiv index at which the wave will start.
   */
  scheduleWave(currentSubdiv: number): number {
    const next = Math.ceil((currentSubdiv + 16) / 16) * 16;
    this.waveStartSubdiv = next;
    const def = this.getWave(this.waveIndex);
    this.pending = def.spawns.map(s => ({
      enemyTypeId: s.enemyTypeId,
      absoluteSubdiv: next + s.offsetSubdiv,
      done: false,
    }));
    this._allSpawned = this.pending.length === 0;
    return next;
  }

  /**
   * Call once per subdivision event while the wave is running.
   * Returns any enemies that should be spawned this subdivision.
   */
  tick(subdivIdx: number, track: [number, number][]): Enemy[] {
    if (this.waveStartSubdiv < 0) return [];
    const spawned: Enemy[] = [];
    for (const s of this.pending) {
      if (!s.done && subdivIdx >= s.absoluteSubdiv) {
        s.done = true;
        const cfg = ENEMY_TYPES[s.enemyTypeId];
        if (cfg) spawned.push(new Enemy(cfg, track, s.absoluteSubdiv / 4));
      }
    }
    this._allSpawned = this.pending.every(s => s.done);
    return spawned;
  }

  /** True once all enemies for this wave have been handed off for spawning. */
  get isAllSpawned(): boolean { return this._allSpawned; }

  /** Number of enemies not yet spawned (scheduled but in the future). */
  get pendingSpawnCount(): number {
    return this.pending.filter(s => !s.done).length;
  }

  /** Advance to the next wave definition and reset state. */
  advanceWave(): void {
    this.waveIndex++;
    this.waveStartSubdiv = -1;
    this.pending = [];
    this._allSpawned = false;
  }

  private getWave(index: number): WaveDefinition {
    return index < HANDCRAFTED_WAVES.length
      ? HANDCRAFTED_WAVES[index]
      : generateWave(index);
  }
}
