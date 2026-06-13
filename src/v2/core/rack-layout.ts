/**
 * rack-layout.ts — Pure rack geometry: constants, bounds checking, and
 * free-slot scanning.
 *
 * This module has no dependencies on save, economy, UI, or world state.
 * It may be imported by any layer without risk of circular imports.
 */

/** Number of columns in the rack grid. */
export const RACK_COLS = 16;
/** Maximum number of rack rows. */
export const MAX_ROWS = 4;

/** A rectangle placed in the rack grid. */
export interface PlacedRect {
  gridY: number;
  gridX: number;
  w: number;
  h: number;
}

/**
 * Return true if (gridY, gridX, w × h) fits within the rack bounds and does
 * not overlap any entry in `placed[0 .. upTo-1]`. When `upTo` is omitted the
 * entire array is checked.
 *
 * Passing `upTo = i` (the current index) enables a greedy-in-order repair
 * pass: earlier entries keep their slots and later ones are displaced.
 */
export function checkRackFit(
  placed: ReadonlyArray<PlacedRect>,
  gridY: number,
  gridX: number,
  w: number,
  h: number,
  rowCount: number,
  upTo?: number,
): boolean {
  if (gridY < 0 || gridY + h > rowCount || gridX < 0 || gridX + w > RACK_COLS) return false;
  const limit = upTo ?? placed.length;
  for (let i = 0; i < limit; i++) {
    const m = placed[i];
    if (gridX < m.gridX + m.w && m.gridX < gridX + w &&
        gridY < m.gridY + m.h && m.gridY < gridY + h) return false;
  }
  return true;
}

/**
 * Scan row-major order for the first position where (w × h) fits, checking
 * only `placed[0 .. upTo-1]`. When `upTo` is omitted the entire array is
 * checked (standard "find any free slot" use case).
 */
export function findRackSlot(
  placed: ReadonlyArray<PlacedRect>,
  w: number,
  h: number,
  rowCount: number,
  upTo?: number,
): { gridY: number; gridX: number } | null {
  const limit = upTo ?? placed.length;
  for (let y = 0; y + h <= rowCount; y++) {
    for (let x = 0; x + w <= RACK_COLS; x++) {
      if (checkRackFit(placed, y, x, w, h, rowCount, limit)) return { gridY: y, gridX: x };
    }
  }
  return null;
}
