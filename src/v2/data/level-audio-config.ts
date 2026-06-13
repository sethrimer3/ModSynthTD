/**
 * level-audio-config.ts — Types for the per-level layered music system.
 *
 * The concrete config objects (with webpack-resolved asset URLs) live in
 * src/v2/ui/level-audio-assets.ts (browser-only, excluded from Node tests).
 */

export interface WaveAudioConfig {
  /** 0-based wave index (matches world.waves array index). */
  waveIndex: number;
  /** OGG URL played once over the background loops during the intro bars. */
  introOgg: string;
  /** MIDI file URL used for notation preview AND as the actual spawn score. */
  midiUrl: string;
}

export interface LevelAudioConfig {
  bpm: number;
  /** Beat/percussion loop — plays constantly in a seamless loop. */
  beatLoop: string;
  /** Optional kick loop. When present, it replaces the fallback one-shot kicks. */
  kickLoop?: string;
  /** Melodic/harmonic loop layers stacked over the beat. */
  bgLayers: string[];
  /** How many bars of MIDI intro to play before the physical wave begins. */
  introBarCount: number;
  /** Per-wave audio overrides. Waves not listed use the standard 1-bar countin. */
  waveAudio: WaveAudioConfig[];
}
