/**
 * pitch.ts — Frequency/pitch helpers shared by combat damage and notation popups.
 *
 * Canonical resonance Hz per band:
 *   low  → A3 = 220 Hz
 *   mid  → A4 = 440 Hz
 *   high → A5 = 880 Hz
 *
 * Adjacent bands are exactly one octave (12 semitones) apart, so cross-band
 * shots at 12 st get ×0.25 damage; same-band exact-pitch shots get ×4.
 */

import { FrequencyBand } from '../core/events';

export const BAND_HZ: Record<FrequencyBand, number> = { low: 220, mid: 440, high: 880 };

export function bandToHz(band: FrequencyBand): number {
  return BAND_HZ[band];
}

/** Convert a band + semitone offset (from SignalEvent.pitchOffset) to Hz. */
export function pitchOffsetToHz(band: FrequencyBand, semitones: number): number {
  return bandToHz(band) * Math.pow(2, semitones / 12);
}

/** Absolute semitone distance between two frequencies. Returns 0 if either is invalid. */
export function semitoneDistance(hz1: number, hz2: number): number {
  if (!Number.isFinite(hz1) || !Number.isFinite(hz2) || hz1 <= 0 || hz2 <= 0) return 0;
  return Math.abs(12 * Math.log2(hz1 / hz2));
}

/**
 * Piecewise-linear damage multiplier from semitone distance:
 *   0 st  → ×4.0   (exact match)
 *   2 st  → ×3.0
 *   4 st  → ×2.0
 *   6 st  → ×1.0   (pivot)
 *   8 st  → ×0.75
 *  10 st  → ×0.5
 *  12 st  → ×0.25
 *  14+ st → ×0.0
 *
 * Formulas:
 *   dist ∈ [0, 6]  → 4 − 0.5 × dist
 *   dist ∈ [6, 14] → 1 − (dist − 6) / 8
 *   clamped to [0, 4]
 */
export function damageMultiplier(hz1: number, hz2: number): number {
  const dist = semitoneDistance(hz1, hz2);
  const raw = dist <= 6 ? 4 - 0.5 * dist : 1 - (dist - 6) / 8;
  return Math.max(0, Math.min(4, raw));
}
