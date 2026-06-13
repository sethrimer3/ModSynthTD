/**
 * save.test.ts — Save schema, migration, import/export, malformed handling.
 */

import { test, assert, assertEq } from './harness';
import {
  SaveData, SaveStorage, SAVE_KEY, SAVE_BACKUP_PREFIX,
  defaultSave, loadSave, persistSave, importSave, exportSave, resetSave,
  getWorldSave, normalizeSave, migrateSave,
} from '../state/save';

function fakeStorage(initial: Record<string, string> = {}): SaveStorage & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: k => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
    removeItem: k => { map.delete(k); },
  };
}

test('fresh storage loads defaults', () => {
  const r = loadSave(fakeStorage());
  assertEq(r.save.schemaVersion, 2, 'current schema');
  assertEq(r.save.resonance, 0, 'no currency');
  assertEq(r.recoveredFromCorrupt, false, 'not a recovery');
});

test('save round-trips through storage', () => {
  const storage = fakeStorage();
  const save = defaultSave();
  save.resonance = 123;
  getWorldSave(save, 'w40').bestWave = 5;
  save.blueprints.push('amp');
  persistSave(storage, save);
  const r = loadSave(storage);
  assertEq(r.save.resonance, 123, 'currency survives');
  assertEq(r.save.worlds['w40'].bestWave, 5, 'world progress survives');
  assertEq(r.save.blueprints, ['amp'], 'blueprints survive');
  assertEq(r.repairs.length, 0, 'no repairs needed');
});

test('malformed JSON is backed up, not overwritten', () => {
  const storage = fakeStorage({ [SAVE_KEY]: '{broken json!!' });
  const r = loadSave(storage, () => 777);
  assertEq(r.recoveredFromCorrupt, true, 'flagged as recovery');
  assertEq(storage.map.get(SAVE_BACKUP_PREFIX + '777'), '{broken json!!', 'raw value preserved in backup');
  assertEq(r.save.resonance, 0, 'defaults loaded');
});

test('unknown blueprint and module types repaired without data loss elsewhere', () => {
  const save = defaultSave();
  save.resonance = 50;
  save.blueprints.push('amp');
  (save.blueprints as string[]).push('flux-capacitor');
  const ws = getWorldSave(save, 'w40');
  ws.rack.modules.push({ instanceId: 'm-x', typeId: 'nonexistent', gridY: 0, gridX: 0, settings: {} });
  ws.rack.cables.push({ cableId: 'c-x', fromModuleId: 'm-x', fromPortId: 'out', toModuleId: 'm-y', toPortId: 'in' });
  const { save: repaired, repairs } = normalizeSave(JSON.parse(JSON.stringify(save)));
  assertEq(repaired.resonance, 50, 'currency intact');
  assertEq(repaired.blueprints, ['amp'], 'unknown blueprint dropped');
  assertEq(repaired.worlds['w40'].rack.modules.length, 0, 'unknown module dropped');
  assertEq(repaired.worlds['w40'].rack.cables.length, 0, 'orphan cable dropped');
  assert(repairs.length >= 2, 'repairs reported');
});

test('claim watermark cannot exceed best wave after normalization', () => {
  const save = defaultSave();
  const ws = getWorldSave(save, 'w40');
  ws.bestWave = 3;
  ws.claimedWaveReward = 7; // tampered/corrupt
  const { save: repaired } = normalizeSave(JSON.parse(JSON.stringify(save)));
  assertEq(repaired.worlds['w40'].claimedWaveReward, 3, 'watermark clamped to best');
});

test('import validates before replacing', () => {
  const bad = importSave('not json');
  assertEq(bad.ok, false, 'garbage rejected');
  const wrongShape = importSave('42');
  assertEq(wrongShape.ok, false, 'non-object rejected');
  const newer = importSave(JSON.stringify({ schemaVersion: 99 }));
  assertEq(newer.ok, false, 'future version rejected');
  const save = defaultSave();
  save.resonance = 9;
  const good = importSave(exportSave(save));
  assertEq(good.ok, true, 'valid export imports');
  assertEq(good.save!.resonance, 9, 'data preserved through export/import');
});

test('reset clears the save key', () => {
  const storage = fakeStorage();
  persistSave(storage, defaultSave());
  resetSave(storage);
  assertEq(storage.map.has(SAVE_KEY), false, 'key removed');
});

test('settings normalize with safe fallbacks', () => {
  const raw = {
    schemaVersion: 1,
    settings: { rackPosition: 'diagonal', masterVolume: 99, percussionVolume: -3, masterMuted: 'yes' },
  };
  const { save } = normalizeSave(raw);
  assertEq(save.settings.rackPosition, 'auto', 'invalid rack position falls back');
  assertEq(save.settings.masterVolume, 1, 'volume clamped high');
  assertEq(save.settings.percussionVolume, 0, 'volume clamped low');
  assertEq(save.settings.masterMuted, false, 'non-bool mute falls back');
});

test('secret reveal and boss state persist', () => {
  const storage = fakeStorage();
  const save = defaultSave();
  save.secretRevealed = true;
  save.finalBossDefeated = true;
  save.cipherChallengeUnlocked = true;
  persistSave(storage, save);
  const r = loadSave(storage);
  assertEq(r.save.secretRevealed, true, 'reveal permanent');
  assertEq(r.save.finalBossDefeated, true, 'boss completion permanent');
  assertEq(r.save.cipherChallengeUnlocked, true, 'challenge unlock permanent');
});

test('v1 save migrates shelfIndex/slotX to gridY/gridX', () => {
  // Simulate a raw v1 save with old field names in module instances.
  const v1Raw = {
    schemaVersion: 1,
    resonance: 42,
    blueprints: [],
    worlds: {
      w40: {
        shelfCount: 1,
        rack: {
          modules: [
            { instanceId: 'm-clk', typeId: 'clock', shelfIndex: 0, slotX: 0, settings: {} },
            { instanceId: 'm-osc', typeId: 'osc', shelfIndex: 0, slotX: 3, settings: {} },
            { instanceId: 'm-out', typeId: 'output', shelfIndex: 0, slotX: 12, settings: {} },
          ],
          cables: [],
        },
        towersByOutputId: {},
        bestWave: 0,
        completed: false,
        endlessBest: 0,
        claimedWaveReward: 0,
        completionClaimed: false,
      },
    },
  };
  const { data } = migrateSave(v1Raw as Record<string, unknown>);
  assertEq(data.schemaVersion, 2, 'version bumped');
  const modules = ((data as Record<string, unknown>).worlds as Record<string, Record<string, Record<string, Record<string, unknown>[]>>>).w40.rack.modules;
  assertEq((modules[0] as Record<string, unknown>).gridX, 0, 'clock gridX=0');
  assertEq((modules[0] as Record<string, unknown>).gridY, 0, 'clock gridY=0');
  assertEq((modules[1] as Record<string, unknown>).gridX, 3, 'osc gridX=3');
  assertEq((modules[2] as Record<string, unknown>).gridX, 12, 'output gridX=12');
  assert(!('slotX' in (modules[0] as Record<string, unknown>)), 'old slotX removed');
  assert(!('shelfIndex' in (modules[0] as Record<string, unknown>)), 'old shelfIndex removed');

  // Full load round-trip preserves positions.
  const { save } = normalizeSave(data);
  assertEq(save.resonance, 42, 'resonance preserved');
  const rack = save.worlds['w40'].rack;
  assertEq(rack.modules[0].gridX, 0, 'gridX survives normalization');
  assertEq(rack.modules[1].gridX, 3, 'osc position correct');
  assertEq(rack.modules[2].gridX, 12, 'output position correct');
});

// ── Rack overlap repair tests ─────────────────────────────────────────────────

test('overlap repair moves colliding module to first free slot', () => {
  // Simulate an old save where two modules were packed at cols 0 and 1
  // (valid when both were w:1), but 'amp' and 'phase' are now w:2.
  // amp at col 0 occupies 0-1; phase at col 1 now overlaps.
  const raw = {
    schemaVersion: 2,
    worlds: {
      w40: {
        shelfCount: 1,
        rack: {
          modules: [
            { instanceId: 'm-amp',   typeId: 'amp',   gridY: 0, gridX: 0, settings: {} },
            { instanceId: 'm-phase', typeId: 'phase', gridY: 0, gridX: 1, settings: {} },
          ],
          cables: [],
        },
        towersByOutputId: {}, bestWave: 0, completed: false, endlessBest: 0,
        claimedWaveReward: 0, completionClaimed: false,
      },
    },
  };
  const { save, repairs } = normalizeSave(raw);
  const modules = save.worlds['w40'].rack.modules;
  assertEq(modules.length, 2, 'both modules survive');
  // Both must be present and non-overlapping.
  const amp   = modules.find(m => m.instanceId === 'm-amp')!;
  const phase = modules.find(m => m.instanceId === 'm-phase')!;
  assert(amp   !== undefined, 'amp present');
  assert(phase !== undefined, 'phase present');
  // amp stays at col 0 (was already valid); phase must have moved.
  assertEq(amp.gridX, 0, 'amp stays at col 0');
  assert(phase.gridX !== 1, 'phase moved away from overlapping col 1');
  assert(repairs.some(r => r.includes('phase')), 'repair note emitted for phase');
});

test('overlap repair preserves cable connections after move', () => {
  // amp → phase cable: endpoints use instanceId, not position,
  // so a position repair must not break the cable.
  const raw = {
    schemaVersion: 2,
    worlds: {
      w40: {
        shelfCount: 1,
        rack: {
          modules: [
            { instanceId: 'm-amp',   typeId: 'amp',   gridY: 0, gridX: 0, settings: {} },
            { instanceId: 'm-phase', typeId: 'phase', gridY: 0, gridX: 1, settings: {} },
          ],
          cables: [
            { cableId: 'c-1', fromModuleId: 'm-amp', fromPortId: 'out', toModuleId: 'm-phase', toPortId: 'in' },
          ],
        },
        towersByOutputId: {}, bestWave: 0, completed: false, endlessBest: 0,
        claimedWaveReward: 0, completionClaimed: false,
      },
    },
  };
  const { save } = normalizeSave(raw);
  const cables = save.worlds['w40'].rack.cables;
  assertEq(cables.length, 1, 'cable survives repair');
  assertEq(cables[0].fromModuleId, 'm-amp',   'cable from-id intact');
  assertEq(cables[0].toModuleId,   'm-phase', 'cable to-id intact');
});

test('overlap repair expands shelfCount when row is full', () => {
  // Fill row 0 with 8 clock modules (w:2) at cols 0,2,4,6,8,10,12,14.
  // Then place clockdiv (w:2) at col 1 — overlaps the first clock.
  // Row 0 is completely full; repair must expand to row 1.
  const clocks = [0, 2, 4, 6, 8, 10, 12, 14].map((x, i) => ({
    instanceId: `m-clk-${i}`, typeId: 'clock', gridY: 0, gridX: x, settings: {},
  }));
  const raw = {
    schemaVersion: 2,
    worlds: {
      w40: {
        shelfCount: 1,
        rack: {
          modules: [
            ...clocks,
            { instanceId: 'm-div', typeId: 'clockdiv', gridY: 0, gridX: 1, settings: {} },
          ],
          cables: [],
        },
        towersByOutputId: {}, bestWave: 0, completed: false, endlessBest: 0,
        claimedWaveReward: 0, completionClaimed: false,
      },
    },
  };
  const { save, repairs } = normalizeSave(raw);
  const ws = save.worlds['w40'];
  assert(ws.shelfCount >= 2, 'shelfCount expanded to fit displaced module');
  const modules = ws.rack.modules;
  const div = modules.find(m => m.instanceId === 'm-div')!;
  assert(div !== undefined, 'clockdiv still present');
  assert(div.gridY >= 1, 'clockdiv moved to a new row');
  assert(repairs.some(r => r.includes('clockdiv')), 'repair note emitted');
});

test('old single tower migrates to first output tower id', () => {
  const raw = defaultSave();
  const ws = getWorldSave(raw, 'w40');
  ws.rack.modules.push({ instanceId: 'out-first', typeId: 'output', gridY: 0, gridX: 0, settings: {} });
  ws.tower = { tileX: 3, tileY: 4, orientation: 'east' };
  delete (ws as Partial<typeof ws>).towersByOutputId;
  const normalized = normalizeSave(JSON.parse(JSON.stringify(raw))).save.worlds['w40'];
  assertEq(normalized.towersByOutputId['out-first'], { tileX: 3, tileY: 4, orientation: 'east' }, 'legacy tower assigned to first output');
});
