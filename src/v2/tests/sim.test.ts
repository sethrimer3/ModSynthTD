/**
 * sim.test.ts - Campaign balance smoke tests using the headless simulator.
 *
 * The simulator is intentionally approximate, but deterministic. It gives
 * alpha QA a fast way to spot impossible waves, trivial waves, bad reward
 * curves, and profile regressions without rendering the browser UI.
 */

import { test, assert, assertEq } from './harness';
import { CAMPAIGN_ORDER, getWorld } from '../data/worlds';
import { simulateWave, starterRack, SimWaveResult, SIM_RACK_PROFILES } from './sim';
import { cumulativeReward } from '../state/economy';

declare const console: { log(...args: unknown[]): void };

const STARTER = starterRack();
const SEED_BASE = 99991;

test('starter rack fires at least once on every wave (patch evaluates non-empty)', () => {
  const silent: string[] = [];

  for (const worldId of CAMPAIGN_ORDER) {
    const world = getWorld(worldId)!;
    const laneLength = world.lanes[0].length;

    for (let wi = 0; wi < world.waves.length; wi++) {
      const r = simulateWave(STARTER, world.waves[wi], SEED_BASE + wi, laneLength, worldId, wi, world.rewardTable);
      if (r.spawned > 0 && r.shotsFired === 0 && r.leaked === r.spawned) {
        silent.push(r.waveId);
      }
    }
  }

  assert(
    silent.length === 0,
    `Waves with spawned enemies but zero shots from starter rack: ${silent.join(', ')}`,
  );
});

test('first two waves of w40 are clearable by the starter rack (tutorial check)', () => {
  const world = getWorld('w40')!;
  const laneLength = world.lanes[0].length;
  for (let wi = 0; wi < Math.min(2, world.waves.length); wi++) {
    const r = simulateWave(STARTER, world.waves[wi], SEED_BASE + wi, laneLength, 'w40', wi, world.rewardTable);
    assert(r.clear, `${r.waveId} must be clearable by the starter rack (tutorial wave)`);
  }
});

test('sim balance report (printed, always passes)', () => {
  console.log('\n=== Balance Simulation Report ===');

  for (const profile of SIM_RACK_PROFILES) {
    console.log(`\nProfile: ${profile.label}`);
    for (const worldId of CAMPAIGN_ORDER) {
      const world = getWorld(worldId)!;
      const laneLength = world.lanes[0].length;
      const graph = profile.graphForWorld(world);
      const results: SimWaveResult[] = [];

      for (let wi = 0; wi < world.waves.length; wi++) {
        results.push(simulateWave(graph, world.waves[wi], SEED_BASE + wi, laneLength, worldId, wi, world.rewardTable));
      }

      const clears = results.filter(r => r.clear).length;
      const enemies = results.reduce((sum, r) => sum + r.enemyCount, 0);
      const hp = results.reduce((sum, r) => sum + r.totalEnemyHp, 0);
      const leaks = results.reduce((sum, r) => sum + r.leaked, 0);
      const shots = results.reduce((sum, r) => sum + r.shotsFired, 0);
      const matches = results.reduce((sum, r) => sum + r.matchedHits, 0);
      const resists = results.reduce((sum, r) => sum + r.resistedHits, 0);
      const reward = results[results.length - 1]?.estimatedReward ?? 0;
      console.log(
        `  ${worldId.padEnd(4)} ${world.name.padEnd(18)} clear ${String(clears).padStart(2)}/${String(results.length).padEnd(2)}` +
        ` enemies ${String(enemies).padStart(3)} hp ${String(hp).padStart(4)}` +
        ` shots ${String(shots).padStart(4)} match ${String(matches).padStart(4)} resist ${String(resists).padStart(4)}` +
        ` leaks ${String(leaks).padStart(3)} reward ${reward}`,
      );
    }
  }

  const sampleWorld = getWorld('w60')!;
  const sampleGraph = SIM_RACK_PROFILES[1].graphForWorld(sampleWorld);
  const laneLength = sampleWorld.lanes[0].length;
  console.log('\nDetailed sample: recommended early patch on w60');
  console.log('  World       Wave        Title                    Enemies  HP  Shots  Match  Resist  Leaks  Result  Reward');
  for (let wi = 0; wi < sampleWorld.waves.length; wi++) {
    const r = simulateWave(sampleGraph, sampleWorld.waves[wi], SEED_BASE + wi, laneLength, sampleWorld.worldId, wi, sampleWorld.rewardTable);
    console.log(
      `  ${r.worldId.padEnd(10)} ${String(r.waveIndex + 1).padStart(2)} ${r.waveTitle.padEnd(24).slice(0, 24)}` +
      ` ${String(r.enemyCount).padStart(5)} ${String(r.totalEnemyHp).padStart(4)}` +
      ` ${String(r.shotsFired).padStart(6)} ${String(r.matchedHits).padStart(6)}` +
      ` ${String(r.resistedHits).padStart(7)} ${String(r.leaked).padStart(6)}` +
      `  ${(r.clear ? 'CLEAR' : 'FAIL').padEnd(5)} ${String(r.estimatedReward).padStart(6)}`,
    );
  }
  console.log('\n=== End of Report ===\n');
});

test('reward progression matches cumulativeReward helper', () => {
  for (const worldId of CAMPAIGN_ORDER) {
    const world = getWorld(worldId)!;
    let prev = 0;
    for (let i = 0; i < world.rewardTable.length; i++) {
      const cum = cumulativeReward(world.rewardTable, i + 1);
      assert(cum > prev, `${worldId} wave ${i + 1} reward strictly increases`);
      prev = cum;
    }
    assertEq(cumulativeReward(world.rewardTable, 0), 0, `${worldId} wave 0 cumulative reward is 0`);
    assertEq(
      cumulativeReward(world.rewardTable, world.rewardTable.length),
      world.rewardTable[world.rewardTable.length - 1],
      `${worldId} last wave cumulative reward matches table tail`,
    );
  }
});

test('sim stats are internally consistent', () => {
  for (const worldId of CAMPAIGN_ORDER) {
    const world = getWorld(worldId)!;
    const laneLength = world.lanes[0].length;
    for (let wi = 0; wi < world.waves.length; wi++) {
      const r = simulateWave(STARTER, world.waves[wi], SEED_BASE + wi, laneLength, worldId, wi, world.rewardTable);
      assert(r.matchedHits <= r.shotsFired, `${r.waveId}: matchedHits (${r.matchedHits}) > shotsFired (${r.shotsFired})`);
      assert(r.resistedHits <= r.shotsFired, `${r.waveId}: resistedHits (${r.resistedHits}) > shotsFired (${r.shotsFired})`);
      assertEq(r.matchedHits + r.resistedHits, r.shotsFired, `${r.waveId}: hit counters must account for all shots`);
      assert(r.defeated + r.leaked === r.spawned, `${r.waveId}: defeated(${r.defeated}) + leaked(${r.leaked}) != spawned(${r.spawned})`);
      assert(r.totalEnemyHp >= r.enemyCount, `${r.waveId}: total enemy HP should be at least enemy count`);
    }
  }
});
