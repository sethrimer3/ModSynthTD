// ── version2-audio.ts ──────────────────────────────────────────────────────
// Rhythmic audio: kick drums + synthesized hi-hat. One shared AudioContext.

import kick1Url from '../ASSETS/sfx/kick/kick_1.mp3';
import kick2Url from '../ASSETS/sfx/kick/kick_2.mp3';

// ── SubdivisionTransport ───────────────────────────────────────────────────

/**
 * Converts a continuous beatFloat into discrete sixteenth-note subdivision
 * events. Each subdivision (0.25 beats) is processed exactly once.
 * Handles tab suspension by re-syncing when the gap is too large.
 */
export class SubdivisionTransport {
  private lastSubdivIdx = -1;
  /** Max subdivisions to catch up on in one tick (≈4 beats = 16 subdivs). */
  private readonly MAX_CATCHUP = 20;

  /**
   * Call every frame. Returns the list of newly crossed subdiv indices
   * (each index i represents beat i * 0.25).
   */
  tick(beatFloat: number): number[] {
    const currentIdx = Math.floor(beatFloat * 4);

    if (this.lastSubdivIdx === -1) {
      this.lastSubdivIdx = currentIdx;
      return [];
    }

    const gap = currentIdx - this.lastSubdivIdx;

    // Tab-suspension guard: large gap → resync without replaying.
    if (gap > this.MAX_CATCHUP) {
      this.lastSubdivIdx = currentIdx;
      return [];
    }

    const crossed: number[] = [];
    for (let i = this.lastSubdivIdx + 1; i <= currentIdx; i++) {
      crossed.push(i);
    }
    this.lastSubdivIdx = currentIdx;
    return crossed;
  }

  reset(): void { this.lastSubdivIdx = -1; }
}

// ── AudioSystem ────────────────────────────────────────────────────────────

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private kick1Buf: AudioBuffer | null = null;
  private kick2Buf: AudioBuffer | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private _muted = false;
  private initialized = false;

  /** Must be called from a user-gesture handler (satisfies autoplay policy). */
  async init(): Promise<void> {
    if (this.initialized) {
      await this.ctx?.resume();
      return;
    }
    this.initialized = true;
    this.ctx = new AudioContext();
    await Promise.all([
      this.loadBuffer(kick1Url).then(b => { this.kick1Buf = b; }),
      this.loadBuffer(kick2Url).then(b => { this.kick2Buf = b; }),
    ]);
    this.buildNoiseBuffer();
  }

  private async loadBuffer(url: string): Promise<AudioBuffer> {
    const res = await fetch(url);
    const ab = await res.arrayBuffer();
    return this.ctx!.decodeAudioData(ab);
  }

  private buildNoiseBuffer(): void {
    const ctx = this.ctx!;
    // Short fixed-length noise burst; created once, reused for every hat hit.
    const length = Math.ceil(ctx.sampleRate * 0.06);
    this.noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  /**
   * Play the appropriate kick for this beat.
   * beat: integer beat index (0, 1, 2, 3, …)
   * kick_1 plays on 0, 4, 8, … (beat % 4 === 0)
   * kick_2 plays on 1, 2, 3, 5, 6, 7, …
   */
  playKick(beat: number): void {
    if (this._muted || !this.ctx) return;
    const buf = beat % 4 === 0 ? this.kick1Buf : this.kick2Buf;
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    src.start(this.ctx.currentTime);
  }

  /**
   * Play a synthesized hi-hat: white-noise burst through a high-pass filter
   * with a short decay envelope.
   */
  playHihat(): void {
    if (this._muted || !this.ctx || !this.noiseBuffer) return;
    const ctx = this.ctx;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 9000;

    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 11000;
    bpf.Q.value = 0.7;

    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);

    src.connect(hpf).connect(bpf).connect(gain).connect(ctx.destination);
    src.start(now);
  }

  suspend(): void { this.ctx?.suspend(); }
  resume():  void { this.ctx?.resume(); }

  get muted(): boolean { return this._muted; }

  setMuted(m: boolean): void {
    this._muted = m;
    if (this.ctx) {
      if (m) this.ctx.suspend(); else this.ctx.resume();
    }
  }

  get ready(): boolean { return this.initialized && this.ctx !== null; }
}

// ── Module-level singleton ─────────────────────────────────────────────────

let _audioSystem: AudioSystem | null = null;

export function getAudioSystem(): AudioSystem {
  if (!_audioSystem) _audioSystem = new AudioSystem();
  return _audioSystem;
}
