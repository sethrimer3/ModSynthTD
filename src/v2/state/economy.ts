/**
 * economy.ts — Resonance meta-currency: milestone rewards, purchases,
 * refunds, shelf economy. All operations are atomic over SaveData: they
 * either complete and return ok, or change nothing.
 */

import { SaveData, getWorldSave } from './save';
import { getModuleType, ModuleTypeDef } from '../core/modules';
import { ModuleInstance } from '../core/graph';
import { hashString } from '../core/rng';

// ── Currency identity ───────────────────────────────────────────────────────

export const CURRENCY_NAME = 'Resonance';
export const CURRENCY_SYMBOL = '◈';

// ── Milestone rewards ───────────────────────────────────────────────────────

/**
 * Cumulative reward by wave: table[w-1] = total Resonance for reaching wave w.
 * newReward = cum(newBest) − cum(prevBest); only the positive difference is
 * ever granted, so replays and reloads can never double-claim.
 */
export function cumulativeReward(table: readonly number[], wave: number): number {
  if (wave <= 0 || table.length === 0) return 0;
  const idx = Math.min(wave, table.length) - 1;
  return table[idx];
}

export interface ClaimResult {
  awarded: number;
}

/**
 * Record a newly cleared wave. Updates bestWave and claims any unclaimed
 * milestone difference. Safe to call repeatedly — repeats award 0.
 */
export function recordWaveCleared(save: SaveData, worldId: string, wave: number, table: readonly number[]): ClaimResult {
  const ws = getWorldSave(save, worldId);
  if (wave > ws.bestWave) ws.bestWave = wave;
  if (ws.bestWave <= ws.claimedWaveReward) return { awarded: 0 };
  const award = cumulativeReward(table, ws.bestWave) - cumulativeReward(table, ws.claimedWaveReward);
  ws.claimedWaveReward = ws.bestWave;
  if (award > 0) save.resonance += award;
  return { awarded: Math.max(0, award) };
}

/** One-time world completion reward. Repeats award 0. */
export function recordWorldCompleted(save: SaveData, worldId: string, completionReward: number): ClaimResult {
  const ws = getWorldSave(save, worldId);
  ws.completed = true;
  if (ws.completionClaimed) return { awarded: 0 };
  ws.completionClaimed = true;
  save.resonance += completionReward;
  return { awarded: completionReward };
}

// ── Shelves ─────────────────────────────────────────────────────────────────

/** Cost of buying shelf n (1-based; shelf 1 is free and mandatory). */
export const SHELF_COSTS: readonly number[] = [0, 60, 120, 200];
export const MAX_SHELVES = 4;
/** Grid slots per shelf. */
export const SHELF_SLOTS = 16;

export interface EconomyResult {
  ok: boolean;
  error?: string;
}

export function shelfCost(shelfNumber: number): number {
  return SHELF_COSTS[shelfNumber - 1] ?? Infinity;
}

export function purchaseShelf(save: SaveData, worldId: string): EconomyResult {
  const ws = getWorldSave(save, worldId);
  if (ws.shelfCount >= MAX_SHELVES) return { ok: false, error: 'Rack already has the maximum four shelves.' };
  const cost = shelfCost(ws.shelfCount + 1);
  if (save.resonance < cost) return { ok: false, error: `Needs ${cost} ${CURRENCY_NAME}.` };
  save.resonance -= cost;
  ws.shelfCount++;
  return { ok: true };
}

export function refundShelf(save: SaveData, worldId: string): EconomyResult {
  const ws = getWorldSave(save, worldId);
  if (ws.shelfCount <= 1) return { ok: false, error: 'The first shelf cannot be removed.' };
  const shelfIndex = ws.shelfCount - 1;
  const occupied = ws.rack.modules.some(m => m.shelfIndex === shelfIndex);
  if (occupied) return { ok: false, error: 'Shelf must be empty before refunding.' };
  const cost = shelfCost(ws.shelfCount);
  ws.shelfCount--;
  save.resonance += cost;
  return { ok: true };
}

// ── Module purchases ────────────────────────────────────────────────────────

export function isBlueprintUnlocked(save: SaveData, typeId: string): boolean {
  const def = getModuleType(typeId);
  if (!def) return false;
  if (def.isStarter || def.unlockAfterWorld === null) return true;
  return save.blueprints.includes(typeId);
}

let instanceCounter = 0;

/** Stable, collision-resistant instance id. */
export function newInstanceId(typeId: string, save: SaveData): string {
  const salt = hashString(`${typeId}:${save.resonance}:${instanceCounter++}:${Object.keys(save.worlds).length}`);
  let id = `m-${typeId}-${salt.toString(36)}`;
  // Guarantee uniqueness across all racks in this save.
  const allIds = new Set<string>();
  for (const ws of Object.values(save.worlds)) {
    for (const m of ws.rack.modules) allIds.add(m.instanceId);
  }
  while (allIds.has(id)) {
    id = `m-${typeId}-${hashString(id).toString(36)}`;
  }
  return id;
}

export interface PlacementCheck {
  fits: boolean;
  reason?: string;
}

/** Does a module of given width fit at shelf/slot without overlap? */
export function checkPlacement(
  modules: readonly ModuleInstance[],
  shelfCount: number,
  ignoreInstanceId: string | null,
  shelfIndex: number,
  slotX: number,
  widthUnits: number,
): PlacementCheck {
  if (shelfIndex < 0 || shelfIndex >= shelfCount) return { fits: false, reason: 'No such shelf.' };
  if (slotX < 0 || slotX + widthUnits > SHELF_SLOTS) return { fits: false, reason: 'Outside usable rack space.' };
  for (const m of modules) {
    if (m.instanceId === ignoreInstanceId) continue;
    if (m.shelfIndex !== shelfIndex) continue;
    const def = getModuleType(m.typeId);
    const w = def?.widthUnits ?? 2;
    if (slotX < m.slotX + w && m.slotX < slotX + widthUnits) {
      return { fits: false, reason: 'Overlaps another module.' };
    }
  }
  return { fits: true };
}

/** Find the first free slot for a module of given width, or null. */
export function findFreeSlot(
  modules: readonly ModuleInstance[],
  shelfCount: number,
  widthUnits: number,
): { shelfIndex: number; slotX: number } | null {
  for (let shelf = 0; shelf < shelfCount; shelf++) {
    for (let x = 0; x + widthUnits <= SHELF_SLOTS; x++) {
      if (checkPlacement(modules, shelfCount, null, shelf, x, widthUnits).fits) {
        return { shelfIndex: shelf, slotX: x };
      }
    }
  }
  return null;
}

export interface PurchaseResult extends EconomyResult {
  instanceId?: string;
}

export function purchaseModule(save: SaveData, worldId: string, typeId: string): PurchaseResult {
  const def = getModuleType(typeId);
  if (!def) return { ok: false, error: 'Unknown module type.' };
  if (!def.shopBuyable && def.isStarter) {
    // Starters exist exactly once via ensureStarterRack, not the shop.
    return { ok: false, error: 'Starter modules are part of the rack, not the shop.' };
  }
  if (!isBlueprintUnlocked(save, typeId)) return { ok: false, error: 'Blueprint not unlocked yet.' };
  if (save.resonance < def.cost) return { ok: false, error: `Needs ${def.cost} ${CURRENCY_NAME}.` };
  const ws = getWorldSave(save, worldId);
  const spot = findFreeSlot(ws.rack.modules, ws.shelfCount, def.widthUnits);
  if (!spot) return { ok: false, error: 'No free rack space — move modules or buy a shelf.' };
  const instanceId = newInstanceId(typeId, save);
  save.resonance -= def.cost;
  ws.rack.modules.push({
    instanceId,
    typeId,
    shelfIndex: spot.shelfIndex,
    slotX: spot.slotX,
    settings: { ...def.defaultSettings },
  });
  return { ok: true, instanceId };
}

export function sellModule(save: SaveData, worldId: string, instanceId: string): EconomyResult {
  const ws = getWorldSave(save, worldId);
  const idx = ws.rack.modules.findIndex(m => m.instanceId === instanceId);
  if (idx === -1) return { ok: false, error: 'Module not found.' };
  const def = getModuleType(ws.rack.modules[idx].typeId);
  if (!def) return { ok: false, error: 'Unknown module type.' };
  if (def.isStarter && (def.typeId !== 'output' || ws.rack.modules.filter(m => m.typeId === 'output').length <= 1)) {
    return { ok: false, error: 'The last starter module cannot be sold.' };
  }
  // Atomic: remove module + its cables + refund in one step.
  ws.rack.modules.splice(idx, 1);
  ws.rack.cables = ws.rack.cables.filter(c => c.fromModuleId !== instanceId && c.toModuleId !== instanceId);
  delete ws.towersByOutputId[instanceId];
  save.resonance += def.cost; // 100% refund outside combat (caller guards live state)
  return { ok: true };
}

export function ownedCount(save: SaveData, worldId: string, typeId: string): number {
  const ws = getWorldSave(save, worldId);
  return ws.rack.modules.filter(m => m.typeId === typeId).length;
}

// ── Starter rack ────────────────────────────────────────────────────────────

/**
 * Ensure the world rack has its minimal functional starter patch:
 * clock → osc → output, fully cabled. Free, idempotent, and the
 * "repair starter patch" action. Returns true if anything was added.
 */
export function ensureStarterRack(save: SaveData, worldId: string): boolean {
  const ws = getWorldSave(save, worldId);
  let changed = false;
  const have = (typeId: string) => ws.rack.modules.find(m => m.typeId === typeId);

  const starterLayout: Array<{ typeId: string; slotX: number }> = [
    { typeId: 'clock', slotX: 0 },
    { typeId: 'osc', slotX: 3 },
    { typeId: 'output', slotX: 12 },
  ];
  for (const { typeId, slotX } of starterLayout) {
    if (have(typeId)) continue;
    const def = getModuleType(typeId)!;
    // Prefer the canonical slot; fall back to any free slot.
    const spot = checkPlacement(ws.rack.modules, ws.shelfCount, null, 0, slotX, def.widthUnits).fits
      ? { shelfIndex: 0, slotX }
      : findFreeSlot(ws.rack.modules, ws.shelfCount, def.widthUnits);
    if (!spot) continue;
    ws.rack.modules.push({
      instanceId: newInstanceId(typeId, save),
      typeId,
      shelfIndex: spot.shelfIndex,
      slotX: spot.slotX,
      settings: { ...def.defaultSettings },
    });
    changed = true;
  }

  // Cable clock→osc→output if those routes are absent.
  const clock = have('clock');
  const osc = have('osc');
  const out = have('output');
  const hasCable = (fromId: string, toId: string) =>
    ws.rack.cables.some(c => c.fromModuleId === fromId && c.toModuleId === toId);
  const hasInput = (toId: string, toPortId: string) =>
    ws.rack.cables.some(c => c.toModuleId === toId && c.toPortId === toPortId);
  const hasOutput = (fromId: string, fromPortId: string) =>
    ws.rack.cables.some(c => c.fromModuleId === fromId && c.fromPortId === fromPortId);
  let cableSeq = ws.rack.cables.length;
  if (clock && osc && !hasCable(clock.instanceId, osc.instanceId) && !hasInput(osc.instanceId, 'in') && !hasOutput(clock.instanceId, 'out')) {
    ws.rack.cables.push({ cableId: `c-starter-${worldId}-${cableSeq++}`, fromModuleId: clock.instanceId, fromPortId: 'out', toModuleId: osc.instanceId, toPortId: 'in' });
    changed = true;
  }
  if (osc && out && !hasCable(osc.instanceId, out.instanceId) && !hasInput(out.instanceId, 'in') && !hasOutput(osc.instanceId, 'out')) {
    ws.rack.cables.push({ cableId: `c-starter-${worldId}-${cableSeq++}`, fromModuleId: osc.instanceId, fromPortId: 'out', toModuleId: out.instanceId, toPortId: 'in' });
    changed = true;
  }
  return changed;
}

export function moduleTypeForShop(def: ModuleTypeDef): boolean {
  return def.shopBuyable === true || !def.isStarter;
}
