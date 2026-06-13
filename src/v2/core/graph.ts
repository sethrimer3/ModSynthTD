/**
 * graph.ts — Rack signal graph: model, validation, deterministic evaluation.
 *
 * Pure and renderer-free: testable under node without DOM or AudioContext.
 */

import { SignalEvent, compareEvents, clampAmplitude } from './events';
import { PortDomain, arePortsCompatible } from './ports';
import {
  ModuleSettings, ModuleTypeDef, PortEvents, getModuleType, findPort,
  eventMultiplier, sanitizeSettings,
} from './modules';
import {
  MAX_GRAPH_DEPTH, MAX_MODULES, MAX_CABLES, MAX_EVENTS_PER_MODULE_WINDOW,
  MAX_EVENTS_PER_WINDOW, MIN_AMPLITUDE, MAX_DELAY_REPEATS,
} from './limits';
import { hashString, combineSeeds } from './rng';

// ── Model ───────────────────────────────────────────────────────────────────

export interface ModuleInstance {
  /** Stable unique id, e.g. 'm-clock-1a2b'. */
  instanceId: string;
  typeId: string;
  /**
   * Top-left position in the coarse rack grid.
   * gridX = column (0-based), gridY = row (0-based).
   * The module occupies cells [gridX .. gridX+rackSize.w) × [gridY .. gridY+rackSize.h).
   */
  gridX: number;
  gridY: number;
  settings: ModuleSettings;
}

export interface Cable {
  cableId: string;
  fromModuleId: string;
  fromPortId: string;
  toModuleId: string;
  toPortId: string;
}

export interface RackGraph {
  modules: ModuleInstance[];
  cables: Cable[];
}

// ── Validation ──────────────────────────────────────────────────────────────

export type GraphStatusCode =
  | 'valid'
  | 'valid-unused'        // valid but some modules contribute nothing
  | 'no-output-route'
  | 'missing-starter'     // no oscillator voicing the output / no clock source
  | 'incompatible'
  | 'cycle'
  | 'over-amplified'
  | 'excessive-events'
  | 'invalid';

export interface GraphIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  moduleId?: string;
  cableId?: string;
}

export interface GraphValidation {
  status: GraphStatusCode;
  issues: GraphIssue[];
  /** Module ids on at least one source→output path. */
  contributing: Set<string>;
  /** Topological order (empty when cyclic). */
  topoOrder: string[];
}

interface Resolved {
  byId: Map<string, ModuleInstance>;
  defs: Map<string, ModuleTypeDef>;
}

function resolve(graph: RackGraph, issues: GraphIssue[]): Resolved {
  const byId = new Map<string, ModuleInstance>();
  const defs = new Map<string, ModuleTypeDef>();
  for (const m of graph.modules) {
    if (byId.has(m.instanceId)) {
      issues.push({ severity: 'error', code: 'duplicate-id', message: `Duplicate module id ${m.instanceId}`, moduleId: m.instanceId });
      continue;
    }
    const def = getModuleType(m.typeId);
    if (!def) {
      issues.push({ severity: 'error', code: 'unknown-type', message: `Unknown module type ${m.typeId}`, moduleId: m.instanceId });
      continue;
    }
    byId.set(m.instanceId, m);
    defs.set(m.instanceId, def);
  }
  return { byId, defs };
}

export function validateGraph(graph: RackGraph): GraphValidation {
  const issues: GraphIssue[] = [];
  const { byId, defs } = resolve(graph, issues);

  if (graph.modules.length > MAX_MODULES) {
    issues.push({ severity: 'error', code: 'too-many-modules', message: `Rack exceeds ${MAX_MODULES} modules` });
  }
  if (graph.cables.length > MAX_CABLES) {
    issues.push({ severity: 'error', code: 'too-many-cables', message: `Rack exceeds ${MAX_CABLES} cables` });
  }

  // Settings validation.
  for (const m of graph.modules) {
    const def = defs.get(m.instanceId);
    if (!def) continue;
    const { issues: settingIssues } = sanitizeSettings(def, m.settings);
    for (const si of settingIssues) {
      issues.push({ severity: 'warning', code: 'setting-repaired', message: si, moduleId: m.instanceId });
    }
  }

  // Cable validation (existence, ports, direction, compatibility, multiplicity).
  const validCables: Cable[] = [];
  const inCount = new Map<string, number>();  // `${moduleId}:${portId}`
  const outCount = new Map<string, number>();
  const seenPairs = new Set<string>();
  for (const c of graph.cables) {
    const fromM = byId.get(c.fromModuleId);
    const toM = byId.get(c.toModuleId);
    if (!fromM || !toM) {
      issues.push({ severity: 'error', code: 'dangling-cable', message: `Cable ${c.cableId} references a missing module`, cableId: c.cableId });
      continue;
    }
    const fromDef = defs.get(c.fromModuleId)!;
    const toDef = defs.get(c.toModuleId)!;
    const fromPort = findPort(fromDef, c.fromPortId);
    const toPort = findPort(toDef, c.toPortId);
    if (!fromPort || !toPort) {
      issues.push({ severity: 'error', code: 'missing-port', message: `Cable ${c.cableId} references a missing port`, cableId: c.cableId });
      continue;
    }
    if (!arePortsCompatible(fromPort, toPort)) {
      issues.push({ severity: 'error', code: 'incompatible-ports', message: `${fromDef.shortName}.${fromPort.label} → ${toDef.shortName}.${toPort.label} is not a compatible route`, cableId: c.cableId });
      continue;
    }
    if (c.fromModuleId === c.toModuleId) {
      issues.push({ severity: 'error', code: 'self-cycle', message: `${fromDef.shortName} cannot patch into itself`, cableId: c.cableId });
      continue;
    }
    const pairKey = `${c.fromModuleId}:${c.fromPortId}>${c.toModuleId}:${c.toPortId}`;
    if (seenPairs.has(pairKey)) {
      issues.push({ severity: 'error', code: 'duplicate-cable', message: `Duplicate cable on the same route`, cableId: c.cableId });
      continue;
    }
    seenPairs.add(pairKey);
    const outKey = `${c.fromModuleId}:${c.fromPortId}`;
    const inKey = `${c.toModuleId}:${c.toPortId}`;
    const oc = (outCount.get(outKey) ?? 0) + 1;
    const ic = (inCount.get(inKey) ?? 0) + 1;
    if (oc > fromPort.maxConnections) {
      issues.push({ severity: 'error', code: 'fanout-exceeded', message: `${fromDef.shortName}.${fromPort.label} supports ${fromPort.maxConnections} cable(s)`, cableId: c.cableId });
      continue;
    }
    if (ic > toPort.maxConnections) {
      issues.push({ severity: 'error', code: 'fanin-exceeded', message: `${toDef.shortName}.${toPort.label} supports ${toPort.maxConnections} cable(s)`, cableId: c.cableId });
      continue;
    }
    outCount.set(outKey, oc);
    inCount.set(inKey, ic);
    validCables.push(c);
  }

  // Adjacency on valid cables.
  const downstream = new Map<string, string[]>();
  const upstream = new Map<string, string[]>();
  for (const id of byId.keys()) { downstream.set(id, []); upstream.set(id, []); }
  for (const c of validCables) {
    downstream.get(c.fromModuleId)!.push(c.toModuleId);
    upstream.get(c.toModuleId)!.push(c.fromModuleId);
  }

  // Cycle detection + topo order (Kahn, deterministic by sorted id).
  const indeg = new Map<string, number>();
  for (const id of byId.keys()) indeg.set(id, upstream.get(id)!.length);
  const queue = [...byId.keys()].filter(id => indeg.get(id) === 0).sort();
  const topoOrder: string[] = [];
  const indegWork = new Map(indeg);
  while (queue.length > 0) {
    const id = queue.shift()!;
    topoOrder.push(id);
    const next: string[] = [];
    for (const d of downstream.get(id)!) {
      const v = indegWork.get(d)! - 1;
      indegWork.set(d, v);
      if (v === 0) next.push(d);
    }
    next.sort();
    queue.push(...next);
    queue.sort();
  }
  const hasCycle = topoOrder.length < byId.size;
  if (hasCycle) {
    const inCycle = [...byId.keys()].filter(id => !topoOrder.includes(id));
    issues.push({ severity: 'error', code: 'cycle', message: `Signal loop detected (${inCycle.length} modules). Patches must flow forward only.`, moduleId: inCycle[0] });
  }

  // Output / source presence.
  const outputs = graph.modules.filter(m => defs.get(m.instanceId)?.kind === 'sink');
  const sources = graph.modules.filter(m => defs.get(m.instanceId)?.kind === 'source');
  if (outputs.length === 0) {
    issues.push({ severity: 'error', code: 'no-output', message: 'No main output module in the rack.' });
  }
  if (sources.length === 0) {
    issues.push({ severity: 'error', code: 'no-source', message: 'No clock source in the rack — nothing generates signal.' });
  }

  // Reachability / contribution: modules on a source→output path.
  const reachableFromSource = new Set<string>();
  {
    const stack = sources.map(s => s.instanceId);
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (reachableFromSource.has(id)) continue;
      reachableFromSource.add(id);
      for (const d of downstream.get(id) ?? []) stack.push(d);
    }
  }
  const reachesOutput = new Set<string>();
  {
    const stack = outputs.map(o => o.instanceId);
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (reachesOutput.has(id)) continue;
      reachesOutput.add(id);
      for (const u of upstream.get(id) ?? []) stack.push(u);
    }
  }
  const contributing = new Set<string>();
  for (const id of byId.keys()) {
    if (reachableFromSource.has(id) && reachesOutput.has(id)) contributing.add(id);
  }

  const outputConnected = outputs.some(o => contributing.has(o.instanceId));
  if (outputs.length > 0 && sources.length > 0 && !outputConnected) {
    issues.push({ severity: 'error', code: 'no-output-route', message: 'No signal route reaches the main output.' });
  }

  // Domain flow: output must receive voice-domain signal (oscillator upstream).
  let missingVoice = false;
  if (!hasCycle && outputConnected) {
    const domainOut = new Map<string, PortDomain>(); // resolved outflow domain per module
    for (const id of topoOrder) {
      const def = defs.get(id);
      if (!def) continue;
      if (def.kind === 'source') { domainOut.set(id, 'trigger'); continue; }
      let inflow: PortDomain | null = null;
      for (const u of upstream.get(id) ?? []) {
        const d = domainOut.get(u);
        if (d === 'voice') inflow = 'voice';
        else if (d === 'trigger' && inflow !== 'voice') inflow = 'trigger';
      }
      const outSpec = def.outputs[0];
      if (def.typeId === 'osc') domainOut.set(id, 'voice');
      else if (outSpec && outSpec.domain !== 'either') domainOut.set(id, outSpec.domain);
      else domainOut.set(id, inflow ?? 'either');
    }
    for (const o of outputs) {
      let sawVoice = false;
      for (const u of upstream.get(o.instanceId) ?? []) {
        if (domainOut.get(u) === 'voice') sawVoice = true;
      }
      if (!sawVoice && contributing.has(o.instanceId)) {
        missingVoice = true;
        issues.push({ severity: 'error', code: 'missing-starter', message: 'The output needs a voiced signal — patch an oscillator somewhere before OUT.', moduleId: o.instanceId });
      }
    }
  }

  // Depth check (longest path through DAG).
  if (!hasCycle) {
    const depth = new Map<string, number>();
    for (const id of topoOrder) {
      let d = 1;
      for (const u of upstream.get(id) ?? []) d = Math.max(d, (depth.get(u) ?? 1) + 1);
      depth.set(id, d);
    }
    const maxDepth = Math.max(0, ...depth.values());
    if (maxDepth > MAX_GRAPH_DEPTH) {
      issues.push({ severity: 'error', code: 'too-deep', message: `Patch chain exceeds maximum depth of ${MAX_GRAPH_DEPTH}.` });
    }
  }

  // Static event-multiplication estimate (DAG DP).
  if (!hasCycle && !missingVoice) {
    const mult = new Map<string, number>();
    for (const id of topoOrder) {
      const def = defs.get(id);
      const m = byId.get(id);
      if (!def || !m) continue;
      let incoming = 0;
      for (const u of upstream.get(id) ?? []) incoming += mult.get(u) ?? 0;
      if (def.kind === 'source') incoming = 1;
      mult.set(id, incoming * eventMultiplier(def, m.settings));
    }
    for (const o of outputs) {
      const total = mult.get(o.instanceId) ?? 0;
      if (total > 64) {
        issues.push({ severity: 'warning', code: 'excessive-events', message: `This patch can multiply one pulse into ~${Math.round(total)} events; output will be hard-capped.`, moduleId: o.instanceId });
      }
    }
  }

  // Amplification warning (informational; evaluation clamps regardless).
  for (const m of graph.modules) {
    const def = defs.get(m.instanceId);
    if (def?.typeId === 'amp') {
      const gain = typeof m.settings['gain'] === 'number' ? (m.settings['gain'] as number) : 1;
      if (gain >= 1.5) {
        issues.push({ severity: 'warning', code: 'near-clipping', message: `AMP gain ×${gain.toFixed(2)} approaches the clipping limit.`, moduleId: m.instanceId });
      }
    }
  }

  // Unused modules (info).
  const unused = [...byId.keys()].filter(id => !contributing.has(id));
  for (const id of unused) {
    issues.push({ severity: 'info', code: 'unused-module', message: `${defs.get(id)?.shortName ?? id} is not on any route to the output.`, moduleId: id });
  }

  // Status rollup.
  let status: GraphStatusCode;
  const hasError = (code: string) => issues.some(i => i.code === code && i.severity === 'error');
  if (hasCycle) status = 'cycle';
  else if (hasError('incompatible-ports') || hasError('fanout-exceeded') || hasError('fanin-exceeded')) status = 'incompatible';
  else if (hasError('no-output') || hasError('no-output-route') || hasError('no-source')) status = 'no-output-route';
  else if (hasError('missing-starter')) status = 'missing-starter';
  else if (issues.some(i => i.severity === 'error')) status = 'invalid';
  else if (issues.some(i => i.code === 'excessive-events')) status = 'excessive-events';
  else if (issues.some(i => i.code === 'near-clipping')) status = 'over-amplified';
  else if (unused.length > 0) status = 'valid-unused';
  else status = 'valid';

  return { status, issues, contributing, topoOrder };
}

// ── Evaluation ──────────────────────────────────────────────────────────────

export interface EvalResult {
  /** Events arriving at the main output, sorted, bounded. */
  events: SignalEvent[];
  eventsByOutput: Map<string, SignalEvent[]>;
  /** Per-cable traffic for visible pulse animation. */
  cableTraffic: Map<string, SignalEvent[]>;
  /** Event count that passed through each module (activity LEDs). */
  moduleActivity: Map<string, number>;
  /** True if any cap truncated events. */
  truncated: boolean;
}

export interface EvalOptions {
  /** Inclusive start tick. */
  startTick: number;
  /** Exclusive end tick. */
  endTick: number;
  /** Stable seed (world + wave + run). */
  seedBase: number;
  /** Optional injected events replacing clock generation (test pulse). */
  injectAtSources?: SignalEvent[];
}

/** Extra lookback so delays/phases from just-before-window events land correctly. */
export function computeLookbackTicks(graph: RackGraph): number {
  let total = 0;
  for (const m of graph.modules) {
    const def = getModuleType(m.typeId);
    if (!def) continue;
    if (def.typeId === 'delay') {
      const dt = typeof m.settings['delayTicks'] === 'number' ? (m.settings['delayTicks'] as number) : 48;
      const reps = typeof m.settings['repeats'] === 'number' ? (m.settings['repeats'] as number) : 1;
      total += Math.min(192, dt) * Math.min(MAX_DELAY_REPEATS, Math.max(1, reps));
    } else if (def.typeId === 'phase') {
      const off = typeof m.settings['offsetTicks'] === 'number' ? (m.settings['offsetTicks'] as number) : 24;
      total += Math.min(191, Math.max(0, off));
    }
  }
  return total;
}

export function evaluatePatch(graph: RackGraph, opts: EvalOptions): EvalResult {
  const issues: GraphIssue[] = [];
  const { byId, defs } = resolve(graph, issues);
  const validation = validateGraph(graph);

  const cableTraffic = new Map<string, SignalEvent[]>();
  const moduleActivity = new Map<string, number>();
  const eventsByOutput = new Map<string, SignalEvent[]>();
  let truncated = false;

  if (validation.topoOrder.length < byId.size) {
    // Cyclic: refuse to evaluate.
    return { events: [], eventsByOutput, cableTraffic, moduleActivity, truncated };
  }
  const fatal = validation.issues.some(i =>
    i.severity === 'error' && ['no-output', 'no-source', 'no-output-route', 'missing-starter', 'too-deep'].includes(i.code));
  if (fatal && !opts.injectAtSources) {
    return { events: [], eventsByOutput, cableTraffic, moduleActivity, truncated };
  }

  // Cables grouped by destination and source for routing events.
  const cablesByDst = new Map<string, Cable[]>(); // `${moduleId}` → cables in
  const connectedOutputs = new Map<string, Set<string>>();
  for (const c of graph.cables) {
    if (!byId.has(c.fromModuleId) || !byId.has(c.toModuleId)) continue;
    if (!cablesByDst.has(c.toModuleId)) cablesByDst.set(c.toModuleId, []);
    cablesByDst.get(c.toModuleId)!.push(c);
    if (!connectedOutputs.has(c.fromModuleId)) connectedOutputs.set(c.fromModuleId, new Set());
    connectedOutputs.get(c.fromModuleId)!.add(c.fromPortId);
  }

  // Per-module output buffers: moduleId → portId → events.
  const outputBuffers = new Map<string, PortEvents>();
  let finalEvents: SignalEvent[] = [];

  const lookback = computeLookbackTicks(graph);
  const windowStart = Math.max(0, opts.startTick - lookback);

  for (const moduleId of validation.topoOrder) {
    const inst = byId.get(moduleId);
    const def = defs.get(moduleId);
    if (!inst || !def) continue;

    const { settings } = sanitizeSettings(def, inst.settings);

    // Gather inputs from upstream buffers via cables.
    const inputs: PortEvents = {};
    for (const c of cablesByDst.get(moduleId) ?? []) {
      const upstreamBuf = outputBuffers.get(c.fromModuleId);
      const events = upstreamBuf?.[c.fromPortId] ?? [];
      if (!inputs[c.toPortId]) inputs[c.toPortId] = [];
      inputs[c.toPortId].push(...events);
      // Record cable traffic (events that exist within the requested window).
      const visible = events.filter(e => e.tick >= opts.startTick && e.tick < opts.endTick);
      if (visible.length > 0) {
        if (!cableTraffic.has(c.cableId)) cableTraffic.set(c.cableId, []);
        cableTraffic.get(c.cableId)!.push(...visible);
      }
    }
    for (const key of Object.keys(inputs)) inputs[key].sort(compareEvents);

    const ctx = {
      windowStartTick: def.kind === 'source' ? windowStart : opts.startTick,
      windowEndTick: opts.endTick,
      seedBase: opts.seedBase,
      moduleId,
      connectedOutputs: connectedOutputs.get(moduleId) ?? new Set<string>(),
    };

    let result: PortEvents;
    if (def.kind === 'source' && opts.injectAtSources) {
      // Test pulse: sources emit the injected events instead of generating.
      result = {
        out: opts.injectAtSources.map(e => ({
          ...e,
          route: [moduleId],
          sourceModuleId: moduleId,
          seed: combineSeeds(e.seed, hashString(moduleId)),
        })),
      };
    } else {
      result = def.process(ctx, inputs, settings);
    }

    // Clamp + cap each output buffer deterministically.
    let activity = 0;
    for (const portId of Object.keys(result)) {
      let events = result[portId];
      for (const e of events) e.amplitude = clampAmplitude(e.amplitude);
      events = events.filter(e => e.amplitude >= MIN_AMPLITUDE);
      events.sort(compareEvents);
      if (events.length > MAX_EVENTS_PER_MODULE_WINDOW) {
        events = events.slice(0, MAX_EVENTS_PER_MODULE_WINDOW);
        truncated = true;
      }
      result[portId] = events;
      activity += events.length;
    }
    moduleActivity.set(moduleId, activity);

    if (def.kind === 'sink') {
      const outputEvents = (result['_final'] ?? []).filter(e => e.tick >= opts.startTick && e.tick < opts.endTick);
      eventsByOutput.set(moduleId, outputEvents);
      finalEvents.push(...outputEvents);
    } else {
      outputBuffers.set(moduleId, result);
    }
  }

  finalEvents.sort(compareEvents);
  if (finalEvents.length > MAX_EVENTS_PER_WINDOW) {
    finalEvents = finalEvents.slice(0, MAX_EVENTS_PER_WINDOW);
    truncated = true;
  }

  return { events: finalEvents, eventsByOutput, cableTraffic, moduleActivity, truncated };
}

// ── Serialization ───────────────────────────────────────────────────────────

export interface SerializedGraph {
  modules: ModuleInstance[];
  cables: Cable[];
}

export function serializeGraph(graph: RackGraph): SerializedGraph {
  return {
    modules: graph.modules.map(m => ({ ...m, settings: { ...m.settings } })),
    cables: graph.cables.map(c => ({ ...c })),
  };
}

/**
 * Deserialize with safe repair: unknown module types are dropped, cables to
 * missing modules/ports removed. Returns repair notes for non-destructive
 * user reporting.
 */
export function deserializeGraph(data: unknown): { graph: RackGraph; repairs: string[] } {
  const repairs: string[] = [];
  const graph: RackGraph = { modules: [], cables: [] };
  if (typeof data !== 'object' || data === null) {
    repairs.push('Rack data was not an object; starting empty.');
    return { graph, repairs };
  }
  const d = data as { modules?: unknown; cables?: unknown };
  const seenIds = new Set<string>();
  if (Array.isArray(d.modules)) {
    for (const raw of d.modules) {
      if (typeof raw !== 'object' || raw === null) continue;
      const m = raw as Partial<ModuleInstance>;
      if (typeof m.instanceId !== 'string' || typeof m.typeId !== 'string') {
        repairs.push('Dropped a malformed module record.');
        continue;
      }
      if (seenIds.has(m.instanceId)) {
        repairs.push(`Dropped duplicate module ${m.instanceId}.`);
        continue;
      }
      const def = getModuleType(m.typeId);
      if (!def) {
        repairs.push(`Dropped unknown module type "${m.typeId}".`);
        continue;
      }
      const { settings } = sanitizeSettings(def, (typeof m.settings === 'object' && m.settings !== null ? m.settings : {}) as ModuleSettings);
      seenIds.add(m.instanceId);
      const mRaw = m as Partial<ModuleInstance> & Record<string, unknown>;
      // Accept both current names and legacy v1 names (shelfIndex/slotX).
      const gridX = typeof mRaw.gridX === 'number' ? Math.max(0, Math.floor(mRaw.gridX))
        : typeof mRaw['slotX'] === 'number' ? Math.max(0, Math.floor(mRaw['slotX'] as number))
        : 0;
      const gridY = typeof mRaw.gridY === 'number' ? Math.max(0, Math.floor(mRaw.gridY))
        : typeof mRaw['shelfIndex'] === 'number' ? Math.max(0, Math.floor(mRaw['shelfIndex'] as number))
        : 0;
      graph.modules.push({
        instanceId: m.instanceId,
        typeId: m.typeId,
        gridX,
        gridY,
        settings,
      });
    }
  }
  const seenCables = new Set<string>();
  if (Array.isArray(d.cables)) {
    for (const raw of d.cables) {
      if (typeof raw !== 'object' || raw === null) continue;
      const c = raw as Partial<Cable>;
      if (typeof c.cableId !== 'string' || typeof c.fromModuleId !== 'string' || typeof c.toModuleId !== 'string'
        || typeof c.fromPortId !== 'string' || typeof c.toPortId !== 'string') {
        repairs.push('Dropped a malformed cable record.');
        continue;
      }
      if (seenCables.has(c.cableId)) { repairs.push(`Dropped duplicate cable ${c.cableId}.`); continue; }
      if (!seenIds.has(c.fromModuleId) || !seenIds.has(c.toModuleId)) {
        repairs.push(`Removed cable to a missing module.`);
        continue;
      }
      const fromDef = getModuleType(graph.modules.find(m => m.instanceId === c.fromModuleId)!.typeId)!;
      const toDef = getModuleType(graph.modules.find(m => m.instanceId === c.toModuleId)!.typeId)!;
      if (!findPort(fromDef, c.fromPortId) || !findPort(toDef, c.toPortId)) {
        repairs.push(`Removed cable to a missing port.`);
        continue;
      }
      seenCables.add(c.cableId);
      graph.cables.push({
        cableId: c.cableId,
        fromModuleId: c.fromModuleId,
        fromPortId: c.fromPortId,
        toModuleId: c.toModuleId,
        toPortId: c.toPortId,
      });
    }
  }
  return { graph, repairs };
}
