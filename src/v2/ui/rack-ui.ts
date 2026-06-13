/**
 * rack-ui.ts — The editable multi-shelf rack: DOM modules, analytic plug
 * layout, soft patch cables, drag-to-rearrange, drag-to-patch, and the
 * organized-yet-messy cable tangle.
 *
 * The rack root lives inside the camera-scaled scene container, so all
 * pointer math divides by the camera zoom. Plug positions are computed
 * analytically from module slots — no per-frame DOM measurement.
 */

import { RackGraph, ModuleInstance, Cable, validateGraph, GraphValidation } from '../core/graph';
import { getModuleType, ModuleTypeDef, SettingSpec } from '../core/modules';
import { PortSpec, arePortsCompatible } from '../core/ports';
import { SignalEvent } from '../core/events';
import { RACK_COLS, MAX_ROWS, shelfCost, checkPlacement } from '../state/economy';
import { hashString } from '../core/rng';
import { createSoftWireRenderer, SoftWireData } from '../../version2-soft-wire';
import { TowerStyle } from './tower-style';

// ── Metrics ─────────────────────────────────────────────────────────────────

export const SLOT_PX = 36;
export const SHELF_H = 148;
export const SHELF_GAP = 14;
export const RACK_PAD = 16;

// ── Module face layout regions ───────────────────────────────────────────────
// All values in pixels relative to the module panel div.

/** Height of the title/header band at the top of every panel. */
const FACE_HEADER_H = 26;
/** Height of the LED/footer band at the bottom of every panel. */
const FACE_FOOTER_H = 22;
/** Horizontal port reservation per side for wide panels; narrows for small panels. */
function facePortStripW(panelW: number): number {
  return Math.min(24, Math.max(6, Math.floor(panelW * 0.22)));
}

export function rackWidthPx(): number {
  return RACK_COLS * SLOT_PX + RACK_PAD * 2;
}

export function rackHeightPx(shelfCount: number, showBuyRail: boolean): number {
  const rails = shelfCount + (showBuyRail ? 1 : 0);
  return rails * (SHELF_H + SHELF_GAP) + RACK_PAD * 2;
}

/**
 * Pixel height of a module's panel area, including any shelf-gap rows it spans.
 * A 1-row module is SHELF_H tall; a 2-row module spans SHELF_H + SHELF_GAP + SHELF_H.
 */
export function moduleHeightPx(rackSizeH: number): number {
  return rackSizeH * SHELF_H + Math.max(0, rackSizeH - 1) * SHELF_GAP;
}

const FF = `font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;`;

const DOMAIN_COLORS: Record<string, string> = {
  trigger: '#33dd88',
  voice: '#cc44ff',
  either: '#88aacc',
};

// ── Public interface ────────────────────────────────────────────────────────

export interface RackUIOpts {
  root: HTMLElement;
  graph: RackGraph;
  getShelfCount(): number;
  getZoom(): number;
  /** Topology locked (active wave). */
  isLive(): boolean;
  themeColor: string;
  reducedMotion(): boolean;
  wireLayer(): 'front' | 'behind';
  wireOpacity(): number;
  onGraphChanged(): void;
  onSellModule(instanceId: string): void;
  onBuyShelf(): void;
  onRefundShelf(): void;
  canBuyShelf(): { ok: boolean; label: string };
  canRefundShelf(): boolean;
  onModuleSelected(instanceId: string | null): void;
  /** Output-module action buttons. */
  onBeginTowerDrag(outputModuleId: string, clientX: number, clientY: number): void;
  onRotateTower(outputModuleId: string): void;
  onSynthToggle(): void;
  onTestPulse(outputModuleId: string): void;
  getTowerState(outputModuleId: string): { isPlaced: boolean; style: TowerStyle };
  getSynthState(): { configured: boolean; active: boolean; needsGesture: boolean };
}

export interface RackUI {
  update(nowMs: number): void;
  /** Rebuild all module/cable DOM from the graph (after structural changes). */
  rebuild(): void;
  /** Live cable pulse + module activity data for the current window. */
  setTraffic(cableTraffic: Map<string, SignalEvent[]>, moduleActivity: Map<string, number>): void;
  setCurrentTick(tick: number): void;
  flashModule(instanceId: string): void;
  highlightRoute(moduleIds: ReadonlySet<string> | null): void;
  refreshControls(): void;
  refreshWireDisplay(): void;
  validation(): GraphValidation;
  destroy(): void;
}

// ── Internals ───────────────────────────────────────────────────────────────

interface PlugView {
  moduleId: string;
  spec: PortSpec;
  el: HTMLElement;     // visible circle
  wrapEl: HTMLElement; // larger hit target
  /** Rack-local center. */
  cx: number;
  cy: number;
}

interface ModuleView {
  inst: ModuleInstance;
  def: ModuleTypeDef;
  /** Background panel: gradient, border, screws, LED, plug wraps. z=20. */
  rootEl: HTMLElement;
  /** Content overlay: title + controls. z=31 — stays above cables in "front" mode. */
  contentEl: HTMLElement;
  plugs: PlugView[];
  ledEl: HTMLElement | null;
  flashUntil: number;
  refreshSettings: () => void;
}

interface CableView {
  cable: Cable;
  wire: SoftWireData;
  hitPath: SVGPolylineElement;
  highlight: 'none' | 'dim' | 'bright';
}

interface PulseDot {
  cableId: string;
  eventTick: number;
  el: SVGCircleElement;
}

export function createRackUI(opts: RackUIOpts): RackUI {
  const { root, graph } = opts;
  root.innerHTML = '';
  root.style.cssText = `position:absolute;${FF}touch-action:none;user-select:none;`;
  root.dataset.rackInteractive = 'true';

  const shelvesEl = document.createElement('div');
  shelvesEl.style.cssText = 'position:absolute;inset:0;';
  root.appendChild(shelvesEl);

  const soft = createSoftWireRenderer(root);
  root.appendChild(soft.svgEl);

  // Full-cable hit paths stay below modules; endpoint handles remain above.
  const hitSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  hitSvg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:19;';
  root.appendChild(hitSvg);

  const pulseSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  pulseSvg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:35;';
  root.appendChild(pulseSvg);

  const moduleViews = new Map<string, ModuleView>();
  const cableViews = new Map<string, CableView>();
  const slurping: Array<{ wire: SoftWireData; ax: number; ay: number }> = [];
  const pulses: PulseDot[] = [];

  function refreshWireDisplay(): void {
    const zIndex = opts.wireLayer() === 'front' ? '30' : '18';
    const opacity = String(opts.wireOpacity());
    soft.svgEl.style.zIndex = zIndex;
    soft.svgEl.style.opacity = opacity;
    hitSvg.style.zIndex = zIndex;
    hitSvg.style.opacity = opacity;
    pulseSvg.style.opacity = opacity;
  }
  refreshWireDisplay();

  let traffic = new Map<string, SignalEvent[]>();
  let activity = new Map<string, number>();
  let currentTick = -1;
  let lastUpdateMs = 0;
  let selectedModuleId: string | null = null;
  let routeHighlight: ReadonlySet<string> | null = null;
  let cachedValidation: GraphValidation = validateGraph(graph);
  let cableSeq = Date.now() % 100000;

  // ── Coordinate helpers ────────────────────────────────────────────────────

  function localPoint(clientX: number, clientY: number): { x: number; y: number } {
    const r = root.getBoundingClientRect();
    const z = Math.max(0.001, opts.getZoom());
    return { x: (clientX - r.left) / z, y: (clientY - r.top) / z };
  }

  function shelfTop(shelfIndex: number): number {
    return RACK_PAD + shelfIndex * (SHELF_H + SHELF_GAP);
  }

  function modulePos(inst: ModuleInstance): { x: number; y: number } {
    return { x: RACK_PAD + inst.gridX * SLOT_PX, y: shelfTop(inst.gridY) + 10 };
  }

  /** Analytic plug layout: inputs left edge, outputs right edge, stacked in usable face area. */
  function plugLocal(def: ModuleTypeDef, spec: PortSpec, index: number, count: number): { x: number; y: number } {
    const panelW = def.rackSize.w * SLOT_PX - 6;
    const panelH = moduleHeightPx(def.rackSize.h) - 20;
    if (spec.anchor) {
      return { x: spec.anchor.x * panelW, y: spec.anchor.y * panelH };
    }
    const x = spec.direction === 'in' ? 10 : panelW - 10;
    // Usable vertical space: skip 32px title header + 22px LED/bottom footer.
    const safeTop = 32;
    const safeBottom = 22;
    const usable = panelH - safeTop - safeBottom;
    const y = safeTop + (count <= 1 ? usable / 2 : (index + 0.5) * (usable / count));
    return { x, y };
  }

  function recomputePlugCenters(mv: ModuleView): void {
    const pos = modulePos(mv.inst);
    const ins = mv.def.inputs;
    const outs = mv.def.outputs;
    for (const pv of mv.plugs) {
      const list = pv.spec.direction === 'in' ? ins : outs;
      const idx = list.findIndex(p => p.portId === pv.spec.portId);
      const off = plugLocal(mv.def, pv.spec, idx, list.length);
      pv.cx = pos.x + off.x;
      pv.cy = pos.y + off.y;
      pv.wrapEl.style.left = `${pv.cx - 16}px`;
      pv.wrapEl.style.top  = `${pv.cy - 16}px`;
    }
  }

  // ── Validation cache ──────────────────────────────────────────────────────

  function revalidate(): void {
    cachedValidation = validateGraph(graph);
  }

  function graphChanged(): void {
    revalidate();
    opts.onGraphChanged();
  }

  // ── Cable management ──────────────────────────────────────────────────────

  function findPlug(moduleId: string, portId: string): PlugView | null {
    const mv = moduleViews.get(moduleId);
    if (!mv) return null;
    return mv.plugs.find(p => p.spec.portId === portId) ?? null;
  }

  function cableColor(c: Cable): { src: string; dst: string } {
    const fromDef = moduleViews.get(c.fromModuleId)?.def;
    const toDef = moduleViews.get(c.toModuleId)?.def;
    return {
      src: fromDef?.color ?? '#88aacc',
      dst: toDef?.color ?? '#88aacc',
    };
  }

  function addCableView(c: Cable): void {
    if (cableViews.has(c.cableId)) return;
    const { src, dst } = cableColor(c);
    const wire = soft.createWire(src, dst);
    // Per-cable slack variation for the organized-yet-messy tangle.
    const slackScale = 0.92 + (hashString(c.cableId) % 1000) / 1000 * 0.35;
    (wire as SoftWireData & { slackScale?: number }).slackScale = slackScale;

    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    hit.setAttribute('fill', 'none');
    hit.setAttribute('stroke', 'rgba(0,0,0,0)');
    hit.setAttribute('stroke-width', '14');
    hit.setAttribute('stroke-linecap', 'round');
    hit.style.pointerEvents = 'stroke';
    hit.style.cursor = 'pointer';
    hitSvg.appendChild(hit);

    const view: CableView = { cable: c, wire, hitPath: hit, highlight: 'none' };
    cableViews.set(c.cableId, view);

    hit.addEventListener('pointerenter', () => { if (view.highlight === 'none') setCableEmphasis(view, 1.6); });
    hit.addEventListener('pointerleave', () => { if (view.highlight === 'none') setCableEmphasis(view, 1); });
    hit.addEventListener('pointerdown', (e: PointerEvent) => {
      // Grab the destination end of an existing cable to re-route it.
      if (opts.isLive() || drag) return;
      e.stopPropagation();
      beginCableDragFromExisting(view, e);
    });

    // Drag the tip handle (near destination plug) to reconnect.
    wire.tipHandle.addEventListener('pointerdown', (e: PointerEvent) => {
      if (opts.isLive() || drag) return;
      e.stopPropagation();
      beginCableDragFromExisting(view, e);
    });
  }

  function setCableEmphasis(view: CableView, widthScale: number): void {
    view.wire.polyline.setAttribute('stroke-width', String(3 * widthScale));
    view.wire.glowPolyline.setAttribute('stroke-opacity', widthScale > 1 ? '0.42' : '0.22');
  }

  function removeCable(cableId: string, slurp: boolean): void {
    const view = cableViews.get(cableId);
    const idx = graph.cables.findIndex(c => c.cableId === cableId);
    if (idx !== -1) graph.cables.splice(idx, 1);
    if (view) {
      cableViews.delete(cableId);
      view.hitPath.remove();
      if (slurp && !opts.reducedMotion()) {
        const from = findPlug(view.cable.fromModuleId, view.cable.fromPortId);
        view.wire.isSlurping = true;
        view.wire.slurpMs = 0;
        slurping.push({ wire: view.wire, ax: from?.cx ?? 0, ay: from?.cy ?? 0 });
      } else {
        soft.finalizeWireRemoval(view.wire);
      }
    }
  }

  function tryConnect(fromModuleId: string, fromPortId: string, toModuleId: string, toPortId: string): boolean {
    const cable: Cable = {
      cableId: `c-${(cableSeq++).toString(36)}`,
      fromModuleId, fromPortId, toModuleId, toPortId,
    };
    graph.cables.push(cable);
    const v = validateGraph(graph);
    const fatal = v.issues.some(i => i.severity === 'error' &&
      ['cycle', 'incompatible-ports', 'fanout-exceeded', 'fanin-exceeded', 'duplicate-cable', 'self-cycle'].includes(i.code) &&
      (i.cableId === cable.cableId || i.code === 'cycle'));
    if (fatal) {
      graph.cables.pop();
      revalidate();
      return false;
    }
    addCableView(cable);
    graphChanged();
    return true;
  }

  // ── Plug drag (patching) ──────────────────────────────────────────────────

  type DragState = null | {
    kind: 'newCable';
    fromModuleId: string;
    fromPort: PortSpec;
    curX: number;
    curY: number;
    pointerId: number;
  } | {
    kind: 'rerouteCable';
    originalCable: Cable;
    fromModuleId: string;
    fromPort: PortSpec;
    curX: number;
    curY: number;
    pointerId: number;
  };
  let drag: DragState = null;

  function isPortDirectionAndDomainCompatible(pv: PlugView): boolean {
    if (!drag) return false;
    if (pv.spec.direction !== 'in') return false;
    if (pv.moduleId === drag.fromModuleId) return false;
    return arePortsCompatible(drag.fromPort, pv.spec);
  }

  function inputOccupancy(pv: PlugView): Cable[] {
    return graph.cables.filter(c => c.toModuleId === pv.moduleId && c.toPortId === pv.spec.portId);
  }

  function canReplaceTarget(pv: PlugView): boolean {
    if (!isPortDirectionAndDomainCompatible(pv)) return false;
    const existing = inputOccupancy(pv);
    return existing.length >= pv.spec.maxConnections && pv.spec.maxConnections === 1 && existing.length === 1;
  }

  function canConnectToTarget(pv: PlugView): boolean {
    if (!isPortDirectionAndDomainCompatible(pv)) return false;
    return inputOccupancy(pv).length < pv.spec.maxConnections || canReplaceTarget(pv);
  }

  function setTargetHighlights(active: boolean): void {
    for (const mv of moduleViews.values()) {
      for (const pv of mv.plugs) {
        if (active && canReplaceTarget(pv)) {
          pv.el.style.boxShadow = '0 0 10px 3px #ffb347, 0 0 0 2px #ffd28a';
          pv.el.style.transform = 'scale(1.4)';
        } else if (active && canConnectToTarget(pv)) {
          pv.el.style.boxShadow = `0 0 10px 3px ${DOMAIN_COLORS[pv.spec.domain]}, 0 0 0 2px #fff`;
          pv.el.style.transform = 'scale(1.4)';
        } else {
          pv.el.style.boxShadow = pv.el.dataset.shadow ?? '';
          pv.el.style.transform = '';
        }
      }
    }
  }

  function beginPlugDrag(mv: ModuleView, pv: PlugView, e: PointerEvent): void {
    if (opts.isLive() || moduleDrag || drag) return;
    // Output port at max fan-out: grab its existing cable instead.
    const existing = graph.cables.filter(c => c.fromModuleId === pv.moduleId && c.fromPortId === pv.spec.portId);
    if (existing.length >= pv.spec.maxConnections && existing.length > 0) {
      const view = cableViews.get(existing[existing.length - 1].cableId);
      if (view) { beginCableDragFromExisting(view, e); return; }
    }
    const local = localPoint(e.clientX, e.clientY);
    drag = { kind: 'newCable', fromModuleId: pv.moduleId, fromPort: pv.spec, curX: local.x, curY: local.y, pointerId: e.pointerId };
    root.setPointerCapture(e.pointerId);
    soft.setDragPreview(pv.cx, pv.cy, local.x, local.y, mv.def.color);
    setTargetHighlights(true);
  }

  function beginCableDragFromExisting(view: CableView, e: PointerEvent): void {
    if (opts.isLive() || moduleDrag || drag) return;
    const fromMv = moduleViews.get(view.cable.fromModuleId);
    const fromPv = findPlug(view.cable.fromModuleId, view.cable.fromPortId);
    if (!fromMv || !fromPv) return;
    const originalCable = { ...view.cable };
    removeCable(originalCable.cableId, false);
    graphChanged();
    const local = localPoint(e.clientX, e.clientY);
    drag = { kind: 'rerouteCable', originalCable, fromModuleId: fromPv.moduleId, fromPort: fromPv.spec, curX: local.x, curY: local.y, pointerId: e.pointerId };
    root.setPointerCapture(e.pointerId);
    soft.setDragPreview(fromPv.cx, fromPv.cy, local.x, local.y, fromMv.def.color);
    setTargetHighlights(true);
  }

  function plugUnder(clientX: number, clientY: number, wantInput: boolean): PlugView | null {
    for (const mv of moduleViews.values()) {
      for (const pv of mv.plugs) {
        if (wantInput && pv.spec.direction !== 'in') continue;
        if (!wantInput && pv.spec.direction !== 'out') continue;
        const r = pv.wrapEl.getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) return pv;
      }
    }
    return null;
  }

  function restoreCable(cable: Cable): void {
    if (!graph.cables.some(c => c.cableId === cable.cableId)) graph.cables.push({ ...cable });
    const restored = graph.cables.find(c => c.cableId === cable.cableId);
    if (restored && !cableViews.has(cable.cableId)) addCableView(restored);
  }

  function cleanupCableDrag(shouldRestoreOriginal: boolean): void {
    const currentDrag = drag;
    if (shouldRestoreOriginal && currentDrag?.kind === 'rerouteCable') {
      restoreCable(currentDrag.originalCable);
      graphChanged();
    }
    drag = null;
    soft.hideDragPreview();
    setTargetHighlights(false);
  }

  function endPlugDrag(e: PointerEvent): void {
    const currentDrag = drag;
    if (!currentDrag) return;
    const target = plugUnder(e.clientX, e.clientY, true);
    if (target && canConnectToTarget(target)) {
      const replacedCable = canReplaceTarget(target) ? { ...inputOccupancy(target)[0] } : null;
      if (replacedCable) removeCable(replacedCable.cableId, false);
      const connected = tryConnect(currentDrag.fromModuleId, currentDrag.fromPort.portId, target.moduleId, target.spec.portId);
      if (connected) {
        cleanupCableDrag(false);
        return;
      }
      if (replacedCable) {
        restoreCable(replacedCable);
        if (currentDrag.kind === 'newCable') graphChanged();
      }
    }
    cleanupCableDrag(true);
  }

  function cancelCableDrag(): void {
    if (!drag) return;
    cleanupCableDrag(true);
  }

  // ── Module drag (rearranging) ─────────────────────────────────────────────

  interface ModuleDrag {
    mv: ModuleView;
    grabDX: number;
    grabDY: number;
    ghost: HTMLElement;
    valid: boolean;
    targetGridY: number;
    targetGridX: number;
    pointerId: number;
    moved: boolean;
  }
  let moduleDrag: ModuleDrag | null = null;

  function beginModuleDrag(mv: ModuleView, e: PointerEvent): void {
    if (opts.isLive() || drag || moduleDrag) {
      mv.rootEl.style.borderColor = '#ff3344';
      setTimeout(() => { if (!moduleDrag) mv.rootEl.style.borderColor = '#1a2a44'; }, 350);
      return;
    }
    const local = localPoint(e.clientX, e.clientY);
    const pos = modulePos(mv.inst);
    const ghost = document.createElement('div');
    ghost.style.cssText = `
      position:absolute;border:2px dashed ${opts.themeColor};border-radius:8px;
      pointer-events:none;z-index:40;opacity:0;
      width:${mv.def.rackSize.w * SLOT_PX - 6}px;height:${moduleHeightPx(mv.def.rackSize.h) - 20}px;
    `;
    root.appendChild(ghost);
    moduleDrag = {
      mv,
      grabDX: local.x - pos.x,
      grabDY: local.y - pos.y,
      ghost,
      valid: true,
      targetGridY: mv.inst.gridY,
      targetGridX: mv.inst.gridX,
      pointerId: e.pointerId,
      moved: false,
    };
    root.setPointerCapture(e.pointerId);
    mv.rootEl.style.zIndex = '45';
    mv.contentEl.style.zIndex = '46';
    mv.rootEl.style.opacity = '0.85';
    mv.contentEl.style.opacity = '0.85';
  }

  function updateModuleDrag(e: PointerEvent): void {
    const md = moduleDrag;
    if (!md) return;
    const local = localPoint(e.clientX, e.clientY);
    const x = local.x - md.grabDX;
    const y = local.y - md.grabDY;
    if (!md.moved && Math.hypot(x - modulePos(md.mv.inst).x, y - modulePos(md.mv.inst).y) > 4) md.moved = true;
    md.mv.rootEl.style.left = `${x}px`;
    md.mv.rootEl.style.top = `${y}px`;
    md.mv.contentEl.style.left = `${x}px`;
    md.mv.contentEl.style.top = `${y}px`;
    recomputePlugCentersAt(md.mv, x, y);

    const gridY = Math.round((y - 10 - RACK_PAD) / (SHELF_H + SHELF_GAP));
    const gridX = Math.round((x - RACK_PAD) / SLOT_PX);
    md.targetGridY = gridY;
    md.targetGridX = gridX;
    const check = checkPlacement(graph.modules, opts.getShelfCount(), md.mv.inst.instanceId, gridY, gridX, md.mv.def.rackSize);
    md.valid = check.fits;
    md.ghost.style.opacity = md.moved ? '1' : '0';
    md.ghost.style.left = `${RACK_PAD + gridX * SLOT_PX}px`;
    md.ghost.style.top = `${shelfTop(gridY) + 10}px`;
    md.ghost.style.borderColor = md.valid ? opts.themeColor : '#ff3344';
    md.mv.rootEl.style.borderColor = md.valid ? opts.themeColor : '#ff3344';
  }

  function recomputePlugCentersAt(mv: ModuleView, x: number, y: number): void {
    const ins = mv.def.inputs;
    const outs = mv.def.outputs;
    for (const pv of mv.plugs) {
      const list = pv.spec.direction === 'in' ? ins : outs;
      const idx = list.findIndex(p => p.portId === pv.spec.portId);
      const off = plugLocal(mv.def, pv.spec, idx, list.length);
      pv.cx = x + off.x;
      pv.cy = y + off.y;
      pv.wrapEl.style.left = `${pv.cx - 16}px`;
      pv.wrapEl.style.top  = `${pv.cy - 16}px`;
    }
  }

  function endModuleDrag(): void {
    const md = moduleDrag;
    if (!md) return;
    moduleDrag = null;
    md.ghost.remove();
    md.mv.rootEl.style.zIndex = '';
    md.mv.contentEl.style.zIndex = '';
    md.mv.rootEl.style.opacity = '';
    md.mv.contentEl.style.opacity = '';
    md.mv.rootEl.style.borderColor = md.valid ? '#1a2a44' : '#ff3344';
    if (md.moved && md.valid) {
      md.mv.inst.gridY = md.targetGridY;
      md.mv.inst.gridX = md.targetGridX;
      graphChanged();
    }
    // Always settle onto the (possibly restored) grid slot.
    positionModule(md.mv);
    if (!md.moved) selectModule(md.mv.inst.instanceId);
    if (!md.valid) setTimeout(() => { md.mv.rootEl.style.borderColor = '#1a2a44'; }, 450);
  }

  function cancelModuleDrag(): void {
    if (!moduleDrag) return;
    const md = moduleDrag;
    moduleDrag = null;
    md.ghost.remove();
    md.mv.rootEl.style.zIndex = '';
    md.mv.contentEl.style.zIndex = '';
    md.mv.rootEl.style.opacity = '';
    md.mv.contentEl.style.opacity = '';
    md.mv.rootEl.style.borderColor = '#1a2a44';
    positionModule(md.mv);
  }

  function positionModule(mv: ModuleView): void {
    const pos = modulePos(mv.inst);
    mv.rootEl.style.left = `${pos.x}px`;
    mv.rootEl.style.top = `${pos.y}px`;
    mv.contentEl.style.left = `${pos.x}px`;
    mv.contentEl.style.top = `${pos.y}px`;
    recomputePlugCenters(mv);
  }

  // ── Selection / highlighting ──────────────────────────────────────────────

  function selectModule(instanceId: string | null): void {
    selectedModuleId = instanceId;
    for (const mv of moduleViews.values()) {
      const sel = mv.inst.instanceId === instanceId;
      mv.rootEl.style.outline = sel ? `2px solid ${opts.themeColor}` : '';
    }
    applyCableHighlights();
    opts.onModuleSelected(instanceId);
  }

  function applyCableHighlights(): void {
    for (const view of cableViews.values()) {
      let mode: 'none' | 'dim' | 'bright' = 'none';
      if (routeHighlight) {
        const on = routeHighlight.has(view.cable.fromModuleId) && routeHighlight.has(view.cable.toModuleId);
        mode = on ? 'bright' : 'dim';
      } else if (selectedModuleId) {
        const touches = view.cable.fromModuleId === selectedModuleId || view.cable.toModuleId === selectedModuleId;
        mode = touches ? 'bright' : 'dim';
      }
      view.highlight = mode;
      view.wire.polyline.style.opacity = mode === 'dim' ? '0.18' : '1';
      view.wire.polyline.setAttribute('stroke-width', mode === 'bright' ? '4.5' : '3');
    }
  }

  // ── Module DOM ────────────────────────────────────────────────────────────

  function buildSettingControl(mv: ModuleView, spec: SettingSpec): HTMLElement {
    const inst = mv.inst;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:3px;justify-content:space-between;';
    wrap.dataset.rackControl = 'true';
    const label = document.createElement('span');
    label.textContent = spec.label;
    label.style.cssText = 'font-size:8px;color:#44608a;letter-spacing:0.08em;';
    wrap.appendChild(label);

    const refresh: Array<() => void> = [];
    const lockable: HTMLButtonElement[] = [];

    if (spec.type === 'enum' && spec.options) {
      const btn = document.createElement('button');
      btn.style.cssText = `${FF}font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px;cursor:pointer;background:#0a1020;border:1px solid #2a3d65;color:${mv.def.color};min-width:34px;`;
      const labelFor = (v: unknown) => {
        const idx = spec.options!.findIndex(o => o === v);
        return spec.optionLabels?.[idx] ?? String(v);
      };
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (opts.isLive() && !spec.liveSafe) return;
        const idx = spec.options!.findIndex(o => o === inst.settings[spec.key]);
        inst.settings[spec.key] = spec.options![(idx + 1) % spec.options!.length];
        refresh.forEach(f => f());
        graphChanged();
      });
      refresh.push(() => { btn.textContent = labelFor(inst.settings[spec.key] ?? mv.def.defaultSettings[spec.key]); });
      lockable.push(btn);
      wrap.appendChild(btn);
    } else if (spec.type === 'bool') {
      const btn = document.createElement('button');
      btn.style.cssText = `${FF}font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px;cursor:pointer;background:#0a1020;border:1px solid #2a3d65;min-width:30px;`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (opts.isLive() && !spec.liveSafe) return;
        inst.settings[spec.key] = !(inst.settings[spec.key] === true);
        refresh.forEach(f => f());
        graphChanged();
      });
      refresh.push(() => {
        const on = inst.settings[spec.key] === true;
        btn.textContent = on ? 'ON' : 'OFF';
        btn.style.color = on ? mv.def.color : '#44608a';
        btn.style.borderColor = on ? mv.def.color : '#2a3d65';
      });
      lockable.push(btn);
      wrap.appendChild(btn);
    } else {
      // int/float: − value +
      const minus = document.createElement('button');
      const plus = document.createElement('button');
      const val = document.createElement('span');
      for (const b of [minus, plus]) {
        b.style.cssText = `${FF}font-size:10px;font-weight:800;width:16px;height:16px;border-radius:4px;cursor:pointer;background:#0a1020;border:1px solid #2a3d65;color:#88aacc;line-height:1;padding:0;`;
      }
      minus.textContent = '−';
      plus.textContent = '+';
      val.style.cssText = `font-size:9px;color:${mv.def.color};min-width:26px;text-align:center;font-weight:800;`;
      const step = spec.type === 'int' ? 1 : 0.05;
      const change = (dir: number) => {
        if (opts.isLive() && !spec.liveSafe) return;
        const cur = typeof inst.settings[spec.key] === 'number' ? inst.settings[spec.key] as number : (mv.def.defaultSettings[spec.key] as number ?? 0);
        let next = cur + dir * step;
        if (spec.min !== undefined) next = Math.max(spec.min, next);
        if (spec.max !== undefined) next = Math.min(spec.max, next);
        inst.settings[spec.key] = spec.type === 'int' ? Math.round(next) : Math.round(next * 100) / 100;
        refresh.forEach(f => f());
        graphChanged();
      };
      minus.addEventListener('click', (e) => { e.stopPropagation(); change(-1); });
      plus.addEventListener('click', (e) => { e.stopPropagation(); change(1); });
      refresh.push(() => {
        const cur = inst.settings[spec.key] ?? mv.def.defaultSettings[spec.key];
        val.textContent = typeof cur === 'number' ? (spec.type === 'int' ? String(cur) : (cur as number).toFixed(2)) : String(cur);
      });
      lockable.push(minus, plus);
      const group = document.createElement('span');
      group.style.cssText = 'display:inline-flex;align-items:center;gap:2px;';
      group.append(minus, val, plus);
      wrap.appendChild(group);
    }

    refresh.forEach(f => f());
    (wrap as HTMLElement & { __refresh?: () => void }).__refresh = () => {
      refresh.forEach(f => f());
      const locked = opts.isLive() && !spec.liveSafe;
      for (const b of lockable) {
        b.style.opacity = locked ? '0.35' : '1';
        b.style.cursor = locked ? 'not-allowed' : 'pointer';
      }
    };
    return wrap;
  }

  function buildModuleView(inst: ModuleInstance): ModuleView | null {
    const def = getModuleType(inst.typeId);
    if (!def) return null;
    const panelW = def.rackSize.w * SLOT_PX - 6;
    const panelH = moduleHeightPx(def.rackSize.h) - 20;
    const portStrip = facePortStripW(panelW);

    // ── Background element (z=20): gradient, border, screws, LED, plug wraps ──
    const bgEl = document.createElement('div');
    bgEl.style.cssText = `
      position:absolute;width:${panelW}px;height:${panelH}px;
      background:linear-gradient(180deg,#0a1226,#060c18);
      border:1.5px solid #1a2a44;border-radius:8px;
      box-shadow:0 2px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(120,160,255,0.07);
      z-index:20;touch-action:none;cursor:grab;user-select:none;
      transition:border-color 0.15s, box-shadow 0.2s;
    `;
    bgEl.title = `${def.name} — ${def.tooltip}`;

    // Faceplate screws at panel corners.
    for (const [sx, sy] of [[4, 4], [panelW - 9, 4], [4, panelH - 14], [panelW - 9, panelH - 14]] as Array<[number, number]>) {
      const screw = document.createElement('div');
      screw.style.cssText = `position:absolute;left:${sx}px;top:${sy}px;width:5px;height:5px;border-radius:50%;background:#1c2a45;border:1px solid #2c4068;pointer-events:none;`;
      bgEl.appendChild(screw);
    }

    // Activity LED at bottom centre of background.
    const led = document.createElement('div');
    led.style.cssText = `
      position:absolute;bottom:8px;left:50%;transform:translateX(-50%);
      width:7px;height:7px;border-radius:50%;
      background:#102030;border:1px solid #224466;transition:background 0.1s, box-shadow 0.1s;
      pointer-events:none;
    `;
    bgEl.appendChild(led);

    // ── Content overlay (z=34): above cables AND plugs ───────────────────────
    // pointer-events:none on the container; interactive children re-enable it.
    const contentEl = document.createElement('div');
    contentEl.style.cssText = `
      position:absolute;width:${panelW}px;height:${panelH}px;
      z-index:34;pointer-events:none;border-radius:8px;overflow:hidden;${FF}
    `;

    // Title — stays inside header band, uses ellipsis for long names.
    const title = document.createElement('div');
    title.textContent = `⠿ ${def.shortName} ⠿`;
    title.title = def.tooltip;
    title.style.cssText = `
      position:absolute;top:0;left:0;right:0;height:${FACE_HEADER_H}px;
      display:flex;align-items:center;justify-content:center;
      font-size:10px;font-weight:800;letter-spacing:0.14em;
      color:${def.color};text-shadow:0 0 8px ${def.color}66;
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
      padding:0 ${portStrip + 4}px;box-sizing:border-box;
      pointer-events:none;
    `;
    contentEl.appendChild(title);

    // Placeholder mv so closures can reference it before controls are wired up.
    const mv: ModuleView = { inst, def, rootEl: bgEl, contentEl, plugs: [], ledEl: led, flashUntil: 0, refreshSettings: () => undefined };

    // ── Plug wraps (root-level, z=33) — above front-cables (30), below content (34) ──
    const allPorts: Array<{ spec: PortSpec; list: PortSpec[] }> = [
      ...def.inputs.map(spec => ({ spec, list: def.inputs })),
      ...def.outputs.map(spec => ({ spec, list: def.outputs })),
    ];
    for (const { spec, list } of allPorts) {
      const idx = list.findIndex(p => p.portId === spec.portId);
      const off = plugLocal(def, spec, idx, list.length);
      const wrapEl = document.createElement('div');
      // Position is root-relative; updated whenever module moves via syncPlugWrapPos.
      wrapEl.style.cssText = `
        position:absolute;left:0;top:0;width:32px;height:32px;
        display:flex;align-items:center;justify-content:center;touch-action:none;
        cursor:crosshair;z-index:33;
      `;
      wrapEl.dataset.rackControl = 'true';
      const color = DOMAIN_COLORS[spec.domain];
      const plugEl = document.createElement('div');
      const shadow = `0 0 6px ${color}99`;
      plugEl.dataset.shadow = shadow;
      plugEl.style.cssText = `
        width:13px;height:13px;border-radius:50%;
        background:${color}22;border:2px solid ${color};
        box-shadow:${shadow};transition:transform 0.1s, box-shadow 0.1s;
        pointer-events:none;
      `;
      wrapEl.appendChild(plugEl);
      wrapEl.title = `${spec.label} — ${spec.help}`;
      root.appendChild(wrapEl);
      const pv: PlugView = { moduleId: inst.instanceId, spec, el: plugEl, wrapEl, cx: 0, cy: 0 };
      mv.plugs.push(pv);
      if (spec.direction === 'out') {
        wrapEl.addEventListener('pointerdown', (e: PointerEvent) => {
          e.stopPropagation();
          beginPlugDrag(mv, pv, e);
        });
      } else {
        wrapEl.addEventListener('pointerdown', (e: PointerEvent) => {
          if (opts.isLive() || drag) return;
          const existing = graph.cables.find(c => c.toModuleId === inst.instanceId && c.toPortId === spec.portId);
          if (existing) {
            e.stopPropagation();
            const view = cableViews.get(existing.cableId);
            if (view) beginCableDragFromExisting(view, e);
          }
        });
      }
    }

    // ── Controls in contentEl ─────────────────────────────────────────────────
    // Safe region: below header, above footer, horizontally inside port strips.
    // Ports live on left/right strip edges so no vertical reservation is needed.
    const hasIn = def.inputs.length > 0;
    const hasOut = def.outputs.length > 0;

    const controls = document.createElement('div');
    controls.style.cssText = `
      position:absolute;
      top:${FACE_HEADER_H}px;bottom:${FACE_FOOTER_H}px;
      left:${hasIn ? portStrip : 6}px;right:${hasOut ? portStrip : 6}px;
      display:flex;flex-direction:column;gap:4px;justify-content:center;
      pointer-events:auto;
    `;
    controls.dataset.rackControl = 'true';
    contentEl.appendChild(controls);

    const settingEls: HTMLElement[] = [];
    for (const spec of def.settingsSpec) {
      const ctrl = buildSettingControl(mv, spec);
      settingEls.push(ctrl);
      controls.appendChild(ctrl);
    }

    // ── Output-module extras ──────────────────────────────────────────────────
    if (def.typeId === 'output') {
      const towerState = opts.getTowerState(inst.instanceId);

      // Tower drag slot — prominent button taking most of the vertical space.
      const slot = document.createElement('button');
      slot.title = 'Drag this emitter tower onto the battlefield';
      slot.style.cssText = `${FF}flex:1;min-height:44px;max-height:72px;position:relative;cursor:grab;background:#050914;border:3px solid ${towerState.style.color};border-radius:6px;color:${towerState.style.color};touch-action:none;overflow:hidden;`;
      const clip = towerState.style.shape === 'circle' ? 'circle(45%)'
        : towerState.style.shape === 'triangle' ? 'polygon(50% 0,100% 100%,0 100%)'
        : towerState.style.shape === 'hexagon' ? 'polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)'
        : towerState.style.shape === 'chevron' ? 'polygon(0 0,100% 50%,0 100%,35% 50%)'
        : towerState.style.shape === 'diamond' ? 'polygon(50% 0,100% 50%,50% 100%,0 50%)'
        : 'polygon(0 0,100% 0,100% 100%,0 100%)';
      const silhouette = document.createElement('span');
      silhouette.style.cssText = `position:absolute;left:10px;top:50%;transform:translateY(-50%);width:22px;height:22px;background:${towerState.style.color};clip-path:${clip};filter:drop-shadow(0 0 5px ${towerState.style.color});`;
      const slotLabel = document.createElement('span');
      slotLabel.textContent = towerState.isPlaced ? 'PLACED' : 'DRAG TOWER';
      slotLabel.style.cssText = `position:absolute;right:6px;top:50%;transform:translateY(-50%);font-size:7px;font-weight:800;letter-spacing:0.07em;color:${towerState.style.color};white-space:nowrap;`;
      slot.append(silhouette, slotLabel);
      slot.addEventListener('pointerdown', (e: PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();
        opts.onBeginTowerDrag(inst.instanceId, e.clientX, e.clientY);
      });

      // Row of action buttons.
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:4px;justify-content:center;flex-shrink:0;';
      const mkBtn = (txt: string, ttl: string, fn: () => void) => {
        const b = document.createElement('button');
        b.textContent = txt;
        b.title = ttl;
        b.style.cssText = `${FF}font-size:8px;font-weight:800;padding:3px 7px;border-radius:4px;cursor:pointer;background:#0a1020;border:1px solid #2a3d65;color:#88aacc;letter-spacing:0.05em;white-space:nowrap;`;
        b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
        return b;
      };
      row.appendChild(mkBtn('↻ ROT', 'Rotate this output tower clockwise', () => opts.onRotateTower(inst.instanceId)));
      row.appendChild(mkBtn('PULSE', 'Send a test pulse through the patch (preparation only)', () => opts.onTestPulse(inst.instanceId)));

      // Synth state label.
      const synthState = document.createElement('div');
      synthState.style.cssText = 'text-align:center;font-size:7px;letter-spacing:0.08em;color:#44608a;flex-shrink:0;';
      const updateSynthLabel = () => {
        const s = opts.getSynthState();
        synthState.textContent = !s.configured ? 'SYNTH OFF' : s.needsGesture ? 'TAP TO ENABLE' : s.active ? 'SYNTH LIVE' : 'SYNTH READY';
        synthState.style.color = s.active ? def.color : '#44608a';
      };
      settingEls.push(Object.assign(synthState, { __refresh: updateSynthLabel }) as unknown as HTMLElement);
      updateSynthLabel();

      // Insert output-specific elements before the settings (tower slot first).
      controls.insertBefore(slot, controls.firstChild);
      controls.appendChild(row);
      controls.appendChild(synthState);
    }

    // ── Sell tab in contentEl (stays above cables) ────────────────────────────
    if (!def.isStarter) {
      const sell = document.createElement('button');
      sell.textContent = '×';
      sell.title = `Sell for full refund (${def.cost})`;
      sell.style.cssText = `
        position:absolute;top:2px;right:2px;width:14px;height:14px;border-radius:4px;
        ${FF}font-size:10px;line-height:1;cursor:pointer;padding:0;
        background:#1a0f14;border:1px solid #663344;color:#aa6677;pointer-events:auto;
      `;
      sell.addEventListener('click', (e) => {
        e.stopPropagation();
        if (opts.isLive()) return;
        opts.onSellModule(inst.instanceId);
      });
      contentEl.appendChild(sell);
    }

    mv.refreshSettings = () => {
      for (const s of settingEls) {
        const fn = (s as HTMLElement & { __refresh?: () => void }).__refresh;
        if (fn) fn();
      }
    };

    // Drag initiates from bgEl (clicks not landing on controls fall through since
    // contentEl is pointer-events:none except for controls/buttons).
    bgEl.addEventListener('pointerdown', (e: PointerEvent) => {
      if (drag || (e.target as HTMLElement).closest('[data-rack-control="true"]')) return;
      e.stopPropagation();
      beginModuleDrag(mv, e);
    });

    return mv;
  }

  // ── Rack case ─────────────────────────────────────────────────────────────

  function buildShelves(): void {
    shelvesEl.innerHTML = '';
    const count = opts.getShelfCount();

    const caseLeft = RACK_PAD - 8;
    const caseTop  = shelfTop(0);
    const caseW    = RACK_COLS * SLOT_PX + 16;
    // Case height spans all rows including inter-row gaps.
    const caseH    = count * SHELF_H + Math.max(0, count - 1) * SHELF_GAP;

    // ── Unified case panel ────────────────────────────────────────────────────
    const caseEl = document.createElement('div');
    caseEl.style.cssText = `
      position:absolute;left:${caseLeft}px;top:${caseTop}px;
      width:${caseW}px;height:${caseH}px;
      background:#060c18;
      border:2px solid #1e3052;border-radius:6px;
      box-shadow:inset 0 0 60px rgba(0,0,0,0.55),0 4px 24px rgba(0,0,0,0.6);
    `;

    // Subtle vertical column guides (every slot boundary).
    const colGrid = document.createElement('div');
    colGrid.style.cssText = `
      position:absolute;inset:0;border-radius:6px;pointer-events:none;overflow:hidden;
      background-image:repeating-linear-gradient(
        90deg,
        transparent 0 ${SLOT_PX - 1}px,
        rgba(20,45,85,0.35) ${SLOT_PX - 1}px ${SLOT_PX}px
      );
      background-position:8px 0;
    `;
    caseEl.appendChild(colGrid);

    // Horizontal seam at each inter-row gap.
    for (let i = 0; i < count - 1; i++) {
      const seamY = i * (SHELF_H + SHELF_GAP) + SHELF_H;
      const seam = document.createElement('div');
      seam.style.cssText = `
        position:absolute;left:0;top:${seamY}px;width:100%;height:${SHELF_GAP}px;
        background:linear-gradient(180deg,
          rgba(0,0,0,0.35) 0%,#04080f 30%,#04080f 70%,rgba(0,0,0,0.35) 100%);
        border-top:1px solid rgba(10,20,44,0.9);
        border-bottom:1px solid rgba(10,20,44,0.9);
        pointer-events:none;
      `;
      caseEl.appendChild(seam);
    }

    // Top and bottom eurorack mounting rails.
    for (const barTop of [0, caseH - 8]) {
      const bar = document.createElement('div');
      bar.style.cssText = `
        position:absolute;left:0;top:${barTop}px;width:100%;height:8px;
        background:repeating-linear-gradient(
          90deg,#16233c 0 ${SLOT_PX - 3}px,#22365a ${SLOT_PX - 3}px ${SLOT_PX}px
        );
        border-radius:3px;opacity:0.85;pointer-events:none;
      `;
      caseEl.appendChild(bar);
    }

    shelvesEl.appendChild(caseEl);

    // ── Buy / refund row button (below the case) ──────────────────────────────
    const buyInfo = opts.canBuyShelf();
    if (count < MAX_ROWS || opts.canRefundShelf()) {
      const btnRow = document.createElement('div');
      btnRow.style.cssText = `
        position:absolute;left:${caseLeft}px;top:${shelfTop(count)}px;
        width:${caseW}px;height:40px;
        display:flex;align-items:center;justify-content:center;gap:8px;${FF}
      `;
      if (count < MAX_ROWS) {
        const b = document.createElement('button');
        b.textContent = `+ SHELF (${shelfCost(count + 1)}◈)`;
        b.style.cssText = `${FF}font-size:10px;font-weight:800;letter-spacing:0.08em;padding:4px 12px;border-radius:6px;cursor:pointer;
          background:${buyInfo.ok ? '#11281a' : '#0a1020'};border:1.5px dashed ${buyInfo.ok ? '#33dd88' : '#2a3d65'};color:${buyInfo.ok ? '#33dd88' : '#44608a'};`;
        b.title = buyInfo.label;
        b.addEventListener('click', (e) => { e.stopPropagation(); if (!opts.isLive()) opts.onBuyShelf(); });
        btnRow.appendChild(b);
      }
      if (opts.canRefundShelf()) {
        const r = document.createElement('button');
        r.textContent = `− REFUND SHELF (${shelfCost(count)}◈)`;
        r.style.cssText = `${FF}font-size:10px;font-weight:800;letter-spacing:0.08em;padding:4px 12px;border-radius:6px;cursor:pointer;
          background:#1a0f14;border:1.5px dashed #aa6677;color:#aa6677;`;
        r.addEventListener('click', (e) => { e.stopPropagation(); if (!opts.isLive()) opts.onRefundShelf(); });
        btnRow.appendChild(r);
      }
      shelvesEl.appendChild(btnRow);
    }
  }

  // ── Rebuild ───────────────────────────────────────────────────────────────

  function rebuild(): void {
    // Remove module DOM (both bg and content overlay).
    for (const mv of moduleViews.values()) { mv.rootEl.remove(); mv.contentEl.remove(); }
    moduleViews.clear();
    for (const view of cableViews.values()) {
      view.hitPath.remove();
      soft.finalizeWireRemoval(view.wire);
    }
    cableViews.clear();

    buildShelves();

    for (const inst of graph.modules) {
      const mv = buildModuleView(inst);
      if (!mv) continue;
      moduleViews.set(inst.instanceId, mv);
      root.appendChild(mv.rootEl);
      root.appendChild(mv.contentEl);
      positionModule(mv);
    }
    for (const c of graph.cables) addCableView(c);
    revalidate();
    applyCableHighlights();
  }

  // ── Root pointer handlers (drag continuation) ─────────────────────────────

  const onRootMove = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.pointerId) {
      const local = localPoint(e.clientX, e.clientY);
      drag.curX = local.x;
      drag.curY = local.y;
    } else if (moduleDrag && e.pointerId === moduleDrag.pointerId) {
      updateModuleDrag(e);
    }
  };
  const onRootUp = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.pointerId) endPlugDrag(e);
    else if (moduleDrag && e.pointerId === moduleDrag.pointerId) endModuleDrag();
    if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId);
  };
  const onRootCancel = (e: PointerEvent) => {
    cancelCableDrag();
    cancelModuleDrag();
    if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId);
  };
  const onLostPointerCapture = () => { cancelCableDrag(); cancelModuleDrag(); };
  const onWindowBlur = () => { cancelCableDrag(); cancelModuleDrag(); };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    cancelCableDrag();
    cancelModuleDrag();
  };
  root.addEventListener('pointermove', onRootMove);
  root.addEventListener('pointerup', onRootUp);
  root.addEventListener('pointercancel', onRootCancel);
  root.addEventListener('lostpointercapture', onLostPointerCapture);
  window.addEventListener('blur', onWindowBlur);
  window.addEventListener('keydown', onKeyDown);
  root.addEventListener('pointerdown', () => {
    if (!drag && !moduleDrag) selectModule(null);
  });

  // ── Frame update ──────────────────────────────────────────────────────────

  const PULSE_TRAVEL_TICKS = 12;

  function update(nowMs: number): void {
    const deltaMs = lastUpdateMs > 0 ? Math.min(nowMs - lastUpdateMs, 100) : 16;
    lastUpdateMs = nowMs;
    const reduced = opts.reducedMotion();

    soft.setViewBox(root.clientWidth, root.clientHeight);

    if (drag) {
      const fromPv = findPlug(drag.fromModuleId, drag.fromPort.portId);
      if (fromPv) soft.updateDragPreviewPhysics(fromPv.cx, fromPv.cy, drag.curX, drag.curY);
    }

    for (const view of cableViews.values()) {
      const a = findPlug(view.cable.fromModuleId, view.cable.fromPortId);
      const b = findPlug(view.cable.toModuleId, view.cable.toPortId);
      if (!a || !b) continue;
      soft.updateLockedWire(view.wire, a.cx, a.cy, b.cx, b.cy, reduced ? 0 : deltaMs);
      // Mirror node polyline onto the invisible hit path (cheap string reuse).
      const pts = view.wire.polyline.getAttribute('points');
      if (pts) view.hitPath.setAttribute('points', pts);
    }

    for (let i = slurping.length - 1; i >= 0; i--) {
      const s = slurping[i];
      if (soft.updateSlurpingWire(s.wire, s.ax, s.ay, deltaMs)) {
        soft.finalizeWireRemoval(s.wire);
        slurping.splice(i, 1);
      }
    }

    // Cable pulses from canonical SignalEvents.
    if (!reduced && currentTick >= 0) {
      let pulseIdx = 0;
      for (const [cableId, events] of traffic) {
        const view = cableViews.get(cableId);
        if (!view || view.wire.nodes.length === 0) continue;
        for (const ev of events) {
          const age = currentTick - (ev.tick - PULSE_TRAVEL_TICKS);
          if (age < 0 || age > PULSE_TRAVEL_TICKS) continue;
          const t = age / PULSE_TRAVEL_TICKS;
          const nodes = view.wire.nodes;
          const fi = t * (nodes.length - 1);
          const i0 = Math.min(nodes.length - 2, Math.floor(fi));
          const frac = fi - i0;
          const x = nodes[i0].x + (nodes[i0 + 1].x - nodes[i0].x) * frac;
          const y = nodes[i0].y + (nodes[i0 + 1].y - nodes[i0].y) * frac;
          let dot = pulses[pulseIdx];
          if (!dot) {
            const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            c.setAttribute('r', '3.4');
            pulseSvg.appendChild(c);
            dot = { cableId, eventTick: ev.tick, el: c };
            pulses.push(dot);
          }
          dot.el.setAttribute('cx', x.toFixed(1));
          dot.el.setAttribute('cy', y.toFixed(1));
          dot.el.setAttribute('fill', view.wire.srcColor);
          dot.el.style.filter = `drop-shadow(0 0 4px ${view.wire.srcColor})`;
          dot.el.style.display = '';
          pulseIdx++;
          if (pulseIdx >= 40) break;
        }
        if (pulseIdx >= 40) break;
      }
      for (let i = pulseIdx; i < pulses.length; i++) pulses[i].el.style.display = 'none';
    }

    // Activity LEDs + flash decay.
    for (const mv of moduleViews.values()) {
      const act = activity.get(mv.inst.instanceId) ?? 0;
      const flashing = nowMs < mv.flashUntil;
      if (mv.ledEl) {
        const on = act > 0 || flashing;
        mv.ledEl.style.background = on ? mv.def.color : '#102030';
        mv.ledEl.style.boxShadow = on ? `0 0 6px ${mv.def.color}` : '';
      }
      if (flashing) {
        mv.rootEl.style.borderColor = mv.def.color;
        mv.rootEl.style.boxShadow = `0 0 14px ${mv.def.color}66`;
      } else if (mv.rootEl.style.borderColor !== '') {
        mv.rootEl.style.borderColor = '#1a2a44';
        mv.rootEl.style.boxShadow = '0 2px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(120,160,255,0.07)';
      }
    }
  }

  rebuild();

  return {
    update,
    rebuild,
    setTraffic(t, a) { traffic = t; activity = a; },
    setCurrentTick(t) { currentTick = t; },
    flashModule(id) {
      const mv = moduleViews.get(id);
      if (mv) mv.flashUntil = performance.now() + 380;
    },
    highlightRoute(ids) {
      routeHighlight = ids;
      applyCableHighlights();
    },
    refreshControls() {
      for (const mv of moduleViews.values()) mv.refreshSettings();
    },
    refreshWireDisplay,
    validation: () => cachedValidation,
    destroy() {
      root.removeEventListener('pointermove', onRootMove);
      root.removeEventListener('pointerup', onRootUp);
      root.removeEventListener('pointercancel', onRootCancel);
      root.removeEventListener('lostpointercapture', onLostPointerCapture);
      window.removeEventListener('blur', onWindowBlur);
      window.removeEventListener('keydown', onKeyDown);
      root.innerHTML = '';
    },
  };
}
