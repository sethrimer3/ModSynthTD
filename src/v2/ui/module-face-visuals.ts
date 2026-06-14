/**
 * module-face-visuals.ts — UI-only, per-module "hardware" face visuals.
 *
 * Each module type gets a small procedural display (oscilloscope, VU meter,
 * step lights, echo taps, route lanes, etc.) rendered as SVG/canvas behind the
 * interactive controls. Visuals never intercept pointer input and never touch
 * core/audio/global state — they read `inst.settings`, an activity number, and
 * the current tick, and animate accordingly. Reduced motion freezes movement
 * while keeping static, settings-driven indicators visible.
 *
 * This file lives in the UI layer and is imported by rack-ui.ts. Do NOT import
 * it from core/modules.ts.
 */

import { ModuleInstance } from '../core/graph';
import { ModuleTypeDef } from '../core/modules';
import { createMaskedFillCanvas } from '../render/masked-fill-renderer';
import plantDesignUrl from '../../../ASSETS/modules/designs/plantDesign.png';

const SVGNS = 'http://www.w3.org/2000/svg';

export interface ModuleFaceVisualOpts {
  typeId: string;
  def: ModuleTypeDef;
  inst: ModuleInstance;
  panelW: number;
  panelH: number;
  color: string;
  reducedMotion: () => boolean;
}

/**
 * A compact, UI-side snapshot of the real signal arriving at a module around
 * the current tick — derived from cable traffic by rack-ui. Lets meters and
 * playheads reflect actual amplitude/band/step instead of approximations.
 */
export interface ModuleLiveSample {
  /** Peak amplitude (0..~1.2) of events firing in the live window, else 0. */
  amp: number;
  /** Frequency band of the loudest firing event. */
  band: string | null;
  /** Count of incoming events with tick ≤ currentTick (drives step playheads). */
  index: number;
  /** True if at least one incoming event is within the live window now. */
  firing: boolean;
  /** Per-input-port peak amplitude + firing flag. */
  ports: Record<string, { amp: number; firing: boolean }>;
}

export interface ModuleFaceVisualHandle {
  /** Root element to append into the module background layer (z below controls). */
  el: HTMLElement;
  /** Per-frame update. act = module activity count, tick = current tick (-1 if none). */
  update?: (nowMs: number, act: number, currentTick: number, live?: ModuleLiveSample | null) => void;
  /** Called when settings change so static layout/colors can refresh. */
  refreshSettings?: () => void;
  destroy?: () => void;
}

// ── tiny helpers ──────────────────────────────────────────────────────────────

type FrameCtx = { nowMs: number; act: number; tick: number; reduced: boolean; live: ModuleLiveSample | null };
type Updater = (c: FrameCtx) => void;

function el(tag: string, attrs?: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(SVGNS, tag);
  if (attrs) for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  return e as SVGElement;
}

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

function bandColor(band: string): string {
  switch (band) {
    case 'low': return '#44aaff';
    case 'mid': return '#44ff88';
    case 'high': return '#ff9944';
    default: return '#88aacc';
  }
}

function setGlow(e: SVGElement | HTMLElement, color: string, active: boolean, blur = 4): void {
  e.style.filter = active ? `drop-shadow(0 0 ${blur}px ${color})` : 'none';
}

// settings readers
function makeReaders(inst: ModuleInstance, def: ModuleTypeDef) {
  return {
    n(key: string, fallback: number): number {
      const v = inst.settings[key] ?? def.defaultSettings[key];
      return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
    },
    s(key: string, fallback: string): string {
      const v = inst.settings[key] ?? def.defaultSettings[key];
      return typeof v === 'string' ? v : fallback;
    },
    b(key: string, fallback: boolean): boolean {
      const v = inst.settings[key] ?? def.defaultSettings[key];
      return typeof v === 'boolean' ? v : fallback;
    },
  };
}

// waveform preview sampler, ph in turns
function waveSample(wf: string, ph: number): number {
  const t = ((ph % 1) + 1) % 1;
  switch (wf) {
    case 'square': return t < 0.5 ? 1 : -1;
    case 'pulse': return t < 0.28 ? 1 : -1;
    case 'saw': return 1 - 2 * t;
    case 'triangle': return t < 0.5 ? 4 * t - 1 : 3 - 4 * t;
    case 'sine':
    default: return Math.sin(t * 2 * Math.PI);
  }
}

function waveformPath(wf: string, w: number, h: number, periods: number, phase: number, ampScale = 1): string {
  const n = 56;
  const amp = h * 0.4 * Math.max(0.15, Math.min(1, ampScale));
  let d = '';
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * w;
    const y = h / 2 - waveSample(wf, phase + (i / n) * periods) * amp;
    d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
  }
  return d;
}

function pitchValues(pattern: string): number[] {
  return pattern.split(',').map(p => {
    const v = parseInt(p.trim(), 10);
    return Number.isFinite(v) ? v : 0;
  });
}

// ── builder ───────────────────────────────────────────────────────────────────

export function buildModuleFaceVisual(opts: ModuleFaceVisualOpts): ModuleFaceVisualHandle | null {
  const { typeId, def, inst, panelW, panelH, color } = opts;

  // Visual box = safe region between header and footer, inset from port strips.
  const padX = Math.min(18, Math.max(5, Math.floor(panelW * 0.16)));
  const top = 24;
  const bottom = 20;
  const w = panelW - padX * 2;
  const h = panelH - top - bottom;
  if (w < 12 || h < 12) return null;

  const container = document.createElement('div');
  container.style.cssText =
    `position:absolute;left:${padX}px;top:${top}px;width:${w}px;height:${h}px;` +
    `pointer-events:none;z-index:2;overflow:hidden;border-radius:4px;`;

  const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, width: '100%', height: '100%' }) as SVGElement;
  (svg.style as CSSStyleDeclaration).display = 'block';

  const R = makeReaders(inst, def);
  const updaters: Updater[] = [];
  const refreshers: Array<() => void> = [];
  let extraDestroy: (() => void) | null = null;

  // Helper: append a mini CRT-style screen rect, returns inner content group.
  function screen(sx: number, sy: number, sw: number, sh: number, accent: string): SVGElement {
    const bg = el('rect', { x: sx, y: sy, width: sw, height: sh, rx: 3, fill: '#04060e', stroke: accent, 'stroke-width': 0.8, 'stroke-opacity': 0.5 });
    svg.appendChild(bg);
    // scanline overlay
    const scan = el('rect', { x: sx, y: sy, width: sw, height: sh, rx: 3, fill: 'url(#sl-' + typeId + ')', opacity: 0.25 });
    // gradient/scanline pattern defined lazily
    if (!svg.querySelector('#sl-' + typeId)) {
      const defs = el('defs');
      const pat = el('pattern', { id: 'sl-' + typeId, width: 2, height: 2, patternUnits: 'userSpaceOnUse' });
      pat.appendChild(el('rect', { width: 2, height: 1, fill: accent, opacity: 0.18 }));
      defs.appendChild(pat);
      svg.appendChild(defs);
    }
    svg.appendChild(scan);
    const g = el('g');
    svg.appendChild(g);
    return g;
  }

  function led(cx: number, cy: number, r: number, col: string): SVGElement {
    const c = el('circle', { cx, cy, r, fill: col, 'fill-opacity': 0.25, stroke: col, 'stroke-width': 0.7 });
    svg.appendChild(c);
    return c;
  }

  function label(x: number, y: number, text: string, col: string, size = 5): SVGElement {
    const t = el('text', { x, y, fill: col, 'font-size': size, 'font-family': "'Pixelify Sans',monospace", 'font-weight': 700, 'text-anchor': 'middle' });
    t.textContent = text;
    svg.appendChild(t);
    return t;
  }

  switch (typeId) {
    // ── CLOCK ───────────────────────────────────────────────────────────────
    case 'clock': {
      // Ported masked-fill "living timing glyph" (bottom-right of panel).
      let lastAct = 0;
      const designW = Math.round(panelW * 0.7);
      const designH = Math.round(panelH * 0.4);
      const canvas = createMaskedFillCanvas({
        maskPath: plantDesignUrl,
        width: designW,
        height: designH,
        colors: [
          { color: '#00c8ff', weight: 0.55 },
          { color: '#00ff88', weight: 0.35 },
          { color: '#0044ff', weight: 0.10 },
        ],
        seed: 0x1c10c,
        luminanceMask: true,
        getColors: () => lastAct > 0
          ? [{ color: '#44eeff', weight: 0.45 }, { color: '#88ffcc', weight: 0.40 }, { color: '#0088ff', weight: 0.15 }]
          : [{ color: '#00c8ff', weight: 0.55 }, { color: '#00ff88', weight: 0.35 }, { color: '#0044ff', weight: 0.10 }],
      });
      // Place relative to panel (container is inset, so undo the inset).
      canvas.style.cssText =
        `position:absolute;left:${panelW - designW - 2 - padX}px;top:${panelH - designH - 4 - top}px;` +
        `pointer-events:none;opacity:0.5;border-radius:4px;`;
      container.appendChild(canvas);
      extraDestroy = () => { try { (canvas as unknown as { remove?: () => void }).remove?.(); } catch { /* noop */ } };

      // Tick ring dial in the upper area of the SVG box.
      const cx = w / 2, cy = Math.min(h * 0.42, w * 0.5), r = Math.min(w, h) * 0.32;
      svg.appendChild(el('circle', { cx, cy, r, fill: 'none', stroke: color, 'stroke-width': 1, 'stroke-opacity': 0.4 }));
      const TICKS = 8;
      const tickEls: SVGElement[] = [];
      for (let i = 0; i < TICKS; i++) {
        const a = (i / TICKS) * Math.PI * 2 - Math.PI / 2;
        const t = el('circle', { cx: cx + Math.cos(a) * r, cy: cy + Math.sin(a) * r, r: 1.4, fill: color, 'fill-opacity': 0.35 });
        svg.appendChild(t);
        tickEls.push(t);
      }
      const sweep = el('circle', { cx: cx + r, cy, r: 2.2, fill: '#ffffff' });
      svg.appendChild(sweep);
      // Phase notch.
      const notch = el('line', { x1: cx, y1: cy - r - 2, x2: cx, y2: cy - r + 2, stroke: color, 'stroke-width': 1 });
      svg.appendChild(notch);
      // Gate-width bar at bottom.
      const barY = Math.min(h - 4, cy + r + 6);
      const barW = w * 0.7, barX = (w - barW) / 2;
      svg.appendChild(el('rect', { x: barX, y: barY, width: barW, height: 3, rx: 1.5, fill: '#0a1830', stroke: color, 'stroke-width': 0.5, 'stroke-opacity': 0.4 }));
      const gateFill = el('rect', { x: barX, y: barY, width: barW * 0.5, height: 3, rx: 1.5, fill: color });
      svg.appendChild(gateFill);

      const applySettings = () => {
        const gate = R.n('gate', 0.5);
        gateFill.setAttribute('width', String(barW * clamp01(gate)));
        const phase = R.n('phaseTicks', 0);
        const pa = (phase / 192) * Math.PI * 2 - Math.PI / 2;
        notch.setAttribute('x1', String(cx + Math.cos(pa) * (r - 2)));
        notch.setAttribute('y1', String(cy + Math.sin(pa) * (r - 2)));
        notch.setAttribute('x2', String(cx + Math.cos(pa) * (r + 2)));
        notch.setAttribute('y2', String(cy + Math.sin(pa) * (r + 2)));
      };
      refreshers.push(applySettings);
      applySettings();

      updaters.push(({ nowMs, act, tick, reduced }) => {
        lastAct = act;
        const sub = R.n('subdivisionTicks', 48);
        let ang: number;
        if (reduced) {
          ang = tick >= 0 ? ((tick % sub) / sub) * Math.PI * 2 - Math.PI / 2 : -Math.PI / 2;
        } else {
          const period = Math.max(300, sub * 12);
          ang = ((nowMs % period) / period) * Math.PI * 2 - Math.PI / 2;
        }
        sweep.setAttribute('cx', String(cx + Math.cos(ang) * r));
        sweep.setAttribute('cy', String(cy + Math.sin(ang) * r));
        const lit = Math.floor(((ang + Math.PI / 2) / (Math.PI * 2)) * TICKS + TICKS) % TICKS;
        for (let i = 0; i < TICKS; i++) {
          const on = i === lit;
          tickEls[i].setAttribute('fill-opacity', on ? '1' : '0.35');
        }
        setGlow(sweep, '#ffffff', act > 0, 5);
      });
      break;
    }

    // ── OSCILLATOR ────────────────────────────────────────────────────────────
    case 'osc': {
      const g = screen(0, 1, w, h - 12, color);
      const path = el('path', { fill: 'none', stroke: color, 'stroke-width': 1.4, 'stroke-linejoin': 'round' });
      g.appendChild(path);
      const sw = w, sh = h - 12;
      // Band LEDs LO/MI/HI along the bottom.
      const bands = ['low', 'mid', 'high'];
      const bandEls: SVGElement[] = [];
      bands.forEach((b, i) => {
        const lx = w * (0.22 + i * 0.28);
        const ly = h - 5;
        bandEls.push(led(lx, ly, 1.8, bandColor(b)));
        label(lx, ly + 4.2, ['LO', 'MI', 'HI'][i], '#44608a', 4);
      });

      let periods = 2, accent = color, wf = 'pulse';
      const applySettings = () => {
        wf = R.s('waveform', 'pulse');
        const band = R.s('band', 'mid');
        accent = bandColor(band);
        periods = band === 'low' ? 1.5 : band === 'high' ? 3.5 : 2.5;
        path.setAttribute('stroke', accent);
        bands.forEach((b, i) => {
          const on = b === band;
          bandEls[i].setAttribute('fill-opacity', on ? '0.9' : '0.18');
          (bandEls[i] as SVGElement).style.filter = on ? `drop-shadow(0 0 2px ${bandColor(b)})` : 'none';
        });
        path.setAttribute('d', waveformPath(wf, sw, sh, periods, 0));
      };
      refreshers.push(applySettings);
      applySettings();

      updaters.push(({ nowMs, act, reduced, live }) => {
        // Real signal scales trace height; scan animates only when active.
        const ampScale = live && live.firing ? 0.4 + live.amp * 0.8 : 1;
        if (!reduced && act > 0) {
          const phase = (nowMs / 600) % 1;
          path.setAttribute('d', waveformPath(wf, sw, sh, periods, phase, ampScale));
        } else if (live && live.firing) {
          path.setAttribute('d', waveformPath(wf, sw, sh, periods, 0, ampScale));
        }
        setGlow(path, accent, act > 0 || (live?.firing ?? false), 4);
      });
      break;
    }

    // ── OUTPUT ────────────────────────────────────────────────────────────────
    case 'output': {
      // VU meter strip near the bottom + speaker grille. Tower slot is a control.
      const meterY = h - 14;
      const cols = 10;
      const cellW = (w - 2) / cols;
      const cells: SVGElement[] = [];
      for (let i = 0; i < cols; i++) {
        const c = el('rect', { x: 1 + i * cellW, y: meterY, width: cellW - 1, height: 5, rx: 1, fill: '#0a1830' });
        svg.appendChild(c);
        cells.push(c);
      }
      // speaker grille dots
      for (let r = 0; r < 2; r++) for (let cI = 0; cI < 6; cI++) {
        svg.appendChild(el('circle', { cx: w * 0.2 + cI * (w * 0.12), cy: meterY + 9 + r * 4, r: 0.9, fill: '#1a2a44' }));
      }
      const meterColor = (i: number) => i < cols * 0.6 ? '#44ff88' : i < cols * 0.85 ? '#ffdd44' : '#ff5544';
      updaters.push(({ act, reduced, nowMs, live }) => {
        const on = R.b('synthOn', false);
        const vol = R.n('synthVolume', 0.5);
        let level: number;
        if (live && live.firing) {
          // Real signal: peak amplitude scaled by output volume.
          level = clamp01(live.amp * (0.45 + vol * 0.55));
        } else {
          level = clamp01((act > 0 ? 0.45 : 0.1) + vol * 0.35);
          if (on && act > 0 && !reduced) level = clamp01(level + 0.1 * Math.sin(nowMs / 120));
        }
        const lit = Math.round(level * cols);
        for (let i = 0; i < cols; i++) {
          const isOn = i < lit;
          cells[i].setAttribute('fill', isOn ? meterColor(i) : '#0a1830');
          (cells[i] as SVGElement).style.opacity = on ? '1' : '0.4';
        }
      });
      break;
    }

    // ── CONNECTOR ─────────────────────────────────────────────────────────────
    case 'connector': {
      // Narrow vertical busbar with a travelling pulse + two status lamps.
      const mx = w / 2;
      svg.appendChild(el('line', { x1: mx, y1: 4, x2: mx, y2: h - 4, stroke: color, 'stroke-width': 1.4, 'stroke-opacity': 0.5 }));
      const lampTop = led(mx, 6, 1.6, '#ffaa44');
      const lampBot = led(mx, h - 6, 1.6, '#44aaff');
      const dot = el('circle', { cx: mx, cy: 6, r: 2, fill: '#ffffff', opacity: 0 });
      svg.appendChild(dot);
      updaters.push(({ nowMs, act, reduced }) => {
        lampTop.setAttribute('fill-opacity', act > 0 ? '0.9' : '0.25');
        lampBot.setAttribute('fill-opacity', act > 0 ? '0.9' : '0.25');
        if (!reduced && act > 0) {
          const t = (nowMs / 700) % 1;
          dot.setAttribute('cy', String(6 + t * (h - 12)));
          dot.setAttribute('opacity', '1');
          setGlow(dot, color, true, 4);
        } else {
          dot.setAttribute('opacity', '0');
        }
      });
      break;
    }

    // ── SPLITTER ──────────────────────────────────────────────────────────────
    case 'splitter': {
      const inX = 2, inY = h / 2, jx = w * 0.42;
      const ys = [h * 0.22, h * 0.5, h * 0.8];
      svg.appendChild(el('line', { x1: inX, y1: inY, x2: jx, y2: inY, stroke: color, 'stroke-width': 1.3, 'stroke-opacity': 0.6 }));
      const branchEls: SVGElement[] = [];
      const branchLeds: SVGElement[] = [];
      ['A', 'B', 'C'].forEach((lab, i) => {
        const p = el('path', { d: `M${jx} ${inY} L${jx + 4} ${ys[i]} L${w - 4} ${ys[i]}`, fill: 'none', stroke: color, 'stroke-width': 1, 'stroke-opacity': 0.45 });
        svg.appendChild(p);
        branchEls.push(p);
        branchLeds.push(led(w - 3, ys[i], 1.6, color));
        label(jx + 8, ys[i] - 2, lab, '#44608a', 4);
      });
      svg.appendChild(el('circle', { cx: jx, cy: inY, r: 1.8, fill: color }));
      updaters.push(({ nowMs, act, reduced }) => {
        const pulse = !reduced && act > 0 ? 0.5 + 0.5 * Math.sin(nowMs / 160) : (act > 0 ? 1 : 0.4);
        branchEls.forEach((p, i) => {
          p.setAttribute('stroke-opacity', String(act > 0 ? 0.4 + 0.5 * pulse : 0.45));
          branchLeds[i].setAttribute('fill-opacity', String(act > 0 ? pulse : 0.25));
        });
      });
      break;
    }

    // ── MIXER ─────────────────────────────────────────────────────────────────
    case 'mixer': {
      const strips = ['A', 'B', 'C', 'D'];
      const stripW = w * 0.16;
      const faders: SVGElement[] = [];
      strips.forEach((lab, i) => {
        const sx = w * (0.06 + i * 0.17);
        svg.appendChild(el('rect', { x: sx, y: 2, width: stripW, height: h - 10, rx: 1.5, fill: '#0a1830', stroke: color, 'stroke-width': 0.4, 'stroke-opacity': 0.4 }));
        const cap = el('rect', { x: sx - 0.5, y: h * 0.5, width: stripW + 1, height: 3, rx: 1, fill: color });
        svg.appendChild(cap);
        faders.push(cap);
        label(sx + stripW / 2, h - 2, lab, '#44608a', 4);
      });
      // output meter on right
      const mx = w * 0.86;
      svg.appendChild(el('rect', { x: mx, y: 2, width: w * 0.1, height: h - 10, rx: 1.5, fill: '#0a1830', stroke: '#44ff88', 'stroke-width': 0.4, 'stroke-opacity': 0.5 }));
      const outMeter = el('rect', { x: mx, y: h - 8, width: w * 0.1, height: 0, rx: 1.5, fill: '#44ff88' });
      svg.appendChild(outMeter);
      const seeds = [0.7, 0.45, 0.6, 0.3];
      const portIds = ['inA', 'inB', 'inC', 'inD'];
      updaters.push(({ nowMs, act, reduced, live }) => {
        let sumReal = 0;
        faders.forEach((cap, i) => {
          const p = live?.ports[portIds[i]];
          let lvl: number;
          if (p && p.firing) { lvl = clamp01(p.amp); sumReal += p.amp; cap.setAttribute('fill-opacity', '1'); }
          else if (live) { lvl = 0.08; cap.setAttribute('fill-opacity', '0.3'); }
          else { lvl = !reduced && act > 0 ? clamp01(seeds[i] + 0.15 * Math.sin(nowMs / 200 + i)) : seeds[i]; cap.setAttribute('fill-opacity', '1'); }
          cap.setAttribute('y', String(2 + (1 - lvl) * (h - 13)));
        });
        let outLvl: number;
        if (live) outLvl = clamp01(sumReal);
        else outLvl = act > 0 ? (reduced ? 0.7 : 0.55 + 0.25 * Math.abs(Math.sin(nowMs / 180))) : 0.15;
        const oh = outLvl * (h - 10);
        outMeter.setAttribute('y', String(h - 8 - oh));
        outMeter.setAttribute('height', String(oh));
      });
      break;
    }

    // ── ROUTER ────────────────────────────────────────────────────────────────
    case 'router': {
      const ys = [h * 0.25, h * 0.5, h * 0.75];
      const laneEls: SVGElement[] = [];
      const laneDots: SVGElement[] = [];
      ['A', 'B', 'C'].forEach((lab, i) => {
        svg.appendChild(el('line', { x1: w * 0.18, y1: ys[i], x2: w - 4, y2: ys[i], stroke: color, 'stroke-width': 1, 'stroke-opacity': 0.3 }));
        const d = led(w * 0.18, ys[i], 1.8, color);
        laneEls.push(d);
        laneDots.push(d);
        label(w * 0.1, ys[i] + 1.5, lab, '#44608a', 4.5);
      });
      svg.appendChild(el('circle', { cx: 2, cy: h / 2, r: 1.6, fill: color }));
      updaters.push(({ nowMs, act, tick, reduced }) => {
        const mode = R.s('mode', 'alternate');
        let active = 0;
        if (mode === 'fixed') {
          active = { A: 0, B: 1, C: 2 }[R.s('fixedRoute', 'A')] ?? 0;
        } else if (mode === 'measure') {
          active = tick >= 0 ? Math.floor(tick / 192) % 3 : 0;
        } else if (mode === 'pattern') {
          const seed = reduced ? (tick >= 0 ? tick : 0) : Math.floor(nowMs / 240);
          active = (seed * 2654435761) % 3;
          active = ((active % 3) + 3) % 3;
        } else {
          active = reduced ? 0 : Math.floor(nowMs / 320) % 3;
        }
        laneDots.forEach((dd, i) => {
          const on = i === active && act > 0;
          dd.setAttribute('fill-opacity', i === active ? (act > 0 ? '1' : '0.5') : '0.18');
          setGlow(dd, color, on, 4);
        });
      });
      break;
    }

    // ── AMP ───────────────────────────────────────────────────────────────────
    case 'amp': {
      const rungs = 8;
      const rungH = (h - 6) / rungs;
      const rungEls: SVGElement[] = [];
      for (let i = 0; i < rungs; i++) {
        const r = el('rect', { x: 2, y: h - 4 - (i + 1) * rungH + 1, width: w * 0.4, height: rungH - 1.5, rx: 1, fill: '#0a1830' });
        svg.appendChild(r);
        rungEls.push(r);
      }
      // knob
      const kx = w * 0.74, ky = h / 2, kr = Math.min(w * 0.2, h * 0.28);
      svg.appendChild(el('circle', { cx: kx, cy: ky, r: kr, fill: '#0a1426', stroke: color, 'stroke-width': 1 }));
      const ptr = el('line', { x1: kx, y1: ky, x2: kx, y2: ky - kr, stroke: color, 'stroke-width': 1.4 });
      svg.appendChild(ptr);
      const rungColor = (i: number) => i < rungs * 0.6 ? '#88ff22' : i < rungs * 0.85 ? '#ffdd44' : '#ff5544';
      const apply = () => {
        const gain = R.n('gain', 1);
        const frac = clamp01(gain / 3);
        const ang = (-0.7 + frac * 1.4) * Math.PI; // sweep ~ -126°..126°
        ptr.setAttribute('x2', String(kx + Math.sin(ang) * (kr - 1)));
        ptr.setAttribute('y2', String(ky - Math.cos(ang) * (kr - 1)));
      };
      refreshers.push(apply);
      apply();
      updaters.push(({ act, nowMs, reduced, live }) => {
        const gain = R.n('gain', 1);
        let frac: number;
        if (live && live.firing) {
          // Real post-gain output amplitude.
          frac = clamp01(live.amp * gain);
        } else {
          frac = clamp01(gain / 3);
          if (!reduced && act > 0) frac = clamp01(frac + 0.12 * Math.sin(nowMs / 140));
        }
        const lit = Math.round(frac * rungs);
        for (let i = 0; i < rungs; i++) {
          const on = i < lit;
          rungEls[i].setAttribute('fill', on ? rungColor(i) : '#0a1830');
          (rungEls[i] as SVGElement).style.opacity = on ? '1' : '0.5';
        }
      });
      break;
    }

    // ── DELAY ─────────────────────────────────────────────────────────────────
    case 'delay': {
      const MAXTAPS = 6;
      const taps: SVGElement[] = [];
      const cy = h / 2;
      svg.appendChild(el('line', { x1: 2, y1: cy, x2: w - 2, y2: cy, stroke: color, 'stroke-width': 0.6, 'stroke-opacity': 0.3 }));
      for (let i = 0; i < MAXTAPS; i++) {
        const cx = 4 + (i / MAXTAPS) * (w - 8);
        const c = el('circle', { cx, cy, r: 3 - i * 0.35, fill: color });
        svg.appendChild(c);
        taps.push(c);
      }
      const apply = () => {
        const repeats = Math.round(R.n('repeats', 1));
        const decay = R.n('decay', 0.5);
        taps.forEach((c, i) => {
          if (i === 0) { c.setAttribute('fill-opacity', '1'); return; }
          const within = i <= repeats;
          c.setAttribute('fill-opacity', within ? String(Math.max(0.12, Math.pow(decay, i))) : '0.05');
        });
      };
      refreshers.push(apply);
      apply();
      updaters.push(({ nowMs, act, reduced }) => {
        if (reduced || act <= 0) return;
        const repeats = Math.round(R.n('repeats', 1));
        const phase = (nowMs / 500) % 1;
        const head = phase * (repeats + 1);
        taps.forEach((c, i) => {
          const near = Math.abs(i - head) < 0.5 && i <= repeats;
          setGlow(c, color, near, 5);
        });
      });
      break;
    }

    // ── PHASE ─────────────────────────────────────────────────────────────────
    case 'phase': {
      const sh = h - 6;
      const orig = el('path', { d: waveformPath('sine', w, sh, 2, 0), fill: 'none', stroke: color, 'stroke-width': 1, 'stroke-opacity': 0.3, transform: 'translate(0,3)' });
      svg.appendChild(orig);
      const shifted = el('path', { fill: 'none', stroke: color, 'stroke-width': 1.4, transform: 'translate(0,3)' });
      svg.appendChild(shifted);
      const arrow = el('line', { x1: w * 0.2, y1: 3, x2: w * 0.5, y2: 3, stroke: '#ffffff', 'stroke-width': 0.8, 'marker-opacity': 1 });
      svg.appendChild(arrow);
      const apply = () => {
        const off = R.n('offsetTicks', 24);
        const phase = (off / 192) * 2;
        shifted.setAttribute('d', waveformPath('sine', w, sh, 2, -phase));
        const ax = w * 0.15, bx = clamp01(off / 96) * w * 0.5 + ax;
        arrow.setAttribute('x1', String(ax));
        arrow.setAttribute('x2', String(bx));
      };
      refreshers.push(apply);
      apply();
      updaters.push(({ act }) => { setGlow(shifted, color, act > 0, 4); });
      break;
    }

    // ── FILTER ────────────────────────────────────────────────────────────────
    case 'filter': {
      const bands = ['low', 'mid', 'high'];
      const colEls: SVGElement[] = [];
      bands.forEach((b, i) => {
        const cx = w * (0.18 + i * 0.28);
        const bw = w * 0.16;
        const c = el('rect', { x: cx - bw / 2, y: 4, width: bw, height: h - 14, rx: 1.5, fill: bandColor(b) });
        svg.appendChild(c);
        colEls.push(c);
        label(cx, h - 4, ['LO', 'MI', 'HI'][i], '#44608a', 4.5);
      });
      const slope = el('path', { fill: 'none', stroke: '#ffffff', 'stroke-width': 0.9, 'stroke-opacity': 0.5 });
      svg.appendChild(slope);
      const apply = () => {
        const band = R.s('band', 'mid');
        const hard = R.s('strength', 'soft') === 'hard';
        bands.forEach((b, i) => {
          const sel = b === band;
          colEls[i].setAttribute('fill-opacity', sel ? '0.95' : hard ? '0.1' : '0.4');
        });
        const sel = bands.indexOf(band);
        const px = w * (0.18 + sel * 0.28);
        const d = hard
          ? `M2 ${h - 8} L${px - 6} ${h - 8} L${px} 4 L${px + 6} ${h - 8} L${w - 2} ${h - 8}`
          : `M2 ${h - 8} Q${px - 10} ${h - 8} ${px} 5 Q${px + 10} ${h - 8} ${w - 2} ${h - 8}`;
        slope.setAttribute('d', d);
      };
      refreshers.push(apply);
      apply();
      updaters.push(({ act, nowMs, reduced }) => {
        const band = R.s('band', 'mid');
        const sel = bands.indexOf(band);
        if (sel >= 0) {
          const pulse = !reduced && act > 0 ? 0.6 + 0.4 * Math.sin(nowMs / 150) : (act > 0 ? 1 : 0);
          setGlow(colEls[sel], bandColor(band), act > 0, 3 + pulse * 2);
        }
      });
      break;
    }

    // ── ENVELOPE ──────────────────────────────────────────────────────────────
    case 'envelope': {
      const g = screen(0, 1, w, h - 2, color);
      const sh = h - 2;
      const env = el('path', { fill: 'none', stroke: color, 'stroke-width': 1.4, 'stroke-linejoin': 'round' });
      g.appendChild(env);
      const dot = el('circle', { r: 2, fill: '#ffffff', opacity: 0 });
      g.appendChild(dot);
      let pts: Array<[number, number]> = [];
      const apply = () => {
        const atk = R.n('attackTicks', 0);
        const rel = R.n('releaseTicks', 12);
        const aFrac = clamp01(atk / 48);
        const rFrac = clamp01(rel / 48);
        const x0 = 1, y0 = sh - 3;
        const xA = x0 + (w - 4) * (0.1 + aFrac * 0.35);
        const yA = 3;
        const xS = xA + (w - 4) * 0.18;
        const xR = clamp01(0.3 + rFrac * 0.6) * (w - 4) + xS > w - 2 ? w - 2 : xS + (w - 4) * (0.15 + rFrac * 0.4);
        pts = [[x0, y0], [xA, yA], [xS, yA], [Math.min(w - 2, xR), y0]];
        env.setAttribute('d', pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(''));
      };
      refreshers.push(apply);
      apply();
      updaters.push(({ nowMs, act, reduced }) => {
        setGlow(env, color, act > 0, 4);
        if (reduced || act <= 0 || pts.length < 2) { dot.setAttribute('opacity', '0'); return; }
        const t = (nowMs / 900) % 1;
        const seg = t * (pts.length - 1);
        const i0 = Math.min(pts.length - 2, Math.floor(seg));
        const f = seg - i0;
        dot.setAttribute('cx', String(pts[i0][0] + (pts[i0 + 1][0] - pts[i0][0]) * f));
        dot.setAttribute('cy', String(pts[i0][1] + (pts[i0 + 1][1] - pts[i0][1]) * f));
        dot.setAttribute('opacity', '1');
        setGlow(dot, '#ffffff', true, 4);
      });
      break;
    }

    // ── CLOCK DIVIDER ─────────────────────────────────────────────────────────
    case 'clockdiv': {
      const STEPS = 8;
      const cy = h * 0.42;
      const dots: SVGElement[] = [];
      for (let i = 0; i < STEPS; i++) {
        const cx = 3 + (i / (STEPS - 1)) * (w - 6);
        const d = el('circle', { cx, cy, r: 2, fill: color, 'fill-opacity': 0.2 });
        svg.appendChild(d);
        dots.push(d);
      }
      const glyph = label(w / 2, h - 3, '÷2', color, 7);
      const apply = () => {
        const factor = R.s('factor', '/2');
        glyph.textContent = factor === 'x2' ? '×2' : '÷' + factor.replace('/', '');
        const n = factor === '/4' ? 4 : factor === '/3' ? 3 : 2;
        const mult = factor === 'x2';
        dots.forEach((d, i) => {
          const bright = mult ? true : i % n === 0;
          d.setAttribute('fill-opacity', bright ? '0.9' : '0.18');
        });
      };
      refreshers.push(apply);
      apply();
      updaters.push(({ nowMs, act, reduced }) => {
        if (reduced || act <= 0) return;
        const head = Math.floor((nowMs / 250)) % STEPS;
        dots.forEach((d, i) => setGlow(d, color, i === head, 4));
      });
      break;
    }

    // ── SEQUENCER ─────────────────────────────────────────────────────────────
    case 'sequencer': {
      const COLS = 4, ROWS = 2, N = 8;
      const cellW = (w - 4) / COLS, cellH = (h - 4) / ROWS;
      const cellEls: SVGElement[] = [];
      const barEls: SVGElement[] = [];
      for (let i = 0; i < N; i++) {
        const r = Math.floor(i / COLS), c = i % COLS;
        const cx = 2 + c * cellW, cy = 2 + r * cellH;
        const cell = el('rect', { x: cx + 1, y: cy + 1, width: cellW - 2, height: cellH - 2, rx: 2, fill: '#0a1830', stroke: color, 'stroke-width': 0.5, 'stroke-opacity': 0.4 });
        svg.appendChild(cell);
        cellEls.push(cell);
        const bar = el('rect', { x: cx + cellW * 0.3, y: cy + cellH - 3, width: cellW * 0.4, height: 2, rx: 0.5, fill: color });
        svg.appendChild(bar);
        barEls.push(bar);
      }
      const apply = () => {
        const gates = R.s('gates', '11111111');
        const pitches = pitchValues(R.s('pitches', '0,0,0,0,0,0,0,0'));
        const maxP = Math.max(1, ...pitches.map(p => Math.abs(p)));
        for (let i = 0; i < N; i++) {
          const on = gates[i] === '1';
          cellEls[i].setAttribute('fill', on ? '#12203a' : '#0a1018');
          cellEls[i].setAttribute('stroke-opacity', on ? '0.6' : '0.2');
          const r = Math.floor(i / COLS);
          const cy = 2 + r * cellH;
          const pv = pitches[i % pitches.length] ?? 0;
          const frac = clamp01((Math.abs(pv) / maxP) * 0.8 + 0.15);
          const bh = (cellH - 5) * frac;
          barEls[i].setAttribute('y', String(cy + cellH - 2 - bh));
          barEls[i].setAttribute('height', String(bh));
          barEls[i].setAttribute('fill-opacity', on ? '0.95' : '0.15');
        }
      };
      refreshers.push(apply);
      apply();
      updaters.push(({ tick, act, nowMs, reduced, live }) => {
        let step: number;
        if (live && live.firing) step = ((live.index - 1) % N + N) % N; // real advancing step
        else if (reduced) step = tick >= 0 ? Math.floor(tick / 24) % N : 0;
        else step = act > 0 ? Math.floor(nowMs / 200) % N : -1;
        for (let i = 0; i < N; i++) {
          const on = i === step;
          cellEls[i].setAttribute('stroke', on ? '#ffffff' : color);
          setGlow(cellEls[i], '#ffffff', on, 4);
        }
      });
      break;
    }

    // ── ARP ───────────────────────────────────────────────────────────────────
    case 'arp': {
      const line = el('polyline', { fill: 'none', stroke: color, 'stroke-width': 1.2, 'stroke-linejoin': 'round' });
      svg.appendChild(line);
      let nodes: SVGElement[] = [];
      let coords: Array<[number, number]> = [];
      const apply = () => {
        nodes.forEach(n => n.remove());
        nodes = [];
        const pat = pitchValues(R.s('pattern', '0,4,7,12'));
        const maxP = Math.max(1, ...pat.map(p => Math.abs(p)));
        coords = pat.map((p, i) => {
          const x = 4 + (pat.length === 1 ? w / 2 : (i / (pat.length - 1)) * (w - 8));
          const y = h - 4 - clamp01(Math.abs(p) / maxP) * (h - 10);
          return [x, y] as [number, number];
        });
        line.setAttribute('points', coords.map(c => c[0].toFixed(1) + ',' + c[1].toFixed(1)).join(' '));
        coords.forEach(c => {
          const n = el('circle', { cx: c[0], cy: c[1], r: 2, fill: color });
          svg.appendChild(n);
          nodes.push(n);
        });
      };
      refreshers.push(apply);
      apply();
      updaters.push(({ tick, act, nowMs, reduced }) => {
        if (!nodes.length) return;
        let step = -1;
        if (act > 0) step = reduced ? (tick >= 0 ? tick % nodes.length : 0) : Math.floor(nowMs / 220) % nodes.length;
        nodes.forEach((n, i) => {
          const on = i === step;
          n.setAttribute('r', on ? '3' : '2');
          setGlow(n, color, on, 5);
        });
      });
      break;
    }

    // ── PROBABILITY ───────────────────────────────────────────────────────────
    case 'probability': {
      const barY = h * 0.6, barW = w - 6;
      svg.appendChild(el('rect', { x: 3, y: barY, width: barW, height: 4, rx: 2, fill: '#0a1830', stroke: color, 'stroke-width': 0.5, 'stroke-opacity': 0.4 }));
      const fill = el('rect', { x: 3, y: barY, width: barW * 0.75, height: 4, rx: 2, fill: color });
      svg.appendChild(fill);
      const pct = label(w / 2, barY - 3, '75%', color, 6);
      // random-looking dot grid
      const dots: SVGElement[] = [];
      const GD = 8;
      for (let i = 0; i < GD; i++) {
        const cx = 4 + (i / (GD - 1)) * (w - 8);
        const d = el('circle', { cx, cy: h * 0.28, r: 1.6, fill: color, 'fill-opacity': 0.2 });
        svg.appendChild(d);
        dots.push(d);
      }
      const apply = () => {
        const chance = R.n('chance', 0.75);
        fill.setAttribute('width', String(barW * clamp01(chance)));
        pct.textContent = Math.round(chance * 100) + '%';
        const lit = Math.round(chance * GD);
        // deterministic spread (not random per-frame)
        dots.forEach((d, i) => {
          const on = ((i * 5 + 2) % GD) < lit;
          d.setAttribute('fill-opacity', on ? '0.9' : '0.15');
        });
      };
      refreshers.push(apply);
      apply();
      updaters.push(({ act }) => { setGlow(fill, color, act > 0, 4); });
      break;
    }

    // ── RESONATOR ─────────────────────────────────────────────────────────────
    case 'resonator': {
      const bands = ['low', 'mid', 'high'];
      const ringEls: SVGElement[] = [];
      bands.forEach((b, i) => {
        const cx = w * (0.22 + i * 0.28);
        const cy = h * 0.42;
        const rr = Math.min(w * 0.12, h * 0.28);
        const ring = el('circle', { cx, cy, r: rr, fill: 'none', stroke: bandColor(b), 'stroke-width': 1.4 });
        svg.appendChild(ring);
        ringEls.push(ring);
        label(cx, cy + rr + 4, ['LO', 'MI', 'HI'][i], '#44608a', 4.5);
      });
      // retune arrow
      svg.appendChild(el('line', { x1: 2, y1: h - 5, x2: w - 4, y2: h - 5, stroke: '#ffffff', 'stroke-width': 0.7, 'stroke-opacity': 0.4 }));
      svg.appendChild(el('path', { d: `M${w - 4} ${h - 5} l-3 -2 l0 4 z`, fill: '#ffffff', 'fill-opacity': 0.4 }));
      let cycleIdx = 0;
      const apply = () => {
        const mode = R.s('band', 'low');
        bands.forEach((b, i) => {
          const sel = mode === b;
          ringEls[i].setAttribute('stroke-opacity', sel ? '1' : '0.25');
        });
      };
      refreshers.push(apply);
      apply();
      updaters.push(({ nowMs, act, tick, reduced }) => {
        const mode = R.s('band', 'low');
        if (mode === 'cycle') {
          cycleIdx = reduced ? (tick >= 0 ? Math.floor(tick / 48) % 3 : 0) : Math.floor(nowMs / 400) % 3;
          ringEls.forEach((r, i) => {
            const on = i === cycleIdx;
            r.setAttribute('stroke-opacity', on ? '1' : '0.2');
            setGlow(r, bandColor(bands[i]), on && act > 0, 4);
          });
        } else {
          const sel = bands.indexOf(mode);
          if (sel >= 0) setGlow(ringEls[sel], bandColor(mode), act > 0, 4);
        }
      });
      break;
    }

    default:
      return null;
  }

  container.appendChild(svg);

  return {
    el: container,
    update: updaters.length
      ? (nowMs, act, tick, live) => {
          const ctx: FrameCtx = { nowMs, act, tick, reduced: opts.reducedMotion(), live: live ?? null };
          for (const u of updaters) u(ctx);
        }
      : undefined,
    refreshSettings: refreshers.length ? () => { for (const r of refreshers) r(); } : undefined,
    destroy: () => { extraDestroy?.(); container.remove(); },
  };
}
