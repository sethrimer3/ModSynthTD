/**
 * combat.ts — Tick-driven combat runtime + battlefield canvas renderer.
 *
 * Enemy spawning derives from compiled scores; tower fire derives from
 * canonical SignalEvents. Both run on the same integer-tick transport, so
 * notation, spawns, pulses, and audio can never disagree.
 */

import { WorldDef, Tile } from '../data/worlds';
import { CompiledScore, SpawnEvent } from '../core/score';
import { SignalEvent, FrequencyBand, Waveform, SignalDirection } from '../core/events';
import { EnemyDef, getEnemyDef } from '../core/enemy-defs';
import { PPQ, QUARTER_TICKS, TICKS_PER_MEASURE } from '../core/ticks';
import { Camera } from './camera';

import quarterNoteUrl from '../../../ASSETS/SPRITES/ENEMIES/enemy_quarterNote.png';
import halfNoteUrl from '../../../ASSETS/SPRITES/ENEMIES/enemy_halfNote.png';
import wholeNoteUrl from '../../../ASSETS/SPRITES/ENEMIES/enemy_wholeNote.png';
import eighthNoteUrl from '../../../ASSETS/SPRITES/ENEMIES/enemy_eighthNoteStemUp.png';
import eighthNoteDownUrl from '../../../ASSETS/SPRITES/ENEMIES/enemy_eighthNoteStemDown.png';
import sixteenthNoteUrl from '../../../ASSETS/SPRITES/ENEMIES/enemy_sixteenthNote.png';

export const TILE_PX = 40;

export const BAND_COLORS: Record<FrequencyBand, string> = {
  low: '#ff6633',
  mid: '#00ddcc',
  high: '#cc88ff',
};

const SPRITES: Record<string, string> = {
  sixteenth: sixteenthNoteUrl,
  eighth: eighthNoteUrl,
  quarter: quarterNoteUrl,
  half: halfNoteUrl,
  whole: wholeNoteUrl,
  dotted: quarterNoteUrl,
  triplet: eighthNoteDownUrl,
  accidental: quarterNoteUrl,
  crescendo: halfNoteUrl,
  fermata: halfNoteUrl,
  tied: quarterNoteUrl,
};

const spriteCache = new Map<string, HTMLImageElement>();
function sprite(url: string): HTMLImageElement {
  let img = spriteCache.get(url);
  if (!img) {
    img = new Image();
    img.src = url;
    spriteCache.set(url, img);
  }
  return img;
}

export function preloadSprites(): void {
  for (const url of Object.values(SPRITES)) sprite(url);
}

function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}

function smoothstep(t: number): number { return t * t * (3 - 2 * t); }

// ── Tower ───────────────────────────────────────────────────────────────────

export type TowerOrientation = 'north' | 'east' | 'south' | 'west';

export interface TowerState {
  tileX: number;
  tileY: number;
  orientation: TowerOrientation;
}

export function rotateTower(t: TowerState): void {
  const seq: TowerOrientation[] = ['north', 'east', 'south', 'west'];
  t.orientation = seq[(seq.indexOf(t.orientation) + 1) % 4];
}

function orientedDir(relDir: SignalDirection, orientation: TowerOrientation): [number, number] {
  const fwd: Record<TowerOrientation, [number, number]> = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] };
  const rgt: Record<TowerOrientation, [number, number]> = { north: [1, 0], east: [0, 1], south: [-1, 0], west: [0, -1] };
  const [fx, fy] = fwd[orientation];
  const [rx, ry] = rgt[orientation];
  switch (relDir) {
    case 'north': return [fx, fy];
    case 'south': return [-fx, -fy];
    case 'east': return [rx, ry];
    case 'west': return [-rx, -ry];
  }
}

// ── Enemy runtime ───────────────────────────────────────────────────────────

interface HpPool {
  hp: number;
  maxHp: number;
}

class EnemyRt {
  readonly def: EnemyDef;
  readonly spawnTick: number;
  readonly lane: Tile[];
  readonly laneIndex: number;
  readonly chordOffset: number;
  band: FrequencyBand;
  pool: HpPool;
  alive = true;
  escaped = false;
  spawned = false;
  tileIdx = 0;
  prevTileIdx = 0;
  hopT = 1;
  flashT = 0;
  flashMatch = false;
  /** Crescendo: incoming damage scales down as it advances. */
  private readonly baseBandIdx: number;

  constructor(spawn: SpawnEvent, def: EnemyDef, lane: Tile[], laneIndex: number, spawnTick: number, chordOffset: number, pool?: HpPool) {
    this.def = def;
    this.lane = lane;
    this.laneIndex = laneIndex;
    this.spawnTick = spawnTick;
    this.band = spawn.band;
    this.chordOffset = chordOffset;
    this.pool = pool ?? { hp: def.maxHp, maxHp: def.maxHp };
    this.baseBandIdx = ['low', 'mid', 'high'].indexOf(spawn.band);
  }

  /** Steps taken at the given tick, including the fermata hold. */
  private stepsAt(tick: number): number {
    let delta = tick - this.spawnTick;
    if (delta < 0) return -1;
    const move = this.def.moveEveryTicks;
    if (this.def.behavior === 'fermata') {
      const mid = Math.floor(this.lane.length / 2);
      const holdStart = mid * move;
      if (delta >= holdStart) {
        delta = Math.max(holdStart, delta - TICKS_PER_MEASURE);
      }
    }
    return Math.floor(delta / move);
  }

  processTick(tick: number): 'none' | 'escaped' {
    if (!this.alive) return 'none';
    const steps = this.stepsAt(tick);
    if (steps < 0) return 'none';
    if (!this.spawned) {
      this.spawned = true;
      this.tileIdx = 0;
      this.prevTileIdx = 0;
      this.hopT = 1;
    }
    if (steps >= this.lane.length) {
      this.alive = false;
      this.escaped = true;
      return 'escaped';
    }
    if (steps !== this.tileIdx) {
      const skipped = steps > this.tileIdx + 1;
      this.prevTileIdx = skipped ? steps : this.tileIdx;
      this.tileIdx = steps;
      this.hopT = skipped ? 1 : 0;
      if (this.def.behavior === 'accidental') {
        const bands: FrequencyBand[] = ['low', 'mid', 'high'];
        this.band = bands[(this.baseBandIdx + steps) % 3];
      }
    }
    return 'none';
  }

  damageScale(): number {
    if (this.def.behavior === 'crescendo') {
      return 1 - 0.5 * Math.min(1, this.tileIdx / Math.max(1, this.lane.length - 1));
    }
    return 1;
  }

  hit(amount: number, isMatch: boolean): void {
    if (!this.alive) return;
    this.pool.hp = Math.max(0, this.pool.hp - amount * this.damageScale());
    this.flashT = isMatch ? 0.4 : 0.22;
    this.flashMatch = isMatch;
    if (this.pool.hp <= 0) this.alive = false;
  }

  updateAnim(dt: number): void {
    if (this.hopT < 1) this.hopT = Math.min(1, this.hopT + dt * 10);
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt);
    if (this.pool.hp <= 0) this.alive = false;
  }

  logicalTile(): Tile {
    return this.lane[Math.min(this.tileIdx, this.lane.length - 1)] ?? [0, 0];
  }

  visualPos(): { x: number; y: number } {
    const from = this.lane[Math.min(this.prevTileIdx, this.lane.length - 1)] ?? this.lane[0];
    const to = this.lane[Math.min(this.tileIdx, this.lane.length - 1)] ?? this.lane[0];
    const t = smoothstep(this.hopT);
    const arc = Math.sin(t * Math.PI) * 0.18;
    return {
      x: from[0] + (to[0] - from[0]) * t + this.chordOffset * 0.22,
      y: from[1] + (to[1] - from[1]) * t - arc - this.chordOffset * 0.1,
    };
  }
}

// ── Projectiles ─────────────────────────────────────────────────────────────

interface Projectile {
  spawnTick: number;
  originX: number;
  originY: number;
  dirX: number;
  dirY: number;
  waveform: Waveform;
  amplitude: number;
  band: FrequencyBand;
  color: string;
  attackTicks: number;
  releaseTicks: number;
  isEcho: boolean;
  dead: boolean;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
  scale: number;
}

interface SpawnEffect extends SpawnEvent {
  absTick: number;
}

export interface WaveCombatStats {
  enemiesDefeated: number;
  shotsFired: number;
  matchedHits: number;
  resistedHits: number;
}

// ── Combat system ───────────────────────────────────────────────────────────

export interface TickOutcome {
  escapes: number;
  fired: boolean;
  spawned: number;
  spawnedEvents: SpawnEffect[];
}

export class Combat {
  readonly world: WorldDef;
  readonly tower: TowerState;
  enemies: EnemyRt[] = [];
  private pendingSpawns: Array<SpawnEvent & { absTick: number }> = [];
  private signalEvents: SignalEvent[] = [];
  private signalCursor = 0;
  private projectiles: Projectile[] = [];
  private floaters: FloatingText[] = [];
  private spawnEffects: SpawnEffect[] = [];
  private stats: WaveCombatStats = { enemiesDefeated: 0, shotsFired: 0, matchedHits: 0, resistedHits: 0 };
  private towerPulse = 0;
  private routePulse = 0;
  private lastFireDirections: Array<[number, number]> = [];
  finishFlash = 0;
  private trackSets: Set<string>[];

  constructor(world: WorldDef, tower: TowerState) {
    this.world = world;
    this.tower = tower;
    this.trackSets = world.lanes.map(lane => new Set(lane.map(([x, y]) => `${x},${y}`)));
  }

  isTrackTile(x: number, y: number): boolean {
    return this.trackSets.some(s => s.has(`${x},${y}`));
  }

  startWave(compiled: CompiledScore, waveStartTick: number): void {
    this.pendingSpawns = compiled.spawns.map(s => ({ ...s, absTick: waveStartTick + s.tick }));
    this.spawnEffects = [];
    this.signalCursor = 0;
    this.stats = { enemiesDefeated: 0, shotsFired: 0, matchedHits: 0, resistedHits: 0 };
  }

  getWaveStats(): WaveCombatStats { return { ...this.stats }; }

  setSignalEvents(events: SignalEvent[]): void {
    this.signalEvents = events;
    this.signalCursor = 0;
  }

  /** Replace not-yet-fired events after a live knob change. */
  replaceFutureSignalEvents(events: SignalEvent[], afterTick: number): void {
    const past = this.signalEvents.filter(e => e.tick <= afterTick);
    const future = events.filter(e => e.tick > afterTick);
    this.signalEvents = [...past, ...future];
    this.signalCursor = past.length;
  }

  clearWave(): void {
    this.pendingSpawns = [];
    this.enemies = [];
    this.projectiles = [];
    this.signalEvents = [];
    this.signalCursor = 0;
  }

  get pendingSpawnCount(): number { return this.pendingSpawns.length; }
  get aliveCount(): number { return this.enemies.filter(e => e.alive).length; }
  get allSpawned(): boolean { return this.pendingSpawns.length === 0; }

  processTick(tick: number): TickOutcome {
    const out: TickOutcome = { escapes: 0, fired: false, spawned: 0, spawnedEvents: [] };

    // Spawning (tied pairs share an HP pool).
    let pendingTie: HpPool | null = null;
    while (this.pendingSpawns.length > 0 && this.pendingSpawns[0].absTick <= tick) {
      const s = this.pendingSpawns.shift()!;
      const def = getEnemyDef(s.enemyTypeId);
      if (!def) continue;
      const lane = this.world.lanes[Math.min(s.lane, this.world.lanes.length - 1)];
      const chordPeers = s.chordGroup ? this.enemies.filter(e => e.spawnTick === s.absTick).length : 0;
      let pool: HpPool | undefined;
      if (def.behavior === 'tied') {
        if (pendingTie) { pool = pendingTie; pendingTie = null; }
        else if (s.tiedToNext) { pool = { hp: def.maxHp, maxHp: def.maxHp }; pendingTie = pool; }
      }
      this.enemies.push(new EnemyRt(s, def, lane, s.lane, s.absTick, chordPeers % 3 - 1, pool));
      this.spawnEffects.push(s);
      if (this.spawnEffects.length > 24) this.spawnEffects.shift();
      out.spawnedEvents.push(s);
      out.spawned++;
    }

    // Enemy movement / escapes.
    for (const e of this.enemies) {
      if (e.processTick(tick) === 'escaped') {
        out.escapes++;
        this.finishFlash = 0.55;
      }
    }

    // Tower fire from canonical SignalEvents.
    while (this.signalCursor < this.signalEvents.length && this.signalEvents[this.signalCursor].tick <= tick) {
      const ev = this.signalEvents[this.signalCursor++];
      if (ev.tick < tick - QUARTER_TICKS) continue; // stale after suspension
      for (const rel of ev.directions) {
        const [dx, dy] = orientedDir(rel, this.tower.orientation);
        this.projectiles.push({
          spawnTick: ev.tick,
          originX: this.tower.tileX,
          originY: this.tower.tileY,
          dirX: dx, dirY: dy,
          waveform: ev.waveform,
          amplitude: ev.amplitude,
          band: ev.band,
          color: BAND_COLORS[ev.band],
          attackTicks: ev.attackTicks,
          releaseTicks: ev.releaseTicks,
          isEcho: ev.tags.includes('echo'),
          dead: false,
        });
        this.stats.shotsFired++;
      }
      this.lastFireDirections = ev.directions.map(rel => orientedDir(rel, this.tower.orientation));
      this.towerPulse = 1;
      this.routePulse = 1;
      out.fired = true;
    }

    return out;
  }

  /** Per-frame: animation, collision, culling. tickFloat = fractional tick. */
  updateFrame(dt: number, tickFloat: number): void {
    this.finishFlash = Math.max(0, this.finishFlash - dt);
    this.towerPulse = Math.max(0, this.towerPulse - dt * 5);
    this.routePulse = Math.max(0, this.routePulse - dt * 3);
    for (const e of this.enemies) e.updateAnim(dt);
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      this.floaters[i].t -= dt;
      if (this.floaters[i].t <= 0) this.floaters.splice(i, 1);
    }

    // Projectile positions in tiles: 1 tile per quarter note.
    for (const p of this.projectiles) {
      if (p.dead) continue;
      const ageTiles = (tickFloat - p.spawnTick) / QUARTER_TICKS;
      const tx = p.originX + ageTiles * p.dirX;
      const ty = p.originY + ageTiles * p.dirY;
      if (tx < -1 || tx > this.world.gridWidth || ty < -1 || ty > this.world.gridHeight) {
        p.dead = true;
        continue;
      }
      const rx = Math.round(tx), ry = Math.round(ty);
      for (const e of this.enemies) {
        if (!e.alive || !e.spawned) continue;
        const [etx, ety] = e.logicalTile();
        if (etx === rx && ety === ry) {
          p.dead = true;
          const isMatch = p.band === e.band;
          const wasAlive = e.alive;
          e.hit(p.amplitude * (isMatch ? 2 : 0.5), isMatch);
          if (isMatch) this.stats.matchedHits++; else this.stats.resistedHits++;
          if (wasAlive && !e.alive) this.stats.enemiesDefeated++;
          this.floaters.push({
            x: etx + 0.5 + (Math.random() * 0.5 - 0.25),
            y: ety,
            text: isMatch ? 'CANCEL ×2' : 'RESIST ×½',
            color: isMatch ? BAND_COLORS[p.band] : '#667788',
            t: 0.9,
            scale: 0.85 + Math.min(1.5, p.amplitude) * 0.25,
          });
          if (!e.alive) this.floaters.push({ x: etx + 0.5, y: ety + 0.35, text: 'NOTE OFF', color: BAND_COLORS[e.band], t: 0.7, scale: 0.9 });
          break;
        }
      }
    }
    if (this.projectiles.length > 160) {
      this.projectiles = this.projectiles.filter(p => !p.dead);
    }
    this.enemies = this.enemies.filter(e => e.alive || e.flashT > 0);
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, camera: Camera, tickFloat: number, placement: { active: boolean; tile: Tile | null }): void {
    const dpr = devicePixelRatio;
    const z = camera.zoom * dpr;
    const tileZ = TILE_PX * z;
    const w = this.world;
    const theme = w.theme.primary;

    ctx.save();
    ctx.translate(camera.panX * dpr, camera.panY * dpr);

    // Battlefield panel.
    ctx.fillStyle = '#01040c';
    ctx.fillRect(0, 0, w.gridWidth * tileZ, w.gridHeight * tileZ);
    ctx.strokeStyle = hexAlpha(theme, 0.25);
    ctx.lineWidth = Math.max(1, 1.5 * z);
    ctx.strokeRect(0, 0, w.gridWidth * tileZ, w.gridHeight * tileZ);

    // Grid.
    ctx.strokeStyle = 'rgba(20,38,72,0.5)';
    ctx.lineWidth = Math.max(0.3, 0.5 * dpr);
    for (let x = 0; x <= w.gridWidth; x += 1) {
      ctx.beginPath(); ctx.moveTo(x * tileZ, 0); ctx.lineTo(x * tileZ, w.gridHeight * tileZ); ctx.stroke();
    }
    for (let y = 0; y <= w.gridHeight; y += 1) {
      ctx.beginPath(); ctx.moveTo(0, y * tileZ); ctx.lineTo(w.gridWidth * tileZ, y * tileZ); ctx.stroke();
    }

    // Track lanes (circuit traces).
    for (const lane of w.lanes) {
      const trace = () => {
        ctx.beginPath();
        for (let i = 0; i < lane.length; i++) {
          const px = lane[i][0] * tileZ + tileZ / 2;
          const py = lane[i][1] * tileZ + tileZ / 2;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
      };
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = hexAlpha(theme, 0.06);
      ctx.lineWidth = Math.max(4, 10 * z);
      trace(); ctx.stroke();
      ctx.strokeStyle = hexAlpha(theme, 0.18);
      ctx.lineWidth = Math.max(2.5, 5 * z);
      trace(); ctx.stroke();
      ctx.strokeStyle = hexAlpha(theme, 0.7);
      ctx.lineWidth = Math.max(0.8, 1.4 * z);
      trace(); ctx.stroke();
      ctx.restore();

      // Start / finish markers.
      const start = lane[0];
      const finish = lane[lane.length - 1];
      this.drawMarker(ctx, start[0], start[1], tileZ, '#33ff88', 'S');
      if (this.finishFlash > 0) {
        const flash = Math.abs(Math.sin(this.finishFlash * Math.PI * 14)) * this.finishFlash;
        ctx.save();
        ctx.fillStyle = `rgba(255,50,80,${Math.min(0.5, flash)})`;
        ctx.beginPath();
        ctx.arc(finish[0] * tileZ + tileZ / 2, finish[1] * tileZ + tileZ / 2, tileZ * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      this.drawMarker(ctx, finish[0], finish[1], tileZ, '#ff3366', 'F');
    }

    // Deterministic pre-spawn telegraphs and short post-spawn handoffs.
    for (const s of this.pendingSpawns) {
      const untilSpawn = s.absTick - tickFloat;
      if (untilSpawn < 0 || untilSpawn > PPQ) break;
      this.drawSpawnTelegraph(ctx, s, tileZ, z, tickFloat, false);
    }
    for (const s of this.spawnEffects) {
      if (tickFloat - s.absTick <= Math.min(PPQ, Math.max(12, s.durationTicks * 0.5))) {
        this.drawSpawnTelegraph(ctx, s, tileZ, z, tickFloat, true);
      }
    }

    // Placement ghost.
    if (placement.active && placement.tile) {
      const [ptx, pty] = placement.tile;
      const valid = ptx >= 0 && ptx < w.gridWidth && pty >= 0 && pty < w.gridHeight && !this.isTrackTile(ptx, pty);
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = valid ? '#ffcc00' : '#ff3344';
      ctx.lineWidth = Math.max(1.5, 2 * z);
      const px = ptx * tileZ + tileZ / 2, py = pty * tileZ + tileZ / 2;
      ctx.translate(px, py);
      ctx.rotate(Math.PI / 4);
      const half = tileZ * 0.24;
      ctx.strokeRect(-half, -half, half * 2, half * 2);
      ctx.restore();
    }

    // Tower.
    this.drawTower(ctx, tileZ, z, tickFloat);

    // Projectiles.
    for (const p of this.projectiles) {
      if (!p.dead) this.drawProjectile(ctx, p, tileZ, z, tickFloat);
    }

    // Enemies.
    for (const e of this.enemies) {
      if (e.spawned) this.drawEnemy(ctx, e, tileZ, z);
    }

    // Floating text.
    if (this.floaters.length > 0) {
      ctx.save();
      ctx.textAlign = 'center';
      for (const f of this.floaters) {
        ctx.font = `bold ${Math.max(8, tileZ * 0.2) * f.scale}px 'Pixelify Sans',sans-serif`;
        ctx.globalAlpha = Math.min(1, f.t / 0.9);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x * tileZ, (f.y - (0.9 - f.t)) * tileZ);
      }
      ctx.restore();
    }

    ctx.restore();
  }

  private drawMarker(ctx: CanvasRenderingContext2D, tx: number, ty: number, tileZ: number, color: string, label: string): void {
    const px = tx * tileZ + tileZ / 2, py = ty * tileZ + tileZ / 2;
    const r = tileZ * 0.2;
    ctx.save();
    ctx.fillStyle = hexAlpha(color, 0.18);
    ctx.beginPath(); ctx.arc(px, py, r * 1.9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
    if (tileZ > 18) {
      ctx.font = `bold ${Math.max(8, Math.round(tileZ * 0.18))}px 'Pixelify Sans',sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#000';
      ctx.fillText(label, px, py);
    }
    ctx.restore();
  }

  private drawSpawnTelegraph(ctx: CanvasRenderingContext2D, s: SpawnEffect, tileZ: number, z: number, tickFloat: number, isResolved: boolean): void {
    const lane = this.world.lanes[Math.min(s.lane, this.world.lanes.length - 1)];
    const start = lane[0];
    const color = BAND_COLORS[s.band];
    const durationWeight = Math.max(0.7, Math.min(1.5, s.durationTicks / QUARTER_TICKS));
    const age = isResolved ? tickFloat - s.absTick : PPQ - (s.absTick - tickFloat);
    const phase = Math.max(0, Math.min(1, age / (isResolved ? Math.max(12, s.durationTicks * 0.5) : PPQ)));
    const alpha = isResolved ? 1 - phase : 0.12 + phase * 0.42;
    const px = start[0] * tileZ + tileZ / 2;
    const py = start[1] * tileZ + tileZ / 2;
    const radius = tileZ * (0.22 + durationWeight * 0.12 + phase * 0.18);
    ctx.save();
    ctx.strokeStyle = hexAlpha(color, alpha);
    ctx.fillStyle = hexAlpha(color, alpha * 0.12);
    ctx.lineWidth = Math.max(1, durationWeight * 1.5 * z);
    ctx.shadowColor = color;
    ctx.shadowBlur = (isResolved ? 12 : 5) * durationWeight * z;
    ctx.beginPath(); ctx.arc(px, py, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px - radius * 0.45, py);
    ctx.lineTo(px + radius * 0.45, py);
    ctx.stroke();
    if (isResolved) {
      const beamTop = py - tileZ * (1.8 - phase * 1.8);
      ctx.lineWidth = Math.max(1, durationWeight * z);
      ctx.beginPath();
      ctx.moveTo(px, beamTop);
      ctx.lineTo(px, py - radius * 0.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawTower(ctx: CanvasRenderingContext2D, tileZ: number, z: number, tickFloat: number): void {
    const t = this.tower;
    const px = t.tileX * tileZ + tileZ / 2, py = t.tileY * tileZ + tileZ / 2;
    const pulse = this.towerPulse;
    const color = '#ffcc00';
    const half = tileZ * 0.3;
    ctx.save();
    ctx.translate(px, py);
    ctx.shadowColor = color;
    ctx.shadowBlur = (6 + pulse * 14) * z;
    ctx.strokeStyle = hexAlpha(color, 0.8 + pulse * 0.2);
    ctx.lineWidth = Math.max(1, 1.4 * z);
    ctx.rotate(Math.PI / 4);
    ctx.strokeRect(-half * 0.8, -half * 0.8, half * 1.6, half * 1.6);
    ctx.rotate(-Math.PI / 4);
    ctx.shadowBlur = 0;
    const cr = Math.max(2, tileZ * 0.06);
    ctx.fillStyle = hexAlpha(color, 0.9);
    ctx.beginPath(); ctx.arc(0, 0, cr, 0, Math.PI * 2); ctx.fill();
    if (this.routePulse > 0) {
      ctx.strokeStyle = hexAlpha(color, this.routePulse * 0.8);
      ctx.beginPath(); ctx.arc(0, 0, half * (1.2 + (1 - this.routePulse)), 0, Math.PI * 2); ctx.stroke();
    }
    for (const [dx, dy] of this.lastFireDirections) {
      ctx.strokeStyle = hexAlpha(color, this.towerPulse * 0.9);
      ctx.beginPath(); ctx.moveTo(dx * half * 0.7, dy * half * 0.7); ctx.lineTo(dx * half * 1.5, dy * half * 1.5); ctx.stroke();
    }
    // Facing arrow.
    const [ax, ay] = orientedDir('north', t.orientation);
    const tip = half * 0.65, base = half * 0.3, hw = half * 0.2;
    const perpX = -ay, perpY = ax;
    ctx.fillStyle = hexAlpha(color, 0.9);
    ctx.beginPath();
    ctx.moveTo(ax * tip, ay * tip);
    ctx.lineTo(ax * base + perpX * hw, ay * base + perpY * hw);
    ctx.lineTo(ax * base - perpX * hw, ay * base - perpY * hw);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile, tileZ: number, z: number, tickFloat: number): void {
    const ageTiles = (tickFloat - p.spawnTick) / QUARTER_TICKS;
    let vx = p.originX + ageTiles * p.dirX;
    let vy = p.originY + ageTiles * p.dirY;
    if (p.waveform === 'sine') {
      const off = Math.sin(ageTiles * Math.PI * 2) * 0.3;
      vx += -p.dirY * off;
      vy += p.dirX * off;
    }
    const hx = vx * tileZ + tileZ / 2;
    const hy = vy * tileZ + tileZ / 2;
    const wfColor = p.color;
    const r = Math.max(2.5, tileZ * 0.1) * (0.8 + p.amplitude * 0.25);

    // Tail.
    const tailTiles = Math.min(ageTiles, 0.45 + Math.min(3, (p.attackTicks + p.releaseTicks) / QUARTER_TICKS));
    const tx2 = hx - p.dirX * tailTiles * tileZ;
    const ty2 = hy - p.dirY * tailTiles * tileZ;
    const grad = ctx.createLinearGradient(hx, hy, tx2, ty2);
    grad.addColorStop(0, hexAlpha(wfColor, 0.8));
    grad.addColorStop(1, hexAlpha(wfColor, 0));
    ctx.strokeStyle = grad;
    ctx.lineWidth = Math.max(0.8, 1.4 * z);
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx2, ty2); ctx.stroke();

    // Head.
    ctx.save();
    ctx.globalAlpha = p.isEcho ? 0.55 : 1;
    ctx.shadowColor = wfColor;
    ctx.shadowBlur = (5 + p.amplitude * 5) * z;
    if (p.waveform === 'square') {
      ctx.fillStyle = wfColor;
      ctx.fillRect(hx - r * 0.8, hy - r * 0.8, r * 1.6, r * 1.6);
    } else if (p.waveform === 'pulse') {
      ctx.translate(hx, hy); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = wfColor; ctx.fillRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
    } else if (p.waveform === 'saw' || p.waveform === 'triangle') {
      const px = -p.dirY, py = p.dirX;
      ctx.fillStyle = wfColor; ctx.beginPath();
      ctx.moveTo(hx + p.dirX * r * 1.4, hy + p.dirY * r * 1.4);
      ctx.lineTo(hx - p.dirX * r + px * r, hy - p.dirY * r + py * r);
      ctx.lineTo(hx - p.dirX * r - px * r, hy - p.dirY * r - py * r);
      ctx.closePath(); ctx.fill();
    } else {
      const cg = ctx.createRadialGradient(hx, hy, 0, hx, hy, r);
      cg.addColorStop(0, '#ffffff');
      cg.addColorStop(0.4, wfColor);
      cg.addColorStop(1, hexAlpha(wfColor, 0.4));
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(hx, hy, r, 0, Math.PI * 2); ctx.fill();
    }
    // Band ring (resonance cue).
    ctx.strokeStyle = hexAlpha(p.color, 0.55);
    ctx.lineWidth = Math.max(0.8, 1.1 * z);
    ctx.shadowBlur = 3 * z;
    ctx.beginPath(); ctx.arc(hx, hy, r * 1.8, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: EnemyRt, tileZ: number, z: number): void {
    const pos = e.visualPos();
    const px = pos.x * tileZ + tileZ / 2;
    const py = pos.y * tileZ + tileZ / 2;
    const bandColor = BAND_COLORS[e.band];
    const isFlash = e.flashT > 0;

    ctx.save();
    ctx.translate(px, py);

    // Resonance arc ring.
    ctx.strokeStyle = hexAlpha(bandColor, 0.55);
    ctx.lineWidth = Math.max(1, 1.4 * z);
    ctx.shadowColor = bandColor;
    ctx.shadowBlur = 3 * z;
    const ringR = tileZ * 0.4;
    ctx.beginPath();
    ctx.arc(0, 0, ringR, -Math.PI * 0.75, Math.PI * 0.75);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Behavior badges.
    if (e.def.behavior !== 'normal' && tileZ > 22) {
      ctx.font = `bold ${Math.max(7, tileZ * 0.18)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = hexAlpha(e.def.color, 0.9);
      const badge = e.def.behavior === 'accidental' ? '♯' : e.def.behavior === 'crescendo' ? '<' : e.def.behavior === 'fermata' ? '𝄐' : e.def.behavior === 'tied' ? '‿' : '';
      if (badge) ctx.fillText(badge, ringR * 0.85, -ringR * 0.7);
    }

    const glow = isFlash ? '#ffffff' : e.def.color;
    ctx.shadowColor = glow;
    ctx.shadowBlur = (isFlash ? 20 : 6) * z;
    const img = sprite(SPRITES[e.def.id] ?? quarterNoteUrl);
    const size = tileZ * 0.72;
    if (img.complete && img.naturalWidth > 0) {
      const aspect = img.naturalWidth / img.naturalHeight;
      ctx.drawImage(img, -size * aspect / 2, -size / 2, size * aspect, size);
      if (isFlash) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.5;
        ctx.drawImage(img, -size * aspect / 2, -size / 2, size * aspect, size);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
    } else {
      ctx.font = `${Math.max(10, tileZ * 0.38)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isFlash ? '#fff' : e.def.color;
      ctx.fillText(e.def.symbol, 0, 0);
    }
    ctx.shadowBlur = 0;

    // HP pips.
    if (tileZ > 20 && e.pool.maxHp > 0) {
      const frac = e.pool.hp / e.pool.maxHp;
      const w = tileZ * 0.55;
      const h = Math.max(1.5, tileZ * 0.05);
      const y0 = size / 2 + h * 1.6;
      ctx.fillStyle = hexAlpha(e.def.color, 0.2);
      ctx.fillRect(-w / 2, y0, w, h);
      ctx.fillStyle = e.def.color;
      ctx.fillRect(-w / 2, y0, w * Math.max(0, Math.min(1, frac)), h);
    }

    ctx.restore();
  }
}
