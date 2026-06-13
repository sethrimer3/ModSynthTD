/**
 * ticks.test.ts — Integer timing and RNG determinism tests.
 */

import { test, assert, assertEq, assertClose } from './harness';
import { PPQ, TICKS_PER_MEASURE, ticksToSec, secPerTick, measureOfTick, tickWithinMeasure } from '../core/ticks';
import { hashString, combineSeeds, makeRng, seededFloat } from '../core/rng';

test('tick constants are sixteenth-compatible integers', () => {
  assertEq(PPQ % 4, 0, 'PPQ divisible into sixteenths');
  assertEq(PPQ % 3, 0, 'PPQ divisible into triplets');
  assertEq(TICKS_PER_MEASURE, PPQ * 4, '4/4 measure');
});

test('tick→seconds conversion only at boundary, exact at known BPM', () => {
  assertClose(ticksToSec(PPQ, 60), 1.0, 1e-12, 'one quarter at 60 BPM = 1s');
  assertClose(ticksToSec(TICKS_PER_MEASURE, 120), 2.0, 1e-12, 'one measure at 120 BPM = 2s');
  assertClose(secPerTick(40) * PPQ, 1.5, 1e-12, 'quarter at 40 BPM = 1.5s');
});

test('measure helpers', () => {
  assertEq(measureOfTick(0), 0, 'tick 0 in measure 0');
  assertEq(measureOfTick(TICKS_PER_MEASURE), 1, 'first tick of measure 1');
  assertEq(tickWithinMeasure(TICKS_PER_MEASURE + 5), 5, 'wrap within measure');
});

test('hashString is stable and deterministic', () => {
  assertEq(hashString('w40'), hashString('w40'), 'same input same hash');
  assert(hashString('w40') !== hashString('w60'), 'different inputs differ');
});

test('seeded rng reproducible', () => {
  const a = makeRng(combineSeeds(1, 2, 3));
  const b = makeRng(combineSeeds(1, 2, 3));
  for (let i = 0; i < 100; i++) {
    assertEq(a(), b(), `step ${i} identical`);
  }
});

test('seededFloat in [0,1) and stable', () => {
  for (let i = 0; i < 50; i++) {
    const v = seededFloat(12345, i);
    assert(v >= 0 && v < 1, 'in range');
    assertEq(v, seededFloat(12345, i), 'stable per (seed,index)');
  }
});
