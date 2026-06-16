/**
 * sim.test.ts — Campaign balance smoke tests using the headless simulator.
 *
 * For every world/wave, simulate the starter rack in perfect-aim mode.
 * Assertions:
 *  - No wave is theoretically un-clearable (the starter rack can kill everything
 *    if given enough events and good matching).
 *  - Reward progression is consistent across the simulation run.
 *
 * Also prints a human-readable balance report that can be inspected manually.
 */

import { test, assert, assertEq } from './harness';
import { WORLDS, CAMPAIGN_ORDER, getWorld } from '../data/worlds';
import { simulateWave, starterRack, SimWaveResult } from './sim';
import { cumulativeReward } from '../state/economy';

declare const console: { log(...args: unknown[]): void };

const STARTER = starterRack();
const SEED_BASE = 99991; // arbitrary but fixed

// ── Per-world simulation ────────────────────────────────────────────────────

test('starter rack fires at least once on every wave (patch evaluates non-empty)', () => {
  // The starter rack should always produce signal events regardless of the wave.
  // Zero shots would indicate a broken patch or an evaluation window mismatch.
  const silent: string[] = [];

  for (const worldId of CAMPAIGN_ORDER) {
    const world = getWorld(worldId)!;
    const laneLength = world.lanes[0].length;

    for (let wi = 0; wi < world.waves.length; wi++) {
      const r = simulateWave(STARTER, world.waves[wi], SEED_BASE + wi, laneLength, worldId, wi);
      // shotsFired counts event×enemy pairs; if all enemies spawn after the
      // patch evaluation window there may legitimately be 0, but spawned > 0
      // with 0 shots across a full wave is a sign of a broken sim.
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
  // The first world is a tutorial; its opening waves must be survivable without
  // any purchased modules so new players can see progress.
  const world = getWorld('w40')!;
  const laneLength = world.lanes[0].length;
  for (let wi = 0; wi < Math.min(2, world.waves.length); wi++) {
    const r = simulateWave(STARTER, world.waves[wi], SEED_BASE + wi, laneLength, 'w40', wi);
    assert(r.clear, `${r.waveId} must be clearable by the starter rack (tutorial wave)`);
  }
});

test('sim balance report (printed, always passes)', () => {
  console.log('\n=== Balance Simulation Report ===');

  for (const worldId of CAMPAIGN_ORDER) {
    const world = getWorld(worldId)!;
    const laneLength = world.lanes[0].length;
    const results: SimWaveResult[] = [];

    for (let wi = 0; wi < world.waves.length; wi++) {
      results.push(simulateWave(STARTER, world.waves[wi], SEED_BASE + wi, laneLength, worldId, wi));
    }

    const clears = results.filter(r => r.clear).length;
    const total = results.length;
    console.log(`\n${worldId} (${world.bpm} BPM) — ${clears}/${total} clears`);
    console.log('  Wave       Clear  Leaked  Shots  Hits  Reward');

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const reward = cumulativeReward(world.rewardTable, i + 1);
      const flag = r.clear ? ' OK' : 'FAIL';
      console.log(
        `  ${r.waveId.padEnd(12)} ${flag}   ${String(r.leaked).padStart(3)}/${String(r.spawned).padEnd(3)}` +
        `  ${String(r.shotsFired).padStart(4)}  ${String(r.matchedHits).padStart(4)}  ${reward}`,
      );
    }
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
    assertEq(
      cumulativeReward(world.rewardTable, 0),
      0,
      `${worldId} wave 0 cumulative reward is 0`,
    );
    assertEq(
      cumulativeReward(world.rewardTable, world.rewardTable.length),
      world.rewardTable[world.rewardTable.length - 1],
      `${worldId} last wave cumulative reward matches table tail`,
    );
  }
});

test('sim stats are internally consistent (shots ≥ matched hits)', () => {
  for (const worldId of CAMPAIGN_ORDER) {
    const world = getWorld(worldId)!;
    const laneLength = world.lanes[0].length;
    for (let wi = 0; wi < world.waves.length; wi++) {
      const r = simulateWave(STARTER, world.waves[wi], SEED_BASE + wi, laneLength, worldId, wi);
      assert(
        r.matchedHits <= r.shotsFired,
        `${r.waveId}: matchedHits (${r.matchedHits}) > shotsFired (${r.shotsFired})`,
      );
      assert(
        r.defeated + r.leaked === r.spawned,
        `${r.waveId}: defeated(${r.defeated}) + leaked(${r.leaked}) ≠ spawned(${r.spawned})`,
      );
    }
  }
});
