/**
 * upgrades.ts — InfinityLoops meta-currency and global per-module-type
 * upgrades. Earned only in endless mode; spent to raise a module type's
 * tier, which increases its in-combat effect for every instance of that
 * type across all worlds. All operations are atomic over SaveData.
 */

import { SaveData } from './save';
import { getModuleType } from '../core/modules';

// ── Currency identity ───────────────────────────────────────────────────────

export const INFINITY_NAME = 'InfinityLoops';
export const INFINITY_SYMBOL = '∞';

export const MAX_UPGRADE_LEVEL = 3;

// ── Earning (endless mode) ──────────────────────────────────────────────────

/**
 * InfinityLoops granted for clearing the given endless wave (1-based depth
 * beyond the campaign). Slowly scales with depth so deeper runs pay more.
 */
export function endlessWaveReward(endlessWave: number): number {
  return 2 + Math.floor(Math.max(0, endlessWave - 1) / 3);
}

export function earnInfinityLoops(save: SaveData, amount: number): number {
  const n = Math.max(0, Math.floor(amount));
  if (n > 0) save.infinityLoops += n;
  return n;
}

// ── Upgrade catalog ─────────────────────────────────────────────────────────

/**
 * One-line description of what upgrading a module type does. Only types in
 * this map are upgradeable; everything else (clock, passive connector) is not.
 * Every upgradeable type gets a per-level amplitude "potency" bonus applied in
 * the evaluator (graph.ts); a few also gain a structural bonus in their own
 * process (see modules.ts: ctx.upgradeLevel).
 */
export const UPGRADE_EFFECTS: Record<string, string> = {
  osc: 'Voices fire louder — more projectile damage per tier.',
  output: 'Final signal amplified — every projectile hits harder.',
  amp: 'Scaled signal carries more punch per tier.',
  delay: '+1 echo repeat per tier, and echoes ring louder.',
  phase: 'Time-shifted voices strike harder per tier.',
  splitter: 'Each branch keeps more of its strength per tier.',
  mixer: 'The combined signal lands harder per tier.',
  router: 'Routed voices strike harder per tier.',
  filter: 'Passband leakage cut and passed voices louder per tier.',
  envelope: 'Shaped voices strike harder per tier.',
  clockdiv: 'Re-clocked voices strike harder per tier.',
  sequencer: 'Sequenced voices strike harder per tier.',
  arp: 'Arpeggiated voices strike harder per tier.',
  probability: '+pass chance and louder survivors per tier.',
  resonator: 'Re-tuned voices strike harder per tier.',
  pitchDial: 'Tuned voices strike harder per tier.',
  octaveSwitch: 'Shifted voices strike harder per tier.',
  harmonizer: 'Stacked voices strike harder per tier.',
  pitchRouter: 'Register-routed voices strike harder per tier.',
  pitchFilter: 'Wider pitch window and louder passed voices per tier.',
  pitchMemory: 'Retuned voices strike harder per tier.',
  targetTuner: 'Auto-tuned voices strike harder per tier.',
};

export function isUpgradeable(typeId: string): boolean {
  return UPGRADE_EFFECTS[typeId] !== undefined && getModuleType(typeId) !== undefined;
}

export function moduleUpgradeLevel(save: SaveData, typeId: string): number {
  const v = save.moduleUpgrades?.[typeId];
  return typeof v === 'number' && v > 0 ? Math.min(MAX_UPGRADE_LEVEL, Math.floor(v)) : 0;
}

/** Cost in InfinityLoops to advance from `level` to `level + 1`. */
export function upgradeCost(level: number): number {
  return 3 + level * 4; // 3, 7, 11
}

export interface UpgradeResult {
  ok: boolean;
  error?: string;
  level?: number;
}

export function purchaseUpgrade(save: SaveData, typeId: string): UpgradeResult {
  if (!isUpgradeable(typeId)) return { ok: false, error: 'This module cannot be upgraded.' };
  const level = moduleUpgradeLevel(save, typeId);
  if (level >= MAX_UPGRADE_LEVEL) return { ok: false, error: 'Already at the maximum tier.' };
  const cost = upgradeCost(level);
  if (save.infinityLoops < cost) return { ok: false, error: `Needs ${cost} ${INFINITY_SYMBOL} ${INFINITY_NAME}.` };
  save.infinityLoops -= cost;
  if (!save.moduleUpgrades) save.moduleUpgrades = {};
  save.moduleUpgrades[typeId] = level + 1;
  return { ok: true, level: level + 1 };
}

/** Snapshot of every upgraded type's level, for passing into evaluatePatch. */
export function upgradeLevels(save: SaveData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const typeId of Object.keys(save.moduleUpgrades ?? {})) {
    const lvl = moduleUpgradeLevel(save, typeId);
    if (lvl > 0) out[typeId] = lvl;
  }
  return out;
}
