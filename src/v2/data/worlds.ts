/**
 * worlds.ts — The nine-world ModSynth TD campaign.
 *
 * Exact BPM sequence: 40, 60, 80, 100, 120, 140, 160, 180, 200.
 * The first eight form the visible campaign; w200 is secret until the
 * Signal Cipher reveals it. Every world owns distinct track geometry, a
 * teaching focus, authored integer-tick wave scores, and reward tables.
 */

import { WaveScore } from '../core/score';
import { wave } from './score-dsl';

// ── Track geometry ──────────────────────────────────────────────────────────

export type Tile = [number, number];

/** Rasterize an orthogonal waypoint polyline into a contiguous tile path. */
function track(...pts: Tile[]): Tile[] {
  const tiles: Tile[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (x0 !== x1 && y0 !== y1) {
      throw new Error(`worlds: diagonal track segment (${x0},${y0})→(${x1},${y1})`);
    }
    const dx = Math.sign(x1 - x0);
    const dy = Math.sign(y1 - y0);
    let x = x0, y = y0;
    while (x !== x1 || y !== y1) {
      if (tiles.length === 0 || tiles[tiles.length - 1][0] !== x || tiles[tiles.length - 1][1] !== y) {
        tiles.push([x, y]);
      }
      x += dx; y += dy;
    }
  }
  const last = pts[pts.length - 1];
  tiles.push([last[0], last[1]]);
  return tiles;
}

// ── World definition ────────────────────────────────────────────────────────

export interface WorldTheme {
  /** Track + accents. */
  primary: string;
  /** Secondary glow. */
  glow: string;
}

export interface WorldDef {
  worldId: string;
  name: string;
  bpm: number;
  /** One-line teaching focus shown on the map. */
  lesson: string;
  description: string;
  theme: WorldTheme;
  gridWidth: number;
  gridHeight: number;
  /** One or more enemy lanes (tile paths from spawn to finish). */
  lanes: Tile[][];
  /** Default tower position for a fresh rack. */
  towerStart: Tile;
  waves: WaveScore[];
  /** Cumulative Resonance reward by wave (length === waves.length). */
  rewardTable: number[];
  completionReward: number;
  isSecret: boolean;
  /** Secret world: number of opening gauntlet waves before the boss phases. */
  gauntletWaves?: number;
  /** Secret world: number of closing boss-phase waves. */
  bossPhases?: number;
}

export function isWorldTrackTile(world: WorldDef, tileX: number, tileY: number): boolean {
  return world.lanes.some(lane => lane.some(([x, y]) => x === tileX && y === tileY));
}

function exteriorWorldTiles(world: WorldDef): Set<string> {
  const exterior = new Set<string>();
  const queue: Tile[] = [];
  const add = (x: number, y: number): void => {
    const key = `${x},${y}`;
    if (x < 0 || x >= world.gridWidth || y < 0 || y >= world.gridHeight) return;
    if (exterior.has(key) || isWorldTrackTile(world, x, y)) return;
    exterior.add(key);
    queue.push([x, y]);
  };
  for (let x = 0; x < world.gridWidth; x++) {
    add(x, 0);
    add(x, world.gridHeight - 1);
  }
  for (let y = 1; y < world.gridHeight - 1; y++) {
    add(0, y);
    add(world.gridWidth - 1, y);
  }
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    add(x + 1, y);
    add(x - 1, y);
    add(x, y + 1);
    add(x, y - 1);
  }
  return exterior;
}

/** Repair stale saved positions that became enclosed by changed track topology. */
export function nearestExteriorWorldTile(world: WorldDef, start: Tile): Tile {
  const startX = Math.max(0, Math.min(world.gridWidth - 1, Math.floor(start[0])));
  const startY = Math.max(0, Math.min(world.gridHeight - 1, Math.floor(start[1])));
  const exterior = exteriorWorldTiles(world);
  if (exterior.has(`${startX},${startY}`)) return [startX, startY];

  const maxRadius = Math.max(world.gridWidth, world.gridHeight);
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let y = startY - radius; y <= startY + radius; y++) {
      for (let x = startX - radius; x <= startX + radius; x++) {
        if (Math.max(Math.abs(x - startX), Math.abs(y - startY)) !== radius) continue;
        if (x < 0 || x >= world.gridWidth || y < 0 || y >= world.gridHeight) continue;
        if (exterior.has(`${x},${y}`)) return [x, y];
      }
    }
  }
  return [startX, startY];
}

/** Cumulative table from per-wave increments. */
function cum(...inc: number[]): number[] {
  const out: number[] = [];
  let total = 0;
  for (const v of inc) { total += v; out.push(total); }
  return out;
}

// ── w40 · First Signal (tutorial) ───────────────────────────────────────────

const W40: WorldDef = {
  worldId: 'w40',
  name: 'First Signal',
  bpm: 40,
  lesson: 'Clock → Oscillator → Output. Your first patch.',
  description: 'A quiet S-bend in deep space. Learn the rack, the score, and the tower.',
  theme: { primary: '#00ddcc', glow: '#00ffee' },
  gridWidth: 16,
  gridHeight: 12,
  lanes: [track([0, 2], [13, 2], [13, 6], [2, 6], [2, 9], [15, 9])],
  towerStart: [7, 4],
  waves: [
    wave('w40-1', ['q rq q rq | q rq q rq'], 'Four steady steps'),
    wave('w40-2', ['q q rq rq | q q rq rq'], 'Paired steps'),
    wave('w40-3', ['q q q q'], 'A full measure'),
    wave('w40-4', ['h rh | q q rq q'], 'The first half note'),
    wave('w40-5', ['h h | q q q q'], 'Low and steady'),
    wave('w40-6', ['q q h | h q q'], 'Trading places'),
    wave('w40-7', ['h h | h h | q q q q'], 'Weight building'),
    wave('w40-8', ['q q q q | h q q | w'], 'First mastery: the whole note'),
  ],
  rewardTable: cum(4, 4, 5, 5, 6, 6, 7, 8),
  completionReward: 40,
  isSecret: false,
};

// ── w60 · Pulse Orbit ───────────────────────────────────────────────────────

const W60: WorldDef = {
  worldId: 'w60',
  name: 'Pulse Orbit',
  bpm: 60,
  lesson: 'Eighth notes, waveforms, and resonance matching.',
  description: 'Notes orbit the core before collapsing inward. Match bands to cancel them faster.',
  theme: { primary: '#aa66ff', glow: '#cc88ff' },
  gridWidth: 16,
  gridHeight: 14,
  lanes: [track([8, 0], [8, 2], [13, 2], [13, 11], [3, 11], [3, 2], [7, 2], [7, 7], [8, 7])],
  towerStart: [8, 5],
  waves: [
    wave('w60-1', ['q q q q | e e q q q'], 'First eighths'),
    wave('w60-2', ['e e e e q q | q e e q q'], 'Skipping pulses'),
    wave('w60-3', ['e e e e e e e e'], 'A running measure'),
    wave('w60-4', ['q q e e e e | h:l q q'], 'A low anchor'),
    wave('w60-5', ['h h | e e e e q q'], 'Slow then fast'),
    wave('w60-6', ['e e q e e q | e e e e h'], 'Orbit tightens'),
    wave('w60-7', ['q q q q | e e e e e e e e | h h'], 'Three speeds'),
    wave('w60-8', ['h:l h:l | e:h e:h e:h e:h q q'], 'Bands split apart'),
    wave('w60-9', ['e e e e q q | q e e e e q | h h'], 'Interleaved orbit'),
    wave('w60-10', ['e e e e e e e e | q q e e q | h:l h:l | w'], 'Orbit mastery'),
  ],
  rewardTable: cum(5, 5, 6, 6, 7, 7, 8, 8, 9, 10),
  completionReward: 50,
  isSecret: false,
};

// ── w80 · Bifurcation ───────────────────────────────────────────────────────

const W80: WorldDef = {
  worldId: 'w80',
  name: 'Bifurcation',
  bpm: 80,
  lesson: 'Splitters, chords, and two simultaneous routes.',
  description: 'The path forks. Signals — and your attention — must branch with it.',
  theme: { primary: '#ff8800', glow: '#ffaa44' },
  gridWidth: 18,
  gridHeight: 12,
  lanes: [
    track([0, 2], [8, 2], [8, 5], [17, 5]),
    track([0, 9], [8, 9], [8, 6], [17, 6]),
  ],
  towerStart: [12, 3],
  waves: [
    wave('w80-1', ['q q q q', 'rq q rq q'], 'Two doors open'),
    wave('w80-2', ['q rq q rq | q rq q rq', 'rq q rq q | rq q rq q'], 'Alternating fork'),
    wave('w80-3', ['[q h:l] rq q | [q q:h] rh q'], 'First chords'),
    wave('w80-4', ['e e e e q q | q q h', 'h h | rq q q rq'], 'Fast north, slow south'),
    wave('w80-5', ['q:h q:h q:h q:h | e e e e q q', 'h:l h:l | h:l h:l'], 'Bands divide'),
    wave('w80-6', ['[q q:h] rq [q q:h] rq', '[h:l q] rh'], 'Chords on both forks'),
    wave('w80-7', ['e e e e e e e e | q q q q', 'q q q q | e e e e q q'], 'Mirrored pressure'),
    wave('w80-8', ['[q h:l] q rq | e e e e q q', 'rh q q | h:l h:l'], 'Weighted chords'),
    wave('w80-9', ['e:h e:h e:h e:h q q | [q q:h] rq q rq', 'h:l h:l | q q [q h:l]'], 'Split spectrum'),
    wave('w80-10', ['[q q:h] [q q:h] rh | e e e e e e e e | h h', 'h:l h:l | q q q q | [w:l q]'], 'Bifurcation mastery'),
  ],
  rewardTable: cum(6, 6, 7, 7, 8, 8, 9, 10, 11, 12),
  completionReward: 60,
  isSecret: false,
};

// ── w100 · Phase Drift ──────────────────────────────────────────────────────

const W100: WorldDef = {
  worldId: 'w100',
  name: 'Phase Drift',
  bpm: 100,
  lesson: 'Syncopation, rests, phase offsets, and quantized delay.',
  description: 'Everything lands off the beat. Shift your clock — or echo into the gaps.',
  theme: { primary: '#44aaff', glow: '#66ccff' },
  gridWidth: 18,
  gridHeight: 12,
  lanes: [track([0, 1], [15, 1], [15, 4], [2, 4], [2, 7], [15, 7], [15, 10], [0, 10])],
  towerStart: [8, 5],
  waves: [
    wave('w100-1', ['re q rq q re | re q rq q re'], 'Everything off-beat'),
    wave('w100-2', ['rq e e rq e e | re q q re q'], 'Holes in the pulse'),
    wave('w100-3', ['d e d e | d d q'], 'Dotted drift'),
    wave('w100-4', ['re e re e re e re e | q rq q rq'], 'Up-beats only'),
    wave('w100-5', ['d d q | re q re q rq | rh rq q | rq q rh'], 'Second current'),
    wave('w100-6', ['e re e re e re e re | d e d e'], 'Push and pull'),
    wave('w100-7', ['rs s rs s rs s rs s rs s rs s rs s rs s | q q q q'], 'Sixteenth shadows'),
    wave('w100-8', ['d q d | h rh | re e re e q q | rq q e e q'], 'Long drift'),
    wave('w100-9', ['re q rq q re | d e d e | h:l h:l'], 'Drift deepens'),
    wave('w100-10', ['d d q | re e re e re e re e | rs s rs s rs s rs s q q | h h'], 'Phase mastery'),
  ],
  rewardTable: cum(7, 7, 8, 8, 9, 9, 10, 11, 12, 13),
  completionReward: 70,
  isSecret: false,
};

// ── w120 · Confluence ───────────────────────────────────────────────────────

const W120: WorldDef = {
  worldId: 'w120',
  name: 'Confluence',
  bpm: 120,
  lesson: 'Multiple sources, the mixer, and amplitude balance.',
  description: 'Two rivers of notes merge into one roaring current.',
  theme: { primary: '#33ff88', glow: '#66ffaa' },
  gridWidth: 20,
  gridHeight: 12,
  lanes: [
    track([0, 2], [6, 2], [6, 6], [10, 6], [19, 6]),
    track([0, 10], [6, 10], [6, 6], [10, 6], [19, 6]),
  ],
  towerStart: [13, 4],
  waves: [
    wave('w120-1', ['q q q q | q q q q', 'rh q q | rh q q'], 'Two streams'),
    wave('w120-2', ['e e e e q q | q q q q', 'q q q q | e e e e q q'], 'Trading speed'),
    wave('w120-3', ['[q q:h] rq q rq | e e e e q q', 'h:l h:l | q q rh'], 'Merging chords'),
    wave('w120-4', ['C rh | q q q q', 'rq q q rq | C rh'], 'Rising pressure'),
    wave('w120-5', ['e e e e e e e e | q q h', 'h h | e e e e q q'], 'Crosscurrent'),
    wave('w120-6', ['d d q | re e re e q q', 'rq q rq q | d e d e'], 'Drift meets flow'),
    wave('w120-7', ['[q h:l] q rq | e:h e:h e:h e:h q q', 'C C | q q q q'], 'Heavy water'),
    wave('w120-8', ['e e q e e q | [q q:h] rq [q q:h] rq', 'h:l h:l | C rh'], 'Chord rapids'),
    wave('w120-9', ['s s s s q e e q | q q e e e e', 'd d q | h:l h:l'], 'White water'),
    wave('w120-10', ['e e e e q q | [q q:h] [q h:l] rq | q q q q | w:l', 'C C | d d q | e e e e q q | rw'], 'Confluence mastery'),
  ],
  rewardTable: cum(8, 8, 9, 9, 10, 10, 11, 12, 13, 14),
  completionReward: 80,
  isSecret: false,
};

// ── w140 · Modulation Field ─────────────────────────────────────────────────

const W140: WorldDef = {
  worldId: 'w140',
  name: 'Modulation Field',
  bpm: 140,
  lesson: 'Filters, envelopes, clock division — enemies that change.',
  description: 'Accidentals bend resonance mid-flight. Your patch must adapt faster than they do.',
  theme: { primary: '#ff66ff', glow: '#ff99ff' },
  gridWidth: 20,
  gridHeight: 12,
  lanes: [track([0, 1], [18, 1], [18, 3], [1, 3], [1, 5], [18, 5], [18, 7], [1, 7], [1, 9], [18, 9], [19, 9])],
  towerStart: [9, 6],
  waves: [
    wave('w140-1', ['A rq A rq | q q q q'], 'The first accidental'),
    wave('w140-2', ['A q A q | A A rh'], 'Shifting pitch'),
    wave('w140-3', ['C rh | A q A q'], 'Growing and bending'),
    wave('w140-4', ['e e e e A A | q A q A'], 'Quick changes'),
    wave('w140-5', ['A A A A | e:h e:h e:h e:h q q'], 'A field of sharps'),
    wave('w140-6', ['C C | A q A q | h:l h:l'], 'Heavy modulation'),
    wave('w140-7', ['[A q] rq [A q] rq | e e e e q q'], 'Accidental chords'),
    wave('w140-8', ['d A d | A e e A e e'], 'Bent drift'),
    wave('w140-9', ['C rh | [A h:l] rq q | A A A A'], 'Deep field'),
    wave('w140-10', ['A A A A | C C | [A q:h] [A q:l] rh | e e e e e e e e'], 'Modulation mastery'),
  ],
  rewardTable: cum(9, 9, 10, 10, 11, 12, 13, 14, 15, 17),
  completionReward: 90,
  isSecret: false,
};

// ── w160 · Dense Array ──────────────────────────────────────────────────────

const W160: WorldDef = {
  worldId: 'w160',
  name: 'Dense Array',
  bpm: 160,
  lesson: 'Three lanes, triplets, sequencers — big racks for big waves.',
  description: 'Three approach vectors and tuplet swarms. One shelf will not be enough.',
  theme: { primary: '#ffee44', glow: '#ffff88' },
  gridWidth: 20,
  gridHeight: 14,
  lanes: [
    track([0, 2], [12, 2], [12, 7], [19, 7]),
    track([0, 7], [8, 7], [8, 10], [16, 10], [16, 7], [19, 7]),
    track([0, 12], [14, 12], [14, 7], [19, 7]),
  ],
  towerStart: [10, 5],
  waves: [
    wave('w160-1', ['q q q q', 'rq q rq q', 'rh q q'], 'Three doors'),
    wave('w160-2', ['t t t t t t t t t t t t', 'q q q q', 'rh h:l'], 'First triplets'),
    wave('w160-3', ['e e e e q q | q q q q', 't t t t t t q q | rh q q', 'h:l h:l | rh h:l'], 'Array warms up'),
    wave('w160-4', ['[q q:h] rq q rq', 'e e e e q q', 'q rq q rq'], 'Chord vectors'),
    wave('w160-5', ['t t t t t t t t t t t t | q q q q', 'A q A q | rh q q', 'h:l h:l | C rh'], 'Tuplet pressure'),
    wave('w160-6', ['e:h e:h e:h e:h e:h e:h e:h e:h', 'd d q | re e re e q q', 'C C'], 'Dense weave'),
    wave('w160-7', ['s s s s s s s s q q | q q h', 't t t t t t q q | A A rh', 'h h | h:l h:l'], 'Sixteenth storm'),
    wave('w160-8', ['[q h:l] q rq | t t t t t t q q', 'e e e e e e e e | q q q q', 'rh q q | C rh'], 'Layered array'),
    wave('w160-9', ['A A A A | e e e e q q', '[q q:h] rq [q q:h] rq | d d q', 'h:l h:l | w:l'], 'Heavy array'),
    wave('w160-10', ['t t t t t t t t t t t t | s s s s q e e q', 'C C | A q A q', 'h h | h:l h:l'], 'Swarm logic'),
    wave('w160-11', ['e e q e e q | [q q:h] [q h:l] rq | q q q q', 't t t t t t q q | C rh | e e e e q q', 'w:l | h:l h:l | rh h:l'], 'The long array'),
    wave('w160-12', ['s s s s s s s s e e e e | t t t t t t t t t t t t | q q q q', 'A A A A | [q h:l] q rq | C C', 'h:l h:l | w:l | h h'], 'Dense mastery'),
  ],
  rewardTable: cum(10, 10, 11, 11, 12, 13, 14, 15, 16, 17, 18, 20),
  completionReward: 110,
  isSecret: false,
};

// ── w180 · Overdrive ────────────────────────────────────────────────────────

const W180: WorldDef = {
  worldId: 'w180',
  name: 'Overdrive',
  bpm: 180,
  lesson: 'Everything at once — fermatas, ties, and full-rack mastery.',
  description: 'The spiral track funnels every kind of note toward the core. This is the proving ground.',
  theme: { primary: '#ff3344', glow: '#ff6677' },
  gridWidth: 22,
  gridHeight: 14,
  lanes: [track([0, 1], [20, 1], [20, 12], [2, 12], [2, 3], [17, 3], [17, 9], [5, 9], [5, 6], [12, 6])],
  towerStart: [10, 7],
  waves: [
    wave('w180-1', ['F rq q q | q q q q'], 'The held note'),
    wave('w180-2', ['T rh | T rh'], 'Tied pairs'),
    wave('w180-3', ['F q F q | T T'], 'Holds and ties'),
    wave('w180-4', ['e e e e e e e e | A A A A'], 'Overdrive begins'),
    wave('w180-5', ['T rh | C C | F rq F rq'], 'Weighted holds'),
    wave('w180-6', ['t t t t t t t t t t t t | s s s s s s s s q q'], 'Velocity'),
    wave('w180-7', ['[q q:h] [q h:l] rq | T rh | e e e e q q'], 'Knotted lines'),
    wave('w180-8', ['F A F A | d d q | C rh'], 'Bent holds'),
    wave('w180-9', ['s s s s q e e q | t t t t t t q q | A A rh'], 'Redline'),
    wave('w180-10', ['T T | [q h:l] [q q:h] rq | F rq q q'], 'The long phrase'),
    wave('w180-11', ['C C | e:h e:h e:h e:h e:h e:h e:h e:h | h:l h:l | w:l'], 'Full spectrum'),
    wave('w180-12', ['F T q | s s s s s s s s e e e e | [A h:l] [A q:h] rq | t t t t t t t t t t t t | w:l'], 'Overdrive mastery'),
  ],
  rewardTable: cum(12, 12, 13, 13, 14, 15, 16, 17, 18, 19, 20, 22),
  completionReward: 130,
  isSecret: false,
};

// ── w200 · The Final Measure (secret) ───────────────────────────────────────

const W200: WorldDef = {
  worldId: 'w200',
  name: 'The Final Measure',
  bpm: 200,
  lesson: 'The hidden measure. A living score conducts itself.',
  description: 'Beyond the eighth world, a composition wakes. Survive its gauntlet, then face the score itself.',
  theme: { primary: '#ffffff', glow: '#cceeff' },
  gridWidth: 22,
  gridHeight: 14,
  lanes: [
    // The long spiral gauntlet.
    track([0, 0], [21, 0], [21, 13], [0, 13], [0, 2], [19, 2], [19, 11], [2, 11], [2, 4], [17, 4], [17, 9], [4, 9], [4, 6], [11, 6], [11, 7]),
    // Boss-phase pincer lanes converging on the same finish.
    track([0, 7], [11, 7]),
    track([21, 7], [11, 7]),
  ],
  towerStart: [10, 8],
  waves: [
    // Gauntlet
    wave('w200-g1', ['e e e e e e e e | q q q q | t t t t t t t t t t t t'], 'Gauntlet I — Approach'),
    wave('w200-g2', ['[q q:h] [q h:l] rq | s s s s s s s s q q | A A A A | C C'], 'Gauntlet II — Acceleration'),
    wave('w200-g3', ['F T q | t t t t t t t t t t t t | e:h e:h e:h e:h q q | w:l'], 'Gauntlet III — The Gate'),
    // Boss phases — an evolving phrase that the player must out-play.
    wave('w200-b1', [
      'q q h | q q h | e e e e q q | w:l',
    ], 'Phase I — The Theme'),
    wave('w200-b2', [
      'e e q e e q | e e q e e q | s s s s e e e e q | h:l h:l',
      'rq A rq A | rq A rq A | T rh | C C',
    ], 'Phase II — Diminution'),
    wave('w200-b3', [
      '[q q:h] [q h:l] rq | [q q:h] [q h:l] rq | t t t t t t t t t t t t | w:l',
      'F rq F rq | T T | A A A A | C C',
      'rh h:l | rh h:l | e e e e e e e e | w:l',
    ], 'Phase III — The Full Measure'),
  ],
  rewardTable: cum(20, 22, 25, 30, 35, 45),
  completionReward: 250,
  isSecret: true,
  gauntletWaves: 3,
  bossPhases: 3,
};

// ── Registry ────────────────────────────────────────────────────────────────

export const WORLDS: readonly WorldDef[] = [W40, W60, W80, W100, W120, W140, W160, W180, W200];

/** Visible campaign order (the secret world is intentionally absent). */
export const CAMPAIGN_ORDER: readonly string[] = ['w40', 'w60', 'w80', 'w100', 'w120', 'w140', 'w160', 'w180'];

export const SECRET_WORLD_ID = 'w200';

const WORLD_MAP = new Map(WORLDS.map(w => [w.worldId, w]));

export function getWorld(worldId: string): WorldDef | undefined {
  return WORLD_MAP.get(worldId);
}
