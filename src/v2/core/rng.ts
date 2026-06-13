/**
 * rng.ts — Seeded deterministic randomness.
 *
 * Every probabilistic module behavior derives its seed from stable values
 * (world id, wave id, module instance id, event index). Re-evaluating the
 * same graph with the same inputs always produces identical results.
 */

/** FNV-1a string hash → 32-bit unsigned int. Stable across sessions. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Combine multiple seeds into one (order-sensitive). */
export function combineSeeds(...seeds: number[]): number {
  let h = 0x811c9dc5;
  for (const s of seeds) {
    h ^= s >>> 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

/** mulberry32 — small fast deterministic PRNG. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One deterministic float in [0,1) for a single (seed, index) pair. */
export function seededFloat(seed: number, index: number): number {
  return makeRng(combineSeeds(seed, index))();
}
