/**
 * worlds.test.ts — Campaign data validation: BPM sequence, tracks, scores,
 * wave minimums, reward tables, unlock chains.
 */

import { test, assert, assertEq } from './harness';
import { WORLDS, CAMPAIGN_ORDER, SECRET_WORLD_ID, getWorld, isWorldTrackTile, nearestExteriorWorldTile } from '../data/worlds';
import { validateWaveScore, compileScore } from '../core/score';
import { MODULE_TYPES } from '../core/modules';
import { TICKS_PER_MEASURE } from '../core/ticks';

test('exact BPM sequence 40..200', () => {
  assertEq(WORLDS.map(w => w.bpm), [40, 60, 80, 100, 120, 140, 160, 180, 200], 'nine worlds at exact tempos');
});

test('first eight worlds visible, 200 BPM secret', () => {
  assertEq(CAMPAIGN_ORDER.length, 8, 'eight visible campaign worlds');
  assert(!CAMPAIGN_ORDER.includes(SECRET_WORLD_ID), 'secret world absent from the campaign order');
  assertEq(getWorld(SECRET_WORLD_ID)!.isSecret, true, 'w200 flagged secret');
  for (const id of CAMPAIGN_ORDER) {
    assertEq(getWorld(id)!.isSecret, false, `${id} is a normal world`);
  }
});

test('world ids unique and stable', () => {
  const ids = WORLDS.map(w => w.worldId);
  assertEq(new Set(ids).size, ids.length, 'no duplicate world ids');
  assertEq(ids, ['w40', 'w60', 'w80', 'w100', 'w120', 'w140', 'w160', 'w180', 'w200'], 'expected id scheme');
});

test('world names distinct', () => {
  const names = WORLDS.map(w => w.name);
  assertEq(new Set(names).size, names.length, 'no duplicate names');
});

test('minimum authored wave counts met', () => {
  const minimums: Record<string, number> = {
    w40: 8, w60: 10, w80: 10, w100: 10, w120: 10, w140: 10, w160: 12, w180: 12,
  };
  for (const [id, min] of Object.entries(minimums)) {
    const w = getWorld(id)!;
    assert(w.waves.length >= min, `${id} has ${w.waves.length} waves, needs ≥ ${min}`);
  }
  const secret = getWorld(SECRET_WORLD_ID)!;
  assert((secret.gauntletWaves ?? 0) >= 1, 'secret world has a gauntlet');
  assert((secret.bossPhases ?? 0) >= 3, 'secret world has at least three boss phases');
  assertEq(secret.waves.length, (secret.gauntletWaves ?? 0) + (secret.bossPhases ?? 0), 'gauntlet + phases account for all waves');
});

test('every wave score validates with zero errors', () => {
  for (const w of WORLDS) {
    for (const score of w.waves) {
      const issues = validateWaveScore(score, w.lanes.length);
      const errors = issues.filter(i => i.severity === 'error');
      assertEq(errors, [], `${score.waveId}: ${errors.map(e => e.message).join('; ')}`);
    }
  }
});

test('wave ids unique across the whole campaign', () => {
  const ids = WORLDS.flatMap(w => w.waves.map(s => s.waveId));
  assertEq(new Set(ids).size, ids.length, 'no duplicate wave ids');
});

test('score compilation is deterministic and ordered', () => {
  for (const w of WORLDS) {
    for (const score of w.waves) {
      const a = compileScore(score);
      const b = compileScore(score);
      assertEq(a, b, `${score.waveId} compiles deterministically`);
      for (let i = 1; i < a.spawns.length; i++) {
        assert(a.spawns[i].tick >= a.spawns[i - 1].tick, `${score.waveId} spawns sorted`);
      }
      assertEq(a.totalTicks, score.measures * TICKS_PER_MEASURE, `${score.waveId} duration from measures`);
    }
  }
});

test('track geometry valid: in bounds, contiguous, orthogonal', () => {
  for (const w of WORLDS) {
    assert(w.lanes.length >= 1, `${w.worldId} has at least one lane`);
    for (const [laneIdx, lane] of w.lanes.entries()) {
      assert(lane.length >= 8, `${w.worldId} lane ${laneIdx} long enough to defend`);
      for (const [x, y] of lane) {
        assert(x >= 0 && x < w.gridWidth && y >= 0 && y < w.gridHeight,
          `${w.worldId} lane ${laneIdx} tile (${x},${y}) within ${w.gridWidth}x${w.gridHeight}`);
      }
      for (let i = 1; i < lane.length; i++) {
        const dx = Math.abs(lane[i][0] - lane[i - 1][0]);
        const dy = Math.abs(lane[i][1] - lane[i - 1][1]);
        assert(dx + dy === 1, `${w.worldId} lane ${laneIdx} step ${i} contiguous orthogonal`);
      }
      const seen = new Set(lane.map(([x, y]) => `${x},${y}`));
      assert(seen.size === lane.length, `${w.worldId} lane ${laneIdx} has no duplicate tiles`);
    }
  }
});

test('tracks are genuinely distinct between worlds', () => {
  const signatures = WORLDS.map(w => JSON.stringify(w.lanes));
  assertEq(new Set(signatures).size, signatures.length, 'no two worlds share identical track geometry');
});

test('w40 follows the authored inward spiral tutorial path', () => {
  const world = getWorld('w40')!;
  const lane = world.lanes[0];
  assertEq(lane[0], [0, 2], 'spiral enters from the upper-left edge');
  assertEq(lane[lane.length - 1], [10, 6], 'spiral terminates near the center');
  for (const corner of [[14, 2], [14, 10], [2, 10], [2, 4], [12, 4], [12, 8], [4, 8], [4, 6]] as const) {
    assert(lane.some(([x, y]) => x === corner[0] && y === corner[1]), `spiral includes corner (${corner[0]},${corner[1]})`);
  }
});

test('tower start tile is on the grid and off the track', () => {
  for (const w of WORLDS) {
    const [tx, ty] = w.towerStart;
    assert(tx >= 0 && tx < w.gridWidth && ty >= 0 && ty < w.gridHeight, `${w.worldId} tower start in bounds`);
    const onTrack = w.lanes.some(lane => lane.some(([x, y]) => x === tx && y === ty));
    assert(!onTrack, `${w.worldId} tower start not on the track`);
  }
});

test('saved positions enclosed by track topology are repaired outside it', () => {
  const world = getWorld('w60')!;
  const trapped: [number, number] = [8, 5];
  const repaired = nearestExteriorWorldTile(world, trapped);
  assert(!isWorldTrackTile(world, repaired[0], repaired[1]), 'repaired position is outside track topology');
  assert(repaired[0] !== trapped[0] || repaired[1] !== trapped[1], 'enclosed open position is moved');
  assert(repaired[0] >= 0 && repaired[0] < world.gridWidth && repaired[1] >= 0 && repaired[1] < world.gridHeight,
    'repaired position stays in bounds');
});

test('reward tables match wave counts and increase strictly', () => {
  for (const w of WORLDS) {
    assertEq(w.rewardTable.length, w.waves.length, `${w.worldId} reward table covers every wave`);
    for (let i = 1; i < w.rewardTable.length; i++) {
      assert(w.rewardTable[i] > w.rewardTable[i - 1], `${w.worldId} cumulative rewards strictly increase`);
    }
    assert(w.completionReward > 0, `${w.worldId} has a completion reward`);
  }
});

test('blueprint unlock chain references real worlds and covers the catalog', () => {
  const worldIds = new Set(WORLDS.map(w => w.worldId));
  for (const def of MODULE_TYPES) {
    if (def.unlockAfterWorld !== null) {
      assert(worldIds.has(def.unlockAfterWorld), `${def.typeId} unlocks after a real world (${def.unlockAfterWorld})`);
      assert(def.unlockAfterWorld !== SECRET_WORLD_ID, `${def.typeId} not locked behind the secret world`);
    }
  }
  // Every normal world except the last should unlock something or teach via track/score.
  const unlockingWorlds = new Set(MODULE_TYPES.map(m => m.unlockAfterWorld).filter((w): w is string => w !== null));
  for (const id of ['w40', 'w60', 'w80', 'w100', 'w120', 'w140', 'w160']) {
    assert(unlockingWorlds.has(id), `${id} unlocks at least one blueprint`);
  }
});

test('per-wave reward increments stay reasonable (anti-farming shape)', () => {
  for (const w of WORLDS) {
    const t = w.rewardTable;
    for (let i = 0; i < t.length; i++) {
      const inc = i === 0 ? t[0] : t[i] - t[i - 1];
      assert(inc >= 1 && inc <= 50, `${w.worldId} wave ${i + 1} increment ${inc} within sane bounds`);
    }
  }
});

test('lane indices used by scores exist on their world tracks', () => {
  for (const w of WORLDS) {
    for (const score of w.waves) {
      for (const n of score.notes) {
        const lane = n.lane ?? 0;
        assert(lane < w.lanes.length, `${score.waveId} lane ${lane} exists (${w.lanes.length} lanes)`);
      }
    }
  }
});
