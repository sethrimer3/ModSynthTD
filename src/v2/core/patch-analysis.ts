/**
 * patch-analysis.ts — Pure, read-only pre-wave patch diagnostics.
 *
 * Input:  CompiledScore (enemy spawn schedule), evaluated SignalEvents per
 *         output module, the current RackGraph, and tower placement state.
 * Output: A serializable PatchAnalysis summary — no side effects, no DOM,
 *         no mutation of game state.
 *
 * All Hz/semitone math is delegated to core/pitch.ts.
 */

import { CompiledScore } from './score';
import { SignalEvent, FrequencyBand } from './events';
import {
  bandToHz,
  damageMultiplier,
  formatHz,
  formatNoteNameFromMidi,
  hzToMidiFloat,
  semitoneDistance,
} from './pitch';
import { getEnemyDef } from './enemy-defs';
import { RackGraph } from './graph';
import { modifierHint, BehaviorCounts } from './enemy-modifiers';

// ── Public types ─────────────────────────────────────────────────────────────

export interface EnemyGroup {
  hz: number;
  /** Scientific note name when the spawn carries MIDI pitch, otherwise null. */
  noteName: string | null;
  band: FrequencyBand;
  count: number;
  totalHp: number;
  /** Unique enemy symbols present in this group. */
  symbols: string[];
  /** Human label, e.g. "A4 · 440 Hz" or "mid · 440 Hz". */
  label: string;
}

export interface OutputSummary {
  outputModuleId: string;
  isPlaced: boolean;
  eventCount: number;
  /** Most common output frequency among voiced events, or null if no voice. */
  dominantHz: number | null;
  /** True if any event in this output's stream has hasVoice = true. */
  hasVoice: boolean;
  /** True if the output module's synthOn setting is enabled. */
  synthOn: boolean;
  /** Non-null when this output has a notable problem. */
  warning: string | null;
}

export type MatchRating = 'excellent' | 'good' | 'weak' | 'bad';

export interface MatchRow {
  group: EnemyGroup;
  /** Hz of the best-matching output event; null if no voiced output exists. */
  bestOutputHz: number | null;
  multiplier: number;
  rating: MatchRating;
}

export interface PatchAnalysis {
  totalEnemies: number;
  enemyGroups: EnemyGroup[];
  outputSummaries: OutputSummary[];
  matchRows: MatchRow[];
  overallRating: MatchRating;
  /** Up to 2 short, actionable tuning hints for the player. */
  hints: string[];
}

// ── Analysis options ─────────────────────────────────────────────────────────

export interface AnalysisOptions {
  compiled: CompiledScore;
  /** Output module ID → evaluated SignalEvents for that output. */
  eventsByOutput: Map<string, SignalEvent[]>;
  graph: RackGraph;
  /** Set of output module IDs that currently have a tower placed. */
  placedOutputIds: Set<string>;
  /** TypeIds of modules already in this rack. Used for hint generation. */
  rackTypeIds: Set<string>;
  /** TypeIds unlocked as blueprints (available to buy). Used for hints. */
  blueprintTypeIds: Set<string>;
  /** Number of enemy lanes in the world. Used to detect under-coverage. */
  laneCount?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ratingFor(multiplier: number): MatchRating {
  if (multiplier >= 3.5) return 'excellent';
  if (multiplier >= 2.0) return 'good';
  if (multiplier >= 0.75) return 'weak';
  return 'bad';
}

/** Bin spawns by effective Hz, merging bins within 1 semitone of each other. */
function groupEnemiesByHz(compiled: CompiledScore): EnemyGroup[] {
  // Collect (hz, band, midiPitch?, enemyTypeId) tuples.
  const entries: Array<{ hz: number; band: FrequencyBand; midiPitch: number | null; typeId: string }> = [];
  for (const spawn of compiled.spawns) {
    const hz = spawn.hertz ?? bandToHz(spawn.band);
    entries.push({ hz, band: spawn.band, midiPitch: spawn.midiPitch ?? null, typeId: spawn.enemyTypeId });
  }

  // Sort by Hz ascending so nearby bins cluster together.
  entries.sort((a, b) => a.hz - b.hz);

  // Greedy merge: place each entry into an existing bin if within 1 semitone.
  const bins: Array<{
    hz: number; band: FrequencyBand; midiPitch: number | null;
    typeIds: string[]; count: number;
  }> = [];
  for (const e of entries) {
    const existing = bins.find(b => semitoneDistance(b.hz, e.hz) < 1.0);
    if (existing) {
      existing.count++;
      if (!existing.typeIds.includes(e.typeId)) existing.typeIds.push(e.typeId);
    } else {
      bins.push({ hz: e.hz, band: e.band, midiPitch: e.midiPitch, typeIds: [e.typeId], count: 1 });
    }
  }

  // Map each spawn's Hz to its bin to accumulate HP.
  const hpByHz = new Map<number, number>();
  for (const spawn of compiled.spawns) {
    const hz = spawn.hertz ?? bandToHz(spawn.band);
    const bin = bins.find(b => semitoneDistance(b.hz, hz) < 1.0);
    if (!bin) continue;
    const def = getEnemyDef(spawn.enemyTypeId);
    hpByHz.set(bin.hz, (hpByHz.get(bin.hz) ?? 0) + (def?.maxHp ?? 1));
  }

  return bins.map(bin => {
    const noteName = bin.midiPitch != null ? formatNoteNameFromMidi(bin.midiPitch) : null;
    const label = noteName
      ? `${noteName} · ${formatHz(bin.hz)} Hz`
      : `${bin.band} · ${formatHz(bin.hz)} Hz`;
    const symbols = [...new Set(
      bin.typeIds.map(id => getEnemyDef(id)?.symbol ?? '?')
    )];
    return {
      hz: bin.hz,
      noteName,
      band: bin.band,
      count: bin.count,
      totalHp: hpByHz.get(bin.hz) ?? 0,
      symbols,
      label,
    };
  });
}

/** Dominant output Hz: most frequently occurring voiced Hz across all events. */
function dominantOutputHz(events: SignalEvent[]): number | null {
  const voiced = events.filter(e => e.hasVoice && e.hertz != null && e.hertz > 0);
  if (voiced.length === 0) return null;

  // Bin by MIDI pitch (integer), pick the most populated bin.
  const counts = new Map<number, { hz: number; n: number }>();
  for (const e of voiced) {
    const midi = Math.round(hzToMidiFloat(e.hertz!));
    const entry = counts.get(midi);
    if (entry) { entry.n++; }
    else { counts.set(midi, { hz: e.hertz!, n: 1 }); }
  }
  let best: { hz: number; n: number } | null = null;
  for (const v of counts.values()) {
    if (!best || v.n > best.n) best = v;
  }
  return best?.hz ?? null;
}

/** Collect all unique voiced Hz values from all outputs. */
function allOutputHz(eventsByOutput: Map<string, SignalEvent[]>): number[] {
  const hzSet: number[] = [];
  for (const events of eventsByOutput.values()) {
    for (const e of events) {
      if (e.hasVoice && e.hertz != null && e.hertz > 0) {
        if (!hzSet.some(h => semitoneDistance(h, e.hertz!) < 0.5)) {
          hzSet.push(e.hertz);
        }
      }
    }
  }
  return hzSet;
}

/** Best damage multiplier any output Hz achieves against a given enemy Hz. */
function bestMultiplierAgainst(enemyHz: number, outputHzList: number[]): { hz: number | null; mult: number } {
  let bestMult = 0;
  let bestHz: number | null = null;
  for (const hz of outputHzList) {
    const m = damageMultiplier(enemyHz, hz);
    if (m > bestMult) { bestMult = m; bestHz = hz; }
  }
  return { hz: bestHz, mult: bestMult };
}

// ── Hint generation ──────────────────────────────────────────────────────────

function generateHints(
  groups: EnemyGroup[],
  outputHzList: number[],
  matchRows: MatchRow[],
  rackTypeIds: Set<string>,
  blueprintTypeIds: Set<string>,
  behaviorCounts: BehaviorCounts,
  outputCount: number,
  placedCount: number,
  laneCount: number,
): string[] {
  const hints: string[] = [];

  // Two-lane coverage warning: surfaces before Hz hints because it's structural.
  if (laneCount >= 2 && outputCount < 2 && hints.length < 2) {
    hints.push(`Two lanes detected — add a second Output module and tower to cover the far path.`);
  } else if (laneCount >= 2 && placedCount < 2 && outputCount >= 2 && hints.length < 2) {
    hints.push(`You have two Output modules but only one tower placed — place a second tower on the far lane.`);
  }

  if (groups.length === 0 || outputHzList.length === 0) return hints;

  const weakOrBad = matchRows.filter(r => r.rating === 'weak' || r.rating === 'bad');
  if (weakOrBad.length === 0) return hints;

  // Compute median signed semitone offset from best output to each enemy group.
  const offsets: number[] = [];
  for (const row of matchRows) {
    if (row.bestOutputHz == null) continue;
    // Signed: positive means output is too high.
    const signed = 12 * Math.log2(row.bestOutputHz / row.group.hz);
    offsets.push(signed);
  }
  const medianOffset = offsets.length
    ? offsets.slice().sort((a, b) => a - b)[Math.floor(offsets.length / 2)]
    : 0;

  const absMedian = Math.abs(medianOffset);
  const uniqueGroupHz = [...new Set(groups.map(g => Math.round(hzToMidiFloat(g.hz))))];
  const uniqueOutputHz = [...new Set(outputHzList.map(h => Math.round(hzToMidiFloat(h))))];

  // Octave offset hint.
  if (absMedian >= 9 && absMedian <= 15) {
    const dir = medianOffset > 0 ? 'down' : 'up';
    if (rackTypeIds.has('octave') || blueprintTypeIds.has('octave')) {
      hints.push(`Patch is ~1 octave too ${dir === 'down' ? 'high' : 'low'} — try an Octave Switch to shift ${dir}.`);
    } else {
      hints.push(`Patch is ~1 octave off. Add an Octave Switch module to correct it.`);
    }
  }
  // Small semitone drift hint.
  else if (absMedian >= 1 && absMedian < 6 && hints.length === 0) {
    if (rackTypeIds.has('pitch') || blueprintTypeIds.has('pitch')) {
      hints.push(`Output is ~${Math.round(absMedian)} semitone${Math.round(absMedian) !== 1 ? 's' : ''} ${medianOffset > 0 ? 'sharp' : 'flat'} — adjust the Pitch Dial.`);
    } else {
      hints.push(`Output pitch is slightly off. A Pitch Dial module can fine-tune it.`);
    }
  }

  // Multiple pitches needed but only one output pitch found.
  if (uniqueGroupHz.length >= 3 && uniqueOutputHz.length <= 1 && hints.length < 2) {
    if (rackTypeIds.has('sequencer')) {
      hints.push(`Wave has ${uniqueGroupHz.length} distinct pitches — a Sequencer can cycle through them.`);
    } else if (rackTypeIds.has('arp')) {
      hints.push(`Wave has ${uniqueGroupHz.length} distinct pitches — an Arpeggiator can hit multiple frequencies.`);
    } else if (blueprintTypeIds.has('sequencer')) {
      hints.push(`Wave has ${uniqueGroupHz.length} distinct pitches. Try adding a Sequencer module.`);
    }
  }

  // Dense / chord wave hint.
  const chordSpawns = groups.filter(g => g.count >= 3 && groups.length >= 3);
  if (chordSpawns.length > 0 && hints.length < 2) {
    if (rackTypeIds.has('harmonizer') || blueprintTypeIds.has('harmonizer')) {
      hints.push(`Dense chord wave ahead — a Harmonizer can cover multiple bands at once.`);
    }
  }

  // Basic band mismatch hint for early-game players with no pitch tools.
  const hasPitchTools = rackTypeIds.has('pitch') || rackTypeIds.has('octave') || rackTypeIds.has('targetTuner')
    || blueprintTypeIds.has('pitch') || blueprintTypeIds.has('octave');
  const overallBad = matchRows.filter(r => r.rating === 'bad').length;
  if (overallBad >= Math.ceil(matchRows.length / 2) && hints.length < 2) {
    if (!hasPitchTools && rackTypeIds.has('osc')) {
      const enemyBands = [...new Set(groups.map(g => g.band))];
      const bandLabel = enemyBands.length === 1 ? ({ low: 'LO', mid: 'MI', high: 'HI' } as const)[enemyBands[0]] : null;
      if (bandLabel) {
        hints.push(`All enemies are ${bandLabel} band — set your OSC Band to ${bandLabel} for up to ×4 damage.`);
      } else {
        hints.push(`Enemies span multiple bands — try changing OSC Band (HI/MI/LO) to match the colored rings.`);
      }
    } else if (blueprintTypeIds.has('targetTuner')) {
      hints.push(`Many enemies mismatched. Target Tuner auto-tunes output to the nearest enemy.`);
    }
  }

  // Timing coverage hint: syncopated wave but no timing module in rack.
  const hasTimingTool = rackTypeIds.has('delay') || rackTypeIds.has('phase') || rackTypeIds.has('clockdiv') || rackTypeIds.has('envelope');
  if (!hasTimingTool && hints.length < 2 && (blueprintTypeIds.has('delay') || blueprintTypeIds.has('phase'))) {
    hints.push(`Wave has varied timing — a DELAY or PHASE module shifts your fire rhythm to match off-beat spawns.`);
  }

  // Modifier-specific hint (if slot still available).
  if (hints.length < 2) {
    const mh = modifierHint(behaviorCounts, rackTypeIds, blueprintTypeIds);
    if (mh) hints.push(mh);
  }

  return hints.slice(0, 2);
}

// ── Main entry ───────────────────────────────────────────────────────────────

export function analyzePatch(opts: AnalysisOptions): PatchAnalysis {
  const { compiled, eventsByOutput, graph, placedOutputIds, rackTypeIds, blueprintTypeIds, laneCount = 1 } = opts;

  // ── Enemy groups ──────────────────────────────────────────────────────────
  const enemyGroups = groupEnemiesByHz(compiled);
  const totalEnemies = compiled.spawns.length;

  // ── Output summaries ──────────────────────────────────────────────────────
  const outputModules = graph.modules.filter(m => m.typeId === 'output');
  const outputSummaries: OutputSummary[] = outputModules.map(m => {
    const events = eventsByOutput.get(m.instanceId) ?? [];
    const isPlaced = placedOutputIds.has(m.instanceId);
    const eventCount = events.length;
    const hasVoice = events.some(e => e.hasVoice);
    const domHz = dominantOutputHz(events);
    const synthOn = m.settings['synthOn'] === true;

    let warning: string | null = null;
    if (!isPlaced) warning = 'No tower placed — output has no battlefield presence.';
    else if (eventCount === 0) warning = 'No signal events reaching this output.';
    else if (!hasVoice) warning = 'Output receives signal but no voiced events — no Hz to match.';

    return { outputModuleId: m.instanceId, isPlaced, eventCount, dominantHz: domHz, hasVoice, synthOn, warning };
  });

  // ── Match diagnostics ─────────────────────────────────────────────────────
  const outputHzList = allOutputHz(eventsByOutput);
  const matchRows: MatchRow[] = enemyGroups.map(group => {
    const { hz: bestHz, mult } = bestMultiplierAgainst(group.hz, outputHzList);
    return { group, bestOutputHz: bestHz, multiplier: mult, rating: ratingFor(mult) };
  });

  // Overall rating = worst of the most populated groups (weighted by count).
  let overallRating: MatchRating = 'excellent';
  const ratingOrder: MatchRating[] = ['excellent', 'good', 'weak', 'bad'];
  let maxCount = 0;
  for (const row of matchRows) {
    if (row.group.count > maxCount) { maxCount = row.group.count; }
  }
  // Drag overall down by majority-count groups.
  for (const row of matchRows) {
    const ri = ratingOrder.indexOf(row.rating);
    const cur = ratingOrder.indexOf(overallRating);
    // Weight: groups with ≥ half the max-count population pull the rating down.
    if (row.group.count >= Math.max(1, Math.floor(maxCount / 2)) && ri > cur) {
      overallRating = row.rating;
    }
  }

  // ── Behavior counts for modifier hints ───────────────────────────────────
  const behaviorCounts: BehaviorCounts = { accidental: 0, crescendo: 0, fermata: 0, tied: 0, chord: 0 };
  for (const spawn of compiled.spawns) {
    const def = getEnemyDef(spawn.enemyTypeId);
    if (!def) continue;
    switch (def.behavior) {
      case 'accidental': behaviorCounts.accidental++; break;
      case 'crescendo':  behaviorCounts.crescendo++;  break;
      case 'fermata':    behaviorCounts.fermata++;    break;
      case 'tied':       behaviorCounts.tied++;       break;
      case 'chord':      behaviorCounts.chord++;      break;
    }
  }

  // ── Hints ─────────────────────────────────────────────────────────────────
  const hints = generateHints(
    enemyGroups, outputHzList, matchRows, rackTypeIds, blueprintTypeIds, behaviorCounts,
    outputModules.length, placedOutputIds.size, laneCount,
  );

  return { totalEnemies, enemyGroups, outputSummaries, matchRows, overallRating, hints };
}
