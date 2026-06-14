/**
 * events.ts — Canonical SignalEvent representation.
 *
 * One evaluated patch produces one stream of SignalEvents. Combat projectile
 * scheduling, visible cable pulses, output-tower attacks, Web Audio voices,
 * and rack test pulses all consume this same structure. Nothing else
 * (AudioNodes, DOM, canvas objects) is a source of truth for the patch.
 */

import { MAX_AMPLITUDE, MIN_AMPLITUDE } from './limits';
import { applySemitoneOffset, A4_HZ, hzToMidiFloat } from './pitch';

export type FrequencyBand = 'low' | 'mid' | 'high';
export type Waveform = 'pulse' | 'sine' | 'square' | 'saw' | 'triangle';
export type SignalDirection = 'north' | 'south' | 'east' | 'west';

export interface SignalEvent {
  /** Stable id: `${windowSeed}:${sourceModuleId}:${tick}:${branchIndex}`. */
  id: string;
  /** Integer musical tick (absolute, from wave/transport start). */
  tick: number;
  /** Integer duration in ticks (gate length basis). */
  durationTicks: number;
  /** Resonance band — combat matching and audio register. */
  band: FrequencyBand;
  /** Voice identity. Trigger-domain events keep a default until an oscillator stamps them. */
  waveform: Waveform;
  /** True once an oscillator has given the event a voice. */
  hasVoice: boolean;
  /** Bounded amplitude (combat damage scale + audio gain scale). */
  amplitude: number;
  /** Gate fraction 0..1 of durationTicks the voice is held. */
  gate: number;
  /** Attack/release shaping in ticks (set by envelope module). */
  attackTicks: number;
  releaseTicks: number;
  /** Semitone offset for audio voicing (sequencer/arp/pitch modules). Cumulative. */
  pitchOffset: number;
  /** Unshifted base frequency in Hz (stamped by the oscillator). */
  baseHz?: number;
  /** Final voiced frequency = baseHz × 2^(pitchOffset/12). Combat projectile pitch. */
  hertz?: number;
  /** Fire directions relative to tower orientation. */
  directions: SignalDirection[];
  /** Module instance ids traversed, in order (route provenance). */
  route: string[];
  /** Module instance that created the event. */
  sourceModuleId: string;
  /** Deterministic per-event seed. */
  seed: number;
  /** Free-form tags for combat/audio modifiers. */
  tags: string[];
}

export function cloneEvent(e: SignalEvent): SignalEvent {
  return {
    ...e,
    directions: e.directions.slice(),
    route: e.route.slice(),
    tags: e.tags.slice(),
  };
}

// ── Hertz model ───────────────────────────────────────────────────────────
// baseHz is the unshifted anchor; pitchOffset is the cumulative semitone shift;
// hertz is the final voiced frequency. Pitch modules mutate pitchOffset then
// recompute hertz from baseHz so the two never drift apart.

/** The anchor frequency: explicit baseHz, else current hertz, else A4. */
export function eventBaseHz(e: SignalEvent): number {
  if (Number.isFinite(e.baseHz) && (e.baseHz as number) > 0) return e.baseHz as number;
  if (Number.isFinite(e.hertz) && (e.hertz as number) > 0) return e.hertz as number;
  return A4_HZ;
}

/** Final voiced frequency, computing from base + offset if not yet stamped. */
export function eventHertz(e: SignalEvent): number {
  if (Number.isFinite(e.hertz) && (e.hertz as number) > 0) return e.hertz as number;
  return applySemitoneOffset(eventBaseHz(e), e.pitchOffset);
}

/** Recompute and store hertz from baseHz + pitchOffset. Returns the event. */
export function recomputeHertz(e: SignalEvent): SignalEvent {
  e.hertz = applySemitoneOffset(eventBaseHz(e), e.pitchOffset);
  return e;
}

/** Shift an event by N semitones: bump pitchOffset, recompute hertz. */
export function retuneEventBySemitones(e: SignalEvent, semitones: number): SignalEvent {
  e.pitchOffset += semitones;
  return recomputeHertz(e);
}

/** Retune an event so its hertz lands on (or fraction toward) a target Hz. */
export function retuneEventTowardHz(e: SignalEvent, targetHz: number, fraction = 1): SignalEvent {
  if (!Number.isFinite(targetHz) || targetHz <= 0) return e;
  const delta = (hzToMidiFloat(targetHz) - hzToMidiFloat(eventHertz(e))) * fraction;
  return retuneEventBySemitones(e, delta);
}

export function clampAmplitude(a: number): number {
  if (!Number.isFinite(a)) return MIN_AMPLITUDE;
  return Math.min(MAX_AMPLITUDE, Math.max(0, a));
}

export function isAudible(e: SignalEvent): boolean {
  return e.amplitude >= MIN_AMPLITUDE;
}

/** Stable ordering: tick, then source, then id — deterministic output order. */
export function compareEvents(a: SignalEvent, b: SignalEvent): number {
  if (a.tick !== b.tick) return a.tick - b.tick;
  if (a.sourceModuleId !== b.sourceModuleId) {
    return a.sourceModuleId < b.sourceModuleId ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
