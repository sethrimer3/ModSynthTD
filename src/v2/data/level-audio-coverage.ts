/**
 * Pure metadata for authored level-audio coverage.
 *
 * Asset URLs live in ui/level-audio-assets.ts, which is browser/webpack-only.
 * This file keeps coverage expectations testable in the headless Node suite.
 */

export interface LevelAudioCoverage {
  worldId: string;
  coveredWaveIndices: readonly number[];
}

export const LEVEL_AUDIO_COVERAGE: readonly LevelAudioCoverage[] = [
  { worldId: 'w60', coveredWaveIndices: [0] },
];

export function getLevelAudioCoverage(worldId: string): LevelAudioCoverage | undefined {
  return LEVEL_AUDIO_COVERAGE.find(entry => entry.worldId === worldId);
}
