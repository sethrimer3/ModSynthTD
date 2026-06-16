/**
 * audio-config.test.ts — Validate the LevelAudioConfig type and validator.
 *
 * Since level-audio-assets.ts uses webpack-resolved imports (browser-only),
 * these tests exercise the pure validateLevelAudioConfig function from
 * level-audio-config.ts using synthetic configs. They confirm that:
 *
 *  - A complete config produces no issues.
 *  - Missing required fields are reported as errors.
 *  - Partial wave coverage is reported as a warning.
 *  - Duplicate or out-of-range waveIndex values are reported as errors.
 *
 * To validate actual game assets, run the game and check the console —
 * level-music.ts logs any issues returned by validateLevelAudioConfig.
 */

import { test, assert, assertEq } from './harness';
import { validateLevelAudioConfig, LevelAudioConfig } from '../data/level-audio-config';

function makeConfig(overrides: Partial<LevelAudioConfig> = {}): LevelAudioConfig {
  return {
    bpm: 60,
    beatLoop: 'beat.ogg',
    bgLayers: ['layer1.ogg', 'layer2.ogg'],
    waveAudio: [
      { waveIndex: 0, introOgg: 'w1.ogg', midiUrl: 'w1.mid' },
      { waveIndex: 1, introOgg: 'w2.ogg', midiUrl: 'w2.mid' },
      { waveIndex: 2, introOgg: 'w3.ogg', midiUrl: 'w3.mid' },
    ],
    ...overrides,
  };
}

test('valid full config produces no issues', () => {
  const issues = validateLevelAudioConfig(makeConfig(), 3, 'w60');
  assertEq(issues, [], 'full config is clean');
});

test('missing beatLoop is an error', () => {
  const issues = validateLevelAudioConfig(makeConfig({ beatLoop: '' }), 3, 'w60');
  assert(issues.some(i => i.severity === 'error' && i.message.includes('beatLoop')), 'missing beatLoop error');
});

test('empty bgLayers is a warning', () => {
  const issues = validateLevelAudioConfig(makeConfig({ bgLayers: [] }), 3, 'w60');
  assert(issues.some(i => i.severity === 'warning' && i.message.includes('bgLayers')), 'empty bgLayers warning');
});

test('partial wave coverage is a warning', () => {
  // 5-wave world but only 3 have audio.
  const issues = validateLevelAudioConfig(makeConfig(), 5, 'w60');
  const partial = issues.find(i => i.message.includes('Partial audio coverage'));
  assert(partial !== undefined, 'partial coverage warning emitted');
  assert(partial!.severity === 'warning', 'partial coverage is a warning, not an error');
  assert(partial!.message.includes('3/5'), 'coverage ratio in message');
  assert(partial!.message.includes('3, 4'), 'missing indices listed');
});

test('zero wave coverage on a non-zero config is not a partial-coverage warning', () => {
  // Config with empty waveAudio is "no audio" rather than "partial" — no warning.
  const issues = validateLevelAudioConfig(makeConfig({ waveAudio: [] }), 5, 'w60');
  const partial = issues.find(i => i.message.includes('Partial audio coverage'));
  assertEq(partial, undefined, 'zero coverage is not a partial-coverage warning');
});

test('full coverage matches exactly — no partial warning', () => {
  const fullConfig = makeConfig({
    waveAudio: [
      { waveIndex: 0, introOgg: 'w1.ogg', midiUrl: 'w1.mid' },
      { waveIndex: 1, introOgg: 'w2.ogg', midiUrl: 'w2.mid' },
      { waveIndex: 2, introOgg: 'w3.ogg', midiUrl: 'w3.mid' },
      { waveIndex: 3, introOgg: 'w4.ogg', midiUrl: 'w4.mid' },
      { waveIndex: 4, introOgg: 'w5.ogg', midiUrl: 'w5.mid' },
    ],
  });
  const issues = validateLevelAudioConfig(fullConfig, 5, 'w60');
  assertEq(issues, [], 'full coverage produces no issues');
});

test('out-of-range waveIndex is an error', () => {
  const config = makeConfig({
    waveAudio: [
      { waveIndex: 0, introOgg: 'w1.ogg', midiUrl: 'w1.mid' },
      { waveIndex: 99, introOgg: 'w99.ogg', midiUrl: 'w99.mid' }, // out of range
    ],
  });
  const issues = validateLevelAudioConfig(config, 3, 'w60');
  assert(issues.some(i => i.severity === 'error' && i.message.includes('waveIndex=99')), 'out-of-range index error');
});

test('duplicate waveIndex is an error', () => {
  const config = makeConfig({
    waveAudio: [
      { waveIndex: 0, introOgg: 'w1.ogg', midiUrl: 'w1.mid' },
      { waveIndex: 0, introOgg: 'w1b.ogg', midiUrl: 'w1b.mid' }, // duplicate
    ],
  });
  const issues = validateLevelAudioConfig(config, 3, 'w60');
  assert(issues.some(i => i.severity === 'error' && i.message.includes('Duplicate')), 'duplicate waveIndex error');
});

test('missing midiUrl in a waveAudio entry is an error', () => {
  const config = makeConfig({
    waveAudio: [
      { waveIndex: 0, introOgg: 'w1.ogg', midiUrl: '' }, // missing midiUrl
    ],
  });
  const issues = validateLevelAudioConfig(config, 3, 'w60');
  assert(issues.some(i => i.severity === 'error' && i.message.includes('midiUrl')), 'missing midiUrl error');
});

test('missing introOgg in a waveAudio entry is a warning', () => {
  const config = makeConfig({
    waveAudio: [
      { waveIndex: 0, introOgg: '', midiUrl: 'w1.mid' }, // missing introOgg
    ],
  });
  const issues = validateLevelAudioConfig(config, 3, 'w60');
  assert(issues.some(i => i.severity === 'warning' && i.message.includes('introOgg')), 'missing introOgg warning');
});
