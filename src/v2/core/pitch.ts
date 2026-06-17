/**
 * pitch.ts — Canonical frequency / pitch math. The single source of truth.
 *
 * Every hertz/semitone calculation in the game (combat damage matching,
 * notation popups, oscillator voicing, the pitch-module family) routes
 * through these helpers. Do not re-derive pitch math anywhere else.
 *
 * Canonical resonance Hz per band:
 *   low  → A3 = 220 Hz
 *   mid  → A4 = 440 Hz
 *   high → A5 = 880 Hz
 * Adjacent bands are exactly one octave (12 semitones) apart.
 */

import { FrequencyBand } from './events';

export const A4_HZ = 440;
export const A4_MIDI = 69;

export const BAND_HZ: Record<FrequencyBand, number> = { low: 220, mid: 440, high: 880 };

export function bandToHz(band: FrequencyBand): number {
  return BAND_HZ[band];
}

/** MIDI note number → Hz. 440 × 2^((pitch − 69) / 12). */
export function midiPitchToHz(pitch: number): number {
  return A4_HZ * Math.pow(2, (pitch - A4_MIDI) / 12);
}

/** Hz → fractional MIDI note number (inverse of midiPitchToHz). */
export function hzToMidiFloat(hz: number): number {
  if (!Number.isFinite(hz) || hz <= 0) return A4_MIDI;
  return A4_MIDI + 12 * Math.log2(hz / A4_HZ);
}

/** Absolute semitone distance between two frequencies. 0 if either is invalid. */
export function semitoneDistance(aHz: number, bHz: number): number {
  if (!Number.isFinite(aHz) || !Number.isFinite(bHz) || aHz <= 0 || bHz <= 0) return 0;
  return Math.abs(12 * Math.log2(aHz / bHz));
}

/** Shift a base frequency up/down by a (possibly fractional) number of semitones. */
export function applySemitoneOffset(baseHz: number, semitones: number): number {
  const base = Number.isFinite(baseHz) && baseHz > 0 ? baseHz : A4_HZ;
  return base * Math.pow(2, semitones / 12);
}

/** Convert a band + semitone offset to Hz (band-anchored voicing). */
export function pitchOffsetToHz(band: FrequencyBand, semitones: number): number {
  return applySemitoneOffset(bandToHz(band), semitones);
}

/**
 * Piecewise-linear damage multiplier from a semitone distance:
 *   0 st -> x5.0, 6 st -> x1.1 (near match), 12 st -> x0.15, 14+ st -> x0.0.
 * Exact resonance should feel decisive, near matches should still contribute,
 * and octave/register mistakes should read as inefficient instead of useless.
 */
export function damageMultiplierForSemitoneDistance(distance: number): number {
  const dist = Math.abs(distance);
  if (dist <= 6) return Math.max(1.1, 5 - 0.65 * dist);
  if (dist <= 12) return 1.1 - (dist - 6) * (0.95 / 6);
  const raw = 0.15 - (dist - 12) * 0.075;
  return Math.max(0, Math.min(5, raw));
}

/** Damage multiplier directly from two frequencies. */
export function damageMultiplier(aHz: number, bHz: number): number {
  return damageMultiplierForSemitoneDistance(semitoneDistance(aHz, bHz));
}

/** Compact Hz display, e.g. "440" or "1.2k". */
export function formatHz(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) return '—';
  if (hz >= 1000) return `${(hz / 1000).toFixed(1)}k`;
  return String(Math.round(hz));
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** MIDI note number → scientific note name, e.g. 69 → "A4". */
export function formatNoteNameFromMidi(pitch: number): string {
  if (!Number.isFinite(pitch)) return '—';
  const p = Math.round(pitch);
  const name = NOTE_NAMES[((p % 12) + 12) % 12];
  const octave = Math.floor(p / 12) - 1;
  return `${name}${octave}`;
}
