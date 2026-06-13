/**
 * economy.ts — Resonance meta-currency: milestone rewards, purchases,
 * refunds, shelf economy. All operations are atomic over SaveData: they
 * either complete and return ok, or change nothing.
 */

import { SaveData, getWorldSave } from './save';
import { getModuleType, ModuleTypeDef } from '../core/modules';
import { ModuleInstance } from '../core/graph';
import { hashString } from '../core/rng';
import { RACK_COLS, MAX_ROWS, checkRackFit, findRackSlot } from '../core/rack-layout';
export { RACK_COLS, MAX_ROWS } from '../core/rack-layout';

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

// ── Rack dimensions ──────────────────────────────────────────────────────────

/** Cost of buying a new rack row (row n, 1-based; row 1 is free and mandatory). */
export const SHELF_COSTS: readonly number[] = [0, 30, 60, 90, 120, 150, 180, 200];
// Legacy aliases — prefer MAX_ROWS / RACK_COLS (re-exported from rack-layout.ts above).
export { MAX_ROWS as MAX_SHELVES, RACK_COLS as SHELF_SLOTS } from '../core/rack-layout';

export interface EconomyResult {
  ok: boolean;
  error?: string;
}

export function shelfCost(shelfNumber: number): number {
  return SHELF_COSTS[shelfNumber - 1] ?? Infinity;
}

export function purchaseShelf(save: SaveData, worldId: string): EconomyResult {
  const ws = getWorldSave(save, worldId);
  if (ws.shelfCount >= MAX_ROWS) return { ok: false, error: 'Rack already has the maximum eight rows.' };
  const cost = shelfCost(ws.shelfCount + 1);
  if (save.resonance < cost) return { ok: false, error: `Needs ${cost} ${CURRENCY_NAME}.` };
  save.resonance -= cost;
  ws.shelfCount++;
  return { ok: true };
}

export function refundShelf(save: SaveData, worldId: string): EconomyResult {
  const ws = getWorldSave(save, worldId);
  if (ws.shelfCount <= 1) return { ok: false, error: 'The first row cannot be removed.' };
  const lastRow = ws.shelfCount - 1;
  // A module occupies the last row if any of its rows falls on lastRow.
  const occupied = ws.rack.modules.some(m => {
    const def = getModuleType(m.typeId);
    const h = def?.rackSize.h ?? 1;
    return m.gridY <= lastRow && m.gridY + h > lastRow;
  });
  if (occupied) return { ok: false, error: 'Row must be empty before refunding.' };
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

/** Build a PlacedRect array from ModuleInstance[], looking up each module's rackSize. */
function toPlacedRects(
  modules: readonly ModuleInstance[],
  skipInstanceId?: string | null,
) {
  return modules
    .filter(m => m.instanceId !== skipInstanceId)
    .map(m => {
      const def = getModuleType(m.typeId);
      return { gridY: m.gridY, gridX: m.gridX, w: def?.rackSize.w ?? 2, h: def?.rackSize.h ?? 1 };
    });
}

/**
 * Does a module with the given rackSize fit at (gridY, gridX) without
 * overlapping the rack boundary or any existing module?
 */
export function checkPlacement(
  modules: readonly ModuleInstance[],
  rowCount: number,
  ignoreInstanceId: string | null,
  gridY: number,
  gridX: number,
  rackSize: { w: number; h: number },
): PlacementCheck {
  // Keep explicit reason strings for UI feedback.
  if (gridY < 0 || gridY + rackSize.h > rowCount) return { fits: false, reason: 'Outside rack rows.' };
  if (gridX < 0 || gridX + rackSize.w > RACK_COLS) return { fits: false, reason: 'Outside rack columns.' };
  const placed = toPlacedRects(modules, ignoreInstanceId);
  return checkRackFit(placed, gridY, gridX, rackSize.w, rackSize.h, rowCount)
    ? { fits: true }
    : { fits: false, reason: 'Overlaps another module.' };
}

/**
 * Find the first free position for a module of the given rackSize.
 * Scans row-major order (top-left to bottom-right).
 */
export function findFreeSlot(
  modules: readonly ModuleInstance[],
  rowCount: number,
  rackSize: { w: number; h: number },
): { gridY: number; gridX: number } | null {
  return findRackSlot(toPlacedRects(modules), rackSize.w, rackSize.h, rowCount);
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
  const spot = findFreeSlot(ws.rack.modules, ws.shelfCount, def.rackSize);
  if (!spot) return { ok: false, error: 'No free rack space — move modules or buy a row.' };
  const instanceId = newInstanceId(typeId, save);
  save.resonance -= def.cost;
  ws.rack.modules.push({
    instanceId,
    typeId,
    gridY: spot.gridY,
    gridX: spot.gridX,
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
  const starterOutputId = ws.rack.modules.find(m => m.typeId === 'output')?.instanceId;
  if (def.isStarter && (def.typeId !== 'output' || instanceId === starterOutputId)) {
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

  const starterLayout: Array<{ typeId: string; gridX: number }> = [
    { typeId: 'clock', gridX: 0 },
    { typeId: 'osc', gridX: 3 },
    { typeId: 'output', gridX: 12 },
  ];

  // Ensure enough rows for the tallest starter module (output is 3×2, needs 2 rows).
  const maxStarterH = starterLayout.reduce((acc, { typeId }) => {
    const def = getModuleType(typeId);
    return Math.max(acc, def?.rackSize.h ?? 1);
  }, 1);
  if (ws.shelfCount < maxStarterH) {
    ws.shelfCount = maxStarterH;
    changed = true;
  }

  for (const { typeId, gridX } of starterLayout) {
    if (have(typeId)) continue;
    const def = getModuleType(typeId)!;
    // Prefer the canonical column; fall back to any free slot.
    const spot = checkPlacement(ws.rack.modules, ws.shelfCount, null, 0, gridX, def.rackSize).fits
      ? { gridY: 0, gridX }
      : findFreeSlot(ws.rack.modules, ws.shelfCount, def.rackSize);
    if (!spot) continue;
    ws.rack.modules.push({
      instanceId: newInstanceId(typeId, save),
      typeId,
      gridY: spot.gridY,
      gridX: spot.gridX,
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
