/**
 * camera.ts — Shared world-space camera for the unified scene.
 *
 * The battlefield canvas and the DOM rack layer are both driven by this one
 * camera: the canvas applies it inside its draw pass; the rack container
 * applies it as a CSS transform. One conversion path, no drift.
 */

export interface CameraState {
  zoom: number;
  /** Screen-pixel offset of world origin within the viewport. */
  panX: number;
  panY: number;
}

export interface SceneBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 4;

export class Camera {
  zoom = 1;
  panX = 0;
  panY = 0;

  private bounds: SceneBounds = { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
  private viewportW = 800;
  private viewportH = 600;

  setViewport(w: number, h: number): void {
    this.viewportW = Math.max(1, w);
    this.viewportH = Math.max(1, h);
  }

  setBounds(b: SceneBounds): void {
    this.bounds = b;
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.panX) / this.zoom, y: (sy - this.panY) / this.zoom };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return { x: wx * this.zoom + this.panX, y: wy * this.zoom + this.panY };
  }

  panBy(dx: number, dy: number): void {
    this.panX += dx;
    this.panY += dy;
    this.clampPan();
  }

  /** Zoom keeping the given screen point fixed. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor));
    const scale = next / this.zoom;
    this.panX = sx - (sx - this.panX) * scale;
    this.panY = sy - (sy - this.panY) * scale;
    this.zoom = next;
    this.clampPan();
  }

  /** Fit the whole scene bounds in the viewport with padding. */
  fitScene(padding = 40): void {
    const w = this.bounds.maxX - this.bounds.minX;
    const h = this.bounds.maxY - this.bounds.minY;
    if (w <= 0 || h <= 0) return;
    const zx = (this.viewportW - padding * 2) / w;
    const zy = (this.viewportH - padding * 2) / h;
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(zx, zy)));
    this.panX = (this.viewportW - w * this.zoom) / 2 - this.bounds.minX * this.zoom;
    this.panY = (this.viewportH - h * this.zoom) / 2 - this.bounds.minY * this.zoom;
  }

  /** Center on a world rect (e.g. the battlefield) at a comfortable zoom. */
  centerOn(rect: SceneBounds, padding = 30): void {
    const w = rect.maxX - rect.minX;
    const h = rect.maxY - rect.minY;
    if (w <= 0 || h <= 0) return;
    const zx = (this.viewportW - padding * 2) / w;
    const zy = (this.viewportH - padding * 2) / h;
    this.zoom = Math.min(1.6, Math.max(MIN_ZOOM, Math.min(zx, zy)));
    this.panX = (this.viewportW - w * this.zoom) / 2 - rect.minX * this.zoom;
    this.panY = (this.viewportH - h * this.zoom) / 2 - rect.minY * this.zoom;
    this.clampPan();
  }

  /**
   * Soft clamp: keep at least a margin of the scene visible so the player
   * can never lose the rack or battlefield entirely.
   */
  private clampPan(): void {
    const margin = 80;
    const minScreenX = margin - this.bounds.maxX * this.zoom;
    const maxScreenX = this.viewportW - margin - this.bounds.minX * this.zoom;
    const minScreenY = margin - this.bounds.maxY * this.zoom;
    const maxScreenY = this.viewportH - margin - this.bounds.minY * this.zoom;
    this.panX = Math.min(maxScreenX, Math.max(minScreenX, this.panX));
    this.panY = Math.min(maxScreenY, Math.max(minScreenY, this.panY));
  }
}

// ── Pointer/touch controller ────────────────────────────────────────────────

export interface CameraControllerOpts {
  /** Return true if a pointerdown at this target should NOT start a pan
   *  (module drags, plugs, knobs, buttons handle themselves). */
  isInteractive(target: EventTarget | null): boolean;
  zoomSensitivity(): number;
  /** Called on a tap/click that did not pan (world coords). */
  onTap?(wx: number, wy: number, ev: PointerEvent): void;
  onChanged?(): void;
}

/**
 * Attaches wheel-zoom, drag-pan, touch-pan and pinch-zoom to the viewport.
 * Returns a cleanup function.
 */
export function attachCameraControls(viewport: HTMLElement, camera: Camera, opts: CameraControllerOpts): () => void {
  interface ActivePointer { id: number; x: number; y: number; startX: number; startY: number }
  const pointers = new Map<number, ActivePointer>();
  let panning = false;
  let didPan = false;
  let pinchStartDist = 0;
  let pinchStartZoom = 1;

  const rectOf = () => viewport.getBoundingClientRect();

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const r = rectOf();
    const step = 0.05 * Math.min(2, Math.max(0.5, opts.zoomSensitivity()));
    const factor = e.deltaY < 0 ? 1 + step : 1 / (1 + step);
    camera.zoomAt(e.clientX - r.left, e.clientY - r.top, factor);
    opts.onChanged?.();
  };

  const onPointerDown = (e: PointerEvent) => {
    if (opts.isInteractive(e.target)) return;
    const r = rectOf();
    pointers.set(e.pointerId, {
      id: e.pointerId,
      x: e.clientX - r.left, y: e.clientY - r.top,
      startX: e.clientX - r.left, startY: e.clientY - r.top,
    });
    viewport.setPointerCapture(e.pointerId);
    if (pointers.size === 1) {
      panning = true;
      didPan = false;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchStartDist = Math.hypot(a.x - b.x, a.y - b.y);
      pinchStartZoom = camera.zoom;
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const r = rectOf();
    const nx = e.clientX - r.left;
    const ny = e.clientY - r.top;

    if (pointers.size === 2) {
      // Pinch zoom around the midpoint.
      p.x = nx; p.y = ny;
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStartDist > 0) {
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const target = pinchStartZoom * (dist / pinchStartDist);
        camera.zoomAt(midX, midY, target / camera.zoom);
        opts.onChanged?.();
      }
      didPan = true;
      return;
    }

    if (panning) {
      const dx = nx - p.x;
      const dy = ny - p.y;
      if (!didPan && Math.hypot(nx - p.startX, ny - p.startY) > 6) didPan = true;
      if (didPan) {
        camera.panBy(dx, dy);
        opts.onChanged?.();
      }
    }
    p.x = nx; p.y = ny;
  };

  const endPointer = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (viewport.hasPointerCapture(e.pointerId)) viewport.releasePointerCapture(e.pointerId);
    if (pointers.size < 2) pinchStartDist = 0;
    if (pointers.size === 0) {
      if (panning && !didPan && p && opts.onTap && e.type === 'pointerup') {
        const w = camera.screenToWorld(p.x, p.y);
        opts.onTap(w.x, w.y, e);
      }
      panning = false;
    }
  };

  viewport.addEventListener('wheel', onWheel, { passive: false });
  viewport.addEventListener('pointerdown', onPointerDown);
  viewport.addEventListener('pointermove', onPointerMove);
  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);

  return () => {
    viewport.removeEventListener('wheel', onWheel);
    viewport.removeEventListener('pointerdown', onPointerDown);
    viewport.removeEventListener('pointermove', onPointerMove);
    viewport.removeEventListener('pointerup', endPointer);
    viewport.removeEventListener('pointercancel', endPointer);
  };
}
