/**
 * audio-frequency.test.ts - exact-Hz contract shared by combat and Web Audio.
 */

import { test, assertEq } from './harness';
import { SignalEvent, eventHertz } from '../core/events';
import { BAND_HZ } from '../core/pitch';

function event(overrides: Partial<SignalEvent>): SignalEvent {
  return {
    id: 'test:event',
    tick: 0,
    durationTicks: 48,
    band: 'mid',
    waveform: 'sine',
    hasVoice: true,
    amplitude: 1,
    gate: 0.5,
    attackTicks: 0,
    releaseTicks: 6,
    pitchOffset: 0,
    directions: ['north'],
    route: ['test'],
    sourceModuleId: 'test',
    seed: 1,
    tags: [],
    ...overrides,
  };
}

test('SignalEvent.hertz wins over band fallback for MIDI-derived voices', () => {
  const midiHz = 261.625565;
  const e = event({ band: 'high', hertz: midiHz, baseHz: BAND_HZ.high });
  assertEq(eventHertz(e), midiHz, 'exact event Hz is preserved');
});

test('band/base fallback still works for authored waves without explicit hertz', () => {
  const e = event({ band: 'low', baseHz: BAND_HZ.low, hertz: undefined });
  assertEq(eventHertz(e), BAND_HZ.low, 'fallback uses band/base frequency');
});
