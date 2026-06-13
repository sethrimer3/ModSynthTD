/**
 * audio-engine.ts — Web Audio synthesis driven by canonical SignalEvents.
 *
 * Signal graph:
 *   beatLoopBus ─┐
 *   bgLoopBus   ─┤
 *   waveIntroBus─┤
 *   percBus ─────┤→ master → limiter → destination
 *   synthBus ────┘
 *
 * Each bus has its own gain node so the audio mixer controls are independent.
 */

import { SignalEvent, FrequencyBand, Waveform } from '../core/events';
import { ticksToSec } from '../core/ticks';
import { MAX_AUDIO_VOICES, MIN_OSC_FREQ, MAX_OSC_FREQ } from '../core/limits';
import kick1Url from '../../../ASSETS/sfx/kick/kick_1.mp3';
import kick2Url from '../../../ASSETS/sfx/kick/kick_2.mp3';

const BAND_BASE_MIDI: Record<FrequencyBand, number> = {
  low: 41,  // F2
  mid: 60,  // C4
  high: 72, // C5
};

const OSC_TYPES: Record<Waveform, OscillatorType> = {
  pulse: 'square',
  sine: 'sine',
  square: 'square',
  saw: 'sawtooth',
  triangle: 'triangle',
};

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

interface ActiveVoice {
  id: string;
  startTime: number;
  stop(): void;
}

export interface SynthPrefs {
  /** Player's per-world synth switch (output module setting). */
  synthOn: boolean;
  /** Per-module synth loudness (from output module setting). */
  synthVolume: number;
  masterMuted: boolean;
  masterVolume: number;
  /** Legacy compat — use sfxVolume for new code. */
  percussionVolume: number;
  // ── Mixer channels ────────────────────────────────────────────────────────
  sfxVolume: number;         // kick / hihat
  towersVolume: number;      // rack synth output
  beatLoopVolume: number;    // beatloop.ogg
  bgLoopVolume: number;      // backgroundLoop_layer_*.ogg
  enemyNotesVolume: number;  // wave intro OGG
}

export type MusicBusType = 'beat' | 'bg' | 'intro';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private percBus: GainNode | null = null;
  private synthBus: GainNode | null = null;
  private beatLoopBus: GainNode | null = null;
  private bgLoopBus: GainNode | null = null;
  private waveIntroBus: GainNode | null = null;
  private kick1: AudioBuffer | null = null;
  private kick2: AudioBuffer | null = null;
  private noise: AudioBuffer | null = null;
  private voices: ActiveVoice[] = [];
  private scheduledIds = new Set<string>();
  private prefs: SynthPrefs = {
    synthOn: false, synthVolume: 0.5,
    masterMuted: false, masterVolume: 0.8,
    percussionVolume: 0.7,
    sfxVolume: 0.7, towersVolume: 1.0,
    beatLoopVolume: 0.7, bgLoopVolume: 0.5, enemyNotesVolume: 0.8,
  };
  private gestureReceived = false;

  get unlocked(): boolean {
    return this.gestureReceived && this.ctx !== null && this.ctx.state === 'running';
  }

  get needsGesture(): boolean {
    return !this.gestureReceived || (this.ctx !== null && this.ctx.state !== 'running');
  }

  get currentTime(): number {
    return this.ctx?.currentTime ?? 0;
  }

  setPrefs(p: Partial<SynthPrefs>): void {
    this.prefs = { ...this.prefs, ...p };
    this.applyPrefs();
  }

  private applyPrefs(): void {
    if (!this.ctx || !this.master || !this.percBus || !this.synthBus) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(
      this.prefs.masterMuted ? 0 : this.prefs.masterVolume * 0.8, t, 0.03);
    this.percBus.gain.setTargetAtTime(this.prefs.sfxVolume * 0.8, t, 0.03);
    this.synthBus.gain.setTargetAtTime(
      this.prefs.synthOn ? this.prefs.synthVolume * this.prefs.towersVolume * 0.7 : 0, t, 0.03);
    this.beatLoopBus?.gain.setTargetAtTime(this.prefs.beatLoopVolume, t, 0.03);
    this.bgLoopBus?.gain.setTargetAtTime(this.prefs.bgLoopVolume, t, 0.03);
    this.waveIntroBus?.gain.setTargetAtTime(this.prefs.enemyNotesVolume, t, 0.03);
  }

  // ── Context bootstrap ────────────────────────────────────────────────────

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.limiter = this.ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -10;
      this.limiter.knee.value = 4;
      this.limiter.ratio.value = 16;
      this.limiter.attack.value = 0.002;
      this.limiter.release.value = 0.12;
      this.percBus = this.ctx.createGain();
      this.synthBus = this.ctx.createGain();
      this.beatLoopBus = this.ctx.createGain();
      this.bgLoopBus = this.ctx.createGain();
      this.waveIntroBus = this.ctx.createGain();
      this.percBus.connect(this.master);
      this.synthBus.connect(this.master);
      this.beatLoopBus.connect(this.master);
      this.bgLoopBus.connect(this.master);
      this.waveIntroBus.connect(this.master);
      this.master.connect(this.limiter).connect(this.ctx.destination);
      this.applyPrefs();
      this.buildNoise();
      void this.loadKicks();
    }
    return this.ctx;
  }

  /** Resume from a user-gesture handler. Safe to call repeatedly. */
  async unlock(): Promise<void> {
    this.gestureReceived = true;
    const ctx = this.ensureCtx();
    if (ctx.state !== 'running') {
      try { await ctx.resume(); } catch { /* stays suspended until next gesture */ }
    }
    this.applyPrefs();
  }

  // ── OGG / buffer loading ──────────────────────────────────────────────────

  /** Fetch + decode an audio URL. Works before unlock (suspended ctx can decode). */
  async loadBuffer(url: string): Promise<AudioBuffer> {
    const ctx = this.ensureCtx();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`loadBuffer: HTTP ${res.status} for ${url}`);
    const raw = await res.arrayBuffer();
    return ctx.decodeAudioData(raw);
  }

  private getBus(busType: MusicBusType): GainNode {
    return (busType === 'beat' ? this.beatLoopBus
      : busType === 'bg' ? this.bgLoopBus
      : this.waveIntroBus)!;
  }

  /** Schedule a one-shot buffer play on the specified music bus. */
  playBufferAt(buffer: AudioBuffer, when: number, busType: MusicBusType = 'intro'): void {
    const ctx = this.ensureCtx();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.getBus(busType));
    src.onended = () => { try { src.disconnect(); } catch { /* ok */ } };
    src.start(Math.max(ctx.currentTime, when));
  }

  // ── Percussion ────────────────────────────────────────────────────────────

  private async loadKicks(): Promise<void> {
    if (!this.ctx) return;
    const load = async (url: string) => {
      const res = await fetch(url);
      const ab = await res.arrayBuffer();
      return this.ctx!.decodeAudioData(ab);
    };
    try {
      [this.kick1, this.kick2] = await Promise.all([load(kick1Url), load(kick2Url)]);
    } catch { /* percussion stays silent if assets fail */ }
  }

  private buildNoise(): void {
    if (!this.ctx) return;
    const len = Math.ceil(this.ctx.sampleRate * 0.06);
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  suspend(): void { void this.ctx?.suspend(); }

  async resume(): Promise<void> {
    if (this.gestureReceived) await this.unlock();
  }

  playKick(beatIndex: number, when: number): void {
    if (!this.ctx || !this.percBus) return;
    const buf = beatIndex % 4 === 0 ? this.kick1 : this.kick2;
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = 0.9;
    src.connect(g).connect(this.percBus);
    src.onended = () => { src.disconnect(); g.disconnect(); };
    src.start(Math.max(this.ctx.currentTime, when));
  }

  playHihat(when: number): void {
    if (!this.ctx || !this.percBus || !this.noise) return;
    const t = Math.max(this.ctx.currentTime, when);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const hpf = this.ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 9000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(hpf).connect(g).connect(this.percBus);
    src.onended = () => { src.disconnect(); hpf.disconnect(); g.disconnect(); };
    src.start(t);
  }

  // ── Synth voices ──────────────────────────────────────────────────────────

  scheduleEvent(e: SignalEvent, waveStartCtxTime: number, bpm: number): void {
    if (!this.ctx || !this.synthBus) return;
    if (!this.prefs.synthOn || this.prefs.masterMuted) return;
    if (this.scheduledIds.has(e.id)) return;
    const start = waveStartCtxTime + ticksToSec(e.tick, bpm);
    const now = this.ctx.currentTime;
    if (start < now - 0.05) return;
    this.scheduledIds.add(e.id);

    while (this.voices.length >= MAX_AUDIO_VOICES) {
      const oldest = this.voices.shift();
      oldest?.stop();
    }

    const ctx = this.ctx;
    const durSec = Math.max(0.06, ticksToSec(Math.max(6, e.durationTicks), bpm) * Math.max(0.15, Math.min(1, e.gate)));
    const atkSec = Math.max(0.004, ticksToSec(e.attackTicks, bpm));
    const relSec = Math.max(0.02, ticksToSec(e.releaseTicks, bpm));

    const osc = ctx.createOscillator();
    osc.type = OSC_TYPES[e.waveform] ?? 'square';
    const midi = BAND_BASE_MIDI[e.band] + e.pitchOffset;
    osc.frequency.value = Math.min(MAX_OSC_FREQ, Math.max(MIN_OSC_FREQ, midiToFreq(midi)));

    const g = ctx.createGain();
    const peak = Math.min(0.5, 0.16 * e.amplitude);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(peak, start + atkSec);
    g.gain.setValueAtTime(peak, start + atkSec + durSec);
    g.gain.exponentialRampToValueAtTime(0.0001, start + atkSec + durSec + relSec);

    osc.connect(g).connect(this.synthBus);
    const stopAt = start + atkSec + durSec + relSec + 0.02;
    osc.start(start);
    osc.stop(stopAt);

    const voice: ActiveVoice = {
      id: e.id,
      startTime: start,
      stop: () => {
        try {
          g.gain.cancelScheduledValues(ctx.currentTime);
          g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.01);
          osc.stop(ctx.currentTime + 0.05);
        } catch { /* already stopped */ }
      },
    };
    this.voices.push(voice);
    osc.onended = () => {
      osc.disconnect(); g.disconnect();
      const idx = this.voices.indexOf(voice);
      if (idx !== -1) this.voices.splice(idx, 1);
    };
  }

  playTestBlip(e: SignalEvent): void {
    if (!this.ctx) return;
    const copy = { ...e, id: `test:${Date.now()}`, tick: 0 };
    const wasOn = this.prefs.synthOn;
    if (!wasOn && this.synthBus && this.ctx) {
      this.synthBus.gain.setTargetAtTime(0.25, this.ctx.currentTime, 0.01);
      setTimeout(() => this.applyPrefs(), 600);
    }
    this.scheduleEvent(copy, this.ctx.currentTime + 0.02, 120);
  }

  cancelAll(): void {
    for (const v of this.voices.splice(0)) v.stop();
    this.scheduledIds.clear();
  }

  teardown(): void {
    this.cancelAll();
    this.suspend();
  }
}

let _engine: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  if (!_engine) _engine = new AudioEngine();
  return _engine;
}
