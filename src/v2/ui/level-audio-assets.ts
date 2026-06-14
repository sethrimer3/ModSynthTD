/**
 * level-audio-assets.ts — Webpack-resolved audio asset URLs for level music configs.
 *
 * Browser-only (not included in Node.js tests). Imports are processed by
 * webpack's asset/resource rule so each URL is the final hashed filename.
 *
 * Add new level configs here and export them from LEVEL_AUDIO_CONFIGS keyed
 * by worldId so level.ts can look them up without touching worlds.ts.
 */

import { LevelAudioConfig } from '../data/level-audio-config';

declare const require: {
  context(directory: string, useSubdirectories: boolean, regExp: RegExp): {
    keys(): string[];
    (key: string): string;
  };
};

import beatLoopUrl from '../../../ASSETS/LEVELS/60BPM/beatloop.ogg';
import bgLayer1Url from '../../../ASSETS/LEVELS/60BPM/backgroundLoop_layer_1.ogg';
import bgLayer2Url from '../../../ASSETS/LEVELS/60BPM/backgroundLoop_layer_2.ogg';
import wave1OggUrl from '../../../ASSETS/LEVELS/60BPM/wave1.ogg';
import wave1MidUrl from '../../../ASSETS/LEVELS/60BPM/wave1.mid';

const kickLoopContext = require.context('../../../ASSETS/LEVELS', true, /kickLoop\.ogg$/i);
const beatLoopOverrideContext = require.context('../../../ASSETS/LEVELS', true, /beatLoop_wave\d+\.ogg$/i);

function findKickLoop(bpm: number): string | undefined {
  const expected = `./${bpm}BPM/kickLoop.ogg`.toLowerCase();
  const key = kickLoopContext.keys().find(candidate => candidate.toLowerCase() === expected);
  return key ? kickLoopContext(key) : undefined;
}

/** Scans for beatLoop_wave<N>.ogg files and returns a map of (0-based waveIndex) → url. */
function findBeatLoopOverrides(bpm: number): Record<number, string> {
  const prefix = `./${bpm}bpm/beatloop_wave`.toLowerCase();
  const overrides: Record<number, string> = {};
  for (const key of beatLoopOverrideContext.keys()) {
    const lower = key.toLowerCase();
    if (!lower.startsWith(prefix)) continue;
    const match = lower.match(/beatloop_wave(\d+)\.ogg$/i);
    if (!match) continue;
    const waveNumber = parseInt(match[1], 10); // 1-based from filename
    overrides[waveNumber - 1] = beatLoopOverrideContext(key); // store as 0-based
  }
  return overrides;
}

// ── 60 BPM — Pulse Orbit (w60) ───────────────────────────────────────────────

const LEVEL_60BPM: LevelAudioConfig = {
  bpm: 60,
  beatLoop: beatLoopUrl,
  beatLoopOverrides: findBeatLoopOverrides(60),
  kickLoop: findKickLoop(60),
  bgLayers: [bgLayer1Url, bgLayer2Url],
  waveAudio: [
    {
      waveIndex: 0,          // w60-1
      introOgg: wave1OggUrl,
      midiUrl: wave1MidUrl,
    },
    // Add more waves here as assets are created:
    // { waveIndex: 1, introOgg: wave2OggUrl, midiUrl: wave2MidUrl },
  ],
};

/**
 * Registry of level audio configs keyed by worldId.
 * level.ts looks up by worldId — no changes to worlds.ts needed.
 */
export const LEVEL_AUDIO_CONFIGS: Readonly<Record<string, LevelAudioConfig>> = {
  w60: LEVEL_60BPM,
};
