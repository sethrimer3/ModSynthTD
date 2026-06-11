/**
 * version2-rack-wiring.ts — Patch-cable wiring system for the Version 2 synth rack.
 *
 * Ported from Equatoria Idle rpg-equip-wiring.ts.
 * Manages drag-to-connect soft-body cables between module plugs.
 */

import { createSoftWireRenderer } from './version2-soft-wire';
import type { SoftWireData } from './version2-soft-wire';
import type { RackPlugType, RackPlugRecord, RackWireEntry, RackWiringHandle, RackWireConnection } from './version2-rack-wiring-types';
import {
  isRackCompatible, isRackOutputPlug, rackMaxOutgoing, rackMaxIncoming,
  rackWireColor, rackWireDstColor,
} from './version2-rack-wiring-types';

export type { RackPlugType, RackWiringHandle, RackWireConnection } from './version2-rack-wiring-types';

// ── Factory ───────────────────────────────────────────────────────────────────

export function createRackWiringSystem(panelEl: HTMLElement): RackWiringHandle {

  const plugs = new Map<string, RackPlugRecord>();

  const softRenderer = createSoftWireRenderer(panelEl);
  panelEl.appendChild(softRenderer.svgEl);

  const connections: Array<{ fromPlugId: string; toPlugId: string }> = [];
  const wireEntries = new Map<string, RackWireEntry>();
  const slurpingEntries: Array<{ wire: SoftWireData; fromPlugId: string }> = [];

  function wireKey(fromId: string, toId: string): string { return fromId + '|' + toId; }

  // ── Drag state ────────────────────────────────────────────────────────────

  interface DragState {
    fromPlugId: string;
    fromType:   RackPlugType;
    currentX:   number;
    currentY:   number;
  }
  let drag: DragState | null = null;
  let lastUpdateMs = 0;

  // ── Helpers ───────────────────────────────────────────────────────────────

  function plugCenter(el: HTMLElement): { x: number; y: number } {
    const panelRect = panelEl.getBoundingClientRect();
    const plugRect  = el.getBoundingClientRect();
    return {
      x: plugRect.left + plugRect.width  / 2 - panelRect.left,
      y: plugRect.top  + plugRect.height / 2 - panelRect.top,
    };
  }

  function outgoingCount(plugId: string): number {
    return connections.filter(c => c.fromPlugId === plugId).length;
  }

  function incomingCount(plugId: string): number {
    return connections.filter(c => c.toPlugId === plugId).length;
  }

  function toLocalCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = panelEl.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  // ── Slurp / disconnect helpers ────────────────────────────────────────────

  function triggerSlurp(fromId: string, toId: string): void {
    const key = wireKey(fromId, toId);
    const entry = wireEntries.get(key);
    if (entry) {
      wireEntries.delete(key);
      entry.wire.isSlurping = true;
      entry.wire.slurpMs = 0;
      slurpingEntries.push({ wire: entry.wire, fromPlugId: fromId });
    }
  }

  function disconnectPair(fromId: string, toId: string): void {
    const idx = connections.findIndex(c => c.fromPlugId === fromId && c.toPlugId === toId);
    if (idx !== -1) {
      connections.splice(idx, 1);
      triggerSlurp(fromId, toId);
    }
  }

  // ── Valid-target highlighting ─────────────────────────────────────────────

  function setValidTargetHighlights(fromType: RackPlugType | null): void {
    for (const record of plugs.values()) {
      if (fromType !== null && isRackCompatible(fromType, record.type) && !record.locked) {
        const hasRoom = incomingCount(record.plugId) < rackMaxIncoming(record.type);
        if (hasRoom) {
          record.el.style.boxShadow = `0 0 10px 3px ${record.el.dataset.color ?? '#fff'}, 0 0 0 2px #fff`;
          record.el.style.transform = 'scale(1.35)';
        }
      } else {
        record.el.style.boxShadow = record.el.dataset.defaultShadow ?? '';
        record.el.style.transform = '';
      }
    }
  }

  // ── Tip handle listeners (reconnect by dragging wire tip) ─────────────────

  function attachTipHandleListeners(wire: SoftWireData, fromPlugId: string, toPlugId: string): void {
    wire.tipHandle.addEventListener('pointerdown', (e: PointerEvent) => {
      if (drag !== null) return;
      e.stopPropagation();
      const fromRecord = plugs.get(fromPlugId);
      if (!fromRecord) return;
      disconnectPair(fromPlugId, toPlugId);
      panelEl.setPointerCapture(e.pointerId);
      const local = toLocalCoords(e.clientX, e.clientY);
      drag = { fromPlugId, fromType: fromRecord.type, currentX: local.x, currentY: local.y };
      const from = plugCenter(fromRecord.el);
      softRenderer.setDragPreview(from.x, from.y, local.x, local.y, rackWireColor(fromRecord.type));
      setValidTargetHighlights(fromRecord.type);
    });
  }

  // ── Drop-target search ────────────────────────────────────────────────────

  function findCompatibleDropTarget(clientX: number, clientY: number, fromType: RackPlugType): RackPlugRecord | null {
    // Pass 1: exact plug element bounds
    for (const record of plugs.values()) {
      if (!isRackCompatible(fromType, record.type)) continue;
      if (record.locked) continue;
      if (incomingCount(record.plugId) >= rackMaxIncoming(record.type)) continue;
      const rect = record.el.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return record;
      }
    }
    // Pass 2: extended drop-hit zones
    for (const record of plugs.values()) {
      if (!record.dropHitEl) continue;
      if (!isRackCompatible(fromType, record.type)) continue;
      if (record.locked) continue;
      if (incomingCount(record.plugId) >= rackMaxIncoming(record.type)) continue;
      const hitRect = record.dropHitEl.getBoundingClientRect();
      if (clientX >= hitRect.left && clientX <= hitRect.right && clientY >= hitRect.top && clientY <= hitRect.bottom) {
        return record;
      }
    }
    return null;
  }

  function findOutputPlugUnderPointer(clientX: number, clientY: number): RackPlugRecord | null {
    for (const record of plugs.values()) {
      if (!isRackOutputPlug(record.type)) continue;
      const rect = record.el.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return record;
      }
    }
    // Extended hit areas
    for (const record of plugs.values()) {
      if (!record.hitEl || !isRackOutputPlug(record.type)) continue;
      const hitRect = record.hitEl.getBoundingClientRect();
      if (clientX >= hitRect.left && clientX <= hitRect.right && clientY >= hitRect.top && clientY <= hitRect.bottom) {
        return record;
      }
    }
    return null;
  }

  // ── Pointer event handlers ────────────────────────────────────────────────

  panelEl.addEventListener('pointerdown', (e: PointerEvent) => {
    const target = findOutputPlugUnderPointer(e.clientX, e.clientY);
    if (!target || target.locked) return;
    e.preventDefault();
    panelEl.setPointerCapture(e.pointerId);

    // Disconnect existing wire if at max outgoing
    if (outgoingCount(target.plugId) >= rackMaxOutgoing(target.type)) {
      const existing = connections.find(c => c.fromPlugId === target.plugId);
      if (existing) disconnectPair(target.plugId, existing.toPlugId);
    }

    const local = toLocalCoords(e.clientX, e.clientY);
    drag = { fromPlugId: target.plugId, fromType: target.type, currentX: local.x, currentY: local.y };
    const from = plugCenter(target.el);
    softRenderer.setDragPreview(from.x, from.y, local.x, local.y, rackWireColor(target.type));
    setValidTargetHighlights(target.type);
  });

  panelEl.addEventListener('pointermove', (e: PointerEvent) => {
    if (!drag) return;
    const local = toLocalCoords(e.clientX, e.clientY);
    drag.currentX = local.x;
    drag.currentY = local.y;
  });

  panelEl.addEventListener('pointerup', (e: PointerEvent) => {
    if (!drag) return;
    const dropTarget = findCompatibleDropTarget(e.clientX, e.clientY, drag.fromType);
    if (dropTarget) {
      // Bump any existing connection on that input plug
      const existingIn = connections.find(c => c.toPlugId === dropTarget.plugId);
      if (existingIn) disconnectPair(existingIn.fromPlugId, existingIn.toPlugId);

      const srcColor = rackWireColor(drag.fromType);
      const dstColor = rackWireDstColor(dropTarget.type);
      const wire = softRenderer.createWire(srcColor, dstColor);
      attachTipHandleListeners(wire, drag.fromPlugId, dropTarget.plugId);
      wireEntries.set(wireKey(drag.fromPlugId, dropTarget.plugId), {
        wire, fromPlugId: drag.fromPlugId, toPlugId: dropTarget.plugId,
      });
      connections.push({ fromPlugId: drag.fromPlugId, toPlugId: dropTarget.plugId });
    }
    drag = null;
    softRenderer.hideDragPreview();
    setValidTargetHighlights(null);
    if (panelEl.hasPointerCapture(e.pointerId)) panelEl.releasePointerCapture(e.pointerId);
  });

  panelEl.addEventListener('pointercancel', (e: PointerEvent) => {
    if (!drag) return;
    drag = null;
    softRenderer.hideDragPreview();
    setValidTargetHighlights(null);
    if (panelEl.hasPointerCapture(e.pointerId)) panelEl.releasePointerCapture(e.pointerId);
  });

  // ── Handle implementation ─────────────────────────────────────────────────

  function registerPlug(plugId: string, type: RackPlugType, el: HTMLElement): void {
    plugs.set(plugId, { plugId, type, el, hitEl: null, dropHitEl: null, locked: false });
  }

  function unregisterPlug(plugId: string): void {
    const toRemove = connections.filter(c => c.fromPlugId === plugId || c.toPlugId === plugId);
    for (const conn of toRemove) {
      const idx = connections.indexOf(conn);
      if (idx !== -1) connections.splice(idx, 1);
      triggerSlurp(conn.fromPlugId, conn.toPlugId);
    }
    plugs.delete(plugId);
  }

  function connectPlugs(fromId: string, toId: string): void {
    const fromRecord = plugs.get(fromId);
    const toRecord   = plugs.get(toId);
    if (!fromRecord || !toRecord) return;
    // Idempotent: skip if already connected
    if (connections.some(c => c.fromPlugId === fromId && c.toPlugId === toId)) return;
    const srcColor = rackWireColor(fromRecord.type);
    const dstColor = rackWireDstColor(toRecord.type);
    const wire = softRenderer.createWire(srcColor, dstColor);
    attachTipHandleListeners(wire, fromId, toId);
    wireEntries.set(wireKey(fromId, toId), { wire, fromPlugId: fromId, toPlugId: toId });
    connections.push({ fromPlugId: fromId, toPlugId: toId });
  }

  function hasRoute(toPlugId: string): boolean {
    return connections.some(c => c.toPlugId === toPlugId);
  }

  function update(nowMs: number): void {
    const deltaMs = lastUpdateMs > 0 ? Math.min(nowMs - lastUpdateMs, 100) : 16;
    lastUpdateMs = nowMs;

    softRenderer.setViewBox(panelEl.clientWidth, panelEl.clientHeight);

    if (drag) {
      const fromRecord = plugs.get(drag.fromPlugId);
      if (fromRecord) {
        const from = plugCenter(fromRecord.el);
        softRenderer.updateDragPreviewPhysics(from.x, from.y, drag.currentX, drag.currentY);
      }
    }

    for (const entry of wireEntries.values()) {
      const fromRecord = plugs.get(entry.fromPlugId);
      const toRecord   = plugs.get(entry.toPlugId);
      if (!fromRecord || !toRecord) continue;
      const from = plugCenter(fromRecord.el);
      const to   = plugCenter(toRecord.el);
      softRenderer.updateLockedWire(entry.wire, from.x, from.y, to.x, to.y, deltaMs);
    }

    for (let i = slurpingEntries.length - 1; i >= 0; i--) {
      const { wire, fromPlugId } = slurpingEntries[i];
      const fromRecord = plugs.get(fromPlugId);
      let ax: number, ay: number;
      if (fromRecord) {
        const from = plugCenter(fromRecord.el);
        ax = from.x; ay = from.y;
      } else {
        const lastNode = wire.nodes[0];
        ax = lastNode ? lastNode.x : 0;
        ay = lastNode ? lastNode.y : 0;
      }
      const done = softRenderer.updateSlurpingWire(wire, ax, ay, deltaMs);
      if (done) {
        softRenderer.finalizeWireRemoval(wire);
        slurpingEntries.splice(i, 1);
      }
    }
  }

  function getConnections(): readonly RackWireConnection[] {
    return connections;
  }

  return { registerPlug, unregisterPlug, connectPlugs, hasRoute, getConnections, update };
}
