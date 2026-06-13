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
}

export function makeInput(portId: string, domain: PortDomain, label: string, help: string, opts?: { maxConnections?: number; required?: boolean }): PortSpec {
  return {
    portId, direction: 'in', domain, label, help,
    maxConnections: opts?.maxConnections ?? 1,
    required: opts?.required ?? true,
  };
}

export function makeOutput(portId: string, domain: PortDomain, label: string, help: string, opts?: { maxConnections?: number }): PortSpec {
  return {
    portId, direction: 'out', domain, label, help,
    maxConnections: opts?.maxConnections ?? 1,
    required: false,
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
