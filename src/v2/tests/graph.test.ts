/**
 * graph.test.ts — Signal graph validation and evaluation tests.
 */

import { test, assert, assertEq, assertClose } from './harness';
import { RackGraph, validateGraph, evaluatePatch, serializeGraph, deserializeGraph } from '../core/graph';
import { ModuleSettings } from '../core/modules';
import { TICKS_PER_MEASURE, QUARTER_TICKS } from '../core/ticks';
import { MAX_EVENTS_PER_WINDOW } from '../core/limits';

let nextId = 0;
function mod(typeId: string, settings: ModuleSettings = {}, gridY = 0, gridX = 0) {
  return { instanceId: `m${nextId++}-${typeId}`, typeId, gridY, gridX, settings };
}
function cable(from: { instanceId: string }, fromPort: string, to: { instanceId: string }, toPort: string) {
  return {
    cableId: `c${nextId++}`,
    fromModuleId: from.instanceId, fromPortId: fromPort,
    toModuleId: to.instanceId, toPortId: toPort,
  };
}

function starterGraph(): { graph: RackGraph; clock: ReturnType<typeof mod>; osc: ReturnType<typeof mod>; out: ReturnType<typeof mod> } {
  const clock = mod('clock', { subdivisionTicks: QUARTER_TICKS });
  const osc = mod('osc', { waveform: 'pulse', band: 'mid' });
  const out = mod('output');
  const graph: RackGraph = {
    modules: [clock, osc, out],
    cables: [cable(clock, 'out', osc, 'in'), cable(osc, 'out', out, 'in')],
  };
  return { graph, clock, osc, out };
}

const WINDOW = { startTick: 0, endTick: TICKS_PER_MEASURE * 2, seedBase: 12345 };

test('starter patch validates as valid', () => {
  const { graph } = starterGraph();
  const v = validateGraph(graph);
  assertEq(v.status, 'valid', 'starter graph should be valid');
});

test('clock generates quarter-note events across the window', () => {
  const { graph } = starterGraph();
  const r = evaluatePatch(graph, WINDOW);
  assertEq(r.events.length, 8, '2 measures of quarter notes = 8 events');
  assertEq(r.events.map(e => e.tick), [0, 48, 96, 144, 192, 240, 288, 336], 'event ticks on the quarter lattice');
  assert(r.events.every(e => e.hasVoice), 'all events voiced by oscillator');
  assert(r.events.every(e => e.waveform === 'pulse'), 'waveform stamped');
});

test('evaluation is deterministic (two runs identical)', () => {
  const { graph } = starterGraph();
  const a = evaluatePatch(graph, WINDOW);
  const b = evaluatePatch(graph, WINDOW);
  assertEq(a.events, b.events, 'same graph + seed → identical events');
});

test('different seed produces different event ids but same timing', () => {
  const { graph } = starterGraph();
  const a = evaluatePatch(graph, WINDOW);
  const b = evaluatePatch(graph, { ...WINDOW, seedBase: 99999 });
  assertEq(a.events.map(e => e.tick), b.events.map(e => e.tick), 'timing independent of seed');
  assert(a.events[0].id !== b.events[0].id, 'ids depend on seed');
});

test('cycle is detected and refuses evaluation', () => {
  const clock = mod('clock');
  const osc = mod('osc');
  const a = mod('connector');
  const b = mod('connector');
  const out = mod('output');
  const graph: RackGraph = {
    modules: [clock, osc, a, b, out],
    cables: [
      cable(clock, 'out', osc, 'in'),
      cable(osc, 'out', a, 'in'),
      cable(a, 'out', b, 'in'),
      cable(b, 'out', a, 'in'), // cycle a→b→a (fan-in collision aside, cycle wins)
    ],
  };
  const v = validateGraph(graph);
  assert(v.issues.some(i => i.code === 'cycle') || v.status === 'cycle' || v.status === 'incompatible', 'cycle or fan-in error reported');
});

test('true cycle through distinct ports is detected', () => {
  const clock = mod('clock');
  const osc = mod('osc');
  const mix = mod('mixer');
  const dly = mod('delay');
  const out = mod('output');
  const graph: RackGraph = {
    modules: [clock, osc, mix, dly, out],
    cables: [
      cable(clock, 'out', osc, 'in'),
      cable(osc, 'out', mix, 'inA'),
      cable(mix, 'out', dly, 'in'),
      cable(dly, 'out', mix, 'inB'), // feedback loop
    ],
  };
  const v = validateGraph(graph);
  assertEq(v.status, 'cycle', 'feedback loop must be rejected as cycle');
  const r = evaluatePatch(graph, WINDOW);
  assertEq(r.events.length, 0, 'cyclic graph refuses evaluation');
});

test('incompatible ports rejected (voice-only input from trigger source)', () => {
  const clock = mod('clock');
  const filt = mod('filter');
  const graph: RackGraph = {
    modules: [clock, filt, mod('output')],
    cables: [cable(clock, 'out', filt, 'in')],
  };
  const v = validateGraph(graph);
  assert(v.issues.some(i => i.code === 'incompatible-ports'), 'trigger→voice-only port rejected');
});

test('missing oscillator yields missing-starter', () => {
  const clock = mod('clock');
  const out = mod('output');
  const conn = mod('connector');
  const graph: RackGraph = {
    modules: [clock, conn, out],
    cables: [cable(clock, 'out', conn, 'in'), cable(conn, 'out', out, 'in')],
  };
  const v = validateGraph(graph);
  assertEq(v.status, 'missing-starter', 'clock→connector→out has no voice');
  const r = evaluatePatch(graph, WINDOW);
  assertEq(r.events.length, 0, 'unvoiced patch produces nothing');
});

test('no route to output reported', () => {
  const { graph } = starterGraph();
  graph.cables.pop(); // disconnect osc→out
  const v = validateGraph(graph);
  assertEq(v.status, 'no-output-route', 'disconnected output detected');
});

test('multiple outputs are valid and events retain output identity', () => {
  const { graph, osc, out } = starterGraph();
  const split = mod('splitter');
  const out2 = mod('output');
  graph.modules.push(split, out2);
  graph.cables = graph.cables.filter(c => c.fromModuleId !== osc.instanceId);
  graph.cables.push(cable(osc, 'out', split, 'in'));
  graph.cables.push(cable(split, 'outA', out, 'in'));
  graph.cables.push(cable(split, 'outB', out2, 'in'));
  const v = validateGraph(graph);
  assert(v.status === 'valid' || v.status === 'valid-unused', 'multiple patched outputs are valid');
  const r = evaluatePatch(graph, WINDOW);
  assertEq(r.eventsByOutput.size, 2, 'events grouped for both outputs');
  assertEq(r.eventsByOutput.get(out.instanceId)!.length, 8, 'first output receives events');
  assertEq(r.eventsByOutput.get(out2.instanceId)!.length, 8, 'second output receives events');
});

test('unpatched extra output is nonfatal', () => {
  const { graph } = starterGraph();
  graph.modules.push(mod('output'));
  const v = validateGraph(graph);
  assert(!v.issues.some(i => i.severity === 'error' && i.code === 'multiple-outputs'), 'extra output does not invalidate graph');
});

test('splitter divides amplitude across connected branches', () => {
  const clock = mod('clock', { subdivisionTicks: 192 });
  const osc = mod('osc');
  const split = mod('splitter');
  const mix = mod('mixer');
  const out = mod('output');
  const graph: RackGraph = {
    modules: [clock, osc, split, mix, out],
    cables: [
      cable(clock, 'out', osc, 'in'),
      cable(osc, 'out', split, 'in'),
      cable(split, 'outA', mix, 'inA'),
      cable(split, 'outB', mix, 'inB'),
      cable(mix, 'out', out, 'in'),
    ],
  };
  const v = validateGraph(graph);
  assertEq(v.status, 'valid', 'split+merge graph valid');
  const r = evaluatePatch(graph, { startTick: 0, endTick: 192, seedBase: 7 });
  assertEq(r.events.length, 2, 'one pulse splits into two merged events');
  assertClose(r.events[0].amplitude, 0.5, 1e-9, 'branch amplitude halved');
  assertClose(r.events[0].amplitude + r.events[1].amplitude, 1.0, 1e-9, 'no volume growth through split+merge');
});

test('splitter branch B overrides fire direction', () => {
  const clock = mod('clock', { subdivisionTicks: 192 });
  const osc = mod('osc');
  const split = mod('splitter', { dirB: 'south' });
  const mix = mod('mixer');
  const out = mod('output');
  const graph: RackGraph = {
    modules: [clock, osc, split, mix, out],
    cables: [
      cable(clock, 'out', osc, 'in'),
      cable(osc, 'out', split, 'in'),
      cable(split, 'outA', mix, 'inA'),
      cable(split, 'outB', mix, 'inB'),
      cable(mix, 'out', out, 'in'),
    ],
  };
  const r = evaluatePatch(graph, { startTick: 0, endTick: 192, seedBase: 7 });
  const dirs = r.events.map(e => e.directions[0]).sort();
  assertEq(dirs, ['north', 'south'], 'branch B re-aimed south');
});

test('delay produces bounded decaying echoes', () => {
  const clock = mod('clock', { subdivisionTicks: 192 });
  const osc = mod('osc');
  const dly = mod('delay', { delayTicks: 48, repeats: 3, decay: 0.5 });
  const out = mod('output');
  const graph: RackGraph = {
    modules: [clock, osc, dly, out],
    cables: [
      cable(clock, 'out', osc, 'in'),
      cable(osc, 'out', dly, 'in'),
      cable(dly, 'out', out, 'in'),
    ],
  };
  const r = evaluatePatch(graph, { startTick: 0, endTick: 192, seedBase: 7 });
  // original at 0 plus echoes at 48, 96, 144 (amp 0.5, 0.25, 0.125)
  assertEq(r.events.map(e => e.tick), [0, 48, 96, 144], 'echo timing quantized');
  assertClose(r.events[1].amplitude, 0.5, 1e-9, 'first echo half amplitude');
  assertClose(r.events[3].amplitude, 0.125, 1e-9, 'third echo decayed');
  assert(r.events[3].tags.includes('echo'), 'echoes tagged');
});

test('phase shifts events forward only', () => {
  const clock = mod('clock', { subdivisionTicks: 96 });
  const osc = mod('osc');
  const ph = mod('phase', { offsetTicks: 24 });
  const out = mod('output');
  const graph: RackGraph = {
    modules: [clock, osc, ph, out],
    cables: [
      cable(clock, 'out', osc, 'in'),
      cable(osc, 'out', ph, 'in'),
      cable(ph, 'out', out, 'in'),
    ],
  };
  const r = evaluatePatch(graph, { startTick: 0, endTick: 192, seedBase: 7 });
  assertEq(r.events.map(e => e.tick), [24, 120], 'half-note pulses shifted +1/8');
  assert(r.events.every(e => e.tick >= 0), 'no negative-time events');
});

test('router alternate mode distributes deterministically', () => {
  const clock = mod('clock', { subdivisionTicks: 48 });
  const osc = mod('osc');
  const router = mod('router', { mode: 'alternate' });
  const mix = mod('mixer');
  const out = mod('output');
  const graph: RackGraph = {
    modules: [clock, osc, router, mix, out],
    cables: [
      cable(clock, 'out', osc, 'in'),
      cable(osc, 'out', router, 'in'),
      cable(router, 'outA', mix, 'inA'),
      cable(router, 'outB', mix, 'inB'),
      cable(mix, 'out', out, 'in'),
    ],
  };
  const a = evaluatePatch(graph, { startTick: 0, endTick: 192, seedBase: 7 });
  const b = evaluatePatch(graph, { startTick: 0, endTick: 192, seedBase: 7 });
  assertEq(a.events, b.events, 'router deterministic');
  assertEq(a.events.length, 4, 'all events arrive (alternation splits, mixer merges)');
});

test('probability gate is deterministic per seed', () => {
  const clock = mod('clock', { subdivisionTicks: 12 });
  const osc = mod('osc');
  const prob = mod('probability', { chance: 0.5 });
  const out = mod('output');
  const graph: RackGraph = {
    modules: [clock, osc, prob, out],
    cables: [
      cable(clock, 'out', osc, 'in'),
      cable(osc, 'out', prob, 'in'),
      cable(prob, 'out', out, 'in'),
    ],
  };
  const a = evaluatePatch(graph, { startTick: 0, endTick: 384, seedBase: 42 });
  const b = evaluatePatch(graph, { startTick: 0, endTick: 384, seedBase: 42 });
  assertEq(a.events, b.events, 'probability deterministic for same seed');
  assert(a.events.length > 0 && a.events.length < 32, 'gate actually thins the stream');
});

test('amp clamps gain and total output is bounded', () => {
  const clock = mod('clock', { subdivisionTicks: 12 });
  const osc = mod('osc');
  const amp1 = mod('amp', { gain: 2.0 });
  const amp2 = mod('amp', { gain: 2.0 });
  const out = mod('output');
  const graph: RackGraph = {
    modules: [clock, osc, amp1, amp2, out],
    cables: [
      cable(clock, 'out', osc, 'in'),
      cable(osc, 'out', amp1, 'in'),
      cable(amp1, 'out', amp2, 'in'),
      cable(amp2, 'out', out, 'in'),
    ],
  };
  const r = evaluatePatch(graph, { startTick: 0, endTick: 192, seedBase: 7 });
  assert(r.events.every(e => e.amplitude <= 2.0), 'amplitude hard-clamped at 2.0');
  const v = validateGraph(graph);
  assert(v.issues.some(i => i.code === 'near-clipping'), 'clipping warning surfaced');
});

test('event explosion is hard-capped', () => {
  const clock = mod('clock', { subdivisionTicks: 12 });
  const osc = mod('osc');
  const d1 = mod('delay', { delayTicks: 12, repeats: 4, decay: 0.65 });
  const x1 = mod('clockdiv', { factor: 'x2' });
  const x2 = mod('clockdiv', { factor: 'x2' });
  const out = mod('output');
  const graph: RackGraph = {
    modules: [clock, osc, d1, x1, x2, out],
    cables: [
      cable(clock, 'out', osc, 'in'),
      cable(osc, 'out', d1, 'in'),
      cable(d1, 'out', x1, 'in'),
      cable(x1, 'out', x2, 'in'),
      cable(x2, 'out', out, 'in'),
    ],
  };
  const r = evaluatePatch(graph, { startTick: 0, endTick: TICKS_PER_MEASURE * 8, seedBase: 7 });
  assert(r.events.length <= MAX_EVENTS_PER_WINDOW, `output capped at ${MAX_EVENTS_PER_WINDOW}`);
});

test('route provenance records traversal order', () => {
  const { graph, clock, osc, out } = starterGraph();
  const r = evaluatePatch(graph, { startTick: 0, endTick: 48, seedBase: 7 });
  assertEq(r.events[0].route, [clock.instanceId, osc.instanceId, out.instanceId], 'route lists modules in order');
});

test('cable traffic captured for pulse animation', () => {
  const { graph } = starterGraph();
  const r = evaluatePatch(graph, { startTick: 0, endTick: 192, seedBase: 7 });
  assertEq(r.cableTraffic.size, 2, 'both cables carry traffic');
  for (const events of r.cableTraffic.values()) {
    assertEq(events.length, 4, 'one measure of quarter notes per cable');
  }
});

test('test-pulse injection flows through patch without clock generation', () => {
  const { graph } = starterGraph();
  const pulse = {
    id: 'test-pulse', tick: 0, durationTicks: 48, band: 'mid' as const,
    waveform: 'pulse' as const, hasVoice: false, amplitude: 1, gate: 0.5,
    attackTicks: 0, releaseTicks: 6, pitchOffset: 0,
    directions: ['north' as const], route: [], sourceModuleId: '', seed: 1, tags: ['test'],
  };
  const r = evaluatePatch(graph, { startTick: 0, endTick: 192, seedBase: 7, injectAtSources: [pulse] });
  assertEq(r.events.length, 1, 'single test pulse arrives at output');
  assert(r.events[0].tags.includes('test'), 'tag preserved');
});

test('serialization round-trips', () => {
  const { graph } = starterGraph();
  const ser = JSON.parse(JSON.stringify(serializeGraph(graph)));
  const { graph: restored, repairs } = deserializeGraph(ser);
  assertEq(repairs.length, 0, 'clean data needs no repairs');
  assertEq(restored.modules.length, graph.modules.length, 'modules survive');
  assertEq(restored.cables.length, graph.cables.length, 'cables survive');
  const a = evaluatePatch(graph, WINDOW);
  const b = evaluatePatch(restored, WINDOW);
  assertEq(a.events, b.events, 'restored graph evaluates identically');
});

test('deserialize drops unknown module types and repairs cables', () => {
  const { graph } = starterGraph();
  const ser = serializeGraph(graph) as unknown as { modules: Array<Record<string, unknown>>; cables: Array<Record<string, unknown>> };
  ser.modules.push({ instanceId: 'm-ghost', typeId: 'haunted-reverb', gridY: 0, gridX: 9, settings: {} });
  ser.cables.push({ cableId: 'c-ghost', fromModuleId: 'm-ghost', fromPortId: 'out', toModuleId: ser.modules[2].instanceId as string, toPortId: 'in' });
  const { graph: restored, repairs } = deserializeGraph(ser);
  assert(repairs.length >= 2, 'unknown module and its cable both reported');
  assertEq(restored.modules.length, 3, 'ghost module dropped');
  assertEq(restored.cables.length, 2, 'ghost cable dropped');
  const v = validateGraph(restored);
  assertEq(v.status, 'valid', 'repaired graph still valid');
});

test('sequencer + arp adjust pitch deterministically', () => {
  const clock = mod('clock', { subdivisionTicks: 48 });
  const osc = mod('osc');
  const seq = mod('sequencer', { gates: '10101010', pitches: '0,0,7,0,12,0,7,3' });
  const arp = mod('arp', { pattern: '0,4,7,12' });
  const out = mod('output');
  const graph: RackGraph = {
    modules: [clock, osc, seq, arp, out],
    cables: [
      cable(clock, 'out', osc, 'in'),
      cable(osc, 'out', seq, 'in'),
      cable(seq, 'out', arp, 'in'),
      cable(arp, 'out', out, 'in'),
    ],
  };
  const r = evaluatePatch(graph, { startTick: 0, endTick: 384, seedBase: 7 });
  assertEq(r.events.length, 4, 'half the 8 quarter pulses pass the 10101010 gate');
  const r2 = evaluatePatch(graph, { startTick: 0, endTick: 384, seedBase: 7 });
  assertEq(r.events.map(e => e.pitchOffset), r2.events.map(e => e.pitchOffset), 'pitch pattern deterministic');
});
