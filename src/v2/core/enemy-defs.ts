/**
 * enemy-defs.ts — Pure enemy registry data (no sprites, no DOM).
 *
 * The renderer maps enemyTypeId → sprite separately. Movement is quantized
 * to integer ticks; behavior flags drive the special musical behaviors.
 */

import { FrequencyBand } from './events';
import { QUARTER_TICKS, EIGHTH_TICKS, HALF_TICKS, WHOLE_TICKS, DOTTED_QUARTER_TICKS, EIGHTH_TRIPLET_TICKS } from './ticks';

export type EnemyBehavior =
  | 'normal'
  /** Accidental: shifts resonance band one step every move. */
  | 'accidental'
  /** Crescendo: amplitude resistance grows over its lifetime (damage taken shrinks). */
  | 'crescendo'
  /** Fermata: pauses on the spot for one full measure mid-track. */
  | 'fermata'
  /** Tied pair: spawns as linked duo sharing one HP pool. */
  | 'tied'
  /** Chord member: spawned in vertical formation by chord score events. */
  | 'chord';

export interface EnemyDef {
  id: string;
  label: string;
  symbol: string;
  color: string;
  band: FrequencyBand;
  /** Integer ticks between one-tile moves. */
  moveEveryTicks: number;
  maxHp: number;
  behavior: EnemyBehavior;
  /** Reward weight for milestone tables / difficulty budgeting. */
  threat: number;
}

export const ENEMY_DEFS: Record<string, EnemyDef> = {
  sixteenth: {
    id: 'sixteenth', label: 'Sixteenth', symbol: '♬', color: '#ff3366',
    band: 'high', moveEveryTicks: EIGHTH_TICKS, maxHp: 2, behavior: 'normal', threat: 2,
  },
  eighth: {
    id: 'eighth', label: 'Eighth', symbol: '♪', color: '#ff8800',
    band: 'high', moveEveryTicks: QUARTER_TICKS, maxHp: 3, behavior: 'normal', threat: 2,
  },
  quarter: {
    id: 'quarter', label: 'Quarter', symbol: '♩', color: '#ffcc00',
    band: 'mid', moveEveryTicks: QUARTER_TICKS, maxHp: 3, behavior: 'normal', threat: 1,
  },
  half: {
    id: 'half', label: 'Half', symbol: '𝅗𝅥', color: '#44ddff',
    band: 'low', moveEveryTicks: HALF_TICKS, maxHp: 5, behavior: 'normal', threat: 2,
  },
  whole: {
    id: 'whole', label: 'Whole', symbol: '𝅝', color: '#aa55ff',
    band: 'low', moveEveryTicks: WHOLE_TICKS, maxHp: 9, behavior: 'normal', threat: 3,
  },
  dotted: {
    id: 'dotted', label: 'Dotted Quarter', symbol: '♩.', color: '#ffdd66',
    band: 'mid', moveEveryTicks: DOTTED_QUARTER_TICKS, maxHp: 5, behavior: 'normal', threat: 2,
  },
  triplet: {
    id: 'triplet', label: 'Triplet', symbol: '♪³', color: '#66ffcc',
    band: 'high', moveEveryTicks: EIGHTH_TICKS, maxHp: 2, behavior: 'normal', threat: 3,
  },
  accidental: {
    id: 'accidental', label: 'Accidental', symbol: '♯', color: '#ff66ff',
    band: 'mid', moveEveryTicks: QUARTER_TICKS, maxHp: 5, behavior: 'accidental', threat: 3,
  },
  crescendo: {
    id: 'crescendo', label: 'Crescendo', symbol: '<', color: '#ff4444',
    band: 'low', moveEveryTicks: HALF_TICKS, maxHp: 9, behavior: 'crescendo', threat: 4,
  },
  fermata: {
    id: 'fermata', label: 'Fermata', symbol: '𝄐', color: '#88aaff',
    band: 'low', moveEveryTicks: QUARTER_TICKS, maxHp: 7, behavior: 'fermata', threat: 3,
  },
  tied: {
    id: 'tied', label: 'Tied Pair', symbol: '♩‿♩', color: '#44ffdd',
    band: 'mid', moveEveryTicks: QUARTER_TICKS, maxHp: 6, behavior: 'tied', threat: 3,
  },
};

export function getEnemyDef(id: string): EnemyDef | undefined {
  return ENEMY_DEFS[id];
}

export const ENEMY_IDS: string[] = Object.keys(ENEMY_DEFS);
