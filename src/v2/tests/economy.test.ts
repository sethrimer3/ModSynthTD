/**
 * economy.test.ts — Milestones, purchases, refunds, shelves, atomicity.
 */

import { test, assert, assertEq } from './harness';
import { defaultSave, getWorldSave } from '../state/save';
import {
  cumulativeReward, recordWaveCleared, recordWorldCompleted,
  purchaseShelf, refundShelf, purchaseModule, sellModule,
  ensureStarterRack, checkPlacement, findFreeSlot, RACK_COLS,
} from '../state/economy';
import {
  isWorldUnlocked, applyWorldCompletionUnlocks, secretHintLevel,
  checkCipherRoute, blueprintsUnlockedBy,
} from '../state/progression';
import { RackGraph, validateGraph } from '../core/graph';
import { getModuleType } from '../core/modules';

const TABLE = [4, 9, 14, 20, 28, 36, 46, 58]; // cumulative by wave

test('milestone rewards pay only the positive cumulative difference', () => {
  const save = defaultSave();
  let r = recordWaveCleared(save, 'w40', 4, TABLE);
  assertEq(r.awarded, 20, 'first reach of wave 4 pays cum(4)');
  assertEq(save.resonance, 20, 'balance updated');
  r = recordWaveCleared(save, 'w40', 6, TABLE);
  assertEq(r.awarded, 16, 'wave 6 pays cum(6)-cum(4) = 36-20');
  r = recordWaveCleared(save, 'w40', 6, TABLE);
  assertEq(r.awarded, 0, 'replaying the same wave pays nothing');
  r = recordWaveCleared(save, 'w40', 3, TABLE);
  assertEq(r.awarded, 0, 'lower wave after higher best pays nothing');
  assertEq(getWorldSave(save, 'w40').bestWave, 6, 'best wave not lowered');
  r = recordWaveCleared(save, 'w40', 7, TABLE);
  assertEq(r.awarded, 10, 'next increment only');
  assertEq(save.resonance, 46, 'total matches cum(7)');
});

test('milestones survive a save/reload cycle without double pay', () => {
  const save = defaultSave();
  recordWaveCleared(save, 'w40', 5, TABLE);
  const reloaded = JSON.parse(JSON.stringify(save));
  const r = recordWaveCleared(reloaded, 'w40', 5, TABLE);
  assertEq(r.awarded, 0, 'no award after reload at same best');
  assertEq(reloaded.resonance, save.resonance, 'balance unchanged');
});

test('world completion reward is one-time', () => {
  const save = defaultSave();
  let r = recordWorldCompleted(save, 'w40', 50);
  assertEq(r.awarded, 50, 'first completion pays');
  r = recordWorldCompleted(save, 'w40', 50);
  assertEq(r.awarded, 0, 'repeat pays nothing');
  assertEq(save.resonance, 50, 'balance correct');
});

test('shelf purchase and eligible refund', () => {
  const save = defaultSave();
  save.resonance = 100;
  let r = purchaseShelf(save, 'w40');
  assertEq(r.ok, true, 'shelf 2 affordable at 60');
  assertEq(save.resonance, 40, 'cost deducted');
  assertEq(getWorldSave(save, 'w40').shelfCount, 2, 'shelf added');
  r = purchaseShelf(save, 'w40');
  assertEq(r.ok, false, 'shelf 3 costs 120 — cannot afford');
  assertEq(save.resonance, 40, 'failed purchase changes nothing');
  r = refundShelf(save, 'w40');
  assertEq(r.ok, true, 'empty shelf 2 refundable');
  assertEq(save.resonance, 100, '100% refund');
  r = refundShelf(save, 'w40');
  assertEq(r.ok, false, 'first shelf not refundable');
});

test('occupied shelf cannot be refunded', () => {
  const save = defaultSave();
  save.resonance = 200;
  purchaseShelf(save, 'w40');
  const ws = getWorldSave(save, 'w40');
  ws.rack.modules.push({ instanceId: 'm-test', typeId: 'connector', gridY: 1, gridX: 0, settings: {} });
  const r = refundShelf(save, 'w40');
  assertEq(r.ok, false, 'occupied shelf blocked');
  assertEq(ws.shelfCount, 2, 'shelf retained');
});

test('module purchase requires blueprint, funds, and space; full refund on sell', () => {
  const save = defaultSave();
  save.resonance = 100;
  let r = purchaseModule(save, 'w40', 'amp');
  assertEq(r.ok, false, 'amp blueprint locked initially');
  save.blueprints.push('amp');
  r = purchaseModule(save, 'w40', 'amp');
  assertEq(r.ok, true, 'unlocked + affordable purchase succeeds');
  const cost = getModuleType('amp')!.cost;
  assertEq(save.resonance, 100 - cost, 'cost deducted');
  const ws = getWorldSave(save, 'w40');
  assertEq(ws.rack.modules.length, 1, 'instance created');
  const id = r.instanceId!;
  const sr = sellModule(save, 'w40', id);
  assertEq(sr.ok, true, 'sell succeeds');
  assertEq(save.resonance, 100, '100% refund restores balance');
  assertEq(ws.rack.modules.length, 0, 'instance removed');
});

test('selling removes attached cables atomically', () => {
  const save = defaultSave();
  save.resonance = 100;
  save.blueprints.push('amp');
  ensureStarterRack(save, 'w40');
  const r = purchaseModule(save, 'w40', 'amp');
  const ws = getWorldSave(save, 'w40');
  const osc = ws.rack.modules.find(m => m.typeId === 'osc')!;
  ws.rack.cables.push({ cableId: 'c-t', fromModuleId: osc.instanceId, fromPortId: 'out', toModuleId: r.instanceId!, toPortId: 'in' });
  const before = ws.rack.cables.length;
  sellModule(save, 'w40', r.instanceId!);
  assertEq(ws.rack.cables.length, before - 1, 'attached cable removed with module');
});

test('additional output can be bought and selling removes its tower', () => {
  const save = defaultSave();
  save.resonance = 100;
  ensureStarterRack(save, 'w40');
  const bought = purchaseModule(save, 'w40', 'output');
  assertEq(bought.ok, true, 'output is shop-buyable');
  const ws = getWorldSave(save, 'w40');
  ws.towersByOutputId[bought.instanceId!] = { tileX: 2, tileY: 3, orientation: 'north' };
  sellModule(save, 'w40', bought.instanceId!);
  assertEq(ws.towersByOutputId[bought.instanceId!], undefined, 'tower placement removed with output');
});

test('starter output cannot be sold for free Resonance profit', () => {
  const save = defaultSave();
  ensureStarterRack(save, 'w40');
  const ws = getWorldSave(save, 'w40');
  const starter = ws.rack.modules.find(m => m.typeId === 'output')!;
  const before = save.resonance;
  const result = sellModule(save, 'w40', starter.instanceId);
  assertEq(result.ok, false, 'starter output is not sellable');
  assertEq(save.resonance, before, 'failed sale grants no Resonance');
});

test('purchased output costs and refunds exactly its purchase cost', () => {
  const save = defaultSave();
  save.resonance = 100;
  ensureStarterRack(save, 'w40');
  const result = purchaseModule(save, 'w40', 'output');
  assertEq(result.ok, true, 'additional output purchase succeeds');
  assertEq(save.resonance, 55, 'output cost deducted');
  assertEq(sellModule(save, 'w40', result.instanceId!).ok, true, 'purchased output sells');
  assertEq(save.resonance, 100, 'sale only restores paid cost');
});

test('starter modules cannot be sold and starter repair is idempotent', () => {
  const save = defaultSave();
  const changed1 = ensureStarterRack(save, 'w40');
  assertEq(changed1, true, 'starter rack created');
  const ws = getWorldSave(save, 'w40');
  assertEq(ws.rack.modules.length, 3, 'clock + osc + output');
  assertEq(ws.rack.cables.length, 2, 'two starter cables');
  const changed2 = ensureStarterRack(save, 'w40');
  assertEq(changed2, false, 'second call is a no-op');
  const clock = ws.rack.modules.find(m => m.typeId === 'clock')!;
  const sr = sellModule(save, 'w40', clock.instanceId);
  assertEq(sr.ok, false, 'starter unsellable');
  const v = validateGraph({ modules: ws.rack.modules, cables: ws.rack.cables });
  assertEq(v.status, 'valid', 'starter rack is a valid patch');
});

test('repeated purchases never duplicate instance ids', () => {
  const save = defaultSave();
  save.resonance = 1000;
  save.blueprints.push('connector');
  const ids = new Set<string>();
  for (let i = 0; i < 10; i++) {
    const r = purchaseModule(save, 'w40', 'connector');
    assertEq(r.ok, true, `purchase ${i} ok`);
    assert(!ids.has(r.instanceId!), 'instance id unique');
    ids.add(r.instanceId!);
  }
});

test('placement rejects overlap and out-of-bounds', () => {
  // osc has rackSize {w:3, h:1}, placed at gridY:0, gridX:0 — occupies cols 0-2
  const modules = [
    { instanceId: 'a', typeId: 'osc', gridY: 0, gridX: 0, settings: {} },
  ];
  assertEq(checkPlacement(modules, 1, null, 0, 2, { w: 2, h: 1 }).fits, false, 'overlap rejected');
  assertEq(checkPlacement(modules, 1, null, 0, 3, { w: 2, h: 1 }).fits, true, 'adjacent ok');
  assertEq(checkPlacement(modules, 1, null, 0, RACK_COLS - 1, { w: 2, h: 1 }).fits, false, 'spills past column edge');
  assertEq(checkPlacement(modules, 1, null, 1, 0, { w: 2, h: 1 }).fits, false, 'no such row');
  assertEq(checkPlacement(modules, 1, 'a', 0, 0, { w: 3, h: 1 }).fits, true, 'self ignored when moving');
  // Multi-row: {w:2, h:2} at gridY:0 with 1 row available should fail
  assertEq(checkPlacement([], 1, null, 0, 0, { w: 2, h: 2 }).fits, false, 'multi-row rejected when only 1 row');
  // Same placement with 2 rows should succeed
  assertEq(checkPlacement([], 2, null, 0, 0, { w: 2, h: 2 }).fits, true, 'multi-row fits with 2 rows');
});

test('findFreeSlot fills grid deterministically', () => {
  const modules: Array<{ instanceId: string; typeId: string; gridY: number; gridX: number; settings: Record<string, never> }> = [];
  const spot = findFreeSlot(modules, 1, { w: 2, h: 1 });
  assertEq(spot, { gridY: 0, gridX: 0 }, 'first slot first');
});

test('world unlock chain follows completion', () => {
  const order = ['w40', 'w60', 'w80'];
  const save = defaultSave();
  assertEq(isWorldUnlocked(save, 'w40', order), true, 'first world open');
  assertEq(isWorldUnlocked(save, 'w60', order), false, 'second locked');
  recordWorldCompleted(save, 'w40', 0);
  assertEq(isWorldUnlocked(save, 'w60', order), true, 'second opens after first completed');
  assertEq(isWorldUnlocked(save, 'w200', order), false, 'secret world locked without reveal');
  save.secretRevealed = true;
  assertEq(isWorldUnlocked(save, 'w200', order), true, 'secret world open after reveal');
});

test('completion unlocks blueprints from registry data', () => {
  const save = defaultSave();
  const granted = applyWorldCompletionUnlocks(save, 'w40');
  assertEq(granted, blueprintsUnlockedBy('w40'), 'w40 grants its blueprint set');
  assert(granted.includes('amp'), 'amp unlocks after w40');
  const again = applyWorldCompletionUnlocks(save, 'w40');
  assertEq(again.length, 0, 'idempotent');
});

test('secret hints appear at six and eight completions', () => {
  const order = ['w40', 'w60', 'w80', 'w100', 'w120', 'w140', 'w160', 'w180'];
  const save = defaultSave();
  assertEq(secretHintLevel(save, order), 0, 'no hints initially');
  for (const w of order.slice(0, 6)) recordWorldCompleted(save, w, 0);
  assertEq(secretHintLevel(save, order), 1, 'first hint at six');
  for (const w of order.slice(6)) recordWorldCompleted(save, w, 0);
  assertEq(secretHintLevel(save, order), 2, 'strong clue at eight');
});

// ── Signal Cipher route ─────────────────────────────────────────────────────

let seq = 0;
function m(typeId: string, settings: Record<string, number | string | boolean> = {}) {
  return { instanceId: `cm${seq++}-${typeId}`, typeId, gridY: 0, gridX: 0, settings };
}
function c(from: { instanceId: string }, fp: string, to: { instanceId: string }, tp: string) {
  return { cableId: `cc${seq++}`, fromModuleId: from.instanceId, fromPortId: fp, toModuleId: to.instanceId, toPortId: tp };
}

/**
 * Builds clock → osc → splitter with two branches into a mixer → output.
 * Branch A: connector (plus a delay when timeOnBoth).
 * Branch B: phase offset when timeOnB, otherwise a bare connector.
 */
function cipherGraph(timeOnB: boolean, timeOnBoth = false): RackGraph {
  const clock = m('clock');
  const osc = m('osc');
  const split = m('splitter');
  const connA = m('connector');
  const mix = m('mixer');
  const out = m('output');
  const mods = [clock, osc, split, connA, mix, out];
  const cables = [
    c(clock, 'out', osc, 'in'),
    c(osc, 'out', split, 'in'),
    c(split, 'outA', connA, 'in'),
    c(mix, 'out', out, 'in'),
  ];
  // Branch A tail: connector → (delay when timeOnBoth) → mixer.inA
  if (timeOnBoth) {
    const dly = m('delay');
    mods.push(dly);
    cables.push(c(connA, 'out', dly, 'in'));
    cables.push(c(dly, 'out', mix, 'inA'));
  } else {
    cables.push(c(connA, 'out', mix, 'inA'));
  }
  // Branch B: phase (time-shift) or bare connector → mixer.inB
  if (timeOnB) {
    const ph = m('phase', { offsetTicks: 24 });
    mods.push(ph);
    cables.push(c(split, 'outB', ph, 'in'));
    cables.push(c(ph, 'out', mix, 'inB'));
  } else {
    const connB = m('connector');
    mods.push(connB);
    cables.push(c(split, 'outB', connB, 'in'));
    cables.push(c(connB, 'out', mix, 'inB'));
  }
  return { modules: mods, cables };
}

test('cipher route accepted: split, one time-shifted branch, remix, output', () => {
  const g = cipherGraph(true);
  const r = checkCipherRoute(g);
  assertEq(r.ok, true, `cipher should pass: ${r.reason ?? ''}`);
  assert(!!r.splitterId && !!r.mixerId, 'route endpoints reported');
});

test('cipher rejected when no branch is time-shifted', () => {
  const r = checkCipherRoute(cipherGraph(false));
  assertEq(r.ok, false, 'two plain branches do not count');
});

test('cipher rejected when both branches are time-shifted', () => {
  const r = checkCipherRoute(cipherGraph(true, true));
  assertEq(r.ok, false, 'exactly one displaced branch required');
});

test('cipher rejected for invalid patch (no route to output)', () => {
  const g = cipherGraph(true);
  g.cables = g.cables.filter(cb => !cb.toModuleId.includes('output'));
  const r = checkCipherRoute(g);
  assertEq(r.ok, false, 'must reach output');
});
