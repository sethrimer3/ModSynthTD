// ── version2-enemies.ts ────────────────────────────────────────────────────
// Data-driven enemy types with discrete rhythmic movement.

import quarterNoteUrl from '../ASSETS/SPRITES/ENEMIES/enemy_quarterNote.png';
import halfNoteUrl from '../ASSETS/SPRITES/ENEMIES/enemy_halfNote.png';
import wholeNoteUrl from '../ASSETS/SPRITES/ENEMIES/enemy_wholeNote.png';
import eighthNoteUrl from '../ASSETS/SPRITES/ENEMIES/enemy_eighthNoteStemUp.png';
import eighthNoteDownUrl from '../ASSETS/SPRITES/ENEMIES/enemy_eighthNoteStemDown.png';
import sixteenthNoteUrl from '../ASSETS/SPRITES/ENEMIES/enemy_sixteenthNote.png';

// ── Types ──────────────────────────────────────────────────────────────────

export interface EnemyTypeConfig {
  id: string;
  label: string;
  spriteUrl: string;
  /** Optional second sprite; alternated per tile position. */
  altSpriteUrl?: string;
  /** quarter-note beats between moves (0.25 = sixteenth, 0.5 = eighth, 1 = quarter, etc.) */
  moveEveryBeats: number;
  /** moveEveryBeats expressed in 0.25-beat subdiv units (integer) */
  moveEverySubdivs: number;
  maxHp: number;
  color: string;
  fallbackSymbol: string;
}

export const ENEMY_TYPES: Record<string, EnemyTypeConfig> = {
  sixteenth: {
    id: 'sixteenth',
    label: '𝅯',
    spriteUrl: sixteenthNoteUrl,
    moveEveryBeats: 0.25,
    moveEverySubdivs: 1,
    maxHp: 3,
    color: '#ff3366',
    fallbackSymbol: '♬',
  },
  eighth: {
    id: 'eighth',
    label: '♪',
    spriteUrl: eighthNoteUrl,
    altSpriteUrl: eighthNoteDownUrl,
    moveEveryBeats: 0.5,
    moveEverySubdivs: 2,
    maxHp: 4,
    color: '#ff8800',
    fallbackSymbol: '♪',
  },
  quarter: {
    id: 'quarter',
    label: '♩',
    spriteUrl: quarterNoteUrl,
    moveEveryBeats: 1,
    moveEverySubdivs: 4,
    maxHp: 5,
    color: '#ffcc00',
    fallbackSymbol: '♩',
  },
  half: {
    id: 'half',
    label: '𝅗𝅥',
    spriteUrl: halfNoteUrl,
    moveEveryBeats: 2,
    moveEverySubdivs: 8,
    maxHp: 7,
    color: '#44ddff',
    fallbackSymbol: '𝅗',
  },
  whole: {
    id: 'whole',
    label: '𝅝',
    spriteUrl: wholeNoteUrl,
    moveEveryBeats: 4,
    moveEverySubdivs: 16,
    maxHp: 10,
    color: '#aa55ff',
    fallbackSymbol: '○',
  },
};

// ── Sprite cache ───────────────────────────────────────────────────────────

const spriteCache = new Map<string, HTMLImageElement>();

function loadSprite(url: string): HTMLImageElement {
  if (spriteCache.has(url)) return spriteCache.get(url)!;
  const img = new Image();
  img.src = url;
  spriteCache.set(url, img);
  return img;
}

// Pre-load all enemy sprites.
export function preloadEnemySprites(): void {
  for (const cfg of Object.values(ENEMY_TYPES)) {
    loadSprite(cfg.spriteUrl);
    if (cfg.altSpriteUrl) loadSprite(cfg.altSpriteUrl);
  }
}

// ── Enemy class ────────────────────────────────────────────────────────────

function smoothstep(t: number): number { return t * t * (3 - 2 * t); }

export class Enemy {
  hp: number;
  readonly maxHp: number;
  flashTimer = 0;

  /** Subdiv index (0.25-beat units) at which this enemy was first created. */
  readonly spawnSubdiv: number;
  /** Effective spawn subdiv — reset to current subdiv on each respawn. */
  private _effectiveSpawnSubdiv: number;

  private currentTileIdx = 0;
  private prevTileIdx = 0;
  private hopTimer = 0;
  private readonly HOP_DURATION = 0.1;

  private _spawned = false;
  private _alive = true;
  private _respawnAtSubdiv = -1;
  private _lastStepTaken = -1;
  private _lastSubdivIdx = -1;

  constructor(
    public readonly typeConfig: EnemyTypeConfig,
    public readonly track: [number, number][],
    spawnBeat: number,
  ) {
    this.spawnSubdiv = Math.round(spawnBeat * 4);
    this._effectiveSpawnSubdiv = this.spawnSubdiv;
    this.hp = typeConfig.maxHp;
    this.maxHp = typeConfig.maxHp;
  }

  /**
   * Called once per subdivision event. Returns true if the enemy moved.
   * Handles initial spawn, respawn, and tab-suspension snap.
   */
  processSubdiv(subdivIdx: number): boolean {
    this._lastSubdivIdx = subdivIdx;
    if (this.track.length === 0) return false;

    // While dead: check if it's time to respawn.
    if (!this._alive) {
      if (this._respawnAtSubdiv >= 0 && subdivIdx >= this._respawnAtSubdiv) {
        this._alive = true;
        this.hp = this.maxHp;
        this._effectiveSpawnSubdiv = subdivIdx;
        this.currentTileIdx = 0;
        this.prevTileIdx = 0;
        this.hopTimer = this.HOP_DURATION; // snap to start tile without animation
        this._lastStepTaken = 0;
        this._respawnAtSubdiv = -1;
        this.flashTimer = 0;
      }
      return false;
    }

    // Before initial spawn time: invisible and inactive.
    if (subdivIdx < this._effectiveSpawnSubdiv) return false;

    // First frame at or past spawn: place on tile 0.
    if (!this._spawned) {
      this._spawned = true;
      this.hopTimer = this.HOP_DURATION; // snap to tile 0
      this._lastStepTaken = 0;
      return false;
    }

    const delta = subdivIdx - this._effectiveSpawnSubdiv;
    if (delta % this.typeConfig.moveEverySubdivs !== 0) return false;

    const stepsTaken = Math.floor(delta / this.typeConfig.moveEverySubdivs);
    const nextIdx = stepsTaken % this.track.length;

    if (nextIdx === this.currentTileIdx) {
      this._lastStepTaken = stepsTaken;
      return false;
    }

    // Snap without hop animation if steps were skipped (e.g. tab suspension).
    const skipped = this._lastStepTaken >= 0 && stepsTaken > this._lastStepTaken + 1;
    this.prevTileIdx = skipped ? nextIdx : this.currentTileIdx;
    this.currentTileIdx = nextIdx;
    this._lastStepTaken = stepsTaken;
    this.hopTimer = skipped ? this.HOP_DURATION : 0;
    return true;
  }

  updateAnimation(dt: number): void {
    if (this.hopTimer < this.HOP_DURATION) this.hopTimer = Math.min(this.HOP_DURATION, this.hopTimer + dt);
    if (this.flashTimer > 0) this.flashTimer = Math.max(0, this.flashTimer - dt);
  }

  getLogicalTile(): [number, number] {
    return this.track[this.currentTileIdx] ?? [0, 0];
  }

  getVisualPos(): { x: number; y: number } {
    if (this.track.length === 0) return { x: 0, y: 0 };
    const from = this.track[this.prevTileIdx] ?? this.track[0];
    const to = this.track[this.currentTileIdx] ?? this.track[0];
    const t = smoothstep(Math.min(1, this.hopTimer / this.HOP_DURATION));
    const arc = Math.sin(t * Math.PI) * 0.18;
    return {
      x: from[0] + (to[0] - from[0]) * t,
      y: from[1] + (to[1] - from[1]) * t - arc,
    };
  }

  hit(damage: number): void {
    if (!this._alive) return;
    this.hp = Math.max(0, this.hp - damage);
    this.flashTimer = 0.25;
    if (this.hp <= 0) {
      this._alive = false;
      // Respawn after 4 beats (16 sixteenth-note subdivisions).
      this._respawnAtSubdiv = (this._lastSubdivIdx >= 0 ? this._lastSubdivIdx : 0) + 16;
    }
  }

  get isDead(): boolean { return !this._alive; }
  get isSpawned(): boolean { return this._spawned && this._alive; }
  get isFlashing(): boolean { return this.flashTimer > 0; }
  get tileIndex(): number { return this.currentTileIdx; }
}

// ── Factory ────────────────────────────────────────────────────────────────

/**
 * Create one of each enemy type, staggered by spawnBeat so they
 * enter the track at different times and are visually separated.
 */
export function createEnemies(track: [number, number][]): Enemy[] {
  if (track.length === 0) return [];
  return [
    new Enemy(ENEMY_TYPES.sixteenth, track, 0),
    new Enemy(ENEMY_TYPES.eighth,    track, 2),
    new Enemy(ENEMY_TYPES.quarter,   track, 4),
    new Enemy(ENEMY_TYPES.half,      track, 6),
    new Enemy(ENEMY_TYPES.whole,     track, 8),
  ];
}

// ── Rendering ──────────────────────────────────────────────────────────────

function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}

export function drawEnemy(
  ctx: CanvasRenderingContext2D,
  enemy: Enemy,
  tileZ: number,
  zoomDpr: number,
): void {
  if (enemy.track.length === 0) return;

  const pos = enemy.getVisualPos();
  const px = pos.x * tileZ + tileZ / 2;
  const py = pos.y * tileZ + tileZ / 2;
  const cfg = enemy.typeConfig;
  const isFlash = enemy.isFlashing;

  ctx.save();
  ctx.translate(px, py);

  // Glow
  const glowColor = isFlash ? '#ffffff' : cfg.color;
  ctx.shadowColor = glowColor;
  ctx.shadowBlur = (isFlash ? 22 : 6) * zoomDpr;

  const spriteUrl = cfg.altSpriteUrl && enemy.tileIndex % 2 === 1 ? cfg.altSpriteUrl : cfg.spriteUrl;
  const sprite = loadSprite(spriteUrl);
  const spriteSize = tileZ * 0.72;

  if (sprite.complete && sprite.naturalWidth > 0) {
    const aspect = sprite.naturalWidth / sprite.naturalHeight;
    const drawH = spriteSize;
    const drawW = drawH * aspect;
    ctx.drawImage(sprite, -drawW / 2, -drawH / 2, drawW, drawH);

    if (isFlash) {
      // White overlay via lighter compositing
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55;
      ctx.drawImage(sprite, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  } else {
    // Fallback symbol while image loads
    const fontSize = Math.max(10, tileZ * 0.38);
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isFlash ? '#ffffff' : cfg.color;
    ctx.fillText(cfg.fallbackSymbol, 0, 0);
  }

  ctx.shadowBlur = 0;

  // HP pips below
  if (tileZ > 20 && enemy.maxHp > 0) {
    const pipW = Math.max(2, tileZ * 0.065);
    const pipH = Math.max(1.5, tileZ * 0.042);
    const gap = pipW * 0.28;
    const totalW = pipW * enemy.maxHp + gap * (enemy.maxHp - 1);
    let startX = -totalW / 2;
    const pipY = spriteSize / 2 + pipH * 1.4;
    for (let i = 0; i < enemy.maxHp; i++) {
      const fill = Math.max(0, Math.min(1, enemy.hp - i));
      ctx.fillStyle = fill > 0 ? cfg.color : hexAlpha(cfg.color, 0.18);
      ctx.fillRect(startX, pipY, pipW * (fill > 0 ? fill : 1), pipH);
      if (fill < 1 && fill > 0) {
        ctx.fillStyle = hexAlpha(cfg.color, 0.18);
        ctx.fillRect(startX + pipW * fill, pipY, pipW * (1 - fill), pipH);
      }
      startX += pipW + gap;
    }
  }

  ctx.restore();
}
