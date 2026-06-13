/**
 * version2-soft-wire.ts — Soft-body wire renderer for the Version 2 synth rack.
 *
 * Ported from Equatoria Idle rpg-soft-wire.ts.
 * Provides Verlet-rope physics and SVG rendering for patch cables.
 *
 * Factory: createSoftWireRenderer(panelEl) → SoftWireRenderer
 */

const ROPE_N            = 24;
const ROPE_GRAVITY      = 0.55;
const ROPE_DAMPING      = 0.97;
const ROPE_ITERS        = 5;
const ROPE_SLACK        = 1.42;
const SLURP_MS_PER_LINK = 20;
const SLURP_TOTAL_MS    = SLURP_MS_PER_LINK * ROPE_N;
const SLURP_RATE        = 1 / SLURP_TOTAL_MS;
const BLEED_RATE        = 0.0015;

export interface RopeNode {
  x: number; y: number;
  px: number; py: number;
}

export interface SoftWireData {
  nodes:        RopeNode[];
  segLen:       number;
  /** Per-wire slack multiplier (0.88–1.28) for natural cable-tangle variation. */
  slackScale?:  number;
  polyline:     SVGPolylineElement;
  /** Wide, low-opacity copy of polyline for a neon glow effect. */
  glowPolyline: SVGPolylineElement;
  gradient:     SVGLinearGradientElement;
  gradStop0:    SVGStopElement;
  gradStop1:    SVGStopElement;
  gradStop2:    SVGStopElement;
  tipHandle:    HTMLDivElement;
  srcColor:     string;
  dstColor:     string;
  colorBleedT:  number;
  isSlurping:   boolean;
  slurpMs:      number;
}

export interface SoftWireRenderer {
  svgEl: SVGSVGElement;
  setViewBox(w: number, h: number): void;
  createWire(srcColor: string, dstColor: string): SoftWireData;
  finalizeWireRemoval(wire: SoftWireData): void;
  updateLockedWire(
    wire: SoftWireData,
    ax: number, ay: number,
    bx: number, by: number,
    deltaMs: number,
  ): void;
  updateSlurpingWire(
    wire: SoftWireData,
    ax: number, ay: number,
    deltaMs: number,
  ): boolean;
  setDragPreview(ax: number, ay: number, bx: number, by: number, color: string): void;
  updateDragPreviewPhysics(ax: number, ay: number, bx: number, by: number): void;
  hideDragPreview(): void;
}

function initRope(
  nodes: RopeNode[],
  x0: number, y0: number,
  x1: number, y1: number,
): number {
  nodes.length = 0;
  for (let i = 0; i < ROPE_N; i++) {
    const t = i / (ROPE_N - 1);
    nodes.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, px: x0 + (x1 - x0) * t, py: y0 + (y1 - y0) * t });
  }
  const dx = x1 - x0, dy = y1 - y0;
  return (Math.sqrt(dx * dx + dy * dy) * ROPE_SLACK) / (ROPE_N - 1);
}

function updateRope(
  nodes: RopeNode[],
  segLen: number,
  ax: number, ay: number,
  bx: number, by: number,
  count: number = ROPE_N,
): void {
  if (nodes.length < count) return;
  for (let i = 1; i < count - 1; i++) {
    const n = nodes[i];
    const vx = (n.x - n.px) * ROPE_DAMPING;
    const vy = (n.y - n.py) * ROPE_DAMPING;
    n.px = n.x; n.py = n.y;
    n.x += vx;
    n.y += vy + ROPE_GRAVITY;
  }
  nodes[0].x = ax; nodes[0].y = ay; nodes[0].px = ax; nodes[0].py = ay;
  nodes[count - 1].x = bx; nodes[count - 1].y = by;
  nodes[count - 1].px = bx; nodes[count - 1].py = by;
  for (let iter = 0; iter < ROPE_ITERS; iter++) {
    for (let i = 0; i < count - 1; i++) {
      const a = nodes[i], b = nodes[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 0.001) continue;
      const diff = (d - segLen) / d * 0.5;
      const ox = dx * diff, oy = dy * diff;
      if (i > 0)         { a.x += ox;  a.y += oy;  }
      if (i < count - 2) { b.x -= ox;  b.y -= oy;  }
    }
    nodes[0].x = ax; nodes[0].y = ay;
    nodes[count - 1].x = bx; nodes[count - 1].y = by;
  }
}

export function createSoftWireRenderer(panelEl: HTMLElement): SoftWireRenderer {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const svgEl = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement;
  svgEl.setAttribute('aria-hidden', 'true');
  svgEl.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:10;';

  const defs = document.createElementNS(SVG_NS, 'defs') as SVGDefsElement;
  svgEl.appendChild(defs);

  // Drag-preview glow layer (rendered behind the dashed line).
  const dragPreviewGlow = document.createElementNS(SVG_NS, 'polyline') as SVGPolylineElement;
  dragPreviewGlow.setAttribute('fill', 'none');
  dragPreviewGlow.setAttribute('stroke-width', '8');
  dragPreviewGlow.setAttribute('stroke-linecap', 'round');
  dragPreviewGlow.setAttribute('stroke-linejoin', 'round');
  dragPreviewGlow.setAttribute('stroke-opacity', '0.18');
  dragPreviewGlow.style.display = 'none';
  svgEl.appendChild(dragPreviewGlow);

  const dragPreviewPolyline = document.createElementNS(SVG_NS, 'polyline') as SVGPolylineElement;
  dragPreviewPolyline.setAttribute('fill', 'none');
  dragPreviewPolyline.setAttribute('stroke-width', '2.5');
  dragPreviewPolyline.setAttribute('stroke-linecap', 'round');
  dragPreviewPolyline.setAttribute('stroke-linejoin', 'round');
  dragPreviewPolyline.setAttribute('stroke-dasharray', '5 4');
  dragPreviewPolyline.style.display = 'none';
  svgEl.appendChild(dragPreviewPolyline);

  const dragNodes: RopeNode[] = [];
  let dragSegLen = 1;
  let gradIdSeq = 0;

  function renderWirePolyline(
    wire: SoftWireData,
    x0: number, y0: number,
    x1: number, y1: number,
    visibleCount: number,
  ): void {
    if (wire.nodes.length < ROPE_N) { wire.polyline.style.display = 'none'; wire.glowPolyline.style.display = 'none'; return; }
    const pts = wire.nodes
      .slice(0, visibleCount)
      .map(n => `${n.x.toFixed(1)},${n.y.toFixed(1)}`)
      .join(' ');
    wire.polyline.setAttribute('points', pts);
    wire.polyline.style.display = '';
    wire.glowPolyline.setAttribute('points', pts);
    wire.glowPolyline.style.display = '';
    wire.gradient.setAttribute('x1', x0.toFixed(1));
    wire.gradient.setAttribute('y1', y0.toFixed(1));
    wire.gradient.setAttribute('x2', x1.toFixed(1));
    wire.gradient.setAttribute('y2', y1.toFixed(1));
    const bleedPct = ((1 - wire.colorBleedT) * 100).toFixed(1);
    wire.gradStop0.setAttribute('stop-color', wire.srcColor);
    wire.gradStop1.setAttribute('offset', bleedPct + '%');
    wire.gradStop1.setAttribute('stop-color', wire.srcColor);
    wire.gradStop2.setAttribute('stop-color', wire.isSlurping ? wire.srcColor : wire.dstColor);
  }

  function setViewBox(w: number, h: number): void {
    svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`);
  }

  function createWire(srcColor: string, dstColor: string): SoftWireData {
    const gradId = `v2-rack-wire-grad-${gradIdSeq++}`;
    const gradient = document.createElementNS(SVG_NS, 'linearGradient') as SVGLinearGradientElement;
    gradient.setAttribute('id', gradId);
    gradient.setAttribute('gradientUnits', 'userSpaceOnUse');

    const gs0 = document.createElementNS(SVG_NS, 'stop') as SVGStopElement;
    gs0.setAttribute('offset', '0%');
    gs0.setAttribute('stop-color', srcColor);
    const gs1 = document.createElementNS(SVG_NS, 'stop') as SVGStopElement;
    gs1.setAttribute('offset', '100%');
    gs1.setAttribute('stop-color', srcColor);
    const gs2 = document.createElementNS(SVG_NS, 'stop') as SVGStopElement;
    gs2.setAttribute('offset', '100%');
    gs2.setAttribute('stop-color', dstColor);

    gradient.appendChild(gs0);
    gradient.appendChild(gs1);
    gradient.appendChild(gs2);
    defs.appendChild(gradient);

    // Glow layer: wide, semi-transparent copy rendered behind the main wire.
    const glowPolyline = document.createElementNS(SVG_NS, 'polyline') as SVGPolylineElement;
    glowPolyline.setAttribute('fill', 'none');
    glowPolyline.setAttribute('stroke', `url(#${gradId})`);
    glowPolyline.setAttribute('stroke-width', '8');
    glowPolyline.setAttribute('stroke-linecap', 'round');
    glowPolyline.setAttribute('stroke-linejoin', 'round');
    glowPolyline.setAttribute('stroke-opacity', '0.22');
    glowPolyline.style.display = 'none';
    glowPolyline.style.pointerEvents = 'none';
    svgEl.appendChild(glowPolyline);

    const polyline = document.createElementNS(SVG_NS, 'polyline') as SVGPolylineElement;
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', `url(#${gradId})`);
    polyline.setAttribute('stroke-width', '3');
    polyline.setAttribute('stroke-linecap', 'round');
    polyline.setAttribute('stroke-linejoin', 'round');
    polyline.style.display = 'none';
    svgEl.appendChild(polyline);

    const tipHandle = document.createElement('div') as HTMLDivElement;
    tipHandle.style.cssText = [
      'position:absolute',
      'width:18px',
      'height:18px',
      'border-radius:50%',
      'transform:translate(-50%,-50%)',
      'pointer-events:auto',
      'cursor:grab',
      'display:none',
      'z-index:12',
      'touch-action:none',
    ].join(';');
    panelEl.appendChild(tipHandle);

    return {
      nodes: [], segLen: 1,
      polyline, glowPolyline, gradient,
      gradStop0: gs0, gradStop1: gs1, gradStop2: gs2,
      tipHandle,
      srcColor, dstColor,
      colorBleedT: 0,
      isSlurping: false,
      slurpMs: 0,
    };
  }

  function finalizeWireRemoval(wire: SoftWireData): void {
    wire.polyline.remove();
    wire.glowPolyline.remove();
    wire.gradient.remove();
    wire.tipHandle.remove();
  }

  function updateLockedWire(
    wire: SoftWireData,
    ax: number, ay: number,
    bx: number, by: number,
    deltaMs: number,
  ): void {
    if (wire.nodes.length !== ROPE_N) {
      wire.segLen = initRope(wire.nodes, ax, ay, bx, by) * (wire.slackScale ?? 1);
    }
    updateRope(wire.nodes, wire.segLen, ax, ay, bx, by);
    wire.colorBleedT = Math.min(0.5, wire.colorBleedT + BLEED_RATE * deltaMs);
    renderWirePolyline(wire, ax, ay, bx, by, ROPE_N);
    const tip = wire.nodes[ROPE_N - 1];
    wire.tipHandle.style.display = 'block';
    wire.tipHandle.style.left = tip.x.toFixed(1) + 'px';
    wire.tipHandle.style.top  = tip.y.toFixed(1) + 'px';
  }

  function updateSlurpingWire(
    wire: SoftWireData,
    ax: number, ay: number,
    deltaMs: number,
  ): boolean {
    wire.slurpMs += deltaMs;
    const slurpProgress = wire.slurpMs * SLURP_RATE;
    const slurpedLinks  = Math.floor(slurpProgress * ROPE_N);
    if (slurpedLinks >= ROPE_N) {
      wire.polyline.style.display = 'none';
      wire.tipHandle.style.display = 'none';
      wire.nodes.length = 0;
      return true;
    }
    const visibleCount = ROPE_N - slurpedLinks;
    const tipProgress  = slurpProgress * ROPE_N - slurpedLinks;
    const tipLerpEase  = 1 - Math.pow(1 - tipProgress, 2);
    const lastVisible  = wire.nodes[visibleCount - 1];
    const pullX = lastVisible.x + (ax - lastVisible.x) * tipLerpEase * 0.15;
    const pullY = lastVisible.y + (ay - lastVisible.y) * tipLerpEase * 0.15;
    updateRope(wire.nodes, wire.segLen, ax, ay, pullX, pullY, visibleCount);
    renderWirePolyline(wire, ax, ay, pullX, pullY, visibleCount);
    wire.tipHandle.style.display = 'none';
    return false;
  }

  function setDragPreview(
    ax: number, ay: number,
    bx: number, by: number,
    color: string,
  ): void {
    if (dragNodes.length !== ROPE_N) {
      dragSegLen = initRope(dragNodes, ax, ay, bx, by);
    }
    dragPreviewPolyline.setAttribute('stroke', color);
    dragPreviewGlow.setAttribute('stroke', color);
    const pts = dragNodes.map(n => `${n.x.toFixed(1)},${n.y.toFixed(1)}`).join(' ');
    dragPreviewPolyline.setAttribute('points', pts);
    dragPreviewPolyline.style.display = '';
    dragPreviewGlow.setAttribute('points', pts);
    dragPreviewGlow.style.display = '';
  }

  function updateDragPreviewPhysics(ax: number, ay: number, bx: number, by: number): void {
    if (dragNodes.length !== ROPE_N) return;
    updateRope(dragNodes, dragSegLen, ax, ay, bx, by);
    const pts = dragNodes.map(n => `${n.x.toFixed(1)},${n.y.toFixed(1)}`).join(' ');
    dragPreviewPolyline.setAttribute('points', pts);
    dragPreviewGlow.setAttribute('points', pts);
  }

  function hideDragPreview(): void {
    dragPreviewPolyline.style.display = 'none';
    dragPreviewGlow.style.display = 'none';
    dragNodes.length = 0;
  }

  return {
    svgEl,
    setViewBox,
    createWire,
    finalizeWireRemoval,
    updateLockedWire,
    updateSlurpingWire,
    setDragPreview,
    updateDragPreviewPhysics,
    hideDragPreview,
  };
}
