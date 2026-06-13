/**
 * app.ts — ModSynth TD root. Loads the save, routes between the world map
 * and levels, and owns persistence. One screen alive at a time; the level
 * returns a cleanup function that tears down its scene, audio, and listeners.
 */

import { SaveData, SaveStorage, loadSave, persistSave } from './state/save';
import { showWorldMap } from './ui/worldmap';
import { enterLevel } from './ui/level';

function getStorage(): SaveStorage {
  try {
    const test = '__msv2_probe__';
    window.localStorage.setItem(test, '1');
    window.localStorage.removeItem(test);
    return window.localStorage;
  } catch {
    // Private mode / disabled storage: in-memory fallback so the game still runs.
    const mem = new Map<string, string>();
    return {
      getItem: k => mem.get(k) ?? null,
      setItem: (k, v) => { mem.set(k, v); },
      removeItem: k => { mem.delete(k); },
    };
  }
}

export function startModSynthTD(): void {
  const app = document.getElementById('app');
  if (!app) return;

  const storage = getStorage();
  const loaded = loadSave(storage);
  const save: SaveData = loaded.save;

  let levelCleanup: (() => void) | null = null;

  const persist = () => persistSave(storage, save);

  const goToMap = () => {
    if (levelCleanup) { levelCleanup(); levelCleanup = null; }
    showWorldMap(app, {
      save,
      storage,
      onEnterWorld: (worldId) => {
        if (levelCleanup) { levelCleanup(); levelCleanup = null; }
        levelCleanup = enterLevel(app, worldId, { save, storage, exitToMap: goToMap, persist });
      },
      onSaveChanged: persist,
      onReset: goToMap,
    });
  };

  goToMap();

  // Surface a non-destructive recovery / migration notice once.
  if (loaded.recoveredFromCorrupt || loaded.repairs.length > 0) {
    showRecoveryNotice(app, loaded.recoveredFromCorrupt, loaded.repairs);
  }
}

function showRecoveryNotice(app: HTMLElement, recovered: boolean, repairs: string[]): void {
  const FF = `font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;`;
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:300;
    max-width:min(440px,92%);background:rgba(20,12,8,0.95);border:1px solid #7a5a2a;
    border-radius:10px;padding:10px 30px 10px 12px;color:#ffddaa;${FF}font-size:0.64rem;line-height:1.5;
    box-shadow:0 6px 20px rgba(0,0,0,0.6);
  `;
  const lines = recovered
    ? ['Your previous save could not be read and was backed up. A fresh save was started — the original value is preserved in storage.']
    : [`Save loaded with ${repairs.length} safe repair(s):`, ...repairs.slice(0, 4)];
  toast.innerHTML = lines.map(l => l).join('<br>');
  const close = document.createElement('button');
  close.textContent = '×';
  close.style.cssText = `position:absolute;top:4px;right:6px;background:none;border:none;color:#aa8855;${FF}font-size:14px;cursor:pointer;`;
  close.addEventListener('click', () => toast.remove());
  toast.appendChild(close);
  app.appendChild(toast);
  setTimeout(() => toast.remove(), 12000);
}
