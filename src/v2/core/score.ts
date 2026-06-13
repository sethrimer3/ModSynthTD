/**
 * score.ts — Authored wave scores: the single source of truth for waves.
 *
 * A WaveScore is integer-tick sheet music. It compiles into:
 *  - the enemy spawn schedule (combat)
 *  - notation layout data (glowing sheet-music preview)
 *  - optional preview-audio events
 * The notation, spawn schedule, transport, and audio never reinterpret
 * timing independently.
 */

import { FrequencyBand } from './events';
import { TICKS_PER_MEASURE, isIntegerTick } from './ticks';
import { getEnemyDef } from './enemy-defs';

// ── Schema ──────────────────────────────────────────────────────────────────

export interface ScoreNote {
  /** Integer onset tick from wave start. */
  tick: number;
  /** Integer duration in ticks (notation value; > 0). */
  durationTicks: number;
  enemyTypeId: string;
  /** Override the enemy's default resonance band (accidental notation). */
  band?: FrequencyBand;
  /** Lane index for multi-lane tracks (0 = primary path). */
  lane?: number;
  /** Chord group id: notes sharing a group spawn simultaneously as a formation. */
  chordGroup?: string;
  /** Tie to the next note of the same lane/enemy (rendering + tied-pair spawn). */
  tieToNext?: boolean;
  /** MIDI note number (0–127) preserved from the source MIDI file, if any. */
  midiPitch?: number;
  /** Exact frequency in Hz derived from midiPitch: 440 × 2^((pitch−69)/12). */
  hertz?: number;
}

export interface WaveScore {
  waveId: string;
  /** Number of 4/4 measures the wave notation spans. */
  measures: number;
  notes: ScoreNote[];
  /** Optional human title shown above the staff. */
  title?: string;
}

// ── Validation ──────────────────────────────────────────────────────────────

export interface ScoreIssue {
  severity: 'error' | 'warning';
  message: string;
  noteIndex?: number;
}

export function validateWaveScore(score: WaveScore, laneCount = 1): ScoreIssue[] {
  const issues: ScoreIssue[] = [];
  if (!score.waveId) issues.push({ severity: 'error', message: 'Wave has no id.' });
  if (!Number.isInteger(score.measures) || score.measures < 1) {
    issues.push({ severity: 'error', message: `Wave ${score.waveId}: invalid measure count ${score.measures}.` });
  }
  const totalTicks = score.measures * TICKS_PER_MEASURE;
  if (score.notes.length === 0) {
    issues.push({ severity: 'error', message: `Wave ${score.waveId}: no notes.` });
  }
  score.notes.forEach((n, i) => {
    if (!isIntegerTick(n.tick)) {
      issues.push({ severity: 'error', message: `Wave ${score.waveId} note ${i}: non-integer or negative tick ${n.tick}.`, noteIndex: i });
    }
    if (!Number.isInteger(n.durationTicks) || n.durationTicks <= 0) {
      issues.push({ severity: 'error', message: `Wave ${score.waveId} note ${i}: non-positive duration ${n.durationTicks}.`, noteIndex: i });
    }
    if (n.tick >= totalTicks) {
      issues.push({ severity: 'error', message: `Wave ${score.waveId} note ${i}: onset ${n.tick} beyond ${score.measures} measures.`, noteIndex: i });
    }
    if (n.tick + n.durationTicks > totalTicks) {
      issues.push({ severity: 'warning', message: `Wave ${score.waveId} note ${i}: duration spills past the final barline.`, noteIndex: i });
    }
    if (!getEnemyDef(n.enemyTypeId)) {
      issues.push({ severity: 'error', message: `Wave ${score.waveId} note ${i}: unknown enemy "${n.enemyTypeId}".`, noteIndex: i });
    }
    if (n.band && !['low', 'mid', 'high'].includes(n.band)) {
      issues.push({ severity: 'error', message: `Wave ${score.waveId} note ${i}: invalid band ${n.band}.`, noteIndex: i });
    }
    if (n.lane !== undefined && (!Number.isInteger(n.lane) || n.lane < 0 || n.lane >= laneCount)) {
      issues.push({ severity: 'error', message: `Wave ${score.waveId} note ${i}: lane ${n.lane} outside 0..${laneCount - 1}.`, noteIndex: i });
    }
  });
  // Tie continuity: a tieToNext must have a following note in the same lane.
  const sorted = [...score.notes].sort((a, b) => a.tick - b.tick);
  sorted.forEach((n, i) => {
    if (n.tieToNext) {
      const next = sorted.slice(i + 1).find(m => (m.lane ?? 0) === (n.lane ?? 0) && m.enemyTypeId === n.enemyTypeId);
      if (!next) issues.push({ severity: 'warning', message: `Wave ${score.waveId}: tie with no continuation.`, noteIndex: i });
    }
  });
  return issues;
}

// ── Compilation ─────────────────────────────────────────────────────────────

export interface SpawnEvent {
  /** Absolute integer tick from wave start. */
  tick: number;
  enemyTypeId: string;
  band: FrequencyBand;
  lane: number;
  /** Stable index for deterministic per-enemy seeds. */
  spawnIndex: number;
  chordGroup?: string;
  tiedToNext?: boolean;
  durationTicks: number;
  /** MIDI note number preserved from source MIDI file, if any. */
  midiPitch?: number;
  /** Exact frequency in Hz from MIDI pitch. Takes priority over band-derived Hz in damage/popup. */
  hertz?: number;
}

export interface CompiledScore {
  waveId: string;
  measures: number;
  totalTicks: number;
  spawns: SpawnEvent[];
}

/** Deterministic: same score always compiles to the same spawn schedule. */
export function compileScore(score: WaveScore): CompiledScore {
  const spawns: SpawnEvent[] = [...score.notes]
    .sort((a, b) => a.tick - b.tick || (a.lane ?? 0) - (b.lane ?? 0) || a.enemyTypeId.localeCompare(b.enemyTypeId))
    .map((n, i) => {
      const def = getEnemyDef(n.enemyTypeId);
      return {
        tick: n.tick,
        enemyTypeId: n.enemyTypeId,
        band: n.band ?? def?.band ?? 'mid',
        lane: n.lane ?? 0,
        spawnIndex: i,
        chordGroup: n.chordGroup,
        tiedToNext: n.tieToNext,
        durationTicks: n.durationTicks,
        midiPitch: n.midiPitch,
        hertz: n.hertz,
      };
    });
  return {
    waveId: score.waveId,
    measures: score.measures,
    totalTicks: score.measures * TICKS_PER_MEASURE,
    spawns,
  };
}
