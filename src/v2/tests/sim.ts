/**
 * sim.ts — Headless balance/combat simulator.
 *
 * Pure: no DOM, no canvas, no AudioContext. Imports only core modules.
 * Used by sim.test.ts to verify campaign balance without a browser.
 *
 * Model:
 *  - A RackGraph is evaluated for N measures producing SignalEvents.
 *  - Enemies walk along their lane at their moveEveryTicks cadence.
 *  - A "perfect-aim" tower fires every signal event at every enemy alive
 *    during the event's tick window, in lane order.
 *  - Damage is calculated with the canonical damageMultiplier.
 *  - Crescendo enemies receive the average of their damageScale over their
 *    lifetime (conservative: 0.75 since scale goes 1→0.5 linearly).
 *  - Fermata pause is accounted for in lifetime calculation.
 *  - A wave CLEARs when zero enemies escape; otherwise it FAILs.
 */

import { RackGraph, evaluatePatch } from '../core/graph';
import { SpawnEvent, compileScore } from '../core/score';
import { WaveScore } from '../core/score';
import { FrequencyBand } from '../core/events';
import { TICKS_PER_MEASURE } from '../core/ticks';
import { damageMultiplier, bandToHz } from '../core/pitch';
import { eventHertz } from '../core/events';
import { getEnemyDef } from '../core/enemy-defs';
import { cumulativeReward } from '../state/economy';
import { WorldDef } from '../data/worlds';

export interface SimWaveResult {
  waveId: string;
  worldId: string;
  waveIndex: number;
  clear: boolean;
  waveTitle: string;
  enemyCount: number;
  totalEnemyHp: number;
  leaked: number;
  defeated: number;
  spawned: number;
  shotsFired: number;
  matchedHits: number;
  resistedHits: number;
  estimatedReward: number;
}

export interface SimWorldResult {
  worldId: string;
  bpm: number;
  waves: SimWaveResult[];
  cumulativeReward: number[];
}

/**
 * Run a headless simulation of one wave.
 * tower fires in perfect-aim mode: every event hits every enemy alive at that tick.
 */
export function simulateWave(
  graph: RackGraph,
  score: WaveScore,
  seedBase: number,
  laneLength: number,
  worldId: string,
  waveIndex: number,
  rewardTable: readonly number[] = [],
): SimWaveResult {
  const compiled = compileScore(score);
  const measures = score.measures;
  // Evaluate the patch for the entire wave duration.
  const result = evaluatePatch(graph, {
    startTick: 0,
    endTick: measures * TICKS_PER_MEASURE,
    seedBase,
  });
  const events = result.events;

  // Build enemy runtime state from spawns.
  interface EnemySim {
    spawn: SpawnEvent;
    hp: number;
    maxHp: number;
    alive: boolean;
    escaped: boolean;
    laneLength: number;
    band: FrequencyBand;
    hz: number;
    lifeStart: number; // tick when first on board
    lifeEnd: number;   // tick when escapes (or dies)
    moveEveryTicks: number;
    behavior: string;
  }

  const enemies: EnemySim[] = compiled.spawns.map(s => {
    const def = getEnemyDef(s.enemyTypeId)!;
    const moveTicks = def.moveEveryTicks;
    let lifetime = laneLength * moveTicks;
    // Fermata adds 1 extra measure of pause at the midpoint.
    if (def.behavior === 'fermata') lifetime += TICKS_PER_MEASURE;
    const hz = s.hertz ?? bandToHz(s.band);
    return {
      spawn: s,
      hp: def.maxHp,
      maxHp: def.maxHp,
      alive: true,
      escaped: false,
      laneLength,
      band: s.band,
      hz,
      lifeStart: s.tick,
      lifeEnd: s.tick + lifetime,
      moveEveryTicks: moveTicks,
      behavior: def.behavior,
    };
  });

  let shotsFired = 0;
  let matchedHits = 0;
  let resistedHits = 0;

  // Process each signal event in tick order (they're already sorted).
  for (const ev of events) {
    const evHz = eventHertz(ev);
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      if (ev.tick < enemy.lifeStart || ev.tick > enemy.lifeEnd) continue;

      // Crescendo: average damageScale over lifetime.
      let scale = 1;
      if (enemy.behavior === 'crescendo') {
        // At this specific tick, progress through lane:
        const progress = (ev.tick - enemy.lifeStart) / Math.max(1, enemy.lifeEnd - enemy.lifeStart);
        scale = 1 - 0.5 * Math.min(1, progress);
      }

      const mult = damageMultiplier(evHz, enemy.hz);
      const dmg = ev.amplitude * mult * scale;
      enemy.hp = Math.max(0, enemy.hp - dmg);
      shotsFired++;
      if (mult >= 2) matchedHits++;
      else resistedHits++;
      if (enemy.hp <= 0) { enemy.alive = false; }
    }
  }

  // Count outcomes.
  let leaked = 0;
  let defeated = 0;
  for (const e of enemies) {
    if (!e.alive && !e.escaped) {
      defeated++;
    } else {
      // Still alive after all events = leaked.
      leaked++;
      e.escaped = true;
    }
  }

  return {
    waveId: score.waveId,
    worldId,
    waveIndex,
    waveTitle: score.title ?? score.waveId,
    clear: leaked === 0,
    enemyCount: enemies.length,
    totalEnemyHp: enemies.reduce((sum, e) => sum + e.maxHp, 0),
    leaked,
    defeated,
    spawned: enemies.length,
    shotsFired,
    matchedHits,
    resistedHits,
    estimatedReward: cumulativeReward(rewardTable, waveIndex + 1),
  };
}

/**
 * Build a minimal starter rack graph (clock → osc → output) for simulation.
 */
export function starterRack(): RackGraph {
  return {
    modules: [
      { instanceId: 'm-clock', typeId: 'clock', gridY: 0, gridX: 0, settings: { subdivisionTicks: 48, phaseTicks: 0, gate: 0.5 } },
      { instanceId: 'm-osc',   typeId: 'osc',   gridY: 0, gridX: 2, settings: { waveform: 'pulse', band: 'mid', baseNote: 'band' } },
      { instanceId: 'm-out',   typeId: 'output', gridY: 0, gridX: 5, settings: { synthOn: false, synthVolume: 0.5 } },
    ],
    cables: [
      { cableId: 'c-clock-osc', fromModuleId: 'm-clock', fromPortId: 'out', toModuleId: 'm-osc', toPortId: 'in' },
      { cableId: 'c-osc-out',   fromModuleId: 'm-osc',   fromPortId: 'out', toModuleId: 'm-out', toPortId: 'in' },
    ],
  };
}

/** A deliberately bad rack: slow clock, low-band oscillator, no modifiers. */
export function weakRack(): RackGraph {
  return {
    modules: [
      { instanceId: 'm-clock', typeId: 'clock', gridY: 0, gridX: 0, settings: { subdivisionTicks: 192, phaseTicks: 0, gate: 0.4 } },
      { instanceId: 'm-osc', typeId: 'osc', gridY: 0, gridX: 2, settings: { waveform: 'sine', band: 'low', baseNote: 'band' } },
      { instanceId: 'm-out', typeId: 'output', gridY: 0, gridX: 5, settings: { synthOn: false, synthVolume: 0.5 } },
    ],
    cables: [
      { cableId: 'c-clock-osc', fromModuleId: 'm-clock', fromPortId: 'out', toModuleId: 'm-osc', toPortId: 'in' },
      { cableId: 'c-osc-out', fromModuleId: 'm-osc', fromPortId: 'out', toModuleId: 'm-out', toPortId: 'in' },
    ],
  };
}

/** Early shop patch: starter path with a safe gain boost after w40 unlocks AMP. */
export function recommendedEarlyRack(worldId: string): RackGraph {
  const band = worldId === 'w60' || worldId === 'w80' || worldId === 'w120' ? 'high'
    : worldId === 'w40' || worldId === 'w140' ? 'mid'
      : 'low';
  return {
    modules: [
      { instanceId: 'm-clock', typeId: 'clock', gridY: 0, gridX: 0, settings: { subdivisionTicks: 48, phaseTicks: 0, gate: 0.65 } },
      { instanceId: 'm-osc', typeId: 'osc', gridY: 0, gridX: 2, settings: { waveform: 'pulse', band, baseNote: 'band' } },
      { instanceId: 'm-amp', typeId: 'amp', gridY: 0, gridX: 5, settings: { gain: 1.35 } },
      { instanceId: 'm-out', typeId: 'output', gridY: 0, gridX: 8, settings: { synthOn: false, synthVolume: 0.5 } },
    ],
    cables: [
      { cableId: 'c-clock-osc', fromModuleId: 'm-clock', fromPortId: 'out', toModuleId: 'm-osc', toPortId: 'in' },
      { cableId: 'c-osc-amp', fromModuleId: 'm-osc', fromPortId: 'out', toModuleId: 'm-amp', toPortId: 'in' },
      { cableId: 'c-amp-out', fromModuleId: 'm-amp', fromPortId: 'out', toModuleId: 'm-out', toPortId: 'in' },
    ],
  };
}

/** Multi-output profile: splitter branches into two independent output towers. */
export function multiOutputRack(): RackGraph {
  return {
    modules: [
      { instanceId: 'm-clock', typeId: 'clock', gridY: 0, gridX: 0, settings: { subdivisionTicks: 48, phaseTicks: 0, gate: 0.55 } },
      { instanceId: 'm-osc', typeId: 'osc', gridY: 0, gridX: 2, settings: { waveform: 'square', band: 'mid', baseNote: 'band' } },
      { instanceId: 'm-split', typeId: 'splitter', gridY: 0, gridX: 5, settings: { dirB: 'east', dirC: 'south' } },
      { instanceId: 'm-out-a', typeId: 'output', gridY: 0, gridX: 8, settings: { synthOn: false, synthVolume: 0.5 } },
      { instanceId: 'm-out-b', typeId: 'output', gridY: 1, gridX: 8, settings: { synthOn: false, synthVolume: 0.5 } },
    ],
    cables: [
      { cableId: 'c-clock-osc', fromModuleId: 'm-clock', fromPortId: 'out', toModuleId: 'm-osc', toPortId: 'in' },
      { cableId: 'c-osc-split', fromModuleId: 'm-osc', fromPortId: 'out', toModuleId: 'm-split', toPortId: 'in' },
      { cableId: 'c-split-a', fromModuleId: 'm-split', fromPortId: 'outA', toModuleId: 'm-out-a', toPortId: 'in' },
      { cableId: 'c-split-b', fromModuleId: 'm-split', fromPortId: 'outB', toModuleId: 'm-out-b', toPortId: 'in' },
    ],
  };
}

/** Strong late-game profile: fast clock plus auto-tuning and gain. */
export function lateGameStrongRack(): RackGraph {
  return {
    modules: [
      { instanceId: 'm-clock', typeId: 'clock', gridY: 0, gridX: 0, settings: { subdivisionTicks: 24, phaseTicks: 0, gate: 0.75 } },
      { instanceId: 'm-osc', typeId: 'osc', gridY: 0, gridX: 2, settings: { waveform: 'saw', band: 'mid', baseNote: 'band' } },
      { instanceId: 'm-harm', typeId: 'harmonizer', gridY: 0, gridX: 5, settings: { intervalSet: 'SPREAD', balance: true } },
      { instanceId: 'm-auto', typeId: 'targetTuner', gridY: 0, gridX: 8, settings: { mode: 'nearest' } },
      { instanceId: 'm-amp', typeId: 'amp', gridY: 0, gridX: 11, settings: { gain: 1.4 } },
      { instanceId: 'm-out', typeId: 'output', gridY: 0, gridX: 14, settings: { synthOn: false, synthVolume: 0.5 } },
    ],
    cables: [
      { cableId: 'c-clock-osc', fromModuleId: 'm-clock', fromPortId: 'out', toModuleId: 'm-osc', toPortId: 'in' },
      { cableId: 'c-osc-harm', fromModuleId: 'm-osc', fromPortId: 'out', toModuleId: 'm-harm', toPortId: 'in' },
      { cableId: 'c-harm-auto', fromModuleId: 'm-harm', fromPortId: 'out', toModuleId: 'm-auto', toPortId: 'in' },
      { cableId: 'c-auto-amp', fromModuleId: 'm-auto', fromPortId: 'out', toModuleId: 'm-amp', toPortId: 'in' },
      { cableId: 'c-amp-out', fromModuleId: 'm-amp', fromPortId: 'out', toModuleId: 'm-out', toPortId: 'in' },
    ],
  };
}

export interface RackProfile {
  profileId: string;
  label: string;
  graphForWorld(world: WorldDef): RackGraph;
}

export const SIM_RACK_PROFILES: readonly RackProfile[] = [
  { profileId: 'starter', label: 'starter patch: clock -> oscillator -> output', graphForWorld: () => starterRack() },
  { profileId: 'recommendedEarly', label: 'recommended early patch for world', graphForWorld: world => recommendedEarlyRack(world.worldId) },
  { profileId: 'multiOutput', label: 'multi-output patch', graphForWorld: () => multiOutputRack() },
  { profileId: 'weak', label: 'intentionally weak/bad patch', graphForWorld: () => weakRack() },
  { profileId: 'lateStrong', label: 'late-game strong patch', graphForWorld: () => lateGameStrongRack() },
];
