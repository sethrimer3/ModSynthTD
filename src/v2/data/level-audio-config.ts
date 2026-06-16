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
  /**
   * Per-wave beat loop overrides keyed by 0-based waveIndex.
   * When present for the active wave, replaces beatLoop for that wave's duration.
   */
  beatLoopOverrides?: Record<number, string>;
  /** Optional kick loop. When present, it replaces the fallback one-shot kicks. */
  kickLoop?: string;
  /** Melodic/harmonic loop layers stacked over the beat. */
  bgLayers: string[];
  /** Per-wave audio overrides. Waves not listed use the standard 1-bar countin. */
  waveAudio: WaveAudioConfig[];
}

export type AudioConfigSeverity = 'warning' | 'error';

export interface AudioConfigIssue {
  severity: AudioConfigSeverity;
  message: string;
}

/**
 * Validate a LevelAudioConfig against the expected wave count for its world.
 * Returns issues for partial coverage (some waves have audio, others don't)
 * and for any duplicate or out-of-range wave indices in waveAudio.
 */
export function validateLevelAudioConfig(
  config: LevelAudioConfig,
  worldWaveCount: number,
  worldId?: string,
): AudioConfigIssue[] {
  const issues: AudioConfigIssue[] = [];
  const tag = worldId ? `[${worldId}] ` : '';

  if (!config.beatLoop) {
    issues.push({ severity: 'error', message: `${tag}Missing beatLoop URL.` });
  }
  if (!Array.isArray(config.bgLayers) || config.bgLayers.length === 0) {
    issues.push({ severity: 'warning', message: `${tag}No bgLayers defined.` });
  }

  const coveredIndices = new Set<number>();
  for (const wa of config.waveAudio) {
    if (wa.waveIndex < 0 || wa.waveIndex >= worldWaveCount) {
      issues.push({
        severity: 'error',
        message: `${tag}waveAudio entry waveIndex=${wa.waveIndex} out of range 0..${worldWaveCount - 1}.`,
      });
    }
    if (coveredIndices.has(wa.waveIndex)) {
      issues.push({
        severity: 'error',
        message: `${tag}Duplicate waveAudio entry for waveIndex=${wa.waveIndex}.`,
      });
    }
    coveredIndices.add(wa.waveIndex);
    if (!wa.introOgg) {
      issues.push({ severity: 'warning', message: `${tag}Wave ${wa.waveIndex}: missing introOgg.` });
    }
    if (!wa.midiUrl) {
      issues.push({ severity: 'error', message: `${tag}Wave ${wa.waveIndex}: missing midiUrl.` });
    }
  }

  // Partial coverage: some waves have audio, not all.
  const configured = config.waveAudio.filter(wa => wa.waveIndex >= 0 && wa.waveIndex < worldWaveCount).length;
  if (configured > 0 && configured < worldWaveCount) {
    const missing: number[] = [];
    for (let i = 0; i < worldWaveCount; i++) {
      if (!coveredIndices.has(i)) missing.push(i);
    }
    issues.push({
      severity: 'warning',
      message: `${tag}Partial audio coverage: ${configured}/${worldWaveCount} waves have audio. Missing wave indices: ${missing.join(', ')}.`,
    });
  }

  return issues;
}
