/**
 * ticks.ts — Project-wide integer musical timing.
 *
 * All authored score data, clock subdivisions, delays, and phase offsets use
 * integer ticks at PPQ resolution. Seconds exist only at the transport /
 * audio-scheduling boundary.
 */

/** Ticks per quarter note. 48 divides cleanly into 16ths (12), 32nds (6),
 *  8th triplets (16) and 16th triplets (8). */
export const PPQ = 48;

/** 4/4 only (constrained notation model). */
export const BEATS_PER_MEASURE = 4;
export const TICKS_PER_MEASURE = PPQ * BEATS_PER_MEASURE; // 192

export const WHOLE_TICKS = PPQ * 4;       // 192
export const HALF_TICKS = PPQ * 2;        // 96
export const QUARTER_TICKS = PPQ;         // 48
export const EIGHTH_TICKS = PPQ / 2;      // 24
export const SIXTEENTH_TICKS = PPQ / 4;   // 12
export const DOTTED_HALF_TICKS = PPQ * 3;       // 144
export const DOTTED_QUARTER_TICKS = PPQ * 1.5;  // 72
export const DOTTED_EIGHTH_TICKS = PPQ * 0.75;  // 36
export const EIGHTH_TRIPLET_TICKS = PPQ / 3;    // 16

export function ticksToSec(ticks: number, bpm: number): number {
  return (ticks * 60) / (bpm * PPQ);
}

export function secToTicksFloat(sec: number, bpm: number): number {
  return (sec * bpm * PPQ) / 60;
}

export function secPerTick(bpm: number): number {
  return 60 / (bpm * PPQ);
}

export function measureOfTick(tick: number): number {
  return Math.floor(tick / TICKS_PER_MEASURE);
}

export function tickWithinMeasure(tick: number): number {
  return ((tick % TICKS_PER_MEASURE) + TICKS_PER_MEASURE) % TICKS_PER_MEASURE;
}

export function isIntegerTick(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}
