/**
 * level-music.ts — Background loop lifecycle and MIDI wave intro manager.
 *
 * Owns the three constant loop layers (beatLoop + bgLayers), per-wave OGG
 * intros, and MIDI → WaveScore conversion. All timing derives from the
 * shared AudioEngine and the level's master transport — nothing in here
 * runs its own clock.
 *
 * Usage:
 *   const music = new LevelMusicManager(audio, config);
 *   // each RAF frame after boot:
 *   music.tryStartLoops();              // starts loops once unlocked + loaded
 *   // when player presses Start Wave:
 *   music.scheduleIntro(waveIndex, audioCtxTime);
 *   // get spawn score (synchronous after preload):
 *   const score = music.getMidiScore(waveIndex);
 *   // cleanup:
 *   music.destroy();
 */

import { AudioEngine } from './audio-engine';
import { LevelAudioConfig } from '../data/level-audio-config';
import { WaveScore } from '../core/score';
import { parseMidi, midiNotesToWaveScore } from './midi-parser';

export class LevelMusicManager {
  private readonly audio: AudioEngine;
  private readonly config: LevelAudioConfig;

  // AudioBuffer cache: url → buffer (null means load failed)
  private readonly bufCache = new Map<string, AudioBuffer | null>();
  // In-flight fetches
  private readonly bufLoading = new Map<string, Promise<AudioBuffer | null>>();

  // MIDI score cache: waveIndex → WaveScore | null
  private readonly midiCache = new Map<number, WaveScore | null>();
  private readonly midiLoading = new Map<number, Promise<WaveScore | null>>();

  private loopSrcs: AudioBufferSourceNode[] = [];
  private loopsStarted = false;

  constructor(audio: AudioEngine, config: LevelAudioConfig) {
    this.audio = audio;
    this.config = config;
    this.preloadAll();
  }

  // ── Preloading ────────────────────────────────────────────────────────────

  private preloadAll(): void {
    // Background loops
    this.loadBuffer(this.config.beatLoop);
    for (const url of this.config.bgLayers) this.loadBuffer(url);
    // Wave intros + MIDI
    for (const wc of this.config.waveAudio) {
      this.loadBuffer(wc.introOgg);
      this.loadMidiScore(wc.waveIndex);
    }
  }

  private loadBuffer(url: string): Promise<AudioBuffer | null> {
    const cached = this.bufCache.get(url);
    if (cached !== undefined) return Promise.resolve(cached);
    const inFlight = this.bufLoading.get(url);
    if (inFlight) return inFlight;

    const p = this.audio.loadBuffer(url)
      .then(buf => { this.bufCache.set(url, buf); return buf; })
      .catch((err: unknown) => {
        console.warn('[LevelMusic] Failed to load', url, err);
        this.bufCache.set(url, null);
        return null;
      });
    this.bufLoading.set(url, p);
    return p;
  }

  private loadMidiScore(waveIndex: number): Promise<WaveScore | null> {
    if (this.midiCache.has(waveIndex)) return Promise.resolve(this.midiCache.get(waveIndex) ?? null);
    if (this.midiLoading.has(waveIndex)) return this.midiLoading.get(waveIndex)!;

    const wc = this.config.waveAudio.find(w => w.waveIndex === waveIndex);
    if (!wc) { this.midiCache.set(waveIndex, null); return Promise.resolve(null); }

    const p = fetch(wc.midiUrl)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); })
      .then(buf => {
        const raw = parseMidi(buf);
        const score = midiNotesToWaveScore(raw, `midi-wave${waveIndex + 1}`);
        this.midiCache.set(waveIndex, score);
        return score;
      })
      .catch((err: unknown) => {
        console.warn('[LevelMusic] MIDI parse failed for wave', waveIndex, err);
        this.midiCache.set(waveIndex, null);
        return null;
      });

    this.midiLoading.set(waveIndex, p);
    return p;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Returns true if this wave index has a MIDI/intro config entry.
   * The score itself may not be cached yet — check getMidiScore() separately.
   */
  hasMidi(waveIndex: number): boolean {
    return this.config.waveAudio.some(w => w.waveIndex === waveIndex);
  }

  /**
   * Synchronous cache lookup. Returns null if not loaded yet or no MIDI configured.
   * Call waitForMidiScore() to wait for loading to finish.
   */
  getMidiScore(waveIndex: number): WaveScore | null {
    return this.midiCache.get(waveIndex) ?? null;
  }

  /** Waits for the MIDI score to be parsed (or fail). */
  waitForMidiScore(waveIndex: number): Promise<WaveScore | null> {
    return this.loadMidiScore(waveIndex);
  }

  /**
   * Try to start background loops. Idempotent — safe to call every frame.
   * Loops only start when: (a) audio is unlocked, and (b) all loop buffers loaded.
   */
  tryStartLoops(): void {
    if (this.loopsStarted || !this.audio.unlocked) return;

    const beatBuf = this.bufCache.get(this.config.beatLoop);
    if (!beatBuf) return;

    const layerBufs = this.config.bgLayers.map(url => this.bufCache.get(url));
    if (layerBufs.some(b => b === undefined)) return; // not all loaded yet

    this.loopsStarted = true;
    this.loopSrcs.push(this.audio.startLoop(beatBuf, 0.65));
    for (const buf of layerBufs) {
      if (buf) this.loopSrcs.push(this.audio.startLoop(buf, 0.45));
    }
  }

  /**
   * Schedule the wave intro OGG to play at the given AudioContext time.
   * The OGG plays once over the background loops.
   */
  scheduleIntro(waveIndex: number, atContextTime: number): void {
    const wc = this.config.waveAudio.find(w => w.waveIndex === waveIndex);
    if (!wc) return;
    const buf = this.bufCache.get(wc.introOgg);
    if (!buf) return;
    this.audio.playBufferAt(buf, atContextTime, 0.75);
  }

  /** Stop and release all active loop sources. */
  stopLoops(): void {
    for (const src of this.loopSrcs) this.audio.stopLoop(src);
    this.loopSrcs = [];
    this.loopsStarted = false;
  }

  /** Full teardown — call on level exit. */
  destroy(): void {
    this.stopLoops();
  }

  // ── Debug info ────────────────────────────────────────────────────────────

  debugInfo(waveIndex: number): string {
    const loaded = this.midiCache.has(waveIndex);
    const score = this.midiCache.get(waveIndex);
    return `loops:${this.loopsStarted ? 'on' : 'off'} midi[${waveIndex}]:${loaded ? (score ? `${score.notes.length}n` : 'fail') : 'loading'}`;
  }
}
