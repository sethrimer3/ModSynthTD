/**
 * audio-engine.ts — Web Audio synthesis driven by canonical SignalEvents.
 *
 * One AudioContext, one master bus with a limiter, separate percussion and
 * synth buses. Voices are scheduled by event id (no duplicates after
 * suspend/resume), capped in polyphony, and fully disconnected when done.
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
  synthVolume: number;
  masterMuted: boolean;
  masterVolume: number;
  percussionVolume: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
  private percBus: GainNode | null = null;
  private synthBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private kick1: AudioBuffer | null = null;
  private kick2: AudioBuffer | null = null;
  private noise: AudioBuffer | null = null;
  private voices: ActiveVoice[] = [];
  private scheduledIds = new Set<string>();
  private prefs: SynthPrefs = { synthOn: false, synthVolume: 0.5, masterMuted: false, masterVolume: 0.8, percussionVolume: 0.7 };
  private gestureReceived = false;

  /** True once a user gesture has unlocked audio in this browser session. */
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
    this.master.gain.setTargetAtTime(this.prefs.masterMuted ? 0 : this.prefs.masterVolume * 0.8, t, 0.03);
    this.percBus.gain.setTargetAtTime(this.prefs.percussionVolume * 0.8, t, 0.03);
    this.synthBus.gain.setTargetAtTime(this.prefs.synthOn ? this.prefs.synthVolume * 0.7 : 0, t, 0.03);
  }

  /**
   * Ensure the AudioContext and all buses exist (context may be suspended).
   * Safe to call before a user gesture — decoding is allowed in suspended state.
   */
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
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.75;
      this.percBus.connect(this.master);
      this.synthBus.connect(this.master);
      this.musicBus.connect(this.master);
      this.master.connect(this.limiter).connect(this.ctx.destination);
      this.applyPrefs();
      this.buildNoise();
      void this.loadKicks();
    }
    return this.ctx;
  }

  /** Must be called from a user-gesture handler. Safe to call repeatedly. */
  async unlock(): Promise<void> {
    this.gestureReceived = true;
    const ctx = this.ensureCtx();
    if (ctx.state !== 'running') {
      try { await ctx.resume(); } catch { /* stays suspended until next gesture */ }
    }
    this.applyPrefs();
  }

  // ── OGG / buffer support for level music ─────────────────────────────────

  /**
   * Fetch and decode an audio file URL. Can be called before unlock (the
   * AudioContext decodes in its suspended state). Rejects on network/decode error.
   */
  async loadBuffer(url: string): Promise<AudioBuffer> {
    const ctx = this.ensureCtx();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`loadBuffer: HTTP ${res.status} for ${url}`);
    const raw = await res.arrayBuffer();
    return ctx.decodeAudioData(raw);
  }

  /**
   * Start a seamlessly looping buffer source connected to the music bus.
   * Returns the source node — pass it to stopLoop() to stop it.
   * Requires audio to be unlocked; call from tryStartLoops() after unlock.
   */
  startLoop(buffer: AudioBuffer, gain = 1.0): AudioBufferSourceNode {
    const ctx = this.ensureCtx();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.musicBus!);
    src.start(0);
    return src;
  }

  /** Stop and disconnect a loop source returned by startLoop(). */
  stopLoop(src: AudioBufferSourceNode): void {
    try { src.stop(); } catch { /* already stopped */ }
    try { src.disconnect(); } catch { /* already disconnected */ }
  }

  /**
   * Play a buffer once at the given AudioContext time.
   * Used to schedule the wave intro OGG over the background loops.
   */
  playBufferAt(buffer: AudioBuffer, when: number, gain = 1.0): void {
    const ctx = this.ensureCtx();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.musicBus!);
    src.onended = () => { src.disconnect(); g.disconnect(); };
    src.start(Math.max(ctx.currentTime, when));
  }

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

  suspend(): void {
    void this.ctx?.suspend();
  }

  async resume(): Promise<void> {
    if (this.gestureReceived) await this.unlock();
  }

  // ── Percussion ────────────────────────────────────────────────────────────

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

  // ── Synth voices from SignalEvents ────────────────────────────────────────

  /**
   * Schedule one SignalEvent as a synth voice.
   * waveStartCtxTime: AudioContext time of wave tick 0.
   * Duplicate event ids are ignored (suspension-safe).
   */
  scheduleEvent(e: SignalEvent, waveStartCtxTime: number, bpm: number): void {
    if (!this.ctx || !this.synthBus) return;
    if (!this.prefs.synthOn || this.prefs.masterMuted) return;
    if (this.scheduledIds.has(e.id)) return;
    const start = waveStartCtxTime + ticksToSec(e.tick, bpm);
    const now = this.ctx.currentTime;
    if (start < now - 0.05) return; // expired — never replay the past
    this.scheduledIds.add(e.id);

    // Polyphony cap: steal the oldest voice.
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
      osc.disconnect();
      g.disconnect();
      const idx = this.voices.indexOf(voice);
      if (idx !== -1) this.voices.splice(idx, 1);
    };
  }

  /** A single immediate test-pulse blip (preparation mode). */
  playTestBlip(e: SignalEvent): void {
    if (!this.ctx) return;
    const copy = { ...e, id: `test:${Date.now()}`, tick: 0 };
    const wasOn = this.prefs.synthOn;
    // Test pulses are audible even with the synth switch off (quietly).
    if (!wasOn && this.synthBus && this.ctx) {
      this.synthBus.gain.setTargetAtTime(0.25, this.ctx.currentTime, 0.01);
      setTimeout(() => this.applyPrefs(), 600);
    }
    this.scheduleEvent(copy, this.ctx.currentTime + 0.02, 120);
  }

  /** Cancel all pending voices and forget scheduled ids (wave restart/exit). */
  cancelAll(): void {
    for (const v of this.voices.splice(0)) v.stop();
    this.scheduledIds.clear();
  }

  /** Full teardown on level exit. */
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
