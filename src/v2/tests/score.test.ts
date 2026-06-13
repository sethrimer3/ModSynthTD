/**
 * score.test.ts — Score model validation and compilation tests.
 */

import { test, assert, assertEq } from './harness';
import { WaveScore, validateWaveScore, compileScore } from '../core/score';
import { QUARTER_TICKS, EIGHTH_TICKS, TICKS_PER_MEASURE } from '../core/ticks';

function basicScore(): WaveScore {
  return {
    waveId: 'test-w1',
    measures: 2,
    notes: [
      { tick: 0, durationTicks: QUARTER_TICKS, enemyTypeId: 'quarter' },
      { tick: 48, durationTicks: EIGHTH_TICKS, enemyTypeId: 'eighth' },
      { tick: 72, durationTicks: EIGHTH_TICKS, enemyTypeId: 'eighth' },
      { tick: 96, durationTicks: QUARTER_TICKS, enemyTypeId: 'quarter' },
      { tick: 192, durationTicks: 96, enemyTypeId: 'half' },
    ],
  };
}

test('valid score passes validation', () => {
  const issues = validateWaveScore(basicScore());
  assertEq(issues.filter(i => i.severity === 'error').length, 0, 'no errors on valid score');
});

test('non-integer tick rejected', () => {
  const s = basicScore();
  s.notes[0] = { ...s.notes[0], tick: 0.5 };
  const issues = validateWaveScore(s);
  assert(issues.some(i => i.severity === 'error' && i.message.includes('non-integer')), 'fractional tick rejected');
});

test('negative duration rejected', () => {
  const s = basicScore();
  s.notes[1] = { ...s.notes[1], durationTicks: -12 };
  const issues = validateWaveScore(s);
  assert(issues.some(i => i.severity === 'error' && i.message.includes('non-positive')), 'negative duration rejected');
});

test('onset beyond final measure rejected', () => {
  const s = basicScore();
  s.notes.push({ tick: TICKS_PER_MEASURE * 2, durationTicks: 48, enemyTypeId: 'quarter' });
  const issues = validateWaveScore(s);
  assert(issues.some(i => i.severity === 'error' && i.message.includes('beyond')), 'overflow onset rejected');
});

test('unknown enemy rejected', () => {
  const s = basicScore();
  s.notes.push({ tick: 0, durationTicks: 48, enemyTypeId: 'kazoo' });
  const issues = validateWaveScore(s);
  assert(issues.some(i => i.message.includes('unknown enemy')), 'unknown enemy id rejected');
});

test('lane outside track lane count rejected', () => {
  const s = basicScore();
  s.notes.push({ tick: 0, durationTicks: 48, enemyTypeId: 'quarter', lane: 2 });
  const issues = validateWaveScore(s, 2);
  assertEq(issues.filter(i => i.severity === 'error').length, 1, 'lane 2 invalid for 2-lane track');
});

test('compile produces sorted deterministic spawns', () => {
  const s = basicScore();
  const a = compileScore(s);
  const b = compileScore(s);
  assertEq(a, b, 'compilation deterministic');
  assertEq(a.spawns.map(sp => sp.tick), [0, 48, 72, 96, 192], 'spawns sorted by tick');
  assertEq(a.totalTicks, 384, 'two measures = 384 ticks');
  assertEq(a.spawns.map(sp => sp.spawnIndex), [0, 1, 2, 3, 4], 'stable spawn indices');
});

test('chord groups preserved through compilation', () => {
  const s: WaveScore = {
    waveId: 'test-chord',
    measures: 1,
    notes: [
      { tick: 0, durationTicks: 48, enemyTypeId: 'quarter', chordGroup: 'g1' },
      { tick: 0, durationTicks: 48, enemyTypeId: 'half', chordGroup: 'g1', band: 'low' },
    ],
  };
  const issues = validateWaveScore(s);
  assertEq(issues.filter(i => i.severity === 'error').length, 0, 'chord score valid');
  const c = compileScore(s);
  assertEq(c.spawns.length, 2, 'both chord members spawn');
  assertEq(c.spawns[0].tick, c.spawns[1].tick, 'chord members simultaneous');
  assertEq(c.spawns.map(sp => sp.chordGroup), ['g1', 'g1'], 'group id kept');
});

test('band override flows into spawn', () => {
  const s: WaveScore = {
    waveId: 'test-band',
    measures: 1,
    notes: [{ tick: 0, durationTicks: 48, enemyTypeId: 'quarter', band: 'high' }],
  };
  const c = compileScore(s);
  assertEq(c.spawns[0].band, 'high', 'explicit band override respected');
});

test('default band comes from enemy definition', () => {
  const c = compileScore(basicScore());
  assertEq(c.spawns[4].band, 'low', 'half note defaults to low band');
});
