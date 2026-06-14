/**
 * masked-fill-renderer.ts — Generic PNG-mask cutout fill renderer.
 *
 * Takes any PNG mask and draws animated fog/blob effects clipped to the
 * mask shape. Two mask modes:
 *   - alpha mask: use PNG alpha channel directly
 *   - luminance mask: black-on-white PNG, dark pixels → opaque (converted once)
 *
 * Primary APIs:
 *   drawMaskedFill(ctx, opts)          — draw into an existing canvas context each frame
 *   createMaskedFillCanvas(opts)       — self-animating HTMLCanvasElement for DOM use
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ColorWeight {
  color: string;
  weight: number;
}

export interface MaskedFillOpts {
  maskPath: string;
  x: number;
  y: number;
  width: number;
  height: number;
  colors: ColorWeight[];
  seed: number;
  timeMs: number;
  outlineColor?: string;
  luminanceMask?: boolean;
  /** Multiplies blob frequency — higher = finer/smaller blobs (default 1.0). */
  detail?: number;
  /** Overall brightness multiplier for the fog, 0–1 (default 1.0). */
  brightness?: number;
}

// ─── Motion preference ────────────────────────────────────────────────────────

let _reducedMotion = false;
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  _reducedMotion = mql.matches;
  mql.addEventListener('change', (e) => { _reducedMotion = e.matches; });
}

// ─── Image cache ──────────────────────────────────────────────────────────────

const _imageCache = new Map<string, HTMLImageElement | null>();
const _warnedMissing = new Set<string>();

function loadMask(path: string): void {
  if (_imageCache.has(path)) return;
  _imageCache.set(path, null); // mark loading
  const img = new Image();
  img.onload = () => { _imageCache.set(path, img); };
  img.onerror = () => {
    _imageCache.set(path, null);
    if (!_warnedMissing.has(path)) {
      _warnedMissing.add(path);
      console.warn(`[masked-fill-renderer] Missing mask PNG: ${path}`);
    }
  };
  img.src = path;
}

function getCachedMask(path: string): HTMLImageElement | null {
  if (!_imageCache.has(path)) loadMask(path);
  return _imageCache.get(path) ?? null;
}

// ─── Luminance mask conversion ─────────────────────────────────────────────────
// Black-on-white PNGs: dark pixels → opaque, light pixels → transparent.

const _processedMaskCache = new Map<string, HTMLCanvasElement>();

function getLuminanceMaskCanvas(path: string, img: HTMLImageElement, res: number): HTMLCanvasElement {
  const cacheKey = `${path}|${res}`;
  const cached = _processedMaskCache.get(cacheKey);
  if (cached) return cached;

  const off = document.createElement('canvas');
  off.width = res;
  off.height = res;
  const ctx = off.getContext('2d')!;
  ctx.drawImage(img, 0, 0, res, res);

  const imageData = ctx.getImageData(0, 0, res, res);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    d[i + 3] = Math.max(0, Math.min(255, 255 - lum)) | 0;
    d[i]     = 255;
    d[i + 1] = 255;
    d[i + 2] = 255;
  }
  ctx.putImageData(imageData, 0, 0);

  _processedMaskCache.set(cacheKey, off);
  return off;
}

// ─── Outline cache ─────────────────────────────────────────────────────────────

const _outlineCache = new Map<string, HTMLCanvasElement>();

function getOutlineCanvas(path: string, maskSource: CanvasImageSource, res: number, outlineColor: string): HTMLCanvasElement {
  const cacheKey = `${path}|${res}|${outlineColor}`;
  const cached = _outlineCache.get(cacheKey);
  if (cached) return cached;

  const off = document.createElement('canvas');
  off.width = res;
  off.height = res;
  const ctx = off.getContext('2d')!;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      ctx.drawImage(maskSource, dx, dy, res, res);
    }
  }
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = outlineColor;
  ctx.fillRect(0, 0, res, res);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(maskSource, 0, 0, res, res);
  ctx.globalCompositeOperation = 'source-over';

  _outlineCache.set(cacheKey, off);
  return off;
}

// ─── Noise + color fields ─────────────────────────────────────────────────────

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function octaveNoise(x: number, y: number, t: number, seed: number): number {
  const s = seed * 0.0013;
  const n0 = Math.sin(x * 0.071 + y * 0.113 + t * 0.31  + s)              * 0.500;
  const n1 = Math.sin(x * 0.157 - y * 0.241 + t * 0.53  + s * 1.3 + 2.14) * 0.250;
  const n2 = Math.sin(x * 0.319 + y * 0.487 + t * 0.91  + s * 1.7 + 4.31) * 0.125;
  const n3 = Math.cos(x * 0.671 - y * 0.823 + t * 1.51  + s * 2.1 + 7.07) * 0.0625;
  return (n0 + n1 + n2 + n3) / 0.9375;
}

interface ColorField {
  r: number; g: number; b: number;
  freqX: number; freqY: number;
  speedX: number; speedY: number;
  phaseX: number; phaseY: number;
  presence: number;
}

const _fieldCache = new Map<number, ColorField[]>();

function getOrBuildFields(rgbs: Rgb[], weights: number[], seed: number): ColorField[] {
  const cached = _fieldCache.get(seed);
  if (cached && cached.length === rgbs.length) return cached;

  const totalWt = weights.reduce((a, b) => a + b, 0) || 1;
  const minorFloor = 0.04;

  const fields: ColorField[] = rgbs.map((rgb, ci) => {
    let h = ((seed + ci * 7919) | 0) >>> 0;
    const lcg = (): number => {
      h = (Math.imul(1664525, h) + 1013904223) >>> 0;
      return h / 0x100000000;
    };
    const share = weights[ci] / totalWt;
    return {
      r: rgb[0], g: rgb[1], b: rgb[2],
      freqX: lcg() * 7 + 4, freqY: lcg() * 7 + 4,
      speedX: lcg() * 0.22 + 0.08, speedY: lcg() * 0.18 + 0.07,
      phaseX: lcg() * Math.PI * 2, phaseY: lcg() * Math.PI * 2,
      presence: share < minorFloor
        ? minorFloor * 2.5 * (share / minorFloor)
        : Math.max(share, minorFloor) * 2.5,
    };
  });

  _fieldCache.set(seed, fields);
  return fields;
}

// ─── Low-res pixel buffers ─────────────────────────────────────────────────────

const FILL_RES = 32;

interface LoBuf { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; img: ImageData; }
const _loBufs = new Map<number, LoBuf>();

function getLoBuf(seed: number): LoBuf {
  let lo = _loBufs.get(seed);
  if (!lo) {
    const canvas = document.createElement('canvas');
    canvas.width = FILL_RES; canvas.height = FILL_RES;
    const ctx = canvas.getContext('2d')!;
    lo = { canvas, ctx, img: ctx.createImageData(FILL_RES, FILL_RES) };
    _loBufs.set(seed, lo);
  }
  return lo;
}

function drawFogIntoLoBuf(
  lo: LoBuf, rgbs: Rgb[], weights: number[], timeMs: number, seed: number,
  detail = 1.0, brightness = 1.0,
): void {
  const t = _reducedMotion ? 0 : timeMs / 1000;
  const n = rgbs.length;
  const fields = getOrBuildFields(rgbs, weights, seed);
  const d = lo.img.data;

  for (let py = 0; py < FILL_RES; py++) {
    const fy = (py + 0.5) / FILL_RES;
    for (let px = 0; px < FILL_RES; px++) {
      const fx = (px + 0.5) / FILL_RES;
      const lumNoise = octaveNoise(fx * 8 * detail, fy * 8 * detail, t * 0.28, seed);

      let totalInf = 0, rSum = 0, gSum = 0, bSum = 0;
      for (let ci = 0; ci < n; ci++) {
        const f = fields[ci];
        const raw = Math.sin(fx * f.freqX * detail + t * f.speedX + f.phaseX)
                  * Math.cos(fy * f.freqY * detail + t * f.speedY + f.phaseY);
        const inf = ((raw + 1) * 0.5) * f.presence;
        rSum += f.r * inf; gSum += f.g * inf; bSum += f.b * inf;
        totalInf += inf;
      }

      if (totalInf > 0.001) {
        rSum /= totalInf; gSum /= totalInf; bSum /= totalInf;
      } else {
        rSum = fields[0].r; gSum = fields[0].g; bSum = fields[0].b;
      }

      const lum = (0.09 + 0.33 * ((lumNoise + 1) * 0.5)) * brightness;
      const i = (py * FILL_RES + px) * 4;
      d[i]     = (rSum * lum) | 0;
      d[i + 1] = (gSum * lum) | 0;
      d[i + 2] = (bSum * lum) | 0;
      d[i + 3] = 255;
    }
  }

  lo.ctx.putImageData(lo.img, 0, 0);
}

// ─── Offscreen compositing canvases (per seed + size) ────────────────────────
// The fog fill is generated at FILL_RES for performance, but the mask
// compositing canvas matches the actual output size so mask edges are sharp.

interface CompState {
  // Low-res fog fill — stays at FILL_RES
  fillCanvas: HTMLCanvasElement;
  fillCtx: CanvasRenderingContext2D;
  // Full-res compositing surface — sized to match output (resized when needed)
  maskCanvas: HTMLCanvasElement;
  maskCtx: CanvasRenderingContext2D;
}

const _compCache = new Map<number, CompState>();

function getCompState(seed: number, w: number, h: number): CompState {
  const dpr = Math.min(typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1, 2);
  const pw = Math.ceil(w * dpr);
  const ph = Math.ceil(h * dpr);

  let s = _compCache.get(seed);
  if (!s) {
    const fillCanvas = document.createElement('canvas');
    fillCanvas.width = FILL_RES; fillCanvas.height = FILL_RES;
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = pw; maskCanvas.height = ph;
    s = {
      fillCanvas, fillCtx: fillCanvas.getContext('2d')!,
      maskCanvas, maskCtx: maskCanvas.getContext('2d')!,
    };
    _compCache.set(seed, s);
  } else if (s.maskCanvas.width !== pw || s.maskCanvas.height !== ph) {
    // Output size changed — resize mask canvas, invalidate outline caches
    s.maskCanvas.width = pw;
    s.maskCanvas.height = ph;
  }
  return s;
}

// ─── Fallback when mask is unavailable ────────────────────────────────────────

function drawRoundedRectFallback(
  ctx: CanvasRenderingContext2D, lo: LoBuf, x: number, y: number, w: number, h: number,
): void {
  ctx.save();
  const r = Math.min(w, h) * 0.2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(lo.canvas, x, y, w, h);
  ctx.restore();
}

// ─── Internal draw helper ─────────────────────────────────────────────────────

function _drawMaskedFill(
  ctx: CanvasRenderingContext2D,
  opts: MaskedFillOpts,
  seed: number,
): void {
  const { maskPath, x, y, width: w, height: h, colors, timeMs, outlineColor, luminanceMask,
          detail = 1.0, brightness = 1.0 } = opts;

  const rgbs = colors.map(c => hexToRgb(c.color));
  const weights = colors.map(c => c.weight);

  // fog fill stays at low res for performance
  const lo = getLoBuf(seed);
  drawFogIntoLoBuf(lo, rgbs, weights, timeMs, seed, detail, brightness);

  const maskImg = getCachedMask(maskPath);
  if (!maskImg) {
    drawRoundedRectFallback(ctx, lo, x, y, w, h);
    return;
  }

  // Mask source: luminance-converted or raw alpha PNG, at mask canvas resolution
  const compState = getCompState(seed, w, h);
  const mw = compState.maskCanvas.width;
  const mh = compState.maskCanvas.height;

  const maskSource = luminanceMask
    ? getLuminanceMaskCanvas(maskPath, maskImg, Math.max(mw, mh))
    : maskImg;

  // Composite: scale fog up smoothly, then punch out mask shape at full res
  compState.maskCtx.clearRect(0, 0, mw, mh);
  compState.maskCtx.globalCompositeOperation = 'source-over';
  compState.maskCtx.imageSmoothingEnabled = true;
  compState.maskCtx.imageSmoothingQuality = 'high';
  // Draw dark base so unlit fog areas aren't transparent after destination-in
  compState.maskCtx.fillStyle = '#04080e';
  compState.maskCtx.fillRect(0, 0, mw, mh);
  compState.maskCtx.drawImage(lo.canvas, 0, 0, mw, mh);
  compState.maskCtx.globalCompositeOperation = 'destination-in';
  compState.maskCtx.imageSmoothingEnabled = true;
  compState.maskCtx.imageSmoothingQuality = 'high';
  compState.maskCtx.drawImage(maskSource, 0, 0, mw, mh);
  compState.maskCtx.globalCompositeOperation = 'source-over';

  // Optional outline behind the fill
  if (outlineColor) {
    ctx.drawImage(getOutlineCanvas(maskPath, maskSource, mw, outlineColor), x, y, w, h);
  }

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(compState.maskCanvas, x, y, w, h);
  ctx.restore();
}

/**
 * Draw a PNG-masked animated fog fill onto an existing canvas context.
 * Call each frame with updated timeMs. Caches compositing state by seed.
 */
export function drawMaskedFill(ctx: CanvasRenderingContext2D, opts: MaskedFillOpts): void {
  _drawMaskedFill(ctx, opts, opts.seed);
}

// ─── Self-animating DOM canvas API ───────────────────────────────────────────

export interface MaskedFillCanvasOpts {
  maskPath: string;
  width: number;
  height: number;
  colors: ColorWeight[];
  seed: number;
  outlineColor?: string;
  luminanceMask?: boolean;
  detail?: number;
  brightness?: number;
  /**
   * When true, resizes the canvas height each frame to match the mask image's
   * natural aspect ratio at the current width. Use for designs that should not
   * be squished (e.g. full-rack-width mountain/sun backgrounds).
   */
  maintainAspectRatio?: boolean;
  /** Called each frame to get current colors (for dynamic color changes). */
  getColors?: () => ColorWeight[];
}

interface LiveState {
  opts: MaskedFillCanvasOpts;
}

const _liveCanvases = new Map<HTMLCanvasElement, LiveState>();
let _rafHandle = 0;
let _lastFogMs = 0;
const FOG_INTERVAL_MS = 33; // ~30fps

function _rafLoop(nowMs: number): void {
  // Prune disconnected canvases
  for (const [canvas] of _liveCanvases) {
    if (!canvas.isConnected) _liveCanvases.delete(canvas);
  }

  if (_liveCanvases.size === 0) {
    _rafHandle = 0;
    return;
  }

  const hidden = document.hidden;
  const elapsed = nowMs - _lastFogMs;
  const shouldRender = !hidden && elapsed >= FOG_INTERVAL_MS;
  if (shouldRender) _lastFogMs = nowMs;

  if (shouldRender) {
    for (const [canvas, state] of _liveCanvases) {
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      // Resize height to preserve the mask's natural aspect ratio if requested.
      if (state.opts.maintainAspectRatio) {
        const img = getCachedMask(state.opts.maskPath);
        if (img && img.naturalWidth > 0) {
          const targetH = Math.round(canvas.width * img.naturalHeight / img.naturalWidth);
          if (canvas.height !== targetH) canvas.height = targetH;
        }
      }

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const colors = state.opts.getColors ? state.opts.getColors() : state.opts.colors;
      _drawMaskedFill(ctx, {
        maskPath: state.opts.maskPath,
        x: 0, y: 0, width: w, height: h,
        colors,
        seed: state.opts.seed,
        timeMs: nowMs,
        outlineColor: state.opts.outlineColor,
        luminanceMask: state.opts.luminanceMask,
        detail: state.opts.detail,
        brightness: state.opts.brightness,
      }, state.opts.seed);
    }
  }

  _rafHandle = requestAnimationFrame(_rafLoop);
}

/**
 * Creates a self-animating HTMLCanvasElement clipped to the given PNG mask.
 * Automatically unregisters when disconnected from the DOM.
 */
export function createMaskedFillCanvas(opts: MaskedFillCanvasOpts): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = opts.width;
  canvas.height = opts.height;

  // Pre-warm the mask load
  getCachedMask(opts.maskPath);

  _liveCanvases.set(canvas, { opts });

  if (_rafHandle === 0) {
    _rafHandle = requestAnimationFrame(_rafLoop);
  }

  return canvas;
}
