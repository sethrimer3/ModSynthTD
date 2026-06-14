/**
 * pitch.ts (ui) — Thin re-export of the canonical pitch math in core/pitch.ts.
 *
 * Kept so existing UI imports (`./pitch`) stay valid. All real math lives in
 * src/v2/core/pitch.ts — do not duplicate it here.
 */

export {
  BAND_HZ,
  bandToHz,
  pitchOffsetToHz,
  semitoneDistance,
  damageMultiplier,
  midiPitchToHz,
  hzToMidiFloat,
  applySemitoneOffset,
  damageMultiplierForSemitoneDistance,
  formatHz,
  formatNoteNameFromMidi,
} from '../core/pitch';
