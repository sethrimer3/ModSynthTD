/**
 * version2-rack-wiring-types.ts — Plug types and helpers for the Version 2 synth rack.
 */

import type { SoftWireData } from './version2-soft-wire';

// ── Plug types ────────────────────────────────────────────────────────────────

export type RackPlugType =
  | 'channelOut'
  | 'clockIn'    | 'clockOut'
  | 'waveformIn' | 'waveformOut'
  | 'frequencyIn'| 'frequencyOut'
  | 'delayIn'    | 'delayOut'
  | 'splitterIn' | 'splitterOut'
  | 'outputIn';

// ── Compatibility ─────────────────────────────────────────────────────────────

export function isRackCompatible(from: RackPlugType, to: RackPlugType): boolean {
  if (from === 'channelOut'    && to === 'clockIn')      return true;
  if (from === 'channelOut'    && to === 'waveformIn')   return true;
  if (from === 'channelOut'    && to === 'outputIn')     return true;
  if (from === 'clockOut'      && to === 'waveformIn')   return true;
  if (from === 'clockOut'      && to === 'frequencyIn')  return true;
  if (from === 'clockOut'      && to === 'delayIn')      return true;
  if (from === 'clockOut'      && to === 'splitterIn')   return true;
  if (from === 'clockOut'      && to === 'outputIn')     return true;
  if (from === 'waveformOut'   && to === 'frequencyIn')  return true;
  if (from === 'waveformOut'   && to === 'delayIn')      return true;
  if (from === 'waveformOut'   && to === 'splitterIn')   return true;
  if (from === 'waveformOut'   && to === 'outputIn')     return true;
  if (from === 'frequencyOut'  && to === 'delayIn')      return true;
  if (from === 'frequencyOut'  && to === 'splitterIn')   return true;
  if (from === 'frequencyOut'  && to === 'outputIn')     return true;
  if (from === 'splitterOut'   && to === 'delayIn')      return true;
  if (from === 'splitterOut'   && to === 'outputIn')     return true;
  if (from === 'delayOut'      && to === 'splitterIn')   return true;
  if (from === 'delayOut'      && to === 'outputIn')     return true;
  return false;
}

export function isRackOutputPlug(type: RackPlugType): boolean {
  return type === 'channelOut' || type === 'clockOut'
      || type === 'waveformOut' || type === 'frequencyOut'
      || type === 'delayOut'   || type === 'splitterOut';
}

export function rackMaxOutgoing(_type: RackPlugType): number { return 1; }
export function rackMaxIncoming(_type: RackPlugType): number { return 1; }

// ── Wire colors ───────────────────────────────────────────────────────────────

export function rackWireColor(from: RackPlugType): string {
  if (from === 'channelOut')   return '#00ffee';
  if (from === 'clockOut')     return '#33dd88';
  if (from === 'waveformOut')  return '#cc44ff';
  if (from === 'frequencyOut') return '#88aacc';
  if (from === 'delayOut')     return '#44aaff';
  if (from === 'splitterOut')  return '#ff8800';
  return '#ffffff';
}

export function rackWireDstColor(to: RackPlugType): string {
  if (to === 'clockIn')      return '#33dd88';
  if (to === 'waveformIn')   return '#cc44ff';
  if (to === 'frequencyIn')  return '#88aacc';
  if (to === 'delayIn')      return '#44aaff';
  if (to === 'splitterIn')   return '#ff8800';
  if (to === 'outputIn')     return '#ffcc00';
  return '#ffffff';
}

export function rackPlugColor(type: RackPlugType): string {
  if (type === 'channelOut')   return '#00ffee';
  if (type === 'clockIn')      return '#33dd88';
  if (type === 'clockOut')     return '#33dd88';
  if (type === 'waveformIn')   return '#cc44ff';
  if (type === 'waveformOut')  return '#cc44ff';
  if (type === 'frequencyIn')  return '#88aacc';
  if (type === 'frequencyOut') return '#88aacc';
  if (type === 'delayIn')      return '#44aaff';
  if (type === 'delayOut')     return '#44aaff';
  if (type === 'splitterIn')   return '#ff8800';
  if (type === 'splitterOut')  return '#ff8800';
  if (type === 'outputIn')     return '#ffcc00';
  return '#ffffff';
}

// ── Data model ────────────────────────────────────────────────────────────────

export interface RackWireConnection {
  fromPlugId: string;
  toPlugId:   string;
}

export interface RackPlugRecord {
  plugId:    string;
  type:      RackPlugType;
  el:        HTMLElement;
  hitEl:     HTMLElement | null;
  dropHitEl: HTMLElement | null;
  locked:    boolean;
}

export interface RackWireEntry {
  wire:       SoftWireData;
  fromPlugId: string;
  toPlugId:   string;
}

// ── Handle interface ──────────────────────────────────────────────────────────

export interface RackWiringHandle {
  registerPlug(plugId: string, type: RackPlugType, el: HTMLElement): void;
  unregisterPlug(plugId: string): void;
  connectPlugs(fromId: string, toId: string): void;
  hasRoute(toPlugId: string): boolean;
  /** Read-only snapshot of all active connections for signal graph evaluation. */
  getConnections(): readonly RackWireConnection[];
  update(nowMs: number): void;
}
