/**
 * progression.ts — Campaign unlock chain, blueprint unlocks, secret-world
 * reveal logic, and the Signal Cipher route check.
 */

import { SaveData, getWorldSave } from './save';
import { MODULE_TYPES, getModuleType } from '../core/modules';
import { RackGraph, validateGraph } from '../core/graph';

// The visible campaign order comes from worlds.ts (CAMPAIGN_ORDER); these
// functions take it as a parameter to stay pure and test-friendly.

export function isWorldUnlocked(save: SaveData, worldId: string, order: readonly string[]): boolean {
  const idx = order.indexOf(worldId);
  if (idx === -1) {
    // Secret world: only via reveal.
    return worldId === 'w200' && save.secretRevealed;
  }
  if (idx === 0) return true;
  return getWorldSave(save, order[idx - 1]).completed;
}

export function isWorldVisible(save: SaveData, worldId: string, order: readonly string[]): boolean {
  if (worldId === 'w200') return save.secretRevealed;
  return order.includes(worldId);
}

export function completedWorldCount(save: SaveData, order: readonly string[]): number {
  return order.filter(w => getWorldSave(save, w).completed).length;
}

/** Blueprints granted by completing a world (from module registry data). */
export function blueprintsUnlockedBy(worldId: string): string[] {
  return MODULE_TYPES.filter(m => m.unlockAfterWorld === worldId).map(m => m.typeId);
}

/** Apply completion side effects: blueprints + challenge unlock. Idempotent. */
export function applyWorldCompletionUnlocks(save: SaveData, worldId: string): string[] {
  const granted: string[] = [];
  for (const typeId of blueprintsUnlockedBy(worldId)) {
    if (!save.blueprints.includes(typeId)) {
      save.blueprints.push(typeId);
      granted.push(typeId);
    }
  }
  if (worldId === 'w180' && !save.cipherChallengeUnlocked) {
    save.cipherChallengeUnlocked = true;
  }
  return granted;
}

// ── Secret hints ────────────────────────────────────────────────────────────

export type SecretHintLevel = 0 | 1 | 2;

/**
 * 0 — no hint; 1 — after six normal completions; 2 — after all eight
 * (the strong clue about division, displacement, and reunion).
 */
export function secretHintLevel(save: SaveData, order: readonly string[]): SecretHintLevel {
  const n = completedWorldCount(save, order);
  if (n >= order.length) return 2;
  if (n >= 6) return 1;
  return 0;
}

export const SECRET_HINTS: Record<SecretHintLevel, string | null> = {
  0: null,
  1: '✦ Something resonates beyond the eighth world — separate voices may form a hidden measure.',
  2: '✦ Divide the pulse. Displace one voice in time. Reunite them at the mix — then send a pulse and listen for the cipher.',
};

/** Clue text shown in the w180 post-victory screen, prompting cipher discovery. */
export const CIPHER_POST_VICTORY_CLUE =
  'The Target Lock world unlocks the Signal Cipher challenge. Build a split-time patch and send a test pulse — a hidden world may reveal itself.';

// ── Signal Cipher route check ───────────────────────────────────────────────

export interface CipherCheck {
  ok: boolean;
  reason?: string;
  /** Module ids forming the discovered route (for highlight/reveal effect). */
  routeModuleIds?: string[];
  splitterId?: string;
  mixerId?: string;
}

/**
 * The exact secret route: a clock source feeding a splitter, two genuinely
 * distinct processing branches, a phase-offset or delay module on exactly
 * one branch, a mixer recombining both branches, reaching the main output.
 * A direct duplicate cable path (both branches bare) does not count.
 */
export function checkCipherRoute(graph: RackGraph): CipherCheck {
  const validation = validateGraph(graph);
  if (['cycle', 'incompatible', 'no-output-route', 'missing-starter', 'invalid'].includes(validation.status)) {
    return { ok: false, reason: 'The patch must be valid and reach the output first.' };
  }

  const byId = new Map(graph.modules.map(m => [m.instanceId, m]));
  const typeOf = (id: string) => byId.get(id)?.typeId ?? '';
  const downstream = new Map<string, Array<{ to: string; fromPort: string }>>();
  for (const c of graph.cables) {
    if (!downstream.has(c.fromModuleId)) downstream.set(c.fromModuleId, []);
    downstream.get(c.fromModuleId)!.push({ to: c.toModuleId, fromPort: c.fromPortId });
  }

  // Modules downstream of any clock.
  const fromClock = new Set<string>();
  {
    const stack = graph.modules.filter(m => m.typeId === 'clock').map(m => m.instanceId);
    while (stack.length) {
      const id = stack.pop()!;
      if (fromClock.has(id)) continue;
      fromClock.add(id);
      for (const e of downstream.get(id) ?? []) stack.push(e.to);
    }
  }

  // Modules from which the output is reachable.
  const reachesOutput = new Set<string>();
  {
    const upstream = new Map<string, string[]>();
    for (const c of graph.cables) {
      if (!upstream.has(c.toModuleId)) upstream.set(c.toModuleId, []);
      upstream.get(c.toModuleId)!.push(c.fromModuleId);
    }
    const stack = graph.modules.filter(m => m.typeId === 'output').map(m => m.instanceId);
    while (stack.length) {
      const id = stack.pop()!;
      if (reachesOutput.has(id)) continue;
      reachesOutput.add(id);
      for (const u of upstream.get(id) ?? []) stack.push(u);
    }
  }

  const TIME_MODULES = new Set(['phase', 'delay']);

  // Enumerate simple paths (bounded) from a starting cable to any mixer.
  interface BranchPath { mixerId: string; between: string[] }
  const pathsFrom = (startId: string): BranchPath[] => {
    const results: BranchPath[] = [];
    const walk = (id: string, between: string[], depth: number, visited: Set<string>) => {
      if (depth > 12 || results.length > 64) return;
      if (typeOf(id) === 'mixer') {
        results.push({ mixerId: id, between: between.slice() });
        return;
      }
      if (typeOf(id) === 'output') return;
      for (const e of downstream.get(id) ?? []) {
        if (visited.has(e.to)) continue;
        visited.add(e.to);
        between.push(id);
        walk(e.to, between, depth + 1, visited);
        between.pop();
        visited.delete(e.to);
      }
    };
    walk(startId, [], 0, new Set([startId]));
    return results;
  };

  for (const splitter of graph.modules.filter(m => m.typeId === 'splitter')) {
    if (!fromClock.has(splitter.instanceId)) continue;
    const edges = downstream.get(splitter.instanceId) ?? [];
    // Branch starts grouped by splitter output port.
    const byPort = new Map<string, string[]>();
    for (const e of edges) {
      if (!byPort.has(e.fromPort)) byPort.set(e.fromPort, []);
      byPort.get(e.fromPort)!.push(e.to);
    }
    const ports = [...byPort.keys()];
    for (let a = 0; a < ports.length; a++) {
      for (let b = a + 1; b < ports.length; b++) {
        for (const startA of byPort.get(ports[a])!) {
          for (const startB of byPort.get(ports[b])!) {
            const pathsA = pathsFrom(startA);
            const pathsB = pathsFrom(startB);
            for (const pa of pathsA) {
              for (const pb of pathsB) {
                if (pa.mixerId !== pb.mixerId) continue;
                if (!reachesOutput.has(pa.mixerId)) continue;
                const setA = [startA, ...pa.between];
                const setB = [startB, ...pb.between];
                // Genuinely distinct: not the same module sequence, and at
                // least one branch does real processing (a bare duplicate
                // cable pair does not count).
                const sameSeq = setA.join('|') === setB.join('|');
                const aProcessing = setA.filter(id => typeOf(id) !== 'mixer');
                const bProcessing = setB.filter(id => typeOf(id) !== 'mixer');
                if (sameSeq) continue;
                if (aProcessing.length === 0 && bProcessing.length === 0) continue;
                const timeA = aProcessing.some(id => TIME_MODULES.has(typeOf(id)));
                const timeB = bProcessing.some(id => TIME_MODULES.has(typeOf(id)));
                if (timeA === timeB) continue; // exactly one branch shifted in time
                return {
                  ok: true,
                  splitterId: splitter.instanceId,
                  mixerId: pa.mixerId,
                  routeModuleIds: [splitter.instanceId, ...setA, ...setB, pa.mixerId],
                };
              }
            }
          }
        }
      }
    }
  }

  return { ok: false, reason: 'The cipher needs: clock → splitter → two distinct branches (one displaced in time) → mixer → output.' };
}

/** All conditions for the reveal, minus the live test pulse (runtime adds that). */
export function canAttemptCipher(save: SaveData, order: readonly string[]): boolean {
  return save.cipherChallengeUnlocked && completedWorldCount(save, order) >= order.length;
}

export function revealSecretWorld(save: SaveData): boolean {
  if (save.secretRevealed) return false;
  save.secretRevealed = true;
  return true;
}
