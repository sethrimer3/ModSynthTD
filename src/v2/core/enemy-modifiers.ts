/**
 * enemy-modifiers.ts — Centralized player-facing descriptions of enemy behaviors.
 *
 * All behavior text, notation marks, and modifier hint logic lives here so that
 * popup text, notation overlays, and patch-analysis hints stay consistent without
 * duplicating behavior logic from enemy-defs.ts or combat.ts.
 */

import { EnemyBehavior } from './enemy-defs';

// ── Behavior descriptions ────────────────────────────────────────────────────

/** One-line player-facing description for each enemy behavior. */
export const BEHAVIOR_DESCRIPTION: Record<EnemyBehavior, string> = {
  normal:     'None',
  accidental: 'Shifts resonance band with every step',
  crescendo:  'Gains damage resistance as it advances',
  fermata:    'Pauses at midpoint for one full measure',
  tied:       'Shares HP pool with its paired enemy',
  chord:      'Spawns simultaneously with its chord group',
};

/** Short tactical note shown below the description in popups. */
export const BEHAVIOR_TACTIC: Partial<Record<EnemyBehavior, string>> = {
  accidental: 'Pitch Memory or Target Tuner helps track shifting bands.',
  crescendo:  'Deal burst damage early before resistance builds.',
  fermata:    'Use Delay or Phase to keep fire constant during pauses.',
  tied:       'Both members must be defeated together — pool resets neither.',
  chord:      'Multiple enemies spawn at once — burst fire or Harmonizer helps.',
};

/** Notation mark glyph for each behavior (drawn above the staff). */
export const BEHAVIOR_MARK: Partial<Record<EnemyBehavior, string>> = {
  accidental: '♯',
  crescendo:  '<',
  fermata:    '𝄐',
  tied:       '‿',
  // chord: no above-staff glyph; handled with a bracket overlay
};

/** Threat label for each behavior shown in the note popup. */
export const BEHAVIOR_THREAT_LABEL: Record<EnemyBehavior, string | null> = {
  normal:     null,
  accidental: 'Pitch Shifter',
  crescendo:  'Tank',
  fermata:    'Staller',
  tied:       'Linked Pair',
  chord:      'Formation',
};

// ── Modifier stat summary ────────────────────────────────────────────────────

/** Counters accumulated per wave for post-wave summary lines. */
export interface ModifierStats {
  accidentalShifts: number;      // total band shifts (≥1 per accidental that moved)
  crescendoResisted: number;     // hits absorbed by crescendo resistance (damage_taken < damage_dealt)
  fermataHolds: number;          // number of fermata enemies that completed a hold
  tiedPairsDefeated: number;     // full tied pairs killed (pool drained)
  tiedPairsTotal: number;        // full tied pairs spawned
  chordGroupsSpawned: number;    // distinct chord groups
}

export function emptyModifierStats(): ModifierStats {
  return {
    accidentalShifts: 0,
    crescendoResisted: 0,
    fermataHolds: 0,
    tiedPairsDefeated: 0,
    tiedPairsTotal: 0,
    chordGroupsSpawned: 0,
  };
}

/**
 * Build compact summary lines for behaviors that were active this wave.
 * Returns at most one sentence per notable stat.
 */
export function modifierSummaryLines(stats: ModifierStats): string[] {
  const lines: string[] = [];
  if (stats.accidentalShifts > 0) {
    lines.push(`Accidentals caused ${stats.accidentalShifts} pitch shift${stats.accidentalShifts !== 1 ? 's' : ''}.`);
  }
  if (stats.crescendoResisted > 0) {
    lines.push(`Crescendos absorbed ${stats.crescendoResisted} damage${stats.crescendoResisted !== 1 ? 's' : ''} via resistance.`);
  }
  if (stats.fermataHolds > 0) {
    lines.push(`Fermata pause${stats.fermataHolds !== 1 ? 's' : ''}: ${stats.fermataHolds} mid-track hold${stats.fermataHolds !== 1 ? 's' : ''}.`);
  }
  if (stats.tiedPairsTotal > 0) {
    lines.push(`Tied pairs: ${stats.tiedPairsDefeated}/${stats.tiedPairsTotal} defeated.`);
  }
  return lines;
}

// ── Patch-analysis modifier hints ────────────────────────────────────────────

export interface BehaviorCounts {
  accidental: number;
  crescendo: number;
  fermata: number;
  tied: number;
  chord: number;
}

/**
 * Return up to 1 modifier-specific hint string for a wave,
 * given behavior counts and the set of module typeIds available to the player.
 */
export function modifierHint(
  counts: BehaviorCounts,
  rackTypeIds: Set<string>,
  blueprintTypeIds: Set<string>,
): string | null {
  const has = (id: string) => rackTypeIds.has(id) || blueprintTypeIds.has(id);
  const total = counts.accidental + counts.crescendo + counts.fermata + counts.tied + counts.chord;
  if (total === 0) return null;

  // Pick the most common non-normal behavior.
  const dominant = ([
    ['accidental', counts.accidental],
    ['crescendo',  counts.crescendo],
    ['fermata',    counts.fermata],
    ['tied',       counts.tied],
    ['chord',      counts.chord],
  ] as [string, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])[0]?.[0];

  if (!dominant) return null;

  switch (dominant) {
    case 'accidental':
      if (has('pitchMemory')) return `${counts.accidental} Accidentals shift bands — Pitch Memory can track them.`;
      if (has('targetTuner')) return `${counts.accidental} Accidentals shift bands — Target Tuner auto-follows.`;
      return `${counts.accidental} Accidentals shift resonance bands — Pitch Dial or Octave Switch may help.`;
    case 'crescendo':
      if (has('amp')) return `${counts.crescendo} Crescendos gain resistance late — front-load damage with Amp.`;
      if (has('delay')) return `${counts.crescendo} Crescendos resist late hits — Delay echoes early in the lane.`;
      return `${counts.crescendo} Crescendos resist late damage — hit them early.`;
    case 'fermata':
      if (has('delay')) return `${counts.fermata} Fermatas pause mid-track — Delay keeps projectiles flowing during holds.`;
      if (has('phase')) return `${counts.fermata} Fermatas create pause windows — Phase can fill the gap.`;
      return `${counts.fermata} Fermatas pause at midpoint for one measure.`;
    case 'tied':
      if (has('splitter')) return `${counts.tied} Tied Pairs share HP — Splitter multi-lane pressure drains them.`;
      return `${counts.tied} Tied Pairs share one HP pool — sustained fire defeats both.`;
    case 'chord':
      if (has('harmonizer')) return `${counts.chord} Chord groups spawn together — Harmonizer covers multiple bands.`;
      if (has('router'))     return `${counts.chord} Chord groups — Pitch Router can route to multiple bands.`;
      if (has('splitter'))   return `${counts.chord} Chord groups — Splitter can hit all formation members.`;
      return `${counts.chord} Chord groups spawn simultaneously — wide-fire coverage helps.`;
    default:
      return null;
  }
}
