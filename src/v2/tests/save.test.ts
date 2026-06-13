/**
 * save.test.ts — Save schema, migration, import/export, malformed handling.
 */

import { test, assert, assertEq } from './harness';
import {
  SaveData, SaveStorage, SAVE_KEY, SAVE_BACKUP_PREFIX,
  defaultSave, loadSave, persistSave, importSave, exportSave, resetSave,
  getWorldSave, normalizeSave,
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
  assertEq(r.save.schemaVersion, 1, 'current schema');
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
  ws.rack.modules.push({ instanceId: 'm-x', typeId: 'nonexistent', shelfIndex: 0, slotX: 0, settings: {} });
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
