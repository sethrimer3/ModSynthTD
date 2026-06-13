/**
 * modules.ts — Data-driven module type registry.
 *
 * Every module type defines its ports, rack width, cost, blueprint unlock,
 * default settings, and a pure deterministic `process` transform over
 * SignalEvents. The graph evaluator calls `process` in topological order;
 * no module touches DOM, audio, or global state.
 */

import {
  SignalEvent, FrequencyBand, Waveform, SignalDirection,
  cloneEvent, clampAmplitude, compareEvents,
} from './events';
import { PortSpec, makeInput, makeOutput } from './ports';
import {
  MAX_DELAY_REPEATS, MAX_DELAY_DECAY, MIN_AMP_GAIN, MAX_AMP_GAIN,
  MIN_AMPLITUDE, MAX_PITCH_OFFSET, MAX_FANIN,
} from './limits';
import { seededFloat, combineSeeds, hashString } from './rng';
import { TICKS_PER_MEASURE } from './ticks';

// ── Settings model ──────────────────────────────────────────────────────────

export type SettingValue = number | string | boolean;
export type ModuleSettings = Record<string, SettingValue>;

export interface SettingSpec {
  key: string;
  label: string;
  type: 'enum' | 'int' | 'float' | 'bool';
  /** For enums: allowed values (stringified for UI). */
  options?: SettingValue[];
  optionLabels?: string[];
  min?: number;
  max?: number;
  /** True if this knob may be adjusted during an active wave. */
  liveSafe: boolean;
}

export interface ProcessCtx {
  /** Inclusive start / exclusive end of the evaluation window, integer ticks. */
  windowStartTick: number;
  windowEndTick: number;
  /** Stable seed for this evaluation (world, wave, run). */
  seedBase: number;
  moduleId: string;
  /** Output ports of this module that have at least one cable attached. */
  connectedOutputs: ReadonlySet<string>;
}

export type PortEvents = Record<string, SignalEvent[]>;
export type ProcessFn = (ctx: ProcessCtx, inputs: PortEvents, settings: ModuleSettings) => PortEvents;

export interface ModuleTypeDef {
  typeId: string;
  name: string;
  /** Faceplate label. */
  shortName: string;
  color: string;
  /** Width in rack grid units (1 unit ≈ one narrow eurorack panel). */
  widthUnits: number;
  /** Purchase cost in Resonance. Starters cost 0 and are non-sellable. */
  cost: number;
  isStarter: boolean;
  shopBuyable?: boolean;
  /** World id whose completion unlocks this blueprint; null = always available. */
  unlockAfterWorld: string | null;
  tooltip: string;
  kind: 'source' | 'transform' | 'sink';
  inputs: PortSpec[];
  outputs: PortSpec[];
  defaultSettings: ModuleSettings;
  settingsSpec: SettingSpec[];
  process: ProcessFn;
}

// ── Settings helpers ────────────────────────────────────────────────────────

function num(settings: ModuleSettings, key: string, fallback: number, min?: number, max?: number): number {
  const v = settings[key];
  let n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  if (min !== undefined) n = Math.max(min, n);
  if (max !== undefined) n = Math.min(max, n);
  return n;
}

function str(settings: ModuleSettings, key: string, fallback: string, options?: string[]): string {
  const v = settings[key];
  const s = typeof v === 'string' ? v : fallback;
  if (options && !options.includes(s)) return fallback;
  return s;
}

function passRoute(e: SignalEvent, moduleId: string): SignalEvent {
  const c = cloneEvent(e);
  c.route.push(moduleId);
  return c;
}

function sortEvents(events: SignalEvent[]): SignalEvent[] {
  return events.sort(compareEvents);
}

/** Deterministic per-module-instance salt. */
function moduleSalt(ctx: ProcessCtx): number {
  return combineSeeds(ctx.seedBase, hashString(ctx.moduleId));
}

const BANDS: FrequencyBand[] = ['low', 'mid', 'high'];
const WAVEFORMS: Waveform[] = ['pulse', 'sine', 'square', 'saw', 'triangle'];
const DIRECTIONS: SignalDirection[] = ['north', 'south', 'east', 'west'];

// ── Catalog ─────────────────────────────────────────────────────────────────

const CLOCK: ModuleTypeDef = {
  typeId: 'clock',
  name: 'Clock',
  shortName: 'CLOCK',
  color: '#33dd88',
  widthUnits: 2,
  cost: 0,
  isStarter: true,
  unlockAfterWorld: null,
  tooltip: 'Generates timed trigger pulses at a musical subdivision. The heartbeat of every patch.',
  kind: 'source',
  inputs: [],
  outputs: [makeOutput('out', 'trigger', 'TRIG', 'Trigger pulses at the selected subdivision.')],
  defaultSettings: { subdivisionTicks: 48, phaseTicks: 0, gate: 0.5 },
  settingsSpec: [
    { key: 'subdivisionTicks', label: 'RATE', type: 'enum', options: [12, 24, 48, 96, 192], optionLabels: ['1/16', '1/8', '1/4', '1/2', '1/1'], liveSafe: true },
    { key: 'phaseTicks', label: 'PHASE', type: 'int', min: 0, max: 191, liveSafe: true },
    { key: 'gate', label: 'GATE', type: 'float', min: 0.1, max: 1, liveSafe: true },
  ],
  process: (ctx, _inputs, settings) => {
    const sub = num(settings, 'subdivisionTicks', 48, 1, TICKS_PER_MEASURE);
    const phase = Math.floor(num(settings, 'phaseTicks', 0, 0, TICKS_PER_MEASURE - 1));
    const gate = num(settings, 'gate', 0.5, 0.1, 1);
    const out: SignalEvent[] = [];
    // First trigger at or after windowStart on the (phase + k*sub) lattice.
    const first = Math.ceil((ctx.windowStartTick - phase) / sub) * sub + phase;
    const salt = moduleSalt(ctx);
    let n = 0;
    for (let t = Math.max(phase, first); t < ctx.windowEndTick; t += sub) {
      out.push({
        id: `${ctx.seedBase.toString(36)}:${ctx.moduleId}:${t}:0`,
        tick: t,
        durationTicks: sub,
        band: 'mid',
        waveform: 'pulse',
        hasVoice: false,
        amplitude: 1,
        gate,
        attackTicks: 0,
        releaseTicks: 6,
        pitchOffset: 0,
        directions: ['north'],
        route: [ctx.moduleId],
        sourceModuleId: ctx.moduleId,
        seed: combineSeeds(salt, t),
        tags: [],
      });
      n++;
    }
    return { out };
  },
};

const OSC: ModuleTypeDef = {
  typeId: 'osc',
  name: 'Oscillator',
  shortName: 'OSC',
  color: '#cc44ff',
  widthUnits: 3,
  cost: 0,
  isStarter: true,
  unlockAfterWorld: null,
  tooltip: 'Gives trigger pulses a voice: waveform shapes the projectile and the sound; band sets its resonance.',
  kind: 'transform',
  inputs: [makeInput('in', 'either', 'IN', 'Trigger or voice signal to (re)shape.')],
  outputs: [makeOutput('out', 'voice', 'OUT', 'Voiced signal.')],
  defaultSettings: { waveform: 'pulse', band: 'mid' },
  settingsSpec: [
    { key: 'waveform', label: 'WAVE', type: 'enum', options: ['pulse', 'sine', 'square', 'saw', 'triangle'], liveSafe: true },
    { key: 'band', label: 'BAND', type: 'enum', options: ['low', 'mid', 'high'], optionLabels: ['LO', 'MI', 'HI'], liveSafe: true },
  ],
  process: (ctx, inputs, settings) => {
    const wf = str(settings, 'waveform', 'pulse', WAVEFORMS as unknown as string[]) as Waveform;
    const band = str(settings, 'band', 'mid', BANDS as unknown as string[]) as FrequencyBand;
    const out = (inputs['in'] ?? []).map(e => {
      const c = passRoute(e, ctx.moduleId);
      c.waveform = wf;
      c.band = band;
      c.hasVoice = true;
      return c;
    });
    return { out: sortEvents(out) };
  },
};

const OUTPUT: ModuleTypeDef = {
  typeId: 'output',
  name: 'Main Output',
  shortName: 'OUT',
  color: '#ffcc00',
  widthUnits: 3,
  cost: 45,
  isStarter: true,
  shopBuyable: true,
  unlockAfterWorld: null,
  tooltip: 'Owns one emitter tower. Routed events fire from its placed tower and can drive the audible synth.',
  kind: 'sink',
  inputs: [makeInput('in', 'voice', 'IN', 'Final voiced signal. Needs an oscillator somewhere upstream.')],
  outputs: [],
  defaultSettings: { synthOn: false, synthVolume: 0.5 },
  settingsSpec: [
    { key: 'synthOn', label: 'SYNTH', type: 'bool', liveSafe: true },
    { key: 'synthVolume', label: 'VOL', type: 'float', min: 0, max: 1, liveSafe: true },
  ],
  process: (ctx, inputs) => {
    return { _final: sortEvents((inputs['in'] ?? []).map(e => passRoute(e, ctx.moduleId))) };
  },
};

const CONNECTOR: ModuleTypeDef = {
  typeId: 'connector',
  name: 'Connector',
  shortName: 'LINK',
  color: '#88aacc',
  widthUnits: 1,
  cost: 8,
  isStarter: false,
  unlockAfterWorld: 'w60',
  tooltip: 'Passive patch-through. Organizes physical cable routes without changing the signal.',
  kind: 'transform',
  inputs: [makeInput('in', 'either', 'IN', 'Any signal.')],
  outputs: [makeOutput('out', 'either', 'OUT', 'The same signal, untouched.')],
  defaultSettings: {},
  settingsSpec: [],
  process: (ctx, inputs) => ({ out: sortEvents((inputs['in'] ?? []).map(e => passRoute(e, ctx.moduleId))) }),
};

const SPLITTER: ModuleTypeDef = {
  typeId: 'splitter',
  name: 'Splitter',
  shortName: 'SPLIT',
  color: '#ff8800',
  widthUnits: 2,
  cost: 25,
  isStarter: false,
  unlockAfterWorld: 'w80',
  tooltip: 'Copies one signal onto several branches. Amplitude divides across connected branches; branches B/C can re-aim fire direction.',
  kind: 'transform',
  inputs: [makeInput('in', 'either', 'IN', 'Signal to split.')],
  outputs: [
    makeOutput('outA', 'either', 'A', 'Branch A (keeps direction).'),
    makeOutput('outB', 'either', 'B', 'Branch B.'),
    makeOutput('outC', 'either', 'C', 'Branch C.'),
  ],
  defaultSettings: { dirB: 'south', dirC: 'east' },
  settingsSpec: [
    { key: 'dirB', label: 'B DIR', type: 'enum', options: ['keep', 'north', 'south', 'east', 'west'], liveSafe: true },
    { key: 'dirC', label: 'C DIR', type: 'enum', options: ['keep', 'north', 'south', 'east', 'west'], liveSafe: true },
  ],
  process: (ctx, inputs, settings) => {
    const events = inputs['in'] ?? [];
    const branchIds = ['outA', 'outB', 'outC'].filter(p => ctx.connectedOutputs.has(p));
    const active = Math.max(1, branchIds.length);
    const result: PortEvents = { outA: [], outB: [], outC: [] };
    for (const port of branchIds) {
      const dirKey = port === 'outB' ? str(settings, 'dirB', 'south') : port === 'outC' ? str(settings, 'dirC', 'east') : 'keep';
      result[port] = sortEvents(events.map((e, i) => {
        const c = passRoute(e, ctx.moduleId);
        c.id = `${e.id}>${port}`;
        c.amplitude = clampAmplitude(c.amplitude / active);
        if (dirKey !== 'keep' && DIRECTIONS.includes(dirKey as SignalDirection)) {
          c.directions = [dirKey as SignalDirection];
        }
        c.seed = combineSeeds(e.seed, hashString(port), i);
        return c;
      }));
    }
    return result;
  },
};

const MIXER: ModuleTypeDef = {
  typeId: 'mixer',
  name: 'Mixer',
  shortName: 'MIX',
  color: '#00ddcc',
  widthUnits: 2,
  cost: 30,
  isStarter: false,
  unlockAfterWorld: 'w120',
  tooltip: 'Recombines up to four signals. Simultaneous events are kept; total loudness per instant is safely normalized.',
  kind: 'transform',
  inputs: [
    makeInput('inA', 'either', 'A', 'Input A.', { required: true }),
    makeInput('inB', 'either', 'B', 'Input B.', { required: false }),
    makeInput('inC', 'either', 'C', 'Input C.', { required: false }),
    makeInput('inD', 'either', 'D', 'Input D.', { required: false }),
  ],
  outputs: [makeOutput('out', 'either', 'OUT', 'Combined signal.')],
  defaultSettings: {},
  settingsSpec: [],
  process: (ctx, inputs) => {
    const all: SignalEvent[] = [];
    for (const port of ['inA', 'inB', 'inC', 'inD']) {
      for (const e of inputs[port] ?? []) all.push(passRoute(e, ctx.moduleId));
    }
    sortEvents(all);
    // Per-tick safe normalization: combined amplitude at one instant ≤ 1.2.
    const MIX_CAP = 1.2;
    let i = 0;
    while (i < all.length) {
      let j = i;
      let sum = 0;
      while (j < all.length && all[j].tick === all[i].tick) { sum += all[j].amplitude; j++; }
      if (sum > MIX_CAP) {
        const scale = MIX_CAP / sum;
        for (let k = i; k < j; k++) all[k].amplitude = clampAmplitude(all[k].amplitude * scale);
      }
      i = j;
    }
    return { out: all };
  },
};

const ROUTER: ModuleTypeDef = {
  typeId: 'router',
  name: 'Router',
  shortName: 'ROUTE',
  color: '#ff33aa',
  widthUnits: 2,
  cost: 40,
  isStarter: false,
  unlockAfterWorld: 'w160',
  tooltip: 'Sends each event down exactly one branch: fixed, alternating, per-measure, or a seeded deterministic pattern.',
  kind: 'transform',
  inputs: [makeInput('in', 'either', 'IN', 'Signal to route.')],
  outputs: [
    makeOutput('outA', 'either', 'A', 'Route A.'),
    makeOutput('outB', 'either', 'B', 'Route B.'),
    makeOutput('outC', 'either', 'C', 'Route C.'),
  ],
  defaultSettings: { mode: 'alternate', fixedRoute: 'A' },
  settingsSpec: [
    { key: 'mode', label: 'MODE', type: 'enum', options: ['fixed', 'alternate', 'measure', 'pattern'], liveSafe: true },
    { key: 'fixedRoute', label: 'ROUTE', type: 'enum', options: ['A', 'B', 'C'], liveSafe: true },
  ],
  process: (ctx, inputs, settings) => {
    const events = sortEvents((inputs['in'] ?? []).slice());
    const mode = str(settings, 'mode', 'alternate', ['fixed', 'alternate', 'measure', 'pattern']);
    const connected = ['outA', 'outB', 'outC'].filter(p => ctx.connectedOutputs.has(p));
    const result: PortEvents = { outA: [], outB: [], outC: [] };
    if (connected.length === 0) return result;
    const salt = moduleSalt(ctx);
    events.forEach((e, idx) => {
      let port: string;
      if (mode === 'fixed') {
        const fixed = 'out' + str(settings, 'fixedRoute', 'A', ['A', 'B', 'C']);
        port = connected.includes(fixed) ? fixed : connected[0];
      } else if (mode === 'measure') {
        port = connected[Math.floor(e.tick / TICKS_PER_MEASURE) % connected.length];
      } else if (mode === 'pattern') {
        port = connected[Math.floor(seededFloat(combineSeeds(salt, e.seed), idx) * connected.length) % connected.length];
      } else {
        port = connected[idx % connected.length];
      }
      result[port].push(passRoute(e, ctx.moduleId));
    });
    return result;
  },
};

const AMP: ModuleTypeDef = {
  typeId: 'amp',
  name: 'Attenuator / Amplifier',
  shortName: 'AMP',
  color: '#88ff22',
  widthUnits: 1,
  cost: 15,
  isStarter: false,
  unlockAfterWorld: 'w40',
  tooltip: 'Scales signal strength. Clamped to safe limits — projectile damage and synth gain follow it.',
  kind: 'transform',
  inputs: [makeInput('in', 'either', 'IN', 'Signal to scale.')],
  outputs: [makeOutput('out', 'either', 'OUT', 'Scaled signal.')],
  defaultSettings: { gain: 1.0 },
  settingsSpec: [
    { key: 'gain', label: 'GAIN', type: 'float', min: MIN_AMP_GAIN, max: MAX_AMP_GAIN, liveSafe: true },
  ],
  process: (ctx, inputs, settings) => {
    const gain = num(settings, 'gain', 1, MIN_AMP_GAIN, MAX_AMP_GAIN);
    const out: SignalEvent[] = [];
    for (const e of inputs['in'] ?? []) {
      const c = passRoute(e, ctx.moduleId);
      c.amplitude = clampAmplitude(c.amplitude * gain);
      if (c.amplitude >= MIN_AMPLITUDE) out.push(c);
    }
    return { out: sortEvents(out) };
  },
};

const DELAY: ModuleTypeDef = {
  typeId: 'delay',
  name: 'Delay',
  shortName: 'DELAY',
  color: '#44aaff',
  widthUnits: 2,
  cost: 35,
  isStarter: false,
  unlockAfterWorld: 'w100',
  tooltip: 'Rhythmically quantized echoes. Each repeat lands a fixed musical interval later, quieter each time.',
  kind: 'transform',
  inputs: [makeInput('in', 'either', 'IN', 'Signal to echo.')],
  outputs: [makeOutput('out', 'either', 'OUT', 'Original plus echoes.')],
  defaultSettings: { delayTicks: 48, repeats: 1, decay: 0.5 },
  settingsSpec: [
    { key: 'delayTicks', label: 'TIME', type: 'enum', options: [12, 24, 48, 96], optionLabels: ['1/16', '1/8', '1/4', '1/2'], liveSafe: true },
    { key: 'repeats', label: 'REPEAT', type: 'int', min: 1, max: MAX_DELAY_REPEATS, liveSafe: true },
    { key: 'decay', label: 'DECAY', type: 'float', min: 0.3, max: MAX_DELAY_DECAY, liveSafe: true },
  ],
  process: (ctx, inputs, settings) => {
    const delay = Math.floor(num(settings, 'delayTicks', 48, 6, 192));
    const repeats = Math.floor(num(settings, 'repeats', 1, 1, MAX_DELAY_REPEATS));
    const decay = num(settings, 'decay', 0.5, 0.1, MAX_DELAY_DECAY);
    const out: SignalEvent[] = [];
    for (const e of inputs['in'] ?? []) {
      out.push(passRoute(e, ctx.moduleId));
      let amp = e.amplitude;
      for (let k = 1; k <= repeats; k++) {
        amp *= decay;
        if (amp < MIN_AMPLITUDE) break;
        const echo = passRoute(e, ctx.moduleId);
        echo.id = `${e.id}~${k}`;
        echo.tick = e.tick + delay * k;
        echo.amplitude = clampAmplitude(amp);
        echo.seed = combineSeeds(e.seed, k);
        echo.tags = [...echo.tags, 'echo'];
        out.push(echo);
      }
    }
    return { out: sortEvents(out) };
  },
};

const PHASE: ModuleTypeDef = {
  typeId: 'phase',
  name: 'Phase Offset',
  shortName: 'PHASE',
  color: '#aa55ff',
  widthUnits: 1,
  cost: 20,
  isStarter: false,
  unlockAfterWorld: 'w100',
  tooltip: 'Shifts every event later by a fixed subdivision. Events always move forward in time — never backward.',
  kind: 'transform',
  inputs: [makeInput('in', 'either', 'IN', 'Signal to shift.')],
  outputs: [makeOutput('out', 'either', 'OUT', 'Time-shifted signal.')],
  defaultSettings: { offsetTicks: 24 },
  settingsSpec: [
    { key: 'offsetTicks', label: 'SHIFT', type: 'enum', options: [6, 12, 24, 48, 96], optionLabels: ['1/32', '1/16', '1/8', '1/4', '1/2'], liveSafe: true },
  ],
  process: (ctx, inputs, settings) => {
    const offset = Math.floor(num(settings, 'offsetTicks', 24, 0, 191));
    const out = (inputs['in'] ?? []).map(e => {
      const c = passRoute(e, ctx.moduleId);
      c.tick = e.tick + offset; // forward-only shift: no negative-time events
      return c;
    });
    return { out: sortEvents(out) };
  },
};

const FILTER: ModuleTypeDef = {
  typeId: 'filter',
  name: 'Band Filter',
  shortName: 'FILT',
  color: '#ffaa44',
  widthUnits: 2,
  cost: 40,
  isStarter: false,
  unlockAfterWorld: 'w140',
  tooltip: 'Passes its selected resonance band. Other bands are softened — or silenced in hard mode.',
  kind: 'transform',
  inputs: [makeInput('in', 'voice', 'IN', 'Voiced signal to filter.')],
  outputs: [makeOutput('out', 'voice', 'OUT', 'Filtered signal.')],
  defaultSettings: { band: 'mid', strength: 'soft' },
  settingsSpec: [
    { key: 'band', label: 'BAND', type: 'enum', options: ['low', 'mid', 'high'], optionLabels: ['LO', 'MI', 'HI'], liveSafe: true },
    { key: 'strength', label: 'SLOPE', type: 'enum', options: ['soft', 'hard'], liveSafe: true },
  ],
  process: (ctx, inputs, settings) => {
    const band = str(settings, 'band', 'mid', BANDS as unknown as string[]) as FrequencyBand;
    const hard = str(settings, 'strength', 'soft', ['soft', 'hard']) === 'hard';
    const out: SignalEvent[] = [];
    for (const e of inputs['in'] ?? []) {
      if (e.band === band) {
        out.push(passRoute(e, ctx.moduleId));
      } else if (!hard) {
        const c = passRoute(e, ctx.moduleId);
        c.amplitude = clampAmplitude(c.amplitude * 0.5);
        if (c.amplitude >= MIN_AMPLITUDE) out.push(c);
      }
    }
    return { out: sortEvents(out) };
  },
};

const ENVELOPE: ModuleTypeDef = {
  typeId: 'envelope',
  name: 'Envelope',
  shortName: 'ENV',
  color: '#ff6688',
  widthUnits: 2,
  cost: 35,
  isStarter: false,
  unlockAfterWorld: 'w140',
  tooltip: 'Shapes attack and release of every voice — longer projectile presence, softer or snappier sound.',
  kind: 'transform',
  inputs: [makeInput('in', 'voice', 'IN', 'Voiced signal to shape.')],
  outputs: [makeOutput('out', 'voice', 'OUT', 'Shaped signal.')],
  defaultSettings: { attackTicks: 0, releaseTicks: 12 },
  settingsSpec: [
    { key: 'attackTicks', label: 'ATK', type: 'enum', options: [0, 6, 12, 24], optionLabels: ['0', '1/32', '1/16', '1/8'], liveSafe: true },
    { key: 'releaseTicks', label: 'REL', type: 'enum', options: [6, 12, 24, 48], optionLabels: ['1/32', '1/16', '1/8', '1/4'], liveSafe: true },
  ],
  process: (ctx, inputs, settings) => {
    const atk = Math.floor(num(settings, 'attackTicks', 0, 0, 48));
    const rel = Math.floor(num(settings, 'releaseTicks', 12, 0, 96));
    const out = (inputs['in'] ?? []).map(e => {
      const c = passRoute(e, ctx.moduleId);
      c.attackTicks = atk;
      c.releaseTicks = rel;
      c.gate = Math.min(1, c.gate + rel / Math.max(1, c.durationTicks) * 0.5);
      return c;
    });
    return { out: sortEvents(out) };
  },
};

const CLOCKDIV: ModuleTypeDef = {
  typeId: 'clockdiv',
  name: 'Clock Divider',
  shortName: 'DIV',
  color: '#66ddff',
  widthUnits: 1,
  cost: 30,
  isStarter: false,
  unlockAfterWorld: 'w140',
  tooltip: 'Thins a stream to every Nth event, or doubles it. Division keeps the downbeat.',
  kind: 'transform',
  inputs: [makeInput('in', 'either', 'IN', 'Stream to divide or multiply.')],
  outputs: [makeOutput('out', 'either', 'OUT', 'Re-clocked stream.')],
  defaultSettings: { factor: '/2' },
  settingsSpec: [
    { key: 'factor', label: 'FACTOR', type: 'enum', options: ['/4', '/3', '/2', 'x2'], liveSafe: true },
  ],
  process: (ctx, inputs, settings) => {
    const factor = str(settings, 'factor', '/2', ['/4', '/3', '/2', 'x2']);
    const events = sortEvents((inputs['in'] ?? []).slice());
    const out: SignalEvent[] = [];
    if (factor === 'x2') {
      for (const e of events) {
        const a = passRoute(e, ctx.moduleId);
        a.durationTicks = Math.max(1, Math.floor(e.durationTicks / 2));
        out.push(a);
        const b = passRoute(e, ctx.moduleId);
        b.id = `${e.id}*2`;
        b.tick = e.tick + Math.max(1, Math.floor(e.durationTicks / 2));
        b.durationTicks = a.durationTicks;
        b.seed = combineSeeds(e.seed, 2);
        out.push(b);
      }
    } else {
      const n = factor === '/4' ? 4 : factor === '/3' ? 3 : 2;
      events.forEach((e, idx) => {
        if (idx % n === 0) out.push(passRoute(e, ctx.moduleId));
      });
    }
    return { out: sortEvents(out) };
  },
};

const SEQUENCER: ModuleTypeDef = {
  typeId: 'sequencer',
  name: 'Sequencer',
  shortName: 'SEQ',
  color: '#ffee44',
  widthUnits: 3,
  cost: 60,
  isStarter: false,
  unlockAfterWorld: 'w160',
  tooltip: '8-step gate + pitch sequence. Each incoming event advances one step; off steps are muted.',
  kind: 'transform',
  inputs: [makeInput('in', 'either', 'IN', 'Stream to sequence.')],
  outputs: [makeOutput('out', 'either', 'OUT', 'Sequenced stream.')],
  defaultSettings: { gates: '11111111', pitches: '0,0,7,0,12,0,7,3' },
  settingsSpec: [
    { key: 'gates', label: 'STEPS', type: 'enum', options: ['11111111', '10101010', '11011010', '10110110', '11101110'], liveSafe: true },
    { key: 'pitches', label: 'PITCH', type: 'enum', options: ['0,0,0,0,0,0,0,0', '0,0,7,0,12,0,7,3', '0,4,7,12,0,4,7,12', '0,12,0,12,7,19,7,19', '0,3,7,10,12,10,7,3'], liveSafe: true },
  ],
  process: (ctx, inputs, settings) => {
    const gates = str(settings, 'gates', '11111111');
    const pitches = str(settings, 'pitches', '0,0,0,0,0,0,0,0').split(',').map(p => {
      const v = parseInt(p.trim(), 10);
      return Number.isFinite(v) ? Math.max(-MAX_PITCH_OFFSET, Math.min(MAX_PITCH_OFFSET, v)) : 0;
    });
    const events = sortEvents((inputs['in'] ?? []).slice());
    const out: SignalEvent[] = [];
    events.forEach((e, idx) => {
      const step = idx % Math.max(1, gates.length);
      if (gates[step] !== '1') return;
      const c = passRoute(e, ctx.moduleId);
      c.pitchOffset = Math.max(-MAX_PITCH_OFFSET, Math.min(MAX_PITCH_OFFSET, c.pitchOffset + (pitches[step % pitches.length] ?? 0)));
      out.push(c);
    });
    return { out };
  },
};

const ARP: ModuleTypeDef = {
  typeId: 'arp',
  name: 'Arpeggiator',
  shortName: 'ARP',
  color: '#44ffaa',
  widthUnits: 2,
  cost: 50,
  isStarter: false,
  unlockAfterWorld: 'w160',
  tooltip: 'Cycles a pitch pattern across incoming voices — broken chords in time.',
  kind: 'transform',
  inputs: [makeInput('in', 'voice', 'IN', 'Voiced stream to arpeggiate.')],
  outputs: [makeOutput('out', 'voice', 'OUT', 'Arpeggiated stream.')],
  defaultSettings: { pattern: '0,4,7,12' },
  settingsSpec: [
    { key: 'pattern', label: 'CHORD', type: 'enum', options: ['0,4,7,12', '0,3,7,12', '0,5,7,12', '12,7,4,0', '0,7,12,19'], liveSafe: true },
  ],
  process: (ctx, inputs, settings) => {
    const pattern = str(settings, 'pattern', '0,4,7,12').split(',').map(p => {
      const v = parseInt(p.trim(), 10);
      return Number.isFinite(v) ? Math.max(-MAX_PITCH_OFFSET, Math.min(MAX_PITCH_OFFSET, v)) : 0;
    });
    const events = sortEvents((inputs['in'] ?? []).slice());
    const out = events.map((e, idx) => {
      const c = passRoute(e, ctx.moduleId);
      c.pitchOffset = Math.max(-MAX_PITCH_OFFSET, Math.min(MAX_PITCH_OFFSET, c.pitchOffset + pattern[idx % pattern.length]));
      return c;
    });
    return { out };
  },
};

const PROBABILITY: ModuleTypeDef = {
  typeId: 'probability',
  name: 'Probability Gate',
  shortName: 'PROB',
  color: '#dd88ff',
  widthUnits: 1,
  cost: 30,
  isStarter: false,
  unlockAfterWorld: 'w160',
  tooltip: 'Deterministically seeded chance gate — the same wave always rolls the same pattern.',
  kind: 'transform',
  inputs: [makeInput('in', 'either', 'IN', 'Stream to thin.')],
  outputs: [makeOutput('out', 'either', 'OUT', 'Surviving events.')],
  defaultSettings: { chance: 0.75 },
  settingsSpec: [
    { key: 'chance', label: 'CHANCE', type: 'enum', options: [0.25, 0.5, 0.75], optionLabels: ['25%', '50%', '75%'], liveSafe: true },
  ],
  process: (ctx, inputs, settings) => {
    const chance = num(settings, 'chance', 0.75, 0.05, 1);
    const salt = moduleSalt(ctx);
    const out: SignalEvent[] = [];
    for (const e of inputs['in'] ?? []) {
      if (seededFloat(combineSeeds(salt, e.seed), e.tick) < chance) {
        out.push(passRoute(e, ctx.moduleId));
      }
    }
    return { out: sortEvents(out) };
  },
};

const RESONATOR: ModuleTypeDef = {
  typeId: 'resonator',
  name: 'Resonance Converter',
  shortName: 'RESO',
  color: '#ff6633',
  widthUnits: 1,
  cost: 20,
  isStarter: false,
  unlockAfterWorld: 'w80',
  tooltip: 'Re-tunes passing voices to a different resonance band — or cycles bands per event.',
  kind: 'transform',
  inputs: [makeInput('in', 'voice', 'IN', 'Voiced signal to re-tune.')],
  outputs: [makeOutput('out', 'voice', 'OUT', 'Re-tuned signal.')],
  defaultSettings: { band: 'low' },
  settingsSpec: [
    { key: 'band', label: 'BAND', type: 'enum', options: ['low', 'mid', 'high', 'cycle'], optionLabels: ['LO', 'MI', 'HI', 'CYC'], liveSafe: true },
  ],
  process: (ctx, inputs, settings) => {
    const mode = str(settings, 'band', 'low', ['low', 'mid', 'high', 'cycle']);
    const events = sortEvents((inputs['in'] ?? []).slice());
    const out = events.map((e, idx) => {
      const c = passRoute(e, ctx.moduleId);
      c.band = mode === 'cycle' ? BANDS[idx % 3] : (mode as FrequencyBand);
      return c;
    });
    return { out };
  },
};

// ── Registry ────────────────────────────────────────────────────────────────

export const MODULE_TYPES: ReadonlyArray<ModuleTypeDef> = [
  CLOCK, OSC, OUTPUT,
  CONNECTOR, SPLITTER, MIXER, ROUTER, AMP, DELAY, PHASE,
  FILTER, ENVELOPE, CLOCKDIV, SEQUENCER, ARP, PROBABILITY, RESONATOR,
];

const REGISTRY = new Map<string, ModuleTypeDef>(MODULE_TYPES.map(m => [m.typeId, m]));

export function getModuleType(typeId: string): ModuleTypeDef | undefined {
  return REGISTRY.get(typeId);
}

export function findPort(def: ModuleTypeDef, portId: string): PortSpec | undefined {
  return def.inputs.find(p => p.portId === portId) ?? def.outputs.find(p => p.portId === portId);
}

/** Static per-module event multiplication factor for explosion estimation. */
export function eventMultiplier(def: ModuleTypeDef, settings: ModuleSettings): number {
  if (def.typeId === 'delay') {
    return 1 + Math.floor(num(settings, 'repeats', 1, 1, MAX_DELAY_REPEATS));
  }
  if (def.typeId === 'clockdiv') {
    return str(settings, 'factor', '/2') === 'x2' ? 2 : 1;
  }
  if (def.typeId === 'splitter') return Math.min(3, MAX_FANIN);
  return 1;
}

/** Validate settings object against the spec; returns repaired copy + issue strings. */
export function sanitizeSettings(def: ModuleTypeDef, settings: ModuleSettings): { settings: ModuleSettings; issues: string[] } {
  const issues: string[] = [];
  const repaired: ModuleSettings = { ...def.defaultSettings };
  for (const spec of def.settingsSpec) {
    const v = settings[spec.key];
    if (v === undefined) continue;
    if (spec.type === 'bool') {
      if (typeof v === 'boolean') repaired[spec.key] = v;
      else issues.push(`${def.typeId}.${spec.key}: expected bool`);
    } else if (spec.type === 'enum') {
      if (spec.options && spec.options.some(o => o === v)) repaired[spec.key] = v;
      else issues.push(`${def.typeId}.${spec.key}: invalid option ${String(v)}`);
    } else {
      if (typeof v === 'number' && Number.isFinite(v)) {
        let n = v;
        if (spec.min !== undefined) n = Math.max(spec.min, n);
        if (spec.max !== undefined) n = Math.min(spec.max, n);
        if (spec.type === 'int') n = Math.round(n);
        repaired[spec.key] = n;
        if (n !== v) issues.push(`${def.typeId}.${spec.key}: clamped ${v} → ${n}`);
      } else {
        issues.push(`${def.typeId}.${spec.key}: expected number`);
      }
    }
  }
  return { settings: repaired, issues };
}
