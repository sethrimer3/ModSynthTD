/**
 * score-dsl.ts — Compact rhythm notation for authoring wave scores.
 *
 * One string per lane; tokens are space-separated and advance a tick cursor:
 *
 *   w  whole enemy (192t)      h  half (96t)        q  quarter (48t)
 *   e  eighth (24t)            s  sixteenth (12t)   d  dotted quarter (72t)
 *   t  triplet eighth (16t)
 *   A  accidental (48t)        C  crescendo (96t)   F  fermata (48t)
 *   T  tied pair — two tied quarters (advances 96t)
 *   rw rh rq re rs rd rt       rests (advance only)
 *   |  barline assertion — cursor must sit on a measure boundary
 *   [ tok tok ]                chord: members share one onset; cursor
 *                              advances by the longest member
 *   :l :m :h                   band override suffix (low/mid/high)
 *
 * Authoring mistakes (overflow, misplaced barlines, unknown tokens) throw at
 * module load and are caught by the data validation tests.
 */

import { ScoreNote, WaveScore } from '../core/score';
import { TICKS_PER_MEASURE } from '../core/ticks';
import { FrequencyBand } from '../core/events';

interface TokenDef {
  enemyTypeId: string;
  durationTicks: number;
  tie?: boolean;
}

const TOKEN_DEFS: Record<string, TokenDef> = {
  w: { enemyTypeId: 'whole', durationTicks: 192 },
  h: { enemyTypeId: 'half', durationTicks: 96 },
  q: { enemyTypeId: 'quarter', durationTicks: 48 },
  e: { enemyTypeId: 'eighth', durationTicks: 24 },
  s: { enemyTypeId: 'sixteenth', durationTicks: 12 },
  d: { enemyTypeId: 'dotted', durationTicks: 72 },
  t: { enemyTypeId: 'triplet', durationTicks: 16 },
  A: { enemyTypeId: 'accidental', durationTicks: 48 },
  C: { enemyTypeId: 'crescendo', durationTicks: 96 },
  F: { enemyTypeId: 'fermata', durationTicks: 48 },
};

const REST_TICKS: Record<string, number> = {
  rw: 192, rh: 96, rq: 48, re: 24, rs: 12, rd: 72, rt: 16,
};

const BANDS: Record<string, FrequencyBand> = { l: 'low', m: 'mid', h: 'high' };

let chordSeq = 0;

function parseToken(raw: string): { def: TokenDef; band?: FrequencyBand } {
  let body = raw;
  let band: FrequencyBand | undefined;
  const colon = raw.indexOf(':');
  if (colon !== -1) {
    body = raw.slice(0, colon);
    const b = BANDS[raw.slice(colon + 1)];
    if (!b) throw new Error(`score-dsl: unknown band suffix in "${raw}"`);
    band = b;
  }
  const def = TOKEN_DEFS[body];
  if (!def) throw new Error(`score-dsl: unknown token "${raw}"`);
  return { def, band };
}

export function parseLane(src: string, lane: number): { notes: ScoreNote[]; endTick: number } {
  const notes: ScoreNote[] = [];
  let cursor = 0;
  const tokens = src
    .replace(/\[/g, ' [ ')
    .replace(/\]/g, ' ] ')
    .split(/\s+/)
    .filter(t => t.length > 0);
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok === '|') {
      if (cursor % TICKS_PER_MEASURE !== 0) {
        throw new Error(`score-dsl: barline at tick ${cursor} is not on a measure boundary in "${src}"`);
      }
      i++;
      continue;
    }
    if (REST_TICKS[tok] !== undefined) {
      cursor += REST_TICKS[tok];
      i++;
      continue;
    }
    if (tok === 'T') {
      // Tied pair: two quarters sharing one formation.
      notes.push({ tick: cursor, durationTicks: 48, enemyTypeId: 'tied', tieToNext: true, lane });
      notes.push({ tick: cursor + 48, durationTicks: 48, enemyTypeId: 'tied', lane });
      cursor += 96;
      i++;
      continue;
    }
    if (tok === '[') {
      const group = `g${chordSeq++}`;
      let maxDur = 0;
      i++;
      while (i < tokens.length && tokens[i] !== ']') {
        const { def, band } = parseToken(tokens[i]);
        notes.push({ tick: cursor, durationTicks: def.durationTicks, enemyTypeId: def.enemyTypeId, band, chordGroup: group, lane });
        maxDur = Math.max(maxDur, def.durationTicks);
        i++;
      }
      if (tokens[i] !== ']') throw new Error(`score-dsl: unterminated chord in "${src}"`);
      if (maxDur === 0) throw new Error(`score-dsl: empty chord in "${src}"`);
      cursor += maxDur;
      i++;
      continue;
    }
    const { def, band } = parseToken(tok);
    notes.push({ tick: cursor, durationTicks: def.durationTicks, enemyTypeId: def.enemyTypeId, band, lane });
    cursor += def.durationTicks;
    i++;
  }
  return { notes, endTick: cursor };
}

/**
 * Build a WaveScore from one rhythm string per lane.
 * The measure count is derived from the longest lane and asserted whole.
 */
export function wave(waveId: string, lanes: string[], title?: string): WaveScore {
  const notes: ScoreNote[] = [];
  let maxEnd = 0;
  lanes.forEach((src, lane) => {
    const { notes: laneNotes, endTick } = parseLane(src, lane);
    if (endTick % TICKS_PER_MEASURE !== 0) {
      throw new Error(`score-dsl: wave ${waveId} lane ${lane} ends mid-measure at tick ${endTick}`);
    }
    notes.push(...laneNotes);
    maxEnd = Math.max(maxEnd, endTick);
  });
  if (maxEnd === 0) throw new Error(`score-dsl: wave ${waveId} is empty`);
  const measures = Math.ceil(maxEnd / TICKS_PER_MEASURE);
  return { waveId, measures, notes, title };
}
