/**
 * notation.ts — Constrained glowing sheet-music renderer.
 *
 * Renders a WaveScore (the same data that drives enemy spawning) onto a
 * cached canvas: 4/4, notes/rests/chords, eighth+sixteenth beams, ties,
 * barlines, per-lane staves, world-theme glow. Rendered once per wave —
 * never per animation frame. The playhead is an overlay the caller moves
 * using tickToX().
 */

import { compileScore, WaveScore, ScoreNote, SpawnEvent } from '../core/score';
import { TICKS_PER_MEASURE, QUARTER_TICKS, EIGHTH_TICKS, SIXTEENTH_TICKS } from '../core/ticks';
import { getEnemyDef } from '../core/enemy-defs';
import { BAND_COLORS } from './combat';
import { FrequencyBand } from '../core/events';
import { bandToHz } from './pitch';

export interface NotationLayout {
  canvas: HTMLCanvasElement;
  widthPx: number;
  heightPx: number;
  notes: NotationNoteLayout[];
  tickToX(tick: number): number;
}

export interface NotationNoteLayout extends SpawnEvent {
  x: number;
  y: number;
  color: string;
  /** Resonance frequency in Hz (derived from band). Used for stat popups and damage display. */
  hz: number;
}

const STAFF_LINE_GAP = 6;
const STAFF_H = STAFF_LINE_GAP * 4;
const LANE_GAP = 26;
const TOP_PAD = 22;
const LEFT_PAD = 34;
const RIGHT_PAD = 16;
const PX_PER_MEASURE = 150;

const BAND_Y: Record<FrequencyBand, number> = {
  high: STAFF_LINE_GAP * 0.5,
  mid: STAFF_LINE_GAP * 2,
  low: STAFF_LINE_GAP * 3.5,
};

interface PlacedNote {
  note: ScoreNote;
  x: number;
  y: number;
  staffTop: number;
  color: string;
}

export interface NotationColors {
  staffColor?: string;    // staff line rgba
  barlineColor?: string;  // barline rgba
  restColor?: string;     // rest glyph rgba
  tieColor?: string;      // tie/slur rgba
}

export function renderNotation(score: WaveScore, themeColor: string, dprScale = 2, colors?: NotationColors): NotationLayout {
  const lanes = 1 + score.notes.reduce((m, n) => Math.max(m, n.lane ?? 0), 0);
  const widthPx = LEFT_PAD + score.measures * PX_PER_MEASURE + RIGHT_PAD;
  const heightPx = TOP_PAD + lanes * (STAFF_H + LANE_GAP) + 6;

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(widthPx * dprScale);
  canvas.height = Math.ceil(heightPx * dprScale);
  canvas.style.width = `${widthPx}px`;
  canvas.style.height = `${heightPx}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dprScale, dprScale);

  const tickToX = (tick: number) => LEFT_PAD + (tick / TICKS_PER_MEASURE) * PX_PER_MEASURE;

  const staffColor  = colors?.staffColor  ?? 'rgba(110,150,210,0.35)';
  const barlineColor = colors?.barlineColor ?? 'rgba(110,150,210,0.45)';
  const barlineFinal = colors?.barlineColor
    ? colors.barlineColor.replace(/[\d.]+\)$/, () => '0.85)')
    : 'rgba(150,190,255,0.80)';
  const restColor   = colors?.restColor   ?? 'rgba(130,170,230,0.55)';
  const tieColor    = colors?.tieColor    ?? 'rgba(180,220,255,0.80)';

  // ── Staves + barlines ─────────────────────────────────────────────────────
  for (let lane = 0; lane < lanes; lane++) {
    const top = TOP_PAD + lane * (STAFF_H + LANE_GAP);
    ctx.strokeStyle = staffColor;
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const y = top + i * STAFF_LINE_GAP;
      ctx.beginPath();
      ctx.moveTo(LEFT_PAD - 8, y);
      ctx.lineTo(widthPx - RIGHT_PAD, y);
      ctx.stroke();
    }
    // Barlines.
    for (let m = 0; m <= score.measures; m++) {
      const x = tickToX(m * TICKS_PER_MEASURE);
      ctx.strokeStyle = m === score.measures ? barlineFinal : barlineColor;
      ctx.lineWidth = m === score.measures ? 2.5 : 1;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + STAFF_H);
      ctx.stroke();
    }
    // Time signature on the first lane only.
    ctx.fillStyle = barlineFinal;
    ctx.font = `bold 11px 'Pixelify Sans',serif`;
    ctx.textAlign = 'center';
    ctx.fillText('4', LEFT_PAD - 18, top + STAFF_LINE_GAP * 1.4);
    ctx.fillText('4', LEFT_PAD - 18, top + STAFF_LINE_GAP * 3.6);
    if (lanes > 1) {
      ctx.fillStyle = barlineColor;
      ctx.font = `9px 'Pixelify Sans',sans-serif`;
      ctx.fillText(`L${lane + 1}`, LEFT_PAD - 26, top + STAFF_H / 2 + 3);
    }
  }

  // ── Notes per lane ────────────────────────────────────────────────────────
  const byLane: ScoreNote[][] = Array.from({ length: lanes }, () => []);
  for (const n of score.notes) byLane[n.lane ?? 0].push(n);

  for (let lane = 0; lane < lanes; lane++) {
    const top = TOP_PAD + lane * (STAFF_H + LANE_GAP);
    const notes = byLane[lane].slice().sort((a, b) => a.tick - b.tick);

    const placed: PlacedNote[] = notes.map(n => {
      const def = getEnemyDef(n.enemyTypeId);
      const band = n.band ?? def?.band ?? 'mid';
      return {
        note: n,
        x: tickToX(n.tick),
        y: top + BAND_Y[band],
        staffTop: top,
        color: def?.color ?? themeColor,
      };
    });

    // Rests: fill gaps between onsets within each measure.
    drawRests(ctx, notes, score.measures, top, tickToX, restColor);

    // Beams: consecutive 8th/16th notes within one beat.
    const beamGroups: PlacedNote[][] = [];
    let current: PlacedNote[] = [];
    for (const p of placed) {
      const d = p.note.durationTicks;
      const isBeamable = d === EIGHTH_TICKS || d === SIXTEENTH_TICKS;
      if (isBeamable && (current.length === 0 ||
        (Math.floor(p.note.tick / QUARTER_TICKS) === Math.floor(current[current.length - 1].note.tick / QUARTER_TICKS)
          && p.note.tick - current[current.length - 1].note.tick <= EIGHTH_TICKS))) {
        current.push(p);
      } else {
        if (current.length >= 2) beamGroups.push(current);
        current = isBeamable ? [p] : [];
      }
    }
    if (current.length >= 2) beamGroups.push(current);
    const beamed = new Set<PlacedNote>(beamGroups.flat());

    // Glow pass.
    ctx.save();
    ctx.shadowColor = themeColor;
    ctx.shadowBlur = 7;

    for (const p of placed) {
      drawNote(ctx, p, beamed.has(p));
    }

    for (const group of beamGroups) {
      drawBeam(ctx, group);
    }

    // Ties.
    for (let i = 0; i < placed.length; i++) {
      const p = placed[i];
      if (!p.note.tieToNext) continue;
      const next = placed.slice(i + 1).find(q => q.note.enemyTypeId === p.note.enemyTypeId);
      if (!next) continue;
      ctx.strokeStyle = tieColor;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      const midX = (p.x + next.x) / 2;
      ctx.moveTo(p.x + 4, p.y + 8);
      ctx.quadraticCurveTo(midX, p.y + 15, next.x - 2, next.y + 8);
      ctx.stroke();
    }
    ctx.restore();
  }

  const notes: NotationNoteLayout[] = compileScore(score).spawns.map(spawn => {
    const def = getEnemyDef(spawn.enemyTypeId);
    return {
      ...spawn,
      x: tickToX(spawn.tick),
      y: TOP_PAD + spawn.lane * (STAFF_H + LANE_GAP) + BAND_Y[spawn.band],
      color: def?.color ?? themeColor,
      hz: spawn.hertz ?? bandToHz(spawn.band),
    };
  });
  return { canvas, widthPx, heightPx, notes, tickToX };
}

function drawNote(ctx: CanvasRenderingContext2D, p: PlacedNote, isBeamed: boolean): void {
  const d = p.note.durationTicks;
  const def = getEnemyDef(p.note.enemyTypeId);
  const hollow = d >= 96; // half, whole, crescendo
  const hasStem = d < 192;
  const durationScale = d >= 192 ? 1.35 : d >= 96 ? 1.18 : d <= 12 ? 0.78 : d <= 24 ? 0.9 : 1;
  const rx = 4.6 * durationScale, ry = 3.4 * durationScale;

  ctx.save();
  ctx.fillStyle = p.color;
  ctx.strokeStyle = p.color;

  // Head.
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, rx, ry, -0.3, 0, Math.PI * 2);
  if (hollow) {
    ctx.lineWidth = 1.6;
    ctx.stroke();
  } else {
    ctx.fill();
  }

  // Dot (dotted quarter).
  if (d === 72) {
    ctx.beginPath();
    ctx.arc(p.x + rx + 3.4, p.y - 1, 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Stem.
  const stemTop = p.y - 17;
  if (hasStem) {
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(p.x + rx - 0.5, p.y - 1);
    ctx.lineTo(p.x + rx - 0.5, stemTop);
    ctx.stroke();
  }

  // Flags (unbeamed eighths/sixteenths/triplets).
  if (!isBeamed && (d === EIGHTH_TICKS || d === SIXTEENTH_TICKS || d === 16)) {
    ctx.lineWidth = 1.4;
    const fx = p.x + rx - 0.5;
    const flags = d === SIXTEENTH_TICKS ? 2 : 1;
    for (let f = 0; f < flags; f++) {
      ctx.beginPath();
      ctx.moveTo(fx, stemTop + f * 4);
      ctx.quadraticCurveTo(fx + 7, stemTop + 4 + f * 4, fx + 4, stemTop + 10 + f * 4);
      ctx.stroke();
    }
    if (d === 16) {
      ctx.font = `bold 7px 'Pixelify Sans',sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('3', fx + 3, stemTop - 2);
    }
  }

  // Special-behavior markers above the staff.
  if (def && def.behavior !== 'normal') {
    const mark = def.behavior === 'accidental' ? '♯'
      : def.behavior === 'crescendo' ? '<'
        : def.behavior === 'fermata' ? '⌒'
          : def.behavior === 'tied' ? '‿' : '';
    if (mark) {
      ctx.font = `bold 9px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = def.color;
      ctx.fillText(mark, p.x, p.staffTop - 6);
    }
  }
  ctx.restore();
}

function drawBeam(ctx: CanvasRenderingContext2D, group: PlacedNote[]): void {
  if (group.length < 2) return;
  const first = group[0], last = group[group.length - 1];
  const rx = 4.1;
  const yTop = Math.min(...group.map(p => p.y)) - 17;
  ctx.strokeStyle = group[0].color;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(first.x + rx, yTop);
  ctx.lineTo(last.x + rx, yTop);
  ctx.stroke();
  // Second beam segmenting for sixteenths.
  ctx.lineWidth = 2;
  for (let i = 0; i < group.length - 1; i++) {
    if (group[i].note.durationTicks === SIXTEENTH_TICKS && group[i + 1].note.durationTicks === SIXTEENTH_TICKS) {
      ctx.beginPath();
      ctx.moveTo(group[i].x + rx, yTop + 4);
      ctx.lineTo(group[i + 1].x + rx, yTop + 4);
      ctx.stroke();
    }
  }
  // Extend each stem to the beam.
  ctx.lineWidth = 1.2;
  for (const p of group) {
    ctx.beginPath();
    ctx.moveTo(p.x + rx, p.y - 1);
    ctx.lineTo(p.x + rx, yTop);
    ctx.stroke();
  }
}

function drawRests(ctx: CanvasRenderingContext2D, notes: ScoreNote[], measures: number, staffTop: number, tickToX: (t: number) => number, restColor: string): void {
  // Compute occupied intervals; fill gaps with rest glyphs.
  const onsets = notes.map(n => ({ start: n.tick, end: n.tick + n.durationTicks })).sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const o of onsets) {
    const lastIv = merged[merged.length - 1];
    if (lastIv && o.start <= lastIv.end) lastIv.end = Math.max(lastIv.end, o.end);
    else merged.push({ ...o });
  }
  const gaps: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const iv of merged) {
    if (iv.start > cursor) gaps.push({ start: cursor, end: iv.start });
    cursor = Math.max(cursor, iv.end);
  }
  const total = measures * TICKS_PER_MEASURE;
  if (cursor < total) gaps.push({ start: cursor, end: total });

  ctx.save();
  ctx.fillStyle = restColor;
  const midY = staffTop + STAFF_LINE_GAP * 2;
  for (const gap of gaps) {
    // Greedy decomposition into half/quarter/eighth rests, measure-aligned.
    let t = gap.start;
    while (t < gap.end) {
      const measureEnd = (Math.floor(t / TICKS_PER_MEASURE) + 1) * TICKS_PER_MEASURE;
      const span = Math.min(gap.end, measureEnd) - t;
      let dur: number;
      if (span >= 96 && t % 48 === 0) dur = 96;
      else if (span >= 48 && t % 24 === 0) dur = 48;
      else if (span >= 24) dur = 24;
      else dur = span;
      const x = tickToX(t + dur / 2);
      if (dur >= 96) {
        // Half rest: block sitting on the middle line.
        ctx.fillRect(x - 4, midY - 3.4, 8, 3.4);
      } else if (dur >= 48) {
        // Quarter rest: small zigzag.
        ctx.strokeStyle = restColor;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x - 1.5, midY - 6);
        ctx.lineTo(x + 2, midY - 2);
        ctx.lineTo(x - 2, midY + 2);
        ctx.lineTo(x + 1.5, midY + 6);
        ctx.stroke();
      } else if (dur >= 24) {
        // Eighth rest: dot + slash.
        ctx.beginPath();
        ctx.arc(x - 2, midY - 2, 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = restColor;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(x - 1, midY - 1.5);
        ctx.lineTo(x - 3.5, midY + 5);
        ctx.stroke();
      }
      t += dur;
    }
  }
  ctx.restore();
}
