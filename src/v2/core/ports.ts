/**
 * ports.ts — Centralized, typed port-contract system.
 *
 * All connection compatibility decisions live here. Pointer handlers and
 * module UI ask this module; they never decide compatibility themselves.
 */

export type PortDirection = 'in' | 'out';

/**
 * Signal domains:
 *  - 'trigger': timed events that have no voice yet (clock output).
 *  - 'voice':   events stamped with a waveform by an oscillator.
 *  - 'either':  pass-through ports that carry whichever domain flows in.
 * A final flow-validation pass guarantees the main output only receives
 * voice-domain signal (you need an oscillator somewhere before OUT).
 */
export type PortDomain = 'trigger' | 'voice' | 'either';

/**
 * Normalized face coordinate (0..1 in each axis) for placing a port on the
 * module face. (0,0) is top-left; (1,1) is bottom-right. Optional — when
 * absent the renderer applies a default layout based on direction and count.
 */
export interface FacePoint {
  x: number; // 0..1
  y: number; // 0..1
}

export interface PortSpec {
  /** Stable port id, unique within the module type (e.g. 'in', 'out', 'outB'). */
  portId: string;
  direction: PortDirection;
  domain: PortDomain;
  label: string;
  help: string;
  /** Max cables on this port. Inputs default 1; mixer inputs and fan-outs higher. */
  maxConnections: number;
  /** Required inputs produce a validation warning when disconnected. */
  required: boolean;
  /**
   * Where on the module face to render this port, in normalized 0..1 coords.
   * When absent, the renderer stacks inputs on the left and outputs on the right.
   */
  anchor?: FacePoint;
  /** Which panel edge the port juts from, for cable direction hints. */
  side?: 'left' | 'right' | 'top' | 'bottom';
}

export function makeInput(portId: string, domain: PortDomain, label: string, help: string, opts?: { maxConnections?: number; required?: boolean; anchor?: FacePoint; side?: 'left' | 'right' | 'top' | 'bottom' }): PortSpec {
  return {
    portId, direction: 'in', domain, label, help,
    maxConnections: opts?.maxConnections ?? 1,
    required: opts?.required ?? true,
    anchor: opts?.anchor,
    side: opts?.side,
  };
}

export function makeOutput(portId: string, domain: PortDomain, label: string, help: string, opts?: { maxConnections?: number; anchor?: FacePoint; side?: 'left' | 'right' | 'top' | 'bottom' }): PortSpec {
  return {
    portId, direction: 'out', domain, label, help,
    maxConnections: opts?.maxConnections ?? 1,
    required: false,
    anchor: opts?.anchor,
    side: opts?.side,
  };
}

/** Static domain compatibility between an output port and an input port. */
export function arePortsCompatible(from: PortSpec, to: PortSpec): boolean {
  if (from.direction !== 'out' || to.direction !== 'in') return false;
  if (from.domain === 'either' || to.domain === 'either') return true;
  return from.domain === to.domain;
}

/** Resolve the runtime domain flowing out of a port given the inflow domain. */
export function resolveOutDomain(out: PortSpec, inflow: PortDomain | null): PortDomain {
  if (out.domain !== 'either') return out.domain;
  return inflow ?? 'either';
}

export const PORT_DOMAIN_COLORS: Record<PortDomain, string> = {
  trigger: '#33dd88',
  voice: '#cc44ff',
  either: '#88aacc',
};
