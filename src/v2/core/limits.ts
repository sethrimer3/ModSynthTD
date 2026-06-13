/**
 * limits.ts — Central bounded-execution limits for the signal graph and audio.
 *
 * These caps guarantee that no patch — however tangled — can produce
 * unbounded event counts, unbounded amplitude, or unbounded audio voices.
 */

/** Maximum topological traversal depth (modules in the longest chain). */
export const MAX_GRAPH_DEPTH = 24;

/** Maximum modules allowed in one rack graph. */
export const MAX_MODULES = 48;

/** Maximum cables allowed in one rack graph. */
export const MAX_CABLES = 96;

/** Maximum events a single module may emit per evaluation window. */
export const MAX_EVENTS_PER_MODULE_WINDOW = 512;

/** Maximum total events one evaluation window may produce at the output. */
export const MAX_EVENTS_PER_WINDOW = 1024;

/** Maximum total scheduled events across one full wave. */
export const MAX_EVENTS_PER_WAVE = 4096;

/** Hard amplitude ceiling for any single signal event. */
export const MAX_AMPLITUDE = 2.0;

/** Amplitude below which events are culled (decayed echoes die out). */
export const MIN_AMPLITUDE = 0.05;

/** Maximum fan-out connections from one output port. */
export const MAX_FANOUT = 4;

/** Maximum fan-in connections into one mixer-style input port. */
export const MAX_FANIN = 4;

/** Delay module: maximum echo repetitions. */
export const MAX_DELAY_REPEATS = 4;

/** Delay module: maximum feedback/decay factor per echo. */
export const MAX_DELAY_DECAY = 0.65;

/** Audio: maximum simultaneous synthesized voices. */
export const MAX_AUDIO_VOICES = 12;

/** Audio: oscillator frequency clamps (Hz). */
export const MIN_OSC_FREQ = 40;
export const MAX_OSC_FREQ = 4000;

/** Amplifier gain range; UI warns at >= AMP_WARN_GAIN. */
export const MIN_AMP_GAIN = 0.25;
export const MAX_AMP_GAIN = 2.0;
export const AMP_WARN_GAIN = 1.5;

/** Pitch offset clamp in semitones. */
export const MAX_PITCH_OFFSET = 24;
