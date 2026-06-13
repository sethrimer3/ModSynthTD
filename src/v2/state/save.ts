/**
 * save.ts — Versioned save schema, migrations, and safe load/store.
 *
 * Storage is injected (Storage-like interface) so everything here is pure
 * and node-testable. Malformed saves are backed up — never overwritten —
 * and unknown module types are repaired non-destructively.
 */

import { SerializedGraph, deserializeGraph, serializeGraph, RackGraph } from '../core/graph';
import { getModuleType } from '../core/modules';

export const SAVE_KEY = 'modsynth-td-save';
export const SAVE_BACKUP_PREFIX = 'modsynth-td-save-corrupt-';
export const CURRENT_SCHEMA_VERSION = 1;

// ── Schema ──────────────────────────────────────────────────────────────────

export type RackPosition = 'auto' | 'left' | 'right' | 'below';
export type TowerOrientation = 'north' | 'east' | 'south' | 'west';

export interface TowerSave {
  tileX: number;
  tileY: number;
  orientation: TowerOrientation;
}

export interface WorldSave {
  /** Highest campaign wave fully cleared (0 = none). */
  bestWave: number;
  completed: boolean;
  /** Best endless wave beyond the campaign (0 = none). */
  endlessBest: number;
  shelfCount: number; // 1..4
  rack: SerializedGraph;
  tower: TowerSave | null;
  /** Best wave for which milestone currency has already been claimed. */
  claimedWaveReward: number;
  completionClaimed: boolean;
}

export interface SaveSettings {
  rackPosition: RackPosition;
  masterMuted: boolean;
  masterVolume: number;       // 0..1
  percussionVolume: number;   // 0..1 — legacy field kept for save compat
  reducedMotion: boolean;
  // Audio mixer channels (added after v1 initial release):
  beatLoopVolume: number;     // 0..1
  bgLoopVolume: number;       // 0..1
  enemyNotesVolume: number;   // 0..1  (wave intro OGG)
  sfxVolume: number;          // 0..1  (kick/hihat — replaces percussionVolume)
  towersVolume: number;       // 0..1  (rack synth output)
}

export interface SaveData {
  schemaVersion: number;
  /** Global meta-currency: Resonance. */
  resonance: number;
  /** Unlocked non-starter blueprint typeIds. */
  blueprints: string[];
  secretRevealed: boolean;
  cipherChallengeUnlocked: boolean;
  finalBossDefeated: boolean;
  tutorialsSeen: string[];
  settings: SaveSettings;
  worlds: Record<string, WorldSave>;
}

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// ── Defaults ────────────────────────────────────────────────────────────────

export function defaultWorldSave(): WorldSave {
  return {
    bestWave: 0,
    completed: false,
    endlessBest: 0,
    shelfCount: 1,
    rack: { modules: [], cables: [] },
    tower: null,
    claimedWaveReward: 0,
    completionClaimed: false,
  };
}

export function defaultSave(): SaveData {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    resonance: 0,
    blueprints: [],
    secretRevealed: false,
    cipherChallengeUnlocked: false,
    finalBossDefeated: false,
    tutorialsSeen: [],
    settings: {
      rackPosition: 'auto',
      masterMuted: false,
      masterVolume: 0.8,
      percussionVolume: 0.7,
      reducedMotion: false,
      beatLoopVolume: 0.70,
      bgLoopVolume: 0.50,
      enemyNotesVolume: 0.80,
      sfxVolume: 0.70,
      towersVolume: 1.00,
    },
    worlds: {},
  };
}

// ── Normalization (repairs any structurally damaged save) ──────────────────

function clamp01(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function asNonNegInt(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}

export interface LoadResult {
  save: SaveData;
  /** Non-destructive repair notes worth surfacing to the player. */
  repairs: string[];
  /** True when the previous save was unreadable and backed up. */
  recoveredFromCorrupt: boolean;
}

export function normalizeSave(raw: unknown): { save: SaveData; repairs: string[] } {
  const repairs: string[] = [];
  const d = defaultSave();
  if (typeof raw !== 'object' || raw === null) {
    repairs.push('Save was not an object; using defaults.');
    return { save: d, repairs };
  }
  const r = raw as Record<string, unknown>;

  d.resonance = asNonNegInt(r.resonance, 0);
  if (Array.isArray(r.blueprints)) {
    for (const b of r.blueprints) {
      if (typeof b === 'string' && getModuleType(b)) d.blueprints.push(b);
      else repairs.push(`Dropped unknown blueprint "${String(b)}".`);
    }
  }
  d.secretRevealed = asBool(r.secretRevealed, false);
  d.cipherChallengeUnlocked = asBool(r.cipherChallengeUnlocked, false);
  d.finalBossDefeated = asBool(r.finalBossDefeated, false);
  if (Array.isArray(r.tutorialsSeen)) {
    d.tutorialsSeen = r.tutorialsSeen.filter((t): t is string => typeof t === 'string');
  }
  if (typeof r.settings === 'object' && r.settings !== null) {
    const s = r.settings as Record<string, unknown>;
    const pos = s.rackPosition;
    d.settings.rackPosition = pos === 'left' || pos === 'right' || pos === 'below' || pos === 'auto' ? pos : 'auto';
    d.settings.masterMuted = asBool(s.masterMuted, false);
    d.settings.masterVolume = clamp01(s.masterVolume, 0.8);
    d.settings.percussionVolume = clamp01(s.percussionVolume, 0.7);
    d.settings.reducedMotion = asBool(s.reducedMotion, false);
    d.settings.beatLoopVolume = clamp01(s.beatLoopVolume, 0.70);
    d.settings.bgLoopVolume = clamp01(s.bgLoopVolume, 0.50);
    d.settings.enemyNotesVolume = clamp01(s.enemyNotesVolume, 0.80);
    // sfxVolume falls back to legacy percussionVolume on old saves.
    d.settings.sfxVolume = clamp01(
      s.sfxVolume !== undefined ? s.sfxVolume : s.percussionVolume,
      0.70,
    );
    d.settings.towersVolume = clamp01(s.towersVolume, 1.00);
  }
  if (typeof r.worlds === 'object' && r.worlds !== null) {
    for (const [worldId, rawWorld] of Object.entries(r.worlds as Record<string, unknown>)) {
      if (typeof rawWorld !== 'object' || rawWorld === null) continue;
      const w = rawWorld as Record<string, unknown>;
      const ws = defaultWorldSave();
      ws.bestWave = asNonNegInt(w.bestWave, 0);
      ws.completed = asBool(w.completed, false);
      ws.endlessBest = asNonNegInt(w.endlessBest, 0);
      ws.shelfCount = Math.min(4, Math.max(1, asNonNegInt(w.shelfCount, 1)));
      ws.claimedWaveReward = asNonNegInt(w.claimedWaveReward, 0);
      ws.completionClaimed = asBool(w.completionClaimed, false);
      const { graph, repairs: rackRepairs } = deserializeGraph(w.rack);
      ws.rack = serializeGraph(graph);
      for (const note of rackRepairs) repairs.push(`[${worldId}] ${note}`);
      if (typeof w.tower === 'object' && w.tower !== null) {
        const t = w.tower as Record<string, unknown>;
        const orient = t.orientation;
        if (typeof t.tileX === 'number' && typeof t.tileY === 'number') {
          ws.tower = {
            tileX: Math.floor(t.tileX),
            tileY: Math.floor(t.tileY),
            orientation: orient === 'east' || orient === 'south' || orient === 'west' ? orient : 'north',
          };
        }
      }
      // Claim watermark can never trail an unclaimed best silently downward.
      if (ws.claimedWaveReward > ws.bestWave) ws.claimedWaveReward = ws.bestWave;
      d.worlds[worldId] = ws;
    }
  }
  return { save: d, repairs };
}

// ── Migrations ──────────────────────────────────────────────────────────────

type Migration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * Keyed by source version: migrations[n] upgrades version n → n+1.
 * Version 1 is the first real schema; future shape changes append here.
 */
export const MIGRATIONS: Record<number, Migration> = {};

export function migrateSave(raw: Record<string, unknown>): { data: Record<string, unknown>; applied: number[] } {
  let data = raw;
  const applied: number[] = [];
  let version = typeof data.schemaVersion === 'number' ? data.schemaVersion : 0;
  if (version <= 0) version = 1; // pre-versioned data treated as v1 shape
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) break;
    data = step(data);
    applied.push(version);
    version++;
  }
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  return { data, applied };
}

// ── Load / store ────────────────────────────────────────────────────────────

export function loadSave(storage: SaveStorage, now: () => number = () => Date.now()): LoadResult {
  const rawText = storage.getItem(SAVE_KEY);
  if (rawText === null) {
    return { save: defaultSave(), repairs: [], recoveredFromCorrupt: false };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    // Preserve the unreadable value — never overwrite it with defaults.
    storage.setItem(SAVE_BACKUP_PREFIX + now(), rawText);
    return { save: defaultSave(), repairs: ['Previous save was unreadable; it was backed up and a fresh save started.'], recoveredFromCorrupt: true };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    storage.setItem(SAVE_BACKUP_PREFIX + now(), rawText);
    return { save: defaultSave(), repairs: ['Previous save had an unexpected shape; it was backed up.'], recoveredFromCorrupt: true };
  }
  const { data } = migrateSave(parsed as Record<string, unknown>);
  const { save, repairs } = normalizeSave(data);
  return { save, repairs, recoveredFromCorrupt: false };
}

export function persistSave(storage: SaveStorage, save: SaveData): void {
  storage.setItem(SAVE_KEY, JSON.stringify(save));
}

export function exportSave(save: SaveData): string {
  return JSON.stringify(save, null, 2);
}

export interface ImportResult {
  ok: boolean;
  save?: SaveData;
  error?: string;
  repairs?: string[];
}

/** Validates before replacing anything. Never throws. */
export function importSave(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Not valid JSON.' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'Save must be a JSON object.' };
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.schemaVersion !== undefined && typeof obj.schemaVersion !== 'number') {
    return { ok: false, error: 'schemaVersion must be a number.' };
  }
  if (typeof obj.schemaVersion === 'number' && obj.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return { ok: false, error: `Save is from a newer version (v${obj.schemaVersion}).` };
  }
  const { data } = migrateSave(obj);
  const { save, repairs } = normalizeSave(data);
  return { ok: true, save, repairs };
}

export function resetSave(storage: SaveStorage): SaveData {
  storage.removeItem(SAVE_KEY);
  return defaultSave();
}

// ── World helpers ───────────────────────────────────────────────────────────

export function getWorldSave(save: SaveData, worldId: string): WorldSave {
  if (!save.worlds[worldId]) save.worlds[worldId] = defaultWorldSave();
  return save.worlds[worldId];
}

export function getWorldRack(save: SaveData, worldId: string): RackGraph {
  const ws = getWorldSave(save, worldId);
  const { graph } = deserializeGraph(ws.rack);
  return graph;
}

export function setWorldRack(save: SaveData, worldId: string, graph: RackGraph): void {
  getWorldSave(save, worldId).rack = serializeGraph(graph);
}
