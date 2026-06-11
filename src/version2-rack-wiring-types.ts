/**
 * version2-rack-wiring-types.ts — Plug types and helpers for the Version 2 synth rack.
 */

import type { SoftWireData } from './version2-soft-wire';

// ── Plug types ────────────────────────────────────────────────────────────────

export type RackPlugType =
  | 'channelOut'
  | 'waveformIn'
  | 'waveformOut'
  | 'splitterIn'
  | 'splitterOut'
  | 'outputIn';

// ── Compatibility ─────────────────────────────────────────────────────────────

export function isRackCompatible(from: RackPlugType, to: RackPlugType): boolean {
  if (from === 'channelOut'  && to === 'waveformIn')  return true;
  if (from === 'channelOut'  && to === 'outputIn')    return true;
  if (from === 'waveformOut' && to === 'splitterIn')  return true;
  if (from === 'waveformOut' && to === 'outputIn')    return true;
  if (from === 'splitterOut' && to === 'outputIn')    return true;
  return false;
}

export function isRackOutputPlug(type: RackPlugType): boolean {
  return type === 'channelOut' || type === 'waveformOut' || type === 'splitterOut';
}

export function rackMaxOutgoing(_type: RackPlugType): number { return 1; }
export function rackMaxIncoming(_type: RackPlugType): number { return 1; }

// ── Wire colors ───────────────────────────────────────────────────────────────

export function rackWireColor(from: RackPlugType): string {
  if (from === 'channelOut')  return '#00ffee';
  if (from === 'waveformOut') return '#cc44ff';
  if (from === 'splitterOut') return '#ff8800';
  return '#ffffff';
}

export function rackWireDstColor(to: RackPlugType): string {
  if (to === 'waveformIn')  return '#cc44ff';
  if (to === 'splitterIn')  return '#ff8800';
  if (to === 'outputIn')    return '#ffcc00';
  return '#ffffff';
}

export function rackPlugColor(type: RackPlugType): string {
  if (type === 'channelOut')  return '#00ffee';
  if (type === 'waveformIn')  return '#cc44ff';
  if (type === 'waveformOut') return '#cc44ff';
  if (type === 'splitterIn')  return '#ff8800';
  if (type === 'splitterOut') return '#ff8800';
  if (type === 'outputIn')    return '#ffcc00';
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
  /** Programmatically connect two already-registered plugs (used for default wiring). */
  connectPlugs(fromId: string, toId: string): void;
  /** Returns true if the given toPlugId has at least one active incoming connection. */
  hasRoute(toPlugId: string): boolean;
  /** Call once per frame with the current timestamp in ms. */
  update(nowMs: number): void;
}
