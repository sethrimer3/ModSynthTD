/**
 * tutorials.ts - Contextual, dismissible, persisted one-shot tips.
 */

import { SaveData } from '../state/save';

const FF = `font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;`;

export interface TutorialDef {
  id: string;
  text: string;
}

export const TUTORIALS: Record<string, string> = {
  'camera': 'Drag to pan, scroll or pinch to zoom. The rack and battlefield are one shared scene.',
  'first-patch': 'Patch the starter route: CLOCK out to OSC trig, then OSC voice to OUT.',
  'score': 'The glowing score IS the wave. Hover a note to see its Hz, HP, speed, and match quality.',
  'tower': 'OUT owns the emitter tower. Drag the bright OUT tower silhouette onto the battlefield before starting.',
  'start-wave': 'When Patch Analysis says VALID and the OUT tower is placed, press START WAVE.',
  'multi-output': 'Multiple OUT modules create multiple towers. Patch different routes into different OUTs to fire from different places.',
  'bands': 'Match your OSC band (LO/MI/HI) to an enemy ring color for x2 damage. Mismatches resist.',
  'hz-match': 'Exact Hz hits resonate hardest. Near matches still work; mismatches look weak and deal reduced damage.',
  'two-lanes': 'Two lanes, two threats. Place a second Output tower on the far path; one tower fires in one direction and cannot cover both routes alone.',
  'osc-combat': 'OSC changes the tower voice: BAND changes resonant color and match damage; WAVE changes projectile shape.',
  'clock-combat': 'CLOCK RATE is the firing rhythm. Faster subdivisions produce more frequent tower pulses.',
  'delay-combat': 'DELAY adds quieter repeated shots. Echo projectiles appear as ghosted copies.',
  'shop': 'Buy modules with Resonance. Selling refunds 100% outside combat, so experiment freely.',
  'shelf': 'More shelves, more modules. Empty purchased shelves refund fully.',
  'live-lock': 'The rack is LIVE during a wave: topology is locked, but glowing knobs stay adjustable.',
  'test-pulse': 'PULSE sends one test signal through your patch so you can watch the route light up.',
  'synth': 'The OUT module SYNTH switch makes your patch audible. What you hear is what fights.',
  'cipher': 'Divide the pulse. Displace one voice in time. Reunite them at a mixer, then send a PULSE.',
  'timing': 'DELAY and PHASE shift events in time. Echoes land on off-beats, and phase offset splits the stream into two staggered voices.',
  'mixing': 'MIXER combines up to four signals. Route two differently tuned OSC voices into one tower for layered damage.',
  'filtering': 'BAND FILTER passes one resonance band and silences others. Combine it with PITCH FILTER for precision targeting.',
  'sequencing': 'SEQUENCER steps through a pitch pattern, one step per incoming event. Pair it with ARP to spread chords across dense note streams.',
  'target-lock': 'TARGET LOCK world: enemies vary too fast for static tuning. Use TARGET TUNER to auto-aim, or plan with Pitch Router and Sequencer.',
};

export class TutorialManager {
  private container: HTMLElement;
  private save: SaveData;
  private onSeen: () => void;
  private activeEl: HTMLElement | null = null;
  private queue: string[] = [];

  constructor(parent: HTMLElement, save: SaveData, onSeen: () => void) {
    this.save = save;
    this.onSeen = onSeen;
    this.container = document.createElement('div');
    this.container.style.cssText = `
      position:absolute;bottom:14px;left:50%;transform:translateX(-50%);
      display:flex;flex-direction:column;gap:6px;z-index:90;pointer-events:none;
      max-width:min(480px, 92%);
    `;
    parent.appendChild(this.container);
  }

  trigger(id: string, replay = false): void {
    if (!TUTORIALS[id]) return;
    if (!replay && this.save.tutorialsSeen.includes(id)) return;
    if (!this.save.tutorialsSeen.includes(id)) {
      this.save.tutorialsSeen.push(id);
      this.onSeen();
    }
    if (this.activeEl) {
      this.queue.push(id);
      return;
    }
    this.show(id);
  }

  private show(id: string): void {
    const el = document.createElement('div');
    el.style.cssText = `
      ${FF}font-size:11px;line-height:1.5;color:#cfe6ff;
      background:rgba(8,16,32,0.94);border:1px solid #2a4d7a;border-radius:10px;
      padding:9px 30px 9px 12px;pointer-events:auto;position:relative;
      box-shadow:0 4px 18px rgba(0,0,0,0.5), 0 0 12px rgba(60,140,255,0.15);
      animation:msv2-tut-in 0.25s ease-out;
    `;
    el.textContent = TUTORIALS[id];
    const close = document.createElement('button');
    close.textContent = 'x';
    close.style.cssText = `
      position:absolute;top:4px;right:6px;background:none;border:none;color:#5577aa;
      ${FF}font-size:14px;cursor:pointer;padding:2px;
    `;
    const dismiss = () => {
      el.remove();
      this.activeEl = null;
      const next = this.queue.shift();
      if (next) this.show(next);
    };
    close.addEventListener('click', dismiss);
    el.appendChild(close);
    this.container.appendChild(el);
    this.activeEl = el;
    setTimeout(dismiss, 11000);
  }

  destroy(): void {
    this.container.remove();
  }
}
