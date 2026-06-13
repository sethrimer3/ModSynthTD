/**
 * level.ts — The unified-scene level screen.
 *
 * Battlefield canvas, DOM rack, and SVG wires share ONE camera-driven
 * world-space scene. Combat, cable pulses, and audio all derive from the
 * same compiled SignalEvents on one integer-tick transport.
 */

import { WorldDef, getWorld, CAMPAIGN_ORDER } from '../data/worlds';
import { compileScore, WaveScore } from '../core/score';
import { evaluatePatch, validateGraph, RackGraph } from '../core/graph';
import { SignalEvent } from '../core/events';
import { PPQ, TICKS_PER_MEASURE, ticksToSec } from '../core/ticks';
import { combineSeeds, hashString } from '../core/rng';
import {
  SaveData, getWorldSave, getWorldRack, setWorldRack, persistSave, SaveStorage, TowerOrientation as SaveTowerOrient,
} from '../state/save';
import {
  recordWaveCleared, recordWorldCompleted, ensureStarterRack,
  purchaseModule, sellModule, purchaseShelf, refundShelf, shelfCost, MAX_ROWS, CURRENCY_SYMBOL,
} from '../state/economy';
import { getModuleType } from '../core/modules';
import {
  applyWorldCompletionUnlocks, checkCipherRoute, revealSecretWorld, canAttemptCipher,
} from '../state/progression';
import { Camera, attachCameraControls } from './camera';
import { Combat, TowerState, rotateTower, TILE_PX, preloadSprites } from './combat';
import { towerStyleForOutput } from './tower-style';
import { createRackUI, RackUI, rackWidthPx, rackHeightPx } from './rack-ui';
import { renderNotation, NotationLayout, NotationNoteLayout } from './notation';
import { getAudioEngine } from './audio-engine';
import { LevelMusicManager } from './level-music';
import { LEVEL_AUDIO_CONFIGS } from './level-audio-assets';
import { TutorialManager } from './tutorials';
import { openShop } from './shop-ui';
import { openSettings } from './settings-ui';

const FF = `font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;`;
const MAX_BASE_HP = 10;
const SCENE_GAP = 60;

type RunState = 'ready' | 'countin' | 'wave' | 'cleared' | 'failed' | 'victory';

export interface LevelHost {
  save: SaveData;
  storage: SaveStorage;
  exitToMap(): void;
  persist(): void;
}

export function enterLevel(app: HTMLElement, worldId: string, host: LevelHost): () => void {
  const maybeWorld = getWorld(worldId);
  if (!maybeWorld) { host.exitToMap(); return () => undefined; }
  const world: WorldDef = maybeWorld;
  preloadSprites();

  const save = host.save;
  const worldSave = getWorldSave(save, worldId);
  ensureStarterRack(save, worldId);
  host.persist();

  const audio = getAudioEngine();
  // Unlock audio on level entry (this is inside a click/tap gesture handler).
  void audio.unlock();

  // ── Level music (optional: only present when a config exists for this world) ─
  const levelAudioConfig = LEVEL_AUDIO_CONFIGS[worldId] ?? null;
  const levelMusic = levelAudioConfig
    ? new LevelMusicManager(audio, levelAudioConfig)
    : null;

  // ── State ─────────────────────────────────────────────────────────────────
  const graph: RackGraph = getWorldRack(save, worldId);
  const towers = new Map<string, TowerState>();
  const towerStyles = new Map<string, ReturnType<typeof towerStyleForOutput>>();
  for (const output of graph.modules.filter(m => m.typeId === 'output')) {
    const saved = worldSave.towersByOutputId[output.instanceId];
    if (saved) towers.set(output.instanceId, { ...saved });
    towerStyles.set(output.instanceId, towerStyleForOutput(output.instanceId));
  }

  let runState: RunState = 'ready';
  let baseHp = MAX_BASE_HP;
  let waveIndex = worldSave.completed ? 0 : Math.min(worldSave.bestWave, world.waves.length - 1);
  let endlessActive = false;
  let endlessCount = worldSave.endlessBest;
  let waveEscapes = 0;
  let lastWaveSummary = '';
  const runSeed = (Date.now() & 0xffff);

  // Transport.
  let startPerfMs = performance.now();
  let lastTick = -1;
  let waveStartTick = -1;
  let waveTotalTicks = 0;
  let countinStartTick = 0;  // tick when the countin/intro began
  let activeIntroBars = 1;   // bars of intro for current wave (4 for MIDI, 1 otherwise)
  let placement = { active: false, tile: null as [number, number] | null, outputModuleId: null as string | null };

  const combat = new Combat(world, towers, towerStyles);
  let graphDirty = false;
  let persistTimer = 0;

  // ── DOM scaffold ──────────────────────────────────────────────────────────
  app.innerHTML = '';
  app.style.cssText = `position:fixed;inset:0;background:#01030a;overflow:hidden;${FF}`;

  // Viewport (camera target).
  const viewport = document.createElement('div');
  viewport.style.cssText = 'position:absolute;inset:0;overflow:hidden;touch-action:none;cursor:grab;';
  app.appendChild(viewport);

  // Battlefield canvas (viewport-sized; camera applied in draw).
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:block;pointer-events:none;';
  viewport.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;

  // Rack scene layer (CSS-transformed with the same camera).
  const rackLayer = document.createElement('div');
  rackLayer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;transform-origin:0 0;pointer-events:none;';
  viewport.appendChild(rackLayer);

  const notationWorld = document.createElement('div');
  notationWorld.style.cssText = 'position:absolute;pointer-events:none;';
  rackLayer.appendChild(notationWorld);

  const rackRoot = document.createElement('div');
  rackRoot.style.cssText = 'position:absolute;pointer-events:auto;';
  rackLayer.appendChild(rackRoot);

  const camera = new Camera();

  // ── Scene layout (rack placement) ─────────────────────────────────────────
  function effectiveRackSide(): 'left' | 'right' | 'below' {
    const setting = save.settings.rackPosition;
    if (setting !== 'auto') return setting;
    const portrait = window.innerHeight >= window.innerWidth;
    return portrait ? 'below' : 'right';
  }

  let rackWorldX = 0, rackWorldY = 0;
  function layoutScene(): void {
    const bfW = world.gridWidth * TILE_PX;
    const bfH = world.gridHeight * TILE_PX;
    const rW = rackWidthPx();
    const rH = rackHeightPx(worldSave.shelfCount, true);
    const side = effectiveRackSide();
    if (side === 'right') { rackWorldX = bfW + SCENE_GAP; rackWorldY = 0; }
    else if (side === 'left') { rackWorldX = -(rW + SCENE_GAP); rackWorldY = 0; }
    else { rackWorldX = 0; rackWorldY = bfH + SCENE_GAP; }
    rackRoot.style.left = `${rackWorldX}px`;
    rackRoot.style.top = `${rackWorldY}px`;
    rackRoot.style.width = `${rW}px`;
    rackRoot.style.height = `${rH}px`;
    notationWorld.style.left = '0px';
    notationWorld.style.top = '-150px';
    notationWorld.style.width = `${bfW}px`;

    const minX = Math.min(0, rackWorldX);
    const minY = Math.min(-150, rackWorldY);
    const maxX = Math.max(bfW, rackWorldX + rW);
    const maxY = Math.max(bfH, rackWorldY + rH);
    camera.setBounds({ minX, minY, maxX, maxY });
  }

  function applyCamera(): void {
    rackLayer.style.transform = `translate(${camera.panX}px, ${camera.panY}px) scale(${camera.zoom})`;
  }

  function focusGrid(): void {
    camera.centerOn({ minX: 0, minY: 0, maxX: world.gridWidth * TILE_PX, maxY: world.gridHeight * TILE_PX });
    applyCamera();
  }

  function focusRack(): void {
    camera.centerOn({
      minX: rackWorldX,
      minY: rackWorldY,
      maxX: rackWorldX + rackWidthPx(),
      maxY: rackWorldY + rackHeightPx(worldSave.shelfCount, true),
    });
    applyCamera();
  }

  // ── Rack UI ───────────────────────────────────────────────────────────────
  const rack: RackUI = createRackUI({
    root: rackRoot,
    graph,
    getShelfCount: () => worldSave.shelfCount,
    getZoom: () => camera.zoom,
    isLive: () => runState === 'countin' || runState === 'wave',
    themeColor: world.theme.primary,
    reducedMotion: () => save.settings.reducedMotion,
    wireLayer: () => save.settings.wireLayer,
    wireOpacity: () => save.settings.wireOpacity,
    onGraphChanged: () => { graphDirty = true; },
    onSellModule: (id) => {
      if (runState === 'wave' || runState === 'countin') return;
      const r = sellModule(save, worldId, id);
      if (r.ok) { towers.delete(id); towerStyles.delete(id); setWorldRack(save, worldId, graph); rack.rebuild(); markGraphDirty(); host.persist(); }
    },
    onBuyShelf: () => {
      const r = purchaseShelf(save, worldId);
      if (r.ok) { layoutScene(); rack.rebuild(); host.persist(); refreshHud(); }
    },
    onRefundShelf: () => {
      const r = refundShelf(save, worldId);
      if (r.ok) { layoutScene(); rack.rebuild(); host.persist(); refreshHud(); }
    },
    canBuyShelf: () => {
      if (worldSave.shelfCount >= MAX_ROWS) return { ok: false, label: 'Max rows' };
      const cost = shelfCost(worldSave.shelfCount + 1);
      return { ok: save.resonance >= cost, label: `${cost} Resonance` };
    },
    canRefundShelf: () => {
      const sc = worldSave.shelfCount;
      if (sc <= 1) return false;
      const lastRow = sc - 1;
      return !graph.modules.some(m => {
        const h = getModuleType(m.typeId)?.rackSize.h ?? 1;
        return m.gridY <= lastRow && m.gridY + h > lastRow;
      });
    },
    onModuleSelected: () => undefined,
    onBeginTowerDrag: (outputModuleId, clientX, clientY) => {
      placement.active = true;
      placement.outputModuleId = outputModuleId;
      updateTowerDrag(clientX, clientY);
      tut.trigger('tower');
    },
    onRotateTower: (outputModuleId) => {
      const tower = towers.get(outputModuleId);
      if (tower) { rotateTower(tower); saveTowers(); host.persist(); }
    },
    onSynthToggle: () => toggleSynth(),
    onTestPulse: () => sendTestPulse(),
    getTowerState: (outputModuleId) => ({ isPlaced: towers.has(outputModuleId), style: towerStyles.get(outputModuleId) ?? towerStyleForOutput(outputModuleId) }),
    getSynthState: () => {
      const out = graph.modules.find(m => m.typeId === 'output');
      const on = out?.settings['synthOn'] === true;
      return { configured: on, active: on && audio.unlocked && !save.settings.masterMuted, needsGesture: on && audio.needsGesture };
    },
  });

  // ── HUD (screen-space) ────────────────────────────────────────────────────
  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:flex-start;padding:10px 12px;pointer-events:none;z-index:100;gap:8px;';
  app.appendChild(hud);

  const hudLeft = document.createElement('div');
  hudLeft.style.cssText = 'display:flex;flex-direction:column;gap:2px;pointer-events:auto;';
  const nameEl = document.createElement('div');
  nameEl.textContent = world.name;
  nameEl.style.cssText = `font-size:0.9rem;font-weight:800;color:${world.theme.glow};text-shadow:0 0 14px ${world.theme.primary}66;`;
  const bpmEl = document.createElement('div');
  bpmEl.textContent = `${world.bpm} BPM · ♩`;
  bpmEl.style.cssText = 'font-size:0.62rem;color:#5577aa;letter-spacing:0.08em;';
  const lessonEl = document.createElement('div');
  lessonEl.textContent = world.lesson;
  lessonEl.style.cssText = 'font-size:0.56rem;color:#44608a;max-width:260px;';
  hudLeft.append(nameEl, bpmEl, lessonEl);

  const hudCenter = document.createElement('div');
  hudCenter.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;pointer-events:auto;flex:1;';
  const waveEl = document.createElement('div');
  waveEl.style.cssText = 'font-size:0.78rem;font-weight:800;color:#ffcc00;letter-spacing:0.06em;';
  const stateEl = document.createElement('div');
  stateEl.style.cssText = 'font-size:0.6rem;font-weight:800;letter-spacing:0.1em;';
  const startBtn = document.createElement('button');
  startBtn.style.cssText = `${FF}font-size:0.72rem;font-weight:800;letter-spacing:0.08em;background:#ffcc0022;border:1.5px solid #ffcc00;color:#ffcc00;border-radius:8px;padding:5px 18px;cursor:pointer;box-shadow:0 0 12px #ffcc0044;`;
  startBtn.addEventListener('click', startWave);
  const countEl = document.createElement('div');
  countEl.style.cssText = 'font-size:1.5rem;font-weight:800;color:#ffcc00;text-shadow:0 0 20px #ffcc00;display:none;';
  hudCenter.append(waveEl, stateEl, startBtn, countEl);

  const hudRight = document.createElement('div');
  hudRight.style.cssText = 'display:flex;flex-direction:column;align-items:flex-end;gap:4px;pointer-events:auto;';
  const hpEl = document.createElement('div');
  hpEl.style.cssText = 'font-size:0.7rem;font-weight:800;';
  const resEl = document.createElement('div');
  resEl.style.cssText = 'font-size:0.66rem;font-weight:800;color:#00ddcc;';
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:5px;';
  const mkHudBtn = (label: string, title: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.title = title;
    b.style.cssText = `${FF}font-size:0.62rem;font-weight:700;background:rgba(8,15,28,0.85);border:1px solid #2a3d65;color:#88aacc;border-radius:6px;padding:4px 8px;cursor:pointer;`;
    b.addEventListener('click', fn);
    btnRow.appendChild(b);
    return b;
  };
  mkHudBtn('🛒 Shop', 'Buy and sell modules', openShopUI);
  mkHudBtn('⚙', 'Settings', openSettingsUI);
  mkHudBtn('⤢ Fit', 'Fit the whole scene', () => { camera.fitScene(); applyCamera(); });
  mkHudBtn('Rack', 'Focus camera on the rack', focusRack);
  mkHudBtn('Grid', 'Focus camera on the playfield', focusGrid);
  mkHudBtn('↩ Map', 'Return to the world map', () => host.exitToMap());
  hudRight.append(hpEl, resEl, btnRow);

  hud.append(hudLeft, hudCenter, hudRight);

  // ── Notation preview ──────────────────────────────────────────────────────
  const notationWrap = document.createElement('div');
  notationWrap.style.cssText = `
    position:absolute;left:50%;transform:translateX(-50%);top:0;
    width:min(620px,calc(100vw - 24px));overflow:hidden;z-index:80;box-sizing:border-box;
    background:rgba(6,12,24,0.82);border:1px solid ${world.theme.primary}44;border-radius:10px;
    padding:4px 6px;box-shadow:0 0 18px ${world.theme.primary}22;pointer-events:none;transition:opacity 0.3s;
  `;
  const notationInner = document.createElement('div');
  notationInner.style.cssText = 'position:relative;';
  const notationLabel = document.createElement('div');
  notationLabel.textContent = 'NEXT WAVE  ·  NOTE LENGTH = ENEMY SPEED';
  notationLabel.style.cssText = `position:absolute;left:8px;top:2px;font-size:7px;font-weight:800;letter-spacing:0.12em;color:${world.theme.glow};opacity:0.72;z-index:4;`;
  const notationEffects = document.createElement('div');
  notationEffects.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:3;';
  notationWrap.appendChild(notationInner);
  const playhead = document.createElement('div');
  playhead.style.cssText = `position:absolute;top:0;bottom:0;width:2px;background:${world.theme.glow};box-shadow:0 0 8px ${world.theme.glow};display:none;pointer-events:none;`;
  const loopPlayhead = document.createElement('div');
  loopPlayhead.style.cssText = `position:absolute;top:0;bottom:0;width:2px;background:${world.theme.glow};box-shadow:0 0 5px ${world.theme.glow};opacity:0.25;pointer-events:none;`;
  notationInner.append(notationLabel, notationEffects, loopPlayhead, playhead);
  notationWorld.appendChild(notationWrap);
  let notation: NotationLayout | null = null;
  let effectiveCompiled = compileScore(currentWaveScore());
  const noteEls: HTMLDivElement[] = [];
  const reducedMotion = () => save.settings.reducedMotion;

  function fitNotation(): void {
    if (!notation) return;
    const availableWidth = Math.max(1, notationWrap.clientWidth - 12);
    const scale = Math.min(1, availableWidth / notation.widthPx);
    notationInner.style.width = `${notation.widthPx}px`;
    notationInner.style.height = `${notation.heightPx}px`;
    notationInner.style.transformOrigin = 'top left';
    notationInner.style.transform = `scale(${scale})`;
    notationWrap.style.height = `${notation.heightPx * scale + 8}px`;
  }

  function rebuildNotation(score: WaveScore): void {
    notation?.canvas.remove();
    notation = renderNotation(score, world.theme.glow);
    notationInner.insertBefore(notation.canvas, notationLabel);
    noteEls.length = 0;
    notationEffects.replaceChildren();
    for (const note of notation.notes) {
      const el = document.createElement('div');
      const size = note.durationTicks >= 192 ? 13 : note.durationTicks >= 96 ? 11 : note.durationTicks <= 12 ? 6 : note.durationTicks <= 24 ? 7 : 9;
      el.style.cssText = `position:absolute;width:${size}px;height:${size}px;border:1px solid ${note.color};border-radius:50%;background:${note.color}44;box-shadow:0 0 5px ${note.color};transform:translate(-50%,-50%);will-change:transform,opacity;`;
      notationEffects.appendChild(el);
      noteEls.push(el);
    }
    fitNotation();
  }

  // ── Overlays ──────────────────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(0,2,8,0.9);z-index:150;pointer-events:auto;';
  const overlayTitle = document.createElement('div');
  overlayTitle.style.cssText = 'font-size:1.3rem;font-weight:800;letter-spacing:0.1em;';
  const overlaySub = document.createElement('div');
  overlaySub.style.cssText = 'font-size:0.72rem;color:#88aacc;letter-spacing:0.06em;text-align:center;max-width:360px;';
  const overlayBtns = document.createElement('div');
  overlayBtns.style.cssText = 'display:flex;gap:10px;margin-top:6px;';
  overlay.append(overlayTitle, overlaySub, overlayBtns);
  app.appendChild(overlay);

  function showOverlay(): void { overlay.style.display = 'flex'; }
  function hideOverlay(): void { overlay.style.display = 'none'; }
  function addOverlayBtn(label: string, color: string, fn: () => void): void {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `${FF}font-size:0.72rem;font-weight:800;letter-spacing:0.06em;background:${color}22;border:1.5px solid ${color};color:${color};border-radius:8px;padding:8px 16px;cursor:pointer;`;
    b.addEventListener('click', fn);
    overlayBtns.appendChild(b);
  }

  // ── Tutorials ─────────────────────────────────────────────────────────────
  const tut = new TutorialManager(app, save, () => host.persist());

  // ── Cipher reveal banner ──────────────────────────────────────────────────
  const cipherBanner = document.createElement('div');
  cipherBanner.style.cssText = `
    position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) scale(0.6);opacity:0;
    font-size:1.1rem;font-weight:800;color:#fff;text-align:center;z-index:160;pointer-events:none;
    text-shadow:0 0 30px #fff,0 0 60px #88ccff;transition:transform 0.6s,opacity 0.6s;max-width:80%;
  `;
  app.appendChild(cipherBanner);

  // ── Camera controls ───────────────────────────────────────────────────────
  const detachCamera = attachCameraControls(viewport, camera, {
    isInteractive: (target) => {
      const el = target as HTMLElement | null;
      return !!el && !!el.closest && !!el.closest('button,input,[data-rack-interactive="true"]');
    },
    onTap: (wx, wy) => {
      // Tower selection / placement happens in battlefield world space.
      const tx = Math.floor(wx / TILE_PX);
      const ty = Math.floor(wy / TILE_PX);
      if (placement.active && placement.outputModuleId) {
        const valid = tx >= 0 && tx < world.gridWidth && ty >= 0 && ty < world.gridHeight && !combat.isTrackTile(tx, ty);
        if (valid) {
          const previous = towers.get(placement.outputModuleId);
          towers.set(placement.outputModuleId, { tileX: tx, tileY: ty, orientation: previous?.orientation ?? 'north' });
          placement.active = false;
          placement.outputModuleId = null;
          viewport.style.cursor = 'grab';
          saveTowers();
          host.persist();
          rack.rebuild();
        }
      }
    },
    onChanged: applyCamera,
  });

  function updateTowerDrag(clientX: number, clientY: number): void {
    const r = viewport.getBoundingClientRect();
    const w = camera.screenToWorld(clientX - r.left, clientY - r.top);
    placement.tile = [Math.floor(w.x / TILE_PX), Math.floor(w.y / TILE_PX)];
    viewport.style.cursor = 'crosshair';
  }
  viewport.addEventListener('pointermove', (e) => {
    if (!placement.active) return;
    updateTowerDrag(e.clientX, e.clientY);
  });
  const onTowerPointerMove = (e: PointerEvent) => {
    if (placement.active) updateTowerDrag(e.clientX, e.clientY);
  };
  const onTowerPointerUp = () => {
    if (!placement.active || !placement.outputModuleId || !placement.tile) return;
    const [tx, ty] = placement.tile;
    const valid = tx >= 0 && tx < world.gridWidth && ty >= 0 && ty < world.gridHeight && !combat.isTrackTile(tx, ty);
    if (valid) {
      const previous = towers.get(placement.outputModuleId);
      towers.set(placement.outputModuleId, { tileX: tx, tileY: ty, orientation: previous?.orientation ?? 'north' });
      saveTowers();
      host.persist();
    }
    placement.active = false;
    placement.outputModuleId = null;
    placement.tile = null;
    viewport.style.cursor = 'grab';
    rack.rebuild();
  };
  window.addEventListener('pointermove', onTowerPointerMove);
  window.addEventListener('pointerup', onTowerPointerUp);
  window.addEventListener('pointercancel', onTowerPointerUp);

  // ── Resize ────────────────────────────────────────────────────────────────
  function resize(): void {
    const r = viewport.getBoundingClientRect();
    canvas.width = Math.round(r.width * devicePixelRatio);
    canvas.height = Math.round(r.height * devicePixelRatio);
    camera.setViewport(r.width, r.height);
    layoutScene();
    applyCamera();
    fitNotation();
  }
  const ro = new ResizeObserver(() => resize());
  ro.observe(viewport);
  const onOrient = () => { resize(); camera.fitScene(); applyCamera(); };
  window.addEventListener('orientationchange', onOrient);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function saveTowers(): void {
    worldSave.towersByOutputId = {};
    for (const [outputId, tower] of towers) {
      worldSave.towersByOutputId[outputId] = { tileX: tower.tileX, tileY: tower.tileY, orientation: tower.orientation as SaveTowerOrient };
    }
  }

  function currentWaveScore(): WaveScore {
    return world.waves[Math.min(waveIndex, world.waves.length - 1)];
  }

  function waveSeed(): number {
    return combineSeeds(hashString(worldId), waveIndex, runSeed, endlessActive ? endlessCount : 0);
  }

  let cachedTraffic = new Map<string, SignalEvent[]>();
  let cachedActivity = new Map<string, number>();

  function recompilePreview(): void {
    const score = currentWaveScore();
    const total = score.measures * TICKS_PER_MEASURE;
    // Evaluate the patch over the whole wave window for cable pulses + notation-independent traffic.
    const seed = waveSeed();
    const result = evaluatePatch(graph, { startTick: 0, endTick: total + PPQ * 4, seedBase: seed });
    cachedTraffic = result.cableTraffic;
    cachedActivity = result.moduleActivity;
    rack.setTraffic(cachedTraffic, cachedActivity);

    // Notation render — prefer MIDI score if available, fall back to authored.
    const midiScore = levelMusic?.getMidiScore(waveIndex) ?? null;
    const notationScore = midiScore ?? score;
    effectiveCompiled = compileScore(notationScore);
    rebuildNotation(notationScore);
  }

  function markGraphDirty(): void { graphDirty = true; }

  function rebuildSignalsForWave(): ReturnType<typeof evaluatePatch> {
    const score = currentWaveScore();
    const total = score.measures * TICKS_PER_MEASURE;
    const seed = waveSeed();
    const result = evaluatePatch(graph, { startTick: 0, endTick: total + PPQ * 4, seedBase: seed });
    cachedTraffic = result.cableTraffic;
    cachedActivity = result.moduleActivity;
    rack.setTraffic(cachedTraffic, cachedActivity);
    return result;
  }

  // ── Wave flow ─────────────────────────────────────────────────────────────
  function startWave(): void {
    if (runState !== 'ready' && runState !== 'cleared') return;
    const v = validateGraph(graph);
    if (v.status === 'cycle' || v.status === 'no-output-route' || v.status === 'missing-starter' || v.status === 'incompatible' || v.status === 'invalid') {
      flashState(`Patch invalid: ${v.status.replace(/-/g, ' ')}`, '#ff6677');
      return;
    }
    void audio.unlock();
    waveEscapes = 0;

    const nowTick = currentTickFloat();
    countinStartTick = nowTick;

    const hasMidi = levelMusic?.hasMidi(waveIndex) ?? false;
    const audioNow = audio.currentTime;
    const waveStartCtxTime = levelMusic?.nextLoopBoundary(audioNow)
      ?? audioNow + ticksToSec(TICKS_PER_MEASURE, world.bpm);
    const countinTicks = Math.max(1, (waveStartCtxTime - audioNow) * world.bpm * PPQ / 60);
    activeIntroBars = countinTicks / TICKS_PER_MEASURE;
    waveStartTick = nowTick + countinTicks;

    // Resolve the wave score: prefer MIDI-derived, fall back to authored.
    const midiScore = levelMusic?.getMidiScore(waveIndex) ?? null;
    const effectiveScore = midiScore ?? currentWaveScore();
    effectiveCompiled = compileScore(effectiveScore);
    waveTotalTicks = effectiveScore.measures * TICKS_PER_MEASURE;

    // Re-render notation with the MIDI score if available.
    if (midiScore) {
      rebuildNotation(midiScore);
    }

    const evaluation = rebuildSignalsForWave();
    const missing = [...evaluation.eventsByOutput.keys()].filter(outputId => !towers.has(outputId));
    if (missing.length > 0) {
      flashState(`Place tower for ${missing.map(id => graph.modules.find(m => m.instanceId === id)?.typeId.toUpperCase() ?? 'OUT').join(', ')}`, '#ff6677');
      return;
    }
    const localEvents = evaluation.events;
    combat.startWave(effectiveCompiled, waveStartTick);
    combat.setSignalEvents(new Map([...evaluation.eventsByOutput].map(([id, events]) => [id, events.map(e => ({ ...e, tick: e.tick + waveStartTick }))])));

    // Schedule synth audio for the whole wave.
    for (const e of localEvents) {
      audio.scheduleEvent(e, waveStartCtxTime, world.bpm);
    }

    // Start the wave OGG at the live-wave boundary, after count-in completes.
    if (hasMidi && levelMusic) {
      levelMusic.scheduleIntro(waveIndex, waveStartCtxTime);
    }

    runState = 'countin';
    tut.trigger('live-lock');
    tut.trigger('bands');
    tut.trigger('osc-combat');
    tut.trigger('clock-combat');
    if (graph.modules.some(m => m.typeId === 'delay')) tut.trigger('delay-combat');
    refreshHud();
  }

  function onWaveCleared(): void {
    const stats = combat.getWaveStats();
    lastWaveSummary = `KO ${stats.enemiesDefeated} · ESC ${waveEscapes} · SHOTS ${stats.shotsFired} · MATCH ${stats.matchedHits} · RESIST ${stats.resistedHits}`;
    combat.clearWave();
    if (endlessActive) {
      endlessCount++;
      if (endlessCount > worldSave.endlessBest) { worldSave.endlessBest = endlessCount; host.persist(); }
      waveIndex = (waveIndex + 1) % world.waves.length;
      runState = 'cleared';
      recompilePreview();
      refreshHud();
      return;
    }

    const campaignWave = waveIndex + 1;
    const reward = recordWaveCleared(save, worldId, campaignWave, world.rewardTable);
    if (reward.awarded > 0) flashState(`+${reward.awarded} ${CURRENCY_SYMBOL}`, '#33dd88');

    if (waveIndex >= world.waves.length - 1) {
      // World complete.
      const completion = recordWorldCompleted(save, worldId, world.completionReward);
      const granted = applyWorldCompletionUnlocks(save, worldId);
      host.persist();
      showVictory(completion.awarded, granted);
      return;
    }
    waveIndex++;
    runState = 'cleared';
    recompilePreview();
    // Preload MIDI for the newly advanced wave index.
    if (levelMusic) {
      levelMusic.waitForMidiScore(waveIndex).then(score => {
        if (score && (runState === 'ready' || runState === 'cleared')) recompilePreview();
      });
    }
    host.persist();
    refreshHud();
  }

  function onFailed(): void {
    runState = 'failed';
    combat.clearWave();
    audio.cancelAll();
    // Background loops keep playing after failure — that's intentional.
    // (The loops stop only on level exit via levelMusic.destroy())
    overlayTitle.textContent = 'BASE OVERWHELMED';
    overlayTitle.style.color = '#ff3344';
    overlaySub.textContent = `Reached ${endlessActive ? 'endless ' : ''}wave ${endlessActive ? endlessCount + 1 : waveIndex + 1} of ${world.name}.`;
    overlayBtns.innerHTML = '';
    addOverlayBtn('↺ RESTART WAVE', '#33ff88', () => { hideOverlay(); resetForRetry(); });
    addOverlayBtn('↩ WORLD MAP', '#5577aa', () => host.exitToMap());
    showOverlay();
  }

  function showVictory(awarded: number, granted: string[]): void {
    runState = 'victory';
    combat.clearWave();
    overlayTitle.textContent = worldId === 'w200' ? 'THE FINAL MEASURE RESOLVES' : 'WORLD COMPLETE';
    overlayTitle.style.color = world.theme.glow;
    const unlockNames = granted.map(g => g.toUpperCase()).join(', ');
    overlaySub.innerHTML = `${world.name} cleared!<br>+${world.completionReward} ${CURRENCY_SYMBOL} Resonance${awarded === 0 ? ' (already claimed)' : ''}` +
      (unlockNames ? `<br><span style="color:#33dd88">Unlocked: ${unlockNames}</span>` : '');
    if (worldId === 'w200') save.finalBossDefeated = true;
    overlayBtns.innerHTML = '';
    addOverlayBtn('↩ WORLD MAP', world.theme.primary, () => host.exitToMap());
    addOverlayBtn('∞ ENDLESS', '#aa66ff', () => { hideOverlay(); beginEndless(); });
    host.persist();
    showOverlay();
  }

  function beginEndless(): void {
    endlessActive = true;
    waveIndex = 0;
    runState = 'ready';
    baseHp = MAX_BASE_HP;
    recompilePreview();
    refreshHud();
  }

  function resetForRetry(): void {
    baseHp = MAX_BASE_HP;
    runState = 'ready';
    combat.clearWave();
    recompilePreview();
    refreshHud();
  }

  // ── Test pulse + cipher ───────────────────────────────────────────────────
  function sendTestPulse(): void {
    if (runState === 'wave' || runState === 'countin') return;
    void audio.unlock();
    const pulse: SignalEvent = {
      id: 'test', tick: 0, durationTicks: PPQ, band: 'mid', waveform: 'pulse', hasVoice: false,
      amplitude: 1, gate: 0.5, attackTicks: 0, releaseTicks: 6, pitchOffset: 0,
      directions: ['north'], route: [], sourceModuleId: '', seed: 1, tags: ['test'],
    };
    const result = evaluatePatch(graph, { startTick: 0, endTick: PPQ * 2, seedBase: 12345, injectAtSources: [pulse] });
    // Flash the whole contributing route.
    const v = validateGraph(graph);
    rack.highlightRoute(v.contributing);
    for (const id of v.contributing) rack.flashModule(id);
    setTimeout(() => rack.highlightRoute(null), 1400);
    if (result.events.length > 0) {
      audio.playTestBlip(result.events[0]);
      tut.trigger('test-pulse');
      tryCipherReveal();
    } else {
      flashState('Test pulse did not reach the output', '#ffaa44');
    }
  }

  function tryCipherReveal(): void {
    if (save.secretRevealed) return;
    if (!canAttemptCipher(save, CAMPAIGN_ORDER)) return;
    const check = checkCipherRoute(graph);
    if (!check.ok) return;
    if (revealSecretWorld(save)) {
      host.persist();
      if (check.routeModuleIds) {
        rack.highlightRoute(new Set(check.routeModuleIds));
        for (const id of check.routeModuleIds) rack.flashModule(id);
      }
      cipherBanner.innerHTML = 'THE HIDDEN MEASURE REVEALS ITSELF<br><span style="font-size:0.7rem;color:#cceeff">A ninth world appears on the map — The Final Measure, 200 BPM.</span>';
      cipherBanner.style.transform = 'translate(-50%,-50%) scale(1)';
      cipherBanner.style.opacity = '1';
      setTimeout(() => { cipherBanner.style.opacity = '0'; cipherBanner.style.transform = 'translate(-50%,-50%) scale(0.6)'; }, 4500);
    }
  }

  // ── Synth toggle ──────────────────────────────────────────────────────────
  function toggleSynth(): void {
    const out = graph.modules.find(m => m.typeId === 'output');
    if (!out) return;
    const next = !(out.settings['synthOn'] === true);
    out.settings['synthOn'] = next;
    void audio.unlock().then(() => {
      audio.setPrefs({
        synthOn: next,
        synthVolume: typeof out.settings['synthVolume'] === 'number' ? out.settings['synthVolume'] as number : 0.5,
        masterMuted: save.settings.masterMuted,
        masterVolume: save.settings.masterVolume,
        percussionVolume: save.settings.percussionVolume,
      });
    });
    setWorldRack(save, worldId, graph);
    host.persist();
    rack.refreshControls();
    tut.trigger('synth');
  }

  // ── Shop / settings ───────────────────────────────────────────────────────
  function openShopUI(): void {
    openShop(app, {
      save, worldId,
      isLive: () => runState === 'wave' || runState === 'countin',
      onBuy: (typeId) => {
        const r = purchaseModule(save, worldId, typeId);
        if (r.ok && typeId === 'output' && r.instanceId) towerStyles.set(r.instanceId, towerStyleForOutput(r.instanceId));
        if (r.ok) { setWorldRack(save, worldId, graph); rack.rebuild(); markGraphDirty(); host.persist(); refreshHud(); }
        return r;
      },
      onClose: () => { rack.rebuild(); markGraphDirty(); },
    });
    tut.trigger('shop');
  }

  function openSettingsUI(): void {
    openSettings(app, {
      save, storage: host.storage,
      onSaveChanged: () => host.persist(),
      onRackPositionChanged: () => { layoutScene(); camera.fitScene(); applyCamera(); },
      onWireDisplayChanged: () => rack.refreshWireDisplay(),
      onReset: () => host.exitToMap(),
    });
  }

  // ── HUD refresh ───────────────────────────────────────────────────────────
  let stateFlash = '';
  let stateFlashColor = '';
  let stateFlashUntil = 0;
  function flashState(text: string, color: string): void {
    stateFlash = text; stateFlashColor = color; stateFlashUntil = performance.now() + 1600;
  }

  function refreshHud(): void {
    const totalWaves = endlessActive ? '∞' : world.waves.length;
    const wn = endlessActive ? endlessCount + 1 : waveIndex + 1;
    waveEl.textContent = `WAVE ${wn} / ${totalWaves}`;
    hpEl.textContent = `BASE ${baseHp}/${MAX_BASE_HP}`;
    hpEl.style.color = baseHp <= 3 ? '#ff3344' : baseHp <= 6 ? '#ffcc00' : '#33ff88';
    resEl.textContent = `${CURRENCY_SYMBOL} ${save.resonance}`;

    const labels: Record<RunState, string> = { ready: 'PREPARE', countin: 'COUNT-IN', wave: 'LIVE', cleared: 'CLEARED', failed: 'FAILED', victory: 'COMPLETE' };
    const colors: Record<RunState, string> = { ready: '#5577aa', countin: '#ffcc00', wave: '#33ff88', cleared: '#33dd88', failed: '#ff3344', victory: '#aa66ff' };
    if (performance.now() < stateFlashUntil) {
      stateEl.textContent = stateFlash;
      stateEl.style.color = stateFlashColor;
    } else {
      stateEl.textContent = labels[runState];
      stateEl.style.color = colors[runState];
    }
    if (runState === 'cleared' && lastWaveSummary && performance.now() >= stateFlashUntil) {
      stateEl.textContent = lastWaveSummary;
    }

    const canStart = runState === 'ready' || runState === 'cleared';
    startBtn.style.display = canStart ? 'block' : 'none';
    startBtn.textContent = `▶ START WAVE ${wn}`;
    notationWrap.style.opacity = runState === 'wave' ? '0.35' : '1';
  }

  // ── Transport ─────────────────────────────────────────────────────────────
  function currentTickFloat(): number {
    return (performance.now() - startPerfMs) / 1000 * world.bpm * PPQ / 60;
  }

  let rafId = 0;
  let lastFrameMs = performance.now();

  function frame(): void {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastFrameMs) / 1000);
    lastFrameMs = now;

    const tickFloat = currentTickFloat();
    const intTick = Math.floor(tickFloat);

    // Recompile when graph edited in prep.
    if (graphDirty) {
      graphDirty = false;
      if (runState === 'ready' || runState === 'cleared') {
        recompilePreview();
        setWorldRack(save, worldId, graph);
        persistTimer = 0.8;
      } else if (runState === 'wave' || runState === 'countin') {
        // Live knob change: recompute future events.
        const localNow = Math.max(0, intTick - waveStartTick);
        const evaluation = rebuildSignalsForWave();
        const localEvents = evaluation.events;
        combat.replaceFutureSignalEvents(new Map([...evaluation.eventsByOutput].map(([id, events]) => [id, events.map(e => ({ ...e, tick: e.tick + waveStartTick }))])), intTick);
        const audioNow = audio.currentTime;
        const waveStartCtxTime = audioNow + ticksToSec(waveStartTick - tickFloat, world.bpm);
        for (const e of localEvents) if (e.tick > localNow) audio.scheduleEvent(e, waveStartCtxTime, world.bpm);
      }
    }
    if (persistTimer > 0) {
      persistTimer -= dt;
      if (persistTimer <= 0) host.persist();
    }

    // Process newly crossed integer ticks (catch-up capped).
    if (lastTick < 0) lastTick = intTick - 1;
    const gap = intTick - lastTick;
    if (gap > 0) {
      const from = gap > 64 ? intTick : lastTick + 1; // resync after suspension
      for (let t = from; t <= intTick; t++) {
        if (runState === 'countin' && t >= waveStartTick) runState = 'wave';
        if (runState === 'wave') {
          const outcome = combat.processTick(t);
          for (const spawned of outcome.spawnedEvents) flashResolvedNote(spawned.spawnIndex);
          if (outcome.escapes > 0) {
            waveEscapes += outcome.escapes;
            baseHp = Math.max(0, baseHp - outcome.escapes);
            if (baseHp <= 0) { onFailed(); break; }
          }
          if (outcome.fired) rack.flashModule(graph.modules.find(m => m.typeId === 'output')?.instanceId ?? '');
        }
        // Percussion.
        if ((runState === 'wave' || runState === 'countin')) {
          const audioTime = audio.currentTime + ticksToSec(t - tickFloat, world.bpm);
          if (t % PPQ === 0 && (levelMusic?.shouldPlayFallbackKick() ?? true)) {
            audio.playKick((t / PPQ) | 0, audioTime);
          }
          if (t % (PPQ / 2) === 0 && combat.aliveCount > 0) audio.playHihat(audioTime);
        }
      }
      lastTick = intTick;
    }

    // Per-frame combat animation/collision.
    if (runState === 'wave') {
      combat.updateFrame(dt, tickFloat);
      // Wave completion.
      if (combat.allSpawned && combat.aliveCount === 0 && combat.pendingSpawnCount === 0) {
        onWaveCleared();
      }
    } else {
      combat.updateFrame(dt, tickFloat);
    }

    // Try to start background loops once audio is unlocked and buffers ready.
    levelMusic?.tryStartLoops();

    // Rack pulses use local tick.
    rack.setCurrentTick(runState === 'wave' || runState === 'countin' ? tickFloat - waveStartTick : (tickFloat % (TICKS_PER_MEASURE * 2)));
    rack.update(now);

    // Notation playhead.
    if (notation) {
      const loopPhase = levelMusic?.loopPhase(audio.currentTime)
        ?? (((tickFloat % (TICKS_PER_MEASURE * 4)) + TICKS_PER_MEASURE * 4) % (TICKS_PER_MEASURE * 4)) / (TICKS_PER_MEASURE * 4);
      loopPlayhead.style.left = `${notation.tickToX(loopPhase * waveTotalTicks)}px`;
    }
    if (notation && runState === 'countin') {
      const introElapsed = Math.max(0, tickFloat - countinStartTick);
      const totalIntroTicks = activeIntroBars * TICKS_PER_MEASURE;
      const fraction = Math.min(1, introElapsed / totalIntroTicks);
      playhead.style.display = 'block';
      playhead.style.left = `${notation.tickToX(fraction * waveTotalTicks)}px`;
    } else if (notation && runState === 'wave') {
      const local = tickFloat - waveStartTick;
      if (local >= 0 && local <= waveTotalTicks) {
        playhead.style.display = 'block';
        playhead.style.left = `${notation.tickToX(local)}px`;
      } else {
        playhead.style.display = 'none';
      }
    } else if (notation) {
      playhead.style.display = 'none';
    }
    updateNotationEffects(tickFloat);

    // Render battlefield.
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    combat.draw(ctx, canvas, camera, tickFloat, placement);

    // Dev overlay.
    if (debugEl && levelMusic) {
      const bar = Math.floor(tickFloat / TICKS_PER_MEASURE) + 1;
      const beat = Math.floor((tickFloat % TICKS_PER_MEASURE) / PPQ) + 1;
      const introElapsed = Math.max(0, tickFloat - countinStartTick);
      const midiScore = levelMusic.getMidiScore(waveIndex);
      const nextNote = midiScore?.notes.find(n => n.tick > (tickFloat - waveStartTick));
      debugEl.textContent = [
        `ctx:${audio.currentTime.toFixed(2)}s  tick:${tickFloat.toFixed(0)}`,
        `bar ${bar} beat ${beat}`,
        `state:${runState}  intro:${runState === 'countin' ? `${(introElapsed / TICKS_PER_MEASURE).toFixed(2)}/${activeIntroBars}bars` : 'off'}`,
        levelMusic.debugInfo(waveIndex),
        nextNote ? `next:${nextNote.enemyTypeId}@tick${nextNote.tick}(${nextNote.durationTicks}t)` : 'next:—',
      ].join('\n');
    }

    refreshHud();
    rafId = requestAnimationFrame(frame);
  }

  function flashResolvedNote(spawnIndex: number): void {
    const el = noteEls[spawnIndex];
    if (!el) return;
    el.style.transition = reducedMotion() ? 'none' : 'transform 120ms,opacity 220ms';
    el.style.transform = 'translate(-50%,-50%) scale(2.2)';
    el.style.opacity = '0';
  }

  function updateNotationEffects(tickFloat: number): void {
    if (!notation) return;
    const isCountin = runState === 'countin';
    const localTick = tickFloat - waveStartTick;
    const introProgress = isCountin
      ? Math.min(1, Math.max(0, (tickFloat - countinStartTick) / (activeIntroBars * TICKS_PER_MEASURE)))
      : 1;
    const beatPhase = ((tickFloat % PPQ) + PPQ) % PPQ / PPQ;
    notationWrap.style.boxShadow = isCountin
      ? `0 0 ${8 + (1 - beatPhase) * 14}px ${world.theme.primary}44`
      : `0 0 18px ${world.theme.primary}22`;
    for (let i = 0; i < notation.notes.length; i++) {
      const note: NotationNoteLayout = notation.notes[i];
      const el = noteEls[i];
      if (!el) continue;
      const until = note.tick - localTick;
      if (localTick > note.tick) {
        if (el.style.opacity !== '0') el.style.opacity = '0';
        continue;
      }
      const approach = Math.max(0, Math.min(1, 1 - until / PPQ));
      const previewOffset = isCountin && !reducedMotion() ? (1 - introProgress) * Math.min(36, 8 + note.durationTicks * 0.12) : 0;
      const pulse = until >= 0 && until <= PPQ / 2 ? 1 + approach * 0.75 : 1;
      el.style.transition = 'none';
      el.style.left = `${note.x + previewOffset}px`;
      el.style.top = `${note.y}px`;
      el.style.opacity = `${0.3 + approach * 0.7}`;
      el.style.transform = `translate(-50%,-50%) scale(${reducedMotion() ? 1 : pulse})`;
      el.style.boxShadow = `0 0 ${5 + approach * 10}px ${note.color}`;
    }
  }

  // ── Dev overlay (add ?dev to the URL to enable) ───────────────────────────
  const devMode = typeof location !== 'undefined' && new URLSearchParams(location.search).has('dev');
  let debugEl: HTMLDivElement | null = null;
  if (devMode) {
    debugEl = document.createElement('div');
    debugEl.style.cssText = [
      'position:absolute;bottom:8px;left:8px;z-index:200;pointer-events:none;',
      'font-size:0.48rem;color:#44ff88;background:rgba(0,0,0,0.75);',
      'padding:5px 7px;border-radius:5px;white-space:pre;line-height:1.6;',
      `font-family:monospace;border:1px solid #44ff8844;`,
    ].join('');
    app.appendChild(debugEl);
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  resize();
  camera.centerOn({ minX: 0, minY: 0, maxX: world.gridWidth * TILE_PX, maxY: world.gridHeight * TILE_PX });
  applyCamera();
  recompilePreview();

  // When MIDI loads asynchronously, update notation in the prep phase.
  if (levelMusic) {
    levelMusic.waitForMidiScore(waveIndex).then(score => {
      if (score && (runState === 'ready' || runState === 'cleared')) {
        recompilePreview();
      }
    });
  }

  // Apply persisted synth/audio prefs (silent until a gesture).
  const outMod = graph.modules.find(m => m.typeId === 'output');
  audio.setPrefs({
    synthOn: outMod?.settings['synthOn'] === true,
    synthVolume: typeof outMod?.settings['synthVolume'] === 'number' ? outMod!.settings['synthVolume'] as number : 0.5,
    masterMuted: save.settings.masterMuted,
    masterVolume: save.settings.masterVolume,
    percussionVolume: save.settings.percussionVolume,
    sfxVolume: save.settings.sfxVolume,
    towersVolume: save.settings.towersVolume,
    beatLoopVolume: save.settings.beatLoopVolume,
    bgLoopVolume: save.settings.bgLoopVolume,
    enemyNotesVolume: save.settings.enemyNotesVolume,
  });
  refreshHud();
  tut.trigger('camera');
  setTimeout(() => { if (runState === 'ready') tut.trigger('first-patch'); }, 1800);
  setTimeout(() => { if (runState === 'ready') tut.trigger('score'); }, 3600);
  if (worldSave.completed && canAttemptCipher(save, CAMPAIGN_ORDER) && !save.secretRevealed) {
    setTimeout(() => tut.trigger('cipher'), 5200);
  }
  rafId = requestAnimationFrame(frame);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  return () => {
    cancelAnimationFrame(rafId);
    ro.disconnect();
    window.removeEventListener('orientationchange', onOrient);
    window.removeEventListener('pointermove', onTowerPointerMove);
    window.removeEventListener('pointerup', onTowerPointerUp);
    window.removeEventListener('pointercancel', onTowerPointerUp);
    detachCamera();
    rack.destroy();
    tut.destroy();
    levelMusic?.destroy();
    audio.teardown();
    setWorldRack(save, worldId, graph);
    saveTowers();
    host.persist();
    app.innerHTML = '';
    app.style.cssText = '';
  };
}
