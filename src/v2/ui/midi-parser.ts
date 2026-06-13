/**
 * midi-parser.ts — Minimal binary MIDI parser for wave preview + enemy spawning.
 *
 * Reads Type-0 and Type-1 MIDI files, extracts note on/off pairs, converts
 * to game ticks (PPQ 48), quantizes durations to the five supported note
 * lengths, and maps pitch to frequency band for staff rendering.
 */

import { WaveScore, ScoreNote } from '../core/score';
import { FrequencyBand } from '../core/events';
import {
  PPQ as GAME_PPQ,
  TICKS_PER_MEASURE,
  WHOLE_TICKS, HALF_TICKS, QUARTER_TICKS, EIGHTH_TICKS, SIXTEENTH_TICKS,
} from '../core/ticks';

// ── Public types ─────────────────────────────────────────────────────────────

export interface RawMidiNote {
  pitch: number;        // MIDI note number 0–127
  startTick: number;    // game ticks from track start
  durationTicks: number; // game ticks
}

// ── Note length table (log-ratio quantization as specified) ──────────────────

const NOTE_LENGTHS = [
  { id: 'whole',     beats: 4,    gameTicks: WHOLE_TICKS },
  { id: 'half',      beats: 2,    gameTicks: HALF_TICKS },
  { id: 'quarter',   beats: 1,    gameTicks: QUARTER_TICKS },
  { id: 'eighth',    beats: 0.5,  gameTicks: EIGHTH_TICKS },
  { id: 'sixteenth', beats: 0.25, gameTicks: SIXTEENTH_TICKS },
] as const;

export function quantizeNoteLength(durationTicks: number): { id: string; gameTicks: number } {
  const durationBeats = durationTicks / GAME_PPQ;
  const clamped = Math.max(0.25, Math.min(4, durationBeats));
  let best: { id: string; beats: number; gameTicks: number } = NOTE_LENGTHS[0];
  for (const candidate of NOTE_LENGTHS) {
    if (Math.abs(Math.log2(clamped / candidate.beats)) < Math.abs(Math.log2(clamped / best.beats))) {
      best = candidate;
    }
  }
  return { id: best.id, gameTicks: best.gameTicks };
}

// ── Variable-length quantity ──────────────────────────────────────────────────

function readVLQ(bytes: Uint8Array, offset: number): { value: number; bytesRead: number } {
  let value = 0;
  let bytesRead = 0;
  do {
    const b = bytes[offset + bytesRead];
    value = (value << 7) | (b & 0x7f);
    bytesRead++;
    if (!(b & 0x80)) break;
  } while (bytesRead < 4);
  return { value, bytesRead };
}

// ── MIDI binary parser ────────────────────────────────────────────────────────

export function parseMidi(buffer: ArrayBuffer): RawMidiNote[] {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== 'MThd') throw new Error('Not a MIDI file (missing MThd)');

  const numTracks = view.getUint16(10, false);
  const division = view.getUint16(12, false);
  if (division & 0x8000) throw new Error('SMPTE MIDI timecode not supported');
  const midiPPQ = division;

  const output: RawMidiNote[] = [];
  let fileOffset = 14; // after 8-byte MThd header + 6 data bytes

  for (let trackIdx = 0; trackIdx < numTracks; trackIdx++) {
    if (fileOffset + 8 > bytes.length) break;

    const chunkId = String.fromCharCode(bytes[fileOffset], bytes[fileOffset+1], bytes[fileOffset+2], bytes[fileOffset+3]);
    const chunkLen = view.getUint32(fileOffset + 4, false);
    const trackEnd = fileOffset + 8 + chunkLen;
    fileOffset += 8;

    if (chunkId !== 'MTrk') { fileOffset = trackEnd; continue; }

    let absMidiTick = 0;
    let lastStatus = 0;
    // key = pitch * 16 + channel  →  midiOnTick
    const pending = new Map<number, number>();

    while (fileOffset < trackEnd) {
      const delta = readVLQ(bytes, fileOffset);
      fileOffset += delta.bytesRead;
      absMidiTick += delta.value;

      // Status byte or running status.
      let status: number;
      if (bytes[fileOffset] & 0x80) {
        status = bytes[fileOffset];
        if (status !== 0xf0 && status !== 0xf7 && status !== 0xff) {
          lastStatus = status; // only channel messages update running status
        }
        fileOffset++;
      } else {
        status = lastStatus;
        // Don't advance — the byte is already data.
      }

      const type = status & 0xf0;
      const channel = status & 0x0f;

      if (status === 0xff) {
        // Meta event.
        fileOffset++; // meta type
        const len = readVLQ(bytes, fileOffset);
        fileOffset += len.bytesRead + len.value;
        lastStatus = 0;
      } else if (status === 0xf0 || status === 0xf7) {
        // SysEx.
        const len = readVLQ(bytes, fileOffset);
        fileOffset += len.bytesRead + len.value;
        lastStatus = 0;
      } else if (type === 0x80) {
        // Note Off.
        const pitch = bytes[fileOffset++];
        fileOffset++; // release velocity
        const key = pitch * 16 + channel;
        const onTick = pending.get(key);
        if (onTick !== undefined) {
          pending.delete(key);
          const gameStart = Math.round(onTick * GAME_PPQ / midiPPQ);
          const gameDur = Math.round((absMidiTick - onTick) * GAME_PPQ / midiPPQ);
          if (gameDur > 0) output.push({ pitch, startTick: gameStart, durationTicks: gameDur });
        }
      } else if (type === 0x90) {
        // Note On (velocity=0 treated as Note Off).
        const pitch = bytes[fileOffset++];
        const vel = bytes[fileOffset++];
        const key = pitch * 16 + channel;
        if (vel === 0) {
          const onTick = pending.get(key);
          if (onTick !== undefined) {
            pending.delete(key);
            const gameStart = Math.round(onTick * GAME_PPQ / midiPPQ);
            const gameDur = Math.round((absMidiTick - onTick) * GAME_PPQ / midiPPQ);
            if (gameDur > 0) output.push({ pitch, startTick: gameStart, durationTicks: gameDur });
          }
        } else {
          pending.set(key, absMidiTick);
        }
      } else if (type === 0xa0 || type === 0xb0 || type === 0xe0) {
        fileOffset += 2; // aftertouch / CC / pitchbend
      } else if (type === 0xc0 || type === 0xd0) {
        fileOffset += 1; // program / channel pressure
      } else {
        break; // unknown status; abandon track
      }
    }

    fileOffset = trackEnd;
  }

  return output.sort((a, b) => a.startTick - b.startTick);
}

// ── MIDI → WaveScore conversion ───────────────────────────────────────────────

function pitchToBand(pitch: number, minPitch: number, maxPitch: number): FrequencyBand {
  const range = maxPitch - minPitch;
  if (range < 3) return 'mid';
  const norm = (pitch - minPitch) / range; // 0..1, low→high
  if (norm >= 0.66) return 'high';
  if (norm >= 0.33) return 'mid';
  return 'low';
}

export function midiNotesToWaveScore(notes: RawMidiNote[], waveId: string): WaveScore {
  if (notes.length === 0) {
    return { waveId, measures: 4, notes: [], title: waveId };
  }

  const pitches = notes.map(n => n.pitch);
  const minPitch = Math.min(...pitches);
  const maxPitch = Math.max(...pitches);

  const scoreNotes: ScoreNote[] = notes.map(n => {
    const q = quantizeNoteLength(n.durationTicks);
    return {
      tick: n.startTick,
      durationTicks: q.gameTicks,
      enemyTypeId: q.id,
      band: pitchToBand(n.pitch, minPitch, maxPitch),
    };
  });

  const lastEnd = Math.max(...notes.map(n => n.startTick + n.durationTicks));
  const measures = Math.max(4, Math.ceil(lastEnd / TICKS_PER_MEASURE));

  return { waveId, measures, notes: scoreNotes, title: waveId };
}
