import { CURRENT_SCHEMA_VERSION, SaveData, getWorldSave } from '../state/save';
import { RackGraph } from '../core/graph';
import { getAudioEngine } from './audio-engine';

declare const __APP_VERSION__: string | undefined;
declare const __BUILD_DATE__: string | undefined;

export const PRIVATE_ALPHA_LABEL = 'private alpha';
export const BUILD_LABEL = 'BUILD 006';

export function appVersion(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.1.0';
}

export function buildDate(): string {
  return typeof __BUILD_DATE__ === 'string' ? __BUILD_DATE__ : 'dev';
}

export function releaseVersionLine(): string {
  return `ModSynth TD v${appVersion()} ${BUILD_LABEL} ${buildDate()} ${PRIVATE_ALPHA_LABEL} save v${CURRENT_SCHEMA_VERSION}`;
}

export interface BugReportContext {
  save: SaveData;
  worldId?: string;
  waveIndex?: number;
  runState?: string;
  graph?: RackGraph;
  placedOutputTowerCount?: number;
}

export function createBugReportText(ctx: BugReportContext): string {
  const worldId = ctx.worldId ?? 'world-map';
  const worldSave = ctx.worldId ? getWorldSave(ctx.save, ctx.worldId) : null;
  const graph = ctx.graph ?? (worldSave?.rack ?? { modules: [], cables: [] });
  const outputTowerCount = ctx.placedOutputTowerCount ?? (worldSave ? Object.keys(worldSave.towersByOutputId).length : 0);
  const outputModules = graph.modules.filter(module => module.typeId === 'output');
  const synthEnabledCount = outputModules.filter(module => module.settings['synthOn'] === true).length;
  const audio = getAudioEngine();
  return [
    'ModSynth TD bug / feedback report',
    `version: ${appVersion()}`,
    `build: ${BUILD_LABEL}`,
    `buildDate: ${buildDate()}`,
    `label: ${PRIVATE_ALPHA_LABEL}`,
    `saveSchemaVersion: ${CURRENT_SCHEMA_VERSION}`,
    `worldId: ${worldId}`,
    `waveIndex: ${ctx.waveIndex !== undefined ? ctx.waveIndex : 'n/a'}`,
    `runState: ${ctx.runState ?? 'world-map'}`,
    `rackModuleCount: ${graph.modules.length}`,
    `cableCount: ${graph.cables.length}`,
    `placedOutputTowerCount: ${outputTowerCount}`,
    `browserUserAgent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a'}`,
    `reducedMotion: ${ctx.save.settings.reducedMotion}`,
    `audioUnlocked: ${audio.unlocked}`,
    `synthEnabledOutputCount: ${synthEnabledCount}`,
    '',
    'What happened:',
    '',
    'What you expected:',
    '',
    'Steps to reproduce:',
  ].join('\n');
}

export function openCopyPanel(parent: HTMLElement, title: string, text: string): void {
  const FF = `font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;`;
  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,3,10,0.84);z-index:360;display:flex;align-items:center;justify-content:center;${FF}`;
  const panel = document.createElement('div');
  panel.style.cssText = 'width:min(560px,92vw);max-height:88vh;background:#070d1a;border:1.5px solid #2a3d65;border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:10px;color:#cfe6ff;';
  const heading = document.createElement('div');
  heading.textContent = title;
  heading.style.cssText = 'font-size:0.78rem;font-weight:900;letter-spacing:0.1em;color:#dff6ff;';
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.cssText = `${FF}width:100%;height:260px;resize:vertical;background:#030811;border:1px solid #1e3558;border-radius:8px;color:#cfe6ff;padding:10px;font-size:0.62rem;line-height:1.5;`;
  const status = document.createElement('div');
  status.style.cssText = 'min-height:1em;font-size:0.58rem;color:#88aacc;';
  const buttons = document.createElement('div');
  buttons.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;';
  const makeButton = (label: string, color: string, onClick: () => void): void => {
    const button = document.createElement('button');
    button.textContent = label;
    button.style.cssText = `${FF}font-size:0.64rem;font-weight:800;letter-spacing:0.06em;background:#0a1020;border:1.5px solid ${color};color:${color};border-radius:7px;padding:6px 12px;cursor:pointer;`;
    button.addEventListener('click', onClick);
    buttons.appendChild(button);
  };
  makeButton('COPY', '#33dd88', () => {
    textarea.select();
    const fallbackCopied = document.execCommand('copy');
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(textarea.value)
        .then(() => { status.textContent = 'Copied report text.'; status.style.color = '#33dd88'; })
        .catch(() => { status.textContent = fallbackCopied ? 'Copied report text.' : 'Select the text and copy manually.'; });
    } else {
      status.textContent = fallbackCopied ? 'Copied report text.' : 'Select the text and copy manually.';
    }
  });
  makeButton('CLOSE', '#88aacc', () => overlay.remove());
  panel.append(heading, textarea, status, buttons);
  overlay.appendChild(panel);
  overlay.addEventListener('pointerdown', event => { if (event.target === overlay) overlay.remove(); });
  parent.appendChild(overlay);
  textarea.focus();
  textarea.select();
}

export function openHowToPlay(parent: HTMLElement): void {
  openCopyPanel(parent, 'HOW TO PLAY', [
    'CLOCK creates rhythm.',
    'OSC creates pitch and voice.',
    'OUT owns an emitter tower.',
    'Drag the OUT tower onto the battlefield.',
    'Patch cables left-to-right.',
    'Exact Hz hits are strongest.',
    'Clear waves to earn Resonance.',
    'Buy modules in the shop.',
    'The rack keeps running between waves.',
  ].join('\n'));
}
