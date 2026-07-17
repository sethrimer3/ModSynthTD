/**
 * settings-ui.ts — Settings overlay: community link, audio mixer, rack position,
 * reduced motion, save export/import/reset.
 */

import { SaveData, RackPosition, exportSave, importSave, persistSave, resetSave, SaveStorage } from '../state/save';
import { getAudioEngine } from './audio-engine';
import { createBugReportText, openCopyPanel, openTesterNotes, releaseVersionLine } from './release-info';

const FF = `font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;`;

export interface SettingsUIOpts {
  save: SaveData;
  storage: SaveStorage;
  onSaveChanged(): void;
  onRackPositionChanged(): void;
  onWireDisplayChanged(): void;
  onReset(): void;
}

export function openSettings(parent: HTMLElement, opts: SettingsUIOpts): void {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,3,10,0.85);z-index:200;
    display:flex;align-items:center;justify-content:center;${FF}
  `;
  const panel = document.createElement('div');
  panel.style.cssText = `
    background:#070d1a;border:1.5px solid #2a3d65;border-radius:14px;
    padding:1.2rem 1.4rem;display:flex;flex-direction:column;gap:0.8rem;
    width:min(420px, 92vw);max-height:88vh;overflow-y:auto;color:#cfe6ff;
  `;
  overlay.appendChild(panel);

  const h = document.createElement('div');
  h.textContent = 'SETTINGS — ModSynth TD';
  h.style.cssText = 'font-size:0.85rem;font-weight:800;letter-spacing:0.1em;color:#dff6ff;';
  panel.appendChild(h);

  const version = document.createElement('div');
  version.textContent = releaseVersionLine();
  version.style.cssText = 'font-size:0.56rem;color:#88aacc;line-height:1.35;';
  panel.appendChild(version);

  const discordLink = document.createElement('a');
  discordLink.href = 'https://discord.gg/dSwR3Fj7du';
  discordLink.target = '_blank';
  discordLink.rel = 'noopener noreferrer';
  discordLink.textContent = 'JOIN THE MODSYNTH TD DISCORD';
  discordLink.setAttribute('aria-label', 'Join the ModSynth TD Discord server');
  discordLink.style.cssText = `${FF}display:block;padding:12px 14px;text-align:center;text-decoration:none;
    font-size:0.78rem;font-weight:900;letter-spacing:0.08em;color:#fff;background:#5865f2;
    border:2px solid #aeb5ff;border-radius:9px;box-shadow:0 0 16px rgba(88,101,242,0.72);
    cursor:pointer;`;
  panel.appendChild(discordLink);

  const row = (label: string, control: HTMLElement) => {
    const r = document.createElement('div');
    r.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:0.8rem;flex-wrap:wrap;';
    const l = document.createElement('span');
    l.textContent = label;
    l.style.cssText = 'font-size:0.68rem;color:#88aacc;letter-spacing:0.05em;';
    r.append(l, control);
    panel.appendChild(r);
    return r;
  };

  const sectionHeader = (text: string) => {
    const s = document.createElement('div');
    s.textContent = text;
    s.style.cssText = 'font-size:0.6rem;font-weight:800;letter-spacing:0.15em;color:#446688;border-bottom:1px solid #16243c;padding-bottom:4px;margin-top:0.3rem;';
    panel.appendChild(s);
  };

  const applyAudio = () => {
    const s = opts.save.settings;
    getAudioEngine().setPrefs({
      masterMuted: s.masterMuted,
      masterVolume: s.masterVolume,
      percussionVolume: s.percussionVolume,
      sfxVolume: s.sfxVolume,
      towersVolume: s.towersVolume,
      beatLoopVolume: s.beatLoopVolume,
      bgLoopVolume: s.bgLoopVolume,
      enemyNotesVolume: s.enemyNotesVolume,
    });
    opts.onSaveChanged();
  };

  const slider = (value: number, onInput: (v: number) => void) => {
    const s = document.createElement('input');
    s.type = 'range';
    s.min = '0'; s.max = '100';
    s.value = String(Math.round(value * 100));
    s.style.cssText = 'width:min(150px, 54vw);accent-color:#00ddcc;';
    s.addEventListener('input', () => onInput(parseInt(s.value, 10) / 100));
    return s;
  };

  const styleToggle = (b: HTMLButtonElement, on: boolean, onLabel: string, offLabel: string) => {
    b.textContent = on ? onLabel : offLabel;
    b.style.cssText = `${FF}font-size:0.65rem;font-weight:800;padding:4px 12px;border-radius:6px;cursor:pointer;
      background:${on ? '#11281a' : '#0a1020'};border:1.5px solid ${on ? '#33dd88' : '#2a3d65'};color:${on ? '#33dd88' : '#5577aa'};`;
  };

  // ── Master ──────────────────────────────────────────────────────────────────

  const muteBtn = document.createElement('button');
  const refreshMute = () => styleToggle(muteBtn, !opts.save.settings.masterMuted, 'SOUND ON', 'MUTED');
  muteBtn.addEventListener('click', () => {
    opts.save.settings.masterMuted = !opts.save.settings.masterMuted;
    refreshMute();
    applyAudio();
  });
  refreshMute();
  row('Master audio', muteBtn);
  row('Master volume', slider(opts.save.settings.masterVolume, v => { opts.save.settings.masterVolume = v; applyAudio(); }));

  // ── Audio Mixer ─────────────────────────────────────────────────────────────

  sectionHeader('MUSIC');
  row('Beat Loop',       slider(opts.save.settings.beatLoopVolume,   v => { opts.save.settings.beatLoopVolume   = v; applyAudio(); }));
  row('Background Loop', slider(opts.save.settings.bgLoopVolume,     v => { opts.save.settings.bgLoopVolume     = v; applyAudio(); }));
  row('Enemy Notes',     slider(opts.save.settings.enemyNotesVolume, v => { opts.save.settings.enemyNotesVolume = v; applyAudio(); }));

  sectionHeader('SOUND EFFECTS');
  row('SFX',              slider(opts.save.settings.sfxVolume,    v => { opts.save.settings.sfxVolume    = v; applyAudio(); }));
  row('Emitters/Towers',  slider(opts.save.settings.towersVolume, v => { opts.save.settings.towersVolume = v; applyAudio(); }));

  // ── Visual ───────────────────────────────────────────────────────────────────

  sectionHeader('DISPLAY');

  const posWrap = document.createElement('div');
  posWrap.style.cssText = 'display:flex;gap:4px;';
  const positions: RackPosition[] = ['auto', 'left', 'right', 'below'];
  const posBtns = new Map<RackPosition, HTMLButtonElement>();
  const refreshPos = () => {
    for (const [p, b] of posBtns) {
      const on = opts.save.settings.rackPosition === p;
      b.style.background = on ? '#102a3a' : '#0a1020';
      b.style.borderColor = on ? '#00ddcc' : '#2a3d65';
      b.style.color = on ? '#00ddcc' : '#5577aa';
    }
  };
  for (const p of positions) {
    const b = document.createElement('button');
    b.textContent = p.toUpperCase();
    b.style.cssText = `${FF}font-size:0.6rem;font-weight:800;padding:4px 8px;border-radius:6px;cursor:pointer;border:1.5px solid #2a3d65;background:#0a1020;color:#5577aa;`;
    b.addEventListener('click', () => {
      opts.save.settings.rackPosition = p;
      refreshPos();
      opts.onSaveChanged();
      opts.onRackPositionChanged();
    });
    posBtns.set(p, b);
    posWrap.appendChild(b);
  }
  refreshPos();
  row('Rack position', posWrap);

  const rmBtn = document.createElement('button');
  const refreshRm = () => styleToggle(rmBtn, opts.save.settings.reducedMotion, 'REDUCED', 'FULL');
  rmBtn.addEventListener('click', () => {
    opts.save.settings.reducedMotion = !opts.save.settings.reducedMotion;
    refreshRm();
    opts.onSaveChanged();
  });
  refreshRm();
  row('Motion', rmBtn);

  sectionHeader('CONTROLS');
  const zoomSensitivity = document.createElement('input');
  zoomSensitivity.type = 'range';
  zoomSensitivity.min = '50'; zoomSensitivity.max = '200'; zoomSensitivity.step = '5';
  zoomSensitivity.value = String(Math.round(opts.save.settings.zoomSensitivity * 100));
  zoomSensitivity.style.cssText = 'width:min(150px, 54vw);accent-color:#00ddcc;';
  const zoomValue = document.createElement('span');
  zoomValue.style.cssText = 'min-width:38px;font-size:0.62rem;color:#00ddcc;text-align:right;';
  const zoomWrap = document.createElement('div');
  zoomWrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
  zoomWrap.append(zoomSensitivity, zoomValue);
  const refreshZoomValue = () => { zoomValue.textContent = `${Math.round(opts.save.settings.zoomSensitivity * 100)}%`; };
  zoomSensitivity.addEventListener('input', () => {
    opts.save.settings.zoomSensitivity = parseInt(zoomSensitivity.value, 10) / 100;
    refreshZoomValue();
    opts.onSaveChanged();
  });
  refreshZoomValue();
  row('Zoom sensitivity', zoomWrap);

  sectionHeader('GRAPHICS');
  const wireLayer = document.createElement('input');
  wireLayer.type = 'range';
  wireLayer.min = '0'; wireLayer.max = '1'; wireLayer.step = '1';
  wireLayer.value = opts.save.settings.wireLayer === 'front' ? '1' : '0';
  wireLayer.style.cssText = 'width:min(150px, 54vw);accent-color:#00ddcc;';
  const wireLayerValue = document.createElement('span');
  wireLayerValue.style.cssText = 'min-width:46px;font-size:0.62rem;color:#00ddcc;text-align:right;';
  const wireLayerWrap = document.createElement('div');
  wireLayerWrap.style.cssText = 'display:flex;align-items:center;gap:8px;';
  wireLayerWrap.append(wireLayer, wireLayerValue);
  const refreshWireLayer = () => { wireLayerValue.textContent = opts.save.settings.wireLayer === 'front' ? 'FRONT' : 'BEHIND'; };
  wireLayer.addEventListener('input', () => {
    opts.save.settings.wireLayer = wireLayer.value === '1' ? 'front' : 'behind';
    refreshWireLayer();
    opts.onSaveChanged();
    opts.onWireDisplayChanged();
  });
  refreshWireLayer();
  row('Wires', wireLayerWrap);
  row('Wire opacity', slider(opts.save.settings.wireOpacity, v => {
    opts.save.settings.wireOpacity = v;
    opts.onSaveChanged();
    opts.onWireDisplayChanged();
  }));

  // ── Save tools ───────────────────────────────────────────────────────────────

  const tools = document.createElement('div');
  tools.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:0.4rem;border-top:1px solid #16243c;padding-top:0.8rem;';
  const toolBtn = (label: string, color: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `${FF}font-size:0.62rem;font-weight:800;padding:5px 10px;border-radius:6px;cursor:pointer;background:#0a1020;border:1.5px solid ${color};color:${color};letter-spacing:0.05em;`;
    b.addEventListener('click', fn);
    tools.appendChild(b);
    return b;
  };

  const status = document.createElement('div');
  status.style.cssText = 'font-size:0.6rem;color:#88aacc;min-height:1em;';

  toolBtn('EXPORT SAVE', '#33dd88', () => {
    const text = exportSave(opts.save);
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `modsynth-td-save-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    status.textContent = 'Save exported.';
  });

  toolBtn('REPORT BUG / FEEDBACK', '#ffcc44', () => {
    openCopyPanel(parent.ownerDocument.getElementById('app') ?? parent, 'BUG / FEEDBACK REPORT', createBugReportText({ save: opts.save }));
  });

  toolBtn('TESTER NOTES', '#aa88ff', () => {
    openTesterNotes(parent.ownerDocument.getElementById('app') ?? parent);
  });

  toolBtn('IMPORT SAVE', '#44aaff', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      void file.text().then(text => {
        const result = importSave(text);
        if (!result.ok || !result.save) {
          status.textContent = `Import rejected: ${result.error}`;
          status.style.color = '#ff6677';
          return;
        }
        Object.assign(opts.save, result.save);
        persistSave(opts.storage, opts.save);
        status.textContent = `Imported.${result.repairs && result.repairs.length > 0 ? ` ${result.repairs.length} repair(s) applied.` : ''}`;
        status.style.color = '#33dd88';
        opts.onReset();
      });
    });
    input.click();
  });

  let confirmReset = false;
  const resetBtn = toolBtn('RESET PROGRESS', '#ff6677', () => {
    if (!confirmReset) {
      confirmReset = true;
      resetBtn.textContent = 'REALLY RESET? CLICK AGAIN';
      setTimeout(() => { confirmReset = false; resetBtn.textContent = 'RESET PROGRESS'; }, 4000);
      return;
    }
    const fresh = resetSave(opts.storage);
    Object.assign(opts.save, fresh);
    opts.onReset();
    overlay.remove();
  });

  panel.appendChild(tools);
  panel.appendChild(status);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'CLOSE';
  closeBtn.style.cssText = `${FF}font-size:0.68rem;font-weight:800;padding:6px;border-radius:8px;cursor:pointer;background:#0a1020;border:1.5px solid #2a3d65;color:#88aacc;margin-top:0.4rem;`;
  closeBtn.addEventListener('click', () => overlay.remove());
  panel.appendChild(closeBtn);

  overlay.addEventListener('pointerdown', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  parent.appendChild(overlay);
}
