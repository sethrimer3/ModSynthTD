/**
 * level.ts — The unified-scene level screen.
 *
 * Battlefield canvas, DOM rack, and SVG wires share ONE camera-driven
 * world-space scene. Combat, cable pulses, and audio all derive from the
 * same compiled SignalEvents on one integer-tick transport.
 */

import { WorldDef, getWorld, CAMPAIGN_ORDER, nearestExteriorWorldTile } from '../data/worlds';
import { compileScore, WaveScore } from '../core/score';
import { evaluatePatch, validateGraph, RackGraph, GraphIssue, GraphValidation } from '../core/graph';
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
  upgradeLevels, earnInfinityLoops, endlessWaveReward, purchaseUpgrade, INFINITY_SYMBOL,
} from '../state/upgrades';
import {
  applyWorldCompletionUnlocks, checkCipherRoute, revealSecretWorld, canAttemptCipher,
  CIPHER_POST_VICTORY_CLUE,
} from '../state/progression';
import { Camera, attachCameraControls } from './camera';
import { Combat, TowerState, rotateTower, TILE_PX, preloadSprites } from './combat';
import { towerStyleForOutput } from './tower-style';
import { createRackUI, RackUI, rackWidthPx, rackHeightPx } from './rack-ui';
import { renderNotation, NotationLayout, NotationNoteLayout } from './notation';
import { getEnemyDef } from '../core/enemy-defs';
import { analyzePatch, PatchAnalysis, MatchRating } from '../core/patch-analysis';
import { BEHAVIOR_DESCRIPTION, BEHAVIOR_TACTIC, BEHAVIOR_THREAT_LABEL, modifierSummaryLines } from '../core/enemy-modifiers';
import { damageMultiplier, formatHz, formatNoteNameFromMidi } from '../core/pitch';
import { getAudioEngine } from './audio-engine';
import { LevelMusicManager } from './level-music';
import { LEVEL_AUDIO_CONFIGS } from './level-audio-assets';
import { validateLevelAudioConfig } from '../data/level-audio-config';
import { TutorialManager } from './tutorials';
import { openShop } from './shop-ui';
import { openSettings } from './settings-ui';
import { BUILD_LABEL, createBugReportText, openCopyPanel, openHowToPlay, openTesterNotes, releaseVersionLine } from './release-info';
import { createLevelFluidBackground } from './fluid-background';
import { getWorldAesthetic, WorldAesthetic } from '../data/world-aesthetics';
import { NotationColors } from './notation';

const FF = `font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;`;
const MAX_BASE_HP = 10;
const SCENE_GAP = 60;
const SIGNAL_PREVIEW_LOOP_TICKS = TICKS_PER_MEASURE * 4;
const PREVIEW_AUDIO_LOOKAHEAD_TICKS = PPQ;

const loggedAudioConfigWorldIds = new Set<string>();

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
  const aesthetic: WorldAesthetic = getWorldAesthetic(worldId, world.theme);
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
  if (levelAudioConfig && !loggedAudioConfigWorldIds.has(worldId)) {
    loggedAudioConfigWorldIds.add(worldId);
    for (const issue of validateLevelAudioConfig(levelAudioConfig, world.waves.length, worldId)) {
      console.warn(`Level audio config ${issue.severity}: ${issue.message}`);
    }
  }
  const levelMusic = levelAudioConfig
    ? new LevelMusicManager(audio, levelAudioConfig)
    : null;

  // ── State ─────────────────────────────────────────────────────────────────
  const graph: RackGraph = getWorldRack(save, worldId);
  const towers = new Map<string, TowerState>();
  const towerStyles = new Map<string, ReturnType<typeof towerStyleForOutput>>();
  for (const output of graph.modules.filter(m => m.typeId === 'output')) {
    const saved = worldSave.towersByOutputId[output.instanceId];
    if (saved) {
      const [tileX, tileY] = nearestExteriorWorldTile(world, [saved.tileX, saved.tileY]);
      towers.set(output.instanceId, { ...saved, tileX, tileY });
      if (tileX !== saved.tileX || tileY !== saved.tileY) {
        worldSave.towersByOutputId[output.instanceId] = { ...saved, tileX, tileY };
        host.persist();
      }
    }
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
  let placementError = '';

  const fluid = createLevelFluidBackground();
  fluid.resize(world.gridWidth * TILE_PX, world.gridHeight * TILE_PX);
  fluid.setLowGraphicsMode(save.settings.reducedMotion);
  const combat = new Combat(world, towers, towerStyles, fluid);
  combat.setAesthetic(aesthetic);
  let graphDirty = false;
  let persistTimer = 0;

  // ── DOM scaffold ──────────────────────────────────────────────────────────
  app.innerHTML = '';
  // Apply per-world CSS variables and background.
  app.style.cssText = `position:fixed;inset:0;background:${aesthetic.background};overflow:hidden;${FF}`;
  app.style.setProperty('--world-primary',    aesthetic.primary);
  app.style.setProperty('--world-glow',       aesthetic.glow);
  app.style.setProperty('--world-bg',         aesthetic.background);
  app.style.setProperty('--world-panel',      aesthetic.panel);
  app.style.setProperty('--world-border',     aesthetic.border);
  app.style.setProperty('--world-muted',      aesthetic.muted);
  app.style.setProperty('--world-grid',       aesthetic.gridColor);
  app.style.setProperty('--world-track',      aesthetic.trackColor);
  app.style.setProperty('--world-rack-case',  aesthetic.rackCase);
  app.style.setProperty('--world-rack-panel', aesthetic.rackBorder);
  app.style.setProperty('--world-note',       aesthetic.glow);

  // Screen-edge damage flash (base hit feedback).
  const damageFlash = document.createElement('div');
  damageFlash.style.cssText = `
    position:absolute;inset:0;pointer-events:none;z-index:200;
    box-shadow:inset 0 0 0 0 transparent;opacity:0;
    transition:opacity 0.08s ease-in;
    background:radial-gradient(ellipse at center, transparent 30%, rgba(255,30,30,0.55) 100%);
  `;
  app.appendChild(damageFlash);

  function triggerDamageFlash(): void {
    if (save.settings.reducedMotion) return;
    damageFlash.style.transition = 'none';
    damageFlash.style.opacity = '1';
    requestAnimationFrame(() => {
      damageFlash.style.transition = 'opacity 0.6s ease-out';
      damageFlash.style.opacity = '0';
    });
  }

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
  rackLayer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;transform-origin:0 0;pointer-events:auto;';
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
    themeColor: aesthetic.primary,
    rackColors: {
      case:       aesthetic.rackCase,
      border:     aesthetic.rackBorder,
      gridV:      aesthetic.rackGridV,
      gridH:      aesthetic.rackGridH,
      railDark:   aesthetic.rackRailDark,
      railLight:  aesthetic.rackRailLight,
    },
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
  nameEl.style.cssText = `font-size:0.9rem;font-weight:800;color:${aesthetic.glow};text-shadow:0 0 14px ${aesthetic.primary}66;`;
  const bpmEl = document.createElement('div');
  bpmEl.textContent = `${world.bpm} BPM · ♩`;
  bpmEl.style.cssText = 'font-size:0.62rem;color:#5577aa;letter-spacing:0.08em;';
  const lessonEl = document.createElement('div');
  lessonEl.textContent = world.lesson;
  lessonEl.style.cssText = 'font-size:0.56rem;color:#44608a;max-width:260px;';
  const versionEl = document.createElement('div');
  versionEl.textContent = `${BUILD_LABEL} · PRIVATE ALPHA`;
  versionEl.title = releaseVersionLine();
  versionEl.style.cssText = 'font-size:0.5rem;color:#556b8a;letter-spacing:0.08em;';
  hudLeft.append(nameEl, bpmEl, lessonEl, versionEl);

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
  const loopEl = document.createElement('div');
  loopEl.style.cssText = 'font-size:0.66rem;font-weight:800;color:#aa66ff;';
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
  mkHudBtn('?', 'How to Play', () => openHowToPlay(app));
  mkHudBtn('Notes', 'Tester notes and known issues', () => openTesterNotes(app));
  mkHudBtn('Report', 'Copy bug / feedback report', openReportUI);
  hudRight.append(hpEl, resEl, loopEl, btnRow);

  hud.append(hudLeft, hudCenter, hudRight);

  // ── Notation preview ──────────────────────────────────────────────────────
  const notationWrap = document.createElement('div');
  notationWrap.style.cssText = `
    position:absolute;left:50%;transform:translateX(-50%);top:0;
    width:min(620px,calc(100vw - 24px));overflow:hidden;z-index:80;box-sizing:border-box;
    background:rgba(6,12,24,0.82);border:1px solid ${aesthetic.primary}44;border-radius:10px;
    padding:4px 6px;box-shadow:0 0 18px ${aesthetic.primary}22;pointer-events:none;transition:opacity 0.3s;
  `;
  const notationInner = document.createElement('div');
  notationInner.style.cssText = 'position:relative;';
  const notationLabel = document.createElement('div');
  notationLabel.textContent = 'NEXT WAVE - HOVER NOTES FOR Hz MATCH';
  notationLabel.style.cssText = `position:absolute;left:8px;top:2px;font-size:7px;font-weight:800;letter-spacing:0.12em;color:${aesthetic.glow};opacity:0.72;z-index:4;`;
  const notationEffects = document.createElement('div');
  notationEffects.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:3;';
  notationWrap.appendChild(notationInner);
  const playhead = document.createElement('div');
  playhead.style.cssText = `position:absolute;top:0;bottom:0;width:2px;background:${aesthetic.glow};box-shadow:0 0 8px ${aesthetic.glow};display:none;pointer-events:none;`;
  const loopPlayhead = document.createElement('div');
  loopPlayhead.style.cssText = `position:absolute;top:0;bottom:0;width:2px;background:${aesthetic.glow};box-shadow:0 0 5px ${aesthetic.glow};opacity:0.25;pointer-events:none;`;
  // Hit-detection layer inside notationInner — children with pointer-events:auto
  // remain interactive even though ancestor elements are pointer-events:none.
  const notationHitLayer = document.createElement('div');
  notationHitLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5;';
  notationInner.append(notationLabel, notationEffects, loopPlayhead, playhead, notationHitLayer);
  notationWorld.appendChild(notationWrap);

  // Floating stat popup (screen-space, fixed position, outside scaled rackLayer).
  const notePopup = document.createElement('div');
  notePopup.style.cssText = [
    'position:fixed;z-index:500;display:none;pointer-events:none;',
    `background:rgba(4,8,20,0.95);border:1px solid transparent;border-radius:8px;`,
    `padding:8px 12px;min-width:155px;max-width:210px;`,
    `${FF}font-size:0.6rem;line-height:1.8;`,
    `box-shadow:0 4px 18px rgba(0,0,0,0.7);`,
  ].join('');
  app.appendChild(notePopup);

  let popupPinnedNote: NotationNoteLayout | null = null;

  function matchLabelForHz(enemyHz: number): { text: string; color: string } {
    let best = 0;
    let bestHz: number | null = null;
    for (const events of cachedEventsByOutput.values()) {
      for (const event of events) {
        if (!event.hasVoice || event.hertz == null || event.hertz <= 0) continue;
        const mult = damageMultiplier(enemyHz, event.hertz);
        if (mult > best) { best = mult; bestHz = event.hertz; }
      }
    }
    if (bestHz == null) return { text: 'No voiced output yet', color: '#ff6677' };
    const grade = best >= 3.5 ? 'MATCHED' : best >= 2 ? 'NEAR' : best >= 0.75 ? 'WEAK' : 'MISMATCH';
    const color = best >= 3.5 ? '#33ffcc' : best >= 2 ? '#44ddff' : best >= 0.75 ? '#ffcc44' : '#ff6677';
    return { text: `${grade} - ${formatHz(bestHz)} Hz - x${best.toFixed(1)}`, color };
  }

  function escapeHtml(text: string): string {
    return text.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch));
  }

  function issueAction(issue: GraphIssue): string {
    switch (issue.code) {
      case 'no-source': return 'Buy or keep a CLOCK, then patch its output into the chain.';
      case 'missing-starter': return 'Patch CLOCK into OSC, then patch OSC voice into OUT.';
      case 'no-output':
      case 'no-output-route': return 'Patch the final voice cable into an OUT module.';
      case 'incompatible-ports': return 'Use matching jack colors: trigger to trigger, voice to voice/either.';
      case 'cycle':
      case 'self-cycle': return 'Break the feedback loop. Signals must flow forward into OUT.';
      case 'fanout-exceeded': return 'That output jack is full. Add a Splitter or reroute one cable.';
      case 'fanin-exceeded': return 'That input jack is full. Use a Mixer or remove a cable.';
      case 'duplicate-cable': return 'Remove the duplicate cable and keep one route.';
      default: return issue.message;
    }
  }

  function patchErrorMessage(validation: GraphValidation): string {
    const issue = validation.issues.find(i => i.severity === 'error');
    if (!issue) return 'Patch invalid. Check cable colors and the route into OUT.';
    const label = issue.code.replace(/-/g, ' ').toUpperCase();
    return `${label}: ${issueAction(issue)}`;
  }

  // ── Patch Analysis Panel ──────────────────────────────────────────────────
  const patchPanel = document.createElement('div');
  patchPanel.style.cssText = [
    'position:fixed;bottom:12px;right:12px;z-index:120;',
    'width:min(320px,calc(100vw - 24px));max-height:calc(100vh - 80px);',
    'overflow:hidden auto;',
    `background:rgba(4,8,20,0.93);border:1px solid ${aesthetic.primary}44;border-radius:10px;`,
    `padding:8px 10px;box-shadow:0 0 18px ${aesthetic.primary}22;`,
    `${FF}font-size:0.58rem;line-height:1.7;color:#88aacc;`,
    'pointer-events:auto;transition:opacity 0.25s;',
  ].join('');
  app.appendChild(patchPanel);

  function updateResponsiveChrome(): void {
    if (window.innerWidth <= 700) {
      patchPanel.style.left = '10px';
      patchPanel.style.right = '10px';
      patchPanel.style.bottom = '10px';
      patchPanel.style.width = 'auto';
      patchPanel.style.maxHeight = 'min(230px, 38vh)';
      patchPanel.style.fontSize = '0.54rem';
    } else {
      patchPanel.style.left = '';
      patchPanel.style.right = '12px';
      patchPanel.style.bottom = '12px';
      patchPanel.style.width = 'min(320px,calc(100vw - 24px))';
      patchPanel.style.maxHeight = 'calc(100vh - 80px)';
      patchPanel.style.fontSize = '0.58rem';
    }
  }
  updateResponsiveChrome();
  window.addEventListener('resize', updateResponsiveChrome);

  const RATING_COLOR: Record<MatchRating, string> = {
    excellent: '#33ffcc',
    good: '#44ddff',
    weak: '#ffcc44',
    bad: '#ff5566',
  };
  const RATING_LABEL: Record<MatchRating, string> = {
    excellent: 'EXCELLENT',
    good: 'GOOD',
    weak: 'WEAK',
    bad: 'BAD',
  };

  function refreshPatchPanel(): void {
    const visible = runState === 'ready' || runState === 'cleared';
    patchPanel.style.display = visible ? 'block' : 'none';
    if (!visible) return;

    const analysis: PatchAnalysis = analyzePatch({
      compiled: effectiveCompiled,
      eventsByOutput: cachedEventsByOutput,
      graph,
      placedOutputIds: new Set(towers.keys()),
      rackTypeIds: new Set(graph.modules.map(m => m.typeId)),
      blueprintTypeIds: new Set(save.blueprints),
      laneCount: world.lanes.length,
    });

    const hasUnplacedOutput = analysis.outputSummaries.some(s => !s.isPlaced);
    const overallColor = hasUnplacedOutput ? '#ffcc44' : RATING_COLOR[analysis.overallRating];
    const readyLabel = hasUnplacedOutput ? 'PATCH VALID - PLACE OUT TOWER' : `PATCH VALID - ${RATING_LABEL[analysis.overallRating]}`;
    const parts: string[] = [];
    parts.push(
      `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;border-bottom:1px solid ${aesthetic.primary}33;padding-bottom:4px;">` +
      `<span style="font-weight:800;font-size:0.62rem;color:${aesthetic.glow};letter-spacing:0.08em;">PATCH ANALYSIS</span>` +
      `<span style="font-weight:800;color:${overallColor};letter-spacing:0.06em;text-align:right;">${readyLabel}</span>` +
      `</div>`
    );

    parts.push(`<div style="font-weight:800;color:#aabbdd;margin-bottom:2px;letter-spacing:0.07em;">WAVE - ${analysis.totalEnemies} ENEM${analysis.totalEnemies === 1 ? 'Y' : 'IES'}</div>`);
    if (analysis.enemyGroups.length === 0) {
      parts.push(`<div style="color:#445566;">No enemies in this wave.</div>`);
    } else {
      for (const g of analysis.enemyGroups) {
        parts.push(
          `<div style="display:flex;justify-content:space-between;padding:1px 0;">` +
          `<span style="color:#c8daf0;">${g.symbols.join(' ')} ${escapeHtml(g.label)}</span>` +
          `<span style="color:#5577aa;">x${g.count} - ${g.totalHp}HP</span>` +
          `</div>`
        );
      }
    }

    parts.push(`<div style="font-weight:800;color:#aabbdd;margin-top:6px;margin-bottom:2px;letter-spacing:0.07em;">OUTPUTS</div>`);
    if (analysis.outputSummaries.length === 0) {
      parts.push(`<div style="color:#ff5566;">No OUT module. Buy or repair an Output module.</div>`);
    } else {
      for (const s of analysis.outputSummaries) {
        const domLabel = s.dominantHz != null ? `${formatHz(s.dominantHz)} Hz` : '-';
        const fireLabel = s.averageIntervalTicks != null ? `every ${(s.averageIntervalTicks / PPQ).toFixed(2)} beats` : (s.eventCount === 1 ? 'one shot' : 'silent');
        const events = s.eventCount > 0 ? `${s.eventCount} shots - ${fireLabel} - ${domLabel}` : 'no shots';
        const statusColor = s.warning ? '#ffcc44' : '#33ffcc';
        const statusLabel = s.warning ? 'Place OUT tower' : 'Tower ready';
        parts.push(
          `<div style="display:flex;justify-content:space-between;gap:6px;padding:1px 0;">` +
          `<span style="color:${statusColor};font-weight:800;">${statusLabel}</span>` +
          `<span style="color:#5577aa;text-align:right;">${events}</span>` +
          `</div>`
        );
        if (s.warning) parts.push(`<div style="color:#ff5566;padding-left:10px;font-size:0.53rem;">${escapeHtml(s.warning)}</div>`);
      }
    }

    parts.push(`<div style="font-weight:800;color:#aabbdd;margin-top:6px;margin-bottom:2px;letter-spacing:0.07em;">HZ MATCH</div>`);
    if (analysis.matchRows.length === 0) {
      parts.push(`<div style="color:#445566;">No voiced signal to compare yet.</div>`);
    } else {
      for (const row of analysis.matchRows) {
        const rc = RATING_COLOR[row.rating];
        const outLabel = row.bestOutputHz != null ? `-> ${formatHz(row.bestOutputHz)} Hz` : '-> no signal';
        const multLabel = row.bestOutputHz != null ? `x${row.multiplier.toFixed(1)}` : '';
        parts.push(
          `<div style="display:grid;grid-template-columns:1fr auto auto;gap:6px;padding:1px 0;align-items:center;">` +
          `<span style="color:#c8daf0;">${row.group.symbols[0] ?? ''} ${escapeHtml(row.group.label)}</span>` +
          `<span style="color:#445566;">${outLabel}</span>` +
          `<span style="color:${rc};font-weight:800;text-align:right;">${multLabel} <span style="font-size:0.5rem;">${RATING_LABEL[row.rating]}</span></span>` +
          `</div>`
        );
      }
    }

    if (analysis.hints.length > 0) {
      parts.push(`<div style="margin-top:7px;border-top:1px solid ${aesthetic.primary}33;padding-top:5px;">`);
      for (const hint of analysis.hints) parts.push(`<div style="color:#ffcc44;font-size:0.54rem;padding:1px 0;">Hint: ${escapeHtml(hint)}</div>`);
      parts.push(`</div>`);
    }

    patchPanel.innerHTML = parts.join('');
  }
  function showNotePopup(note: NotationNoteLayout, refEl: HTMLElement): void {
    const def = getEnemyDef(note.enemyTypeId);
    if (!def) return;
    const rect = refEl.getBoundingClientRect();
    notePopup.style.borderColor = note.color;
    notePopup.style.boxShadow = `0 4px 18px rgba(0,0,0,0.7),0 0 10px ${note.color}44`;
    const behavior = def.behavior;
    const behaviorDesc = BEHAVIOR_DESCRIPTION[behavior];
    const behaviorTip = BEHAVIOR_TACTIC[behavior] ?? null;
    const threatLabel = BEHAVIOR_THREAT_LABEL[behavior];
    const isSpecial = behavior !== 'normal';
    const descColor = isSpecial ? def.color : '#6688aa';
    const chordLabel = note.chordGroup ? ` - chord ${note.chordGroup}` : '';
    const tiedLabel = note.tiedToNext ? ' - first tied note' : (behavior === 'tied' && !note.tiedToNext ? ' - second tied note' : '');
    const bandLabel = note.band ? note.band : def.band;
    const match = matchLabelForHz(note.hz);
    const noteName = note.midiPitch != null ? formatNoteNameFromMidi(note.midiPitch) : bandLabel.toUpperCase();
    const speedLabel = note.durationTicks <= 24 ? 'fast' : note.durationTicks >= 96 ? 'slow/heavy' : 'steady';
    notePopup.innerHTML = [
      `<div style="color:${note.color};font-weight:800;font-size:0.68rem;margin-bottom:3px;">${escapeHtml(def.symbol)} ${escapeHtml(noteName)} - ${escapeHtml(def.label)}${threatLabel ? ` <span style="font-weight:400;color:${note.color}88;">[${escapeHtml(threatLabel)}]</span>` : ''}</div>`,
      `<div style="color:#5577aa;">Hz <span style="color:#c8daf0;">${note.hz.toFixed(1)}</span> &nbsp; HP <span style="color:#c8daf0;">${def.maxHp}</span> &nbsp; Speed <span style="color:#c8daf0;">${speedLabel}</span></div>`,
      `<div style="color:#5577aa;">Band <span style="color:#c8daf0;">${bandLabel}</span> &nbsp; Threat <span style="color:#c8daf0;">${def.threat}/4</span></div>`,
      `<div style="color:${match.color};font-weight:800;">${match.text}</div>`,
      `<div style="color:#5577aa;margin-top:3px;">Behavior <span style="color:${descColor};">${escapeHtml(behaviorDesc)}${escapeHtml(chordLabel)}${escapeHtml(tiedLabel)}</span></div>`,
      behaviorTip ? `<div style="color:#88776a;font-size:0.52rem;margin-top:2px;border-top:1px solid #22334488;padding-top:2px;">${escapeHtml(behaviorTip)}</div>` : '',
    ].join('');
    notePopup.style.display = 'block';
    const vw = window.innerWidth, vh = window.innerHeight;
    const popW = 240, popH = behavior !== 'normal' ? 145 : 112;
    let left = rect.right + 8;
    let top = rect.top - 10;
    if (left + popW > vw - 8) left = rect.left - popW - 8;
    if (left < 8) left = 8;
    if (top + popH > vh - 8) top = vh - popH - 8;
    if (top < 8) top = 8;
    notePopup.style.left = `${left}px`;
    notePopup.style.top = `${top}px`;
  }
  function hideNotePopup(): void {
    notePopup.style.display = 'none';
    popupPinnedNote = null;
  }

  // Dismiss pinned popup when clicking anywhere outside a note hit-target.
  const onDocClickForPopup = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest('[data-note-hit]')) hideNotePopup();
  };
  document.addEventListener('click', onDocClickForPopup);

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
    const notationColors: NotationColors = {
      staffColor:   aesthetic.staffColor,
      barlineColor: aesthetic.barlineColor,
      restColor:    aesthetic.restColor,
      tieColor:     aesthetic.tieColor,
    };
    notation = renderNotation(score, aesthetic.glow, 2, notationColors);
    notationInner.insertBefore(notation.canvas, notationLabel);
    noteEls.length = 0;
    notationEffects.replaceChildren();
    notationHitLayer.replaceChildren();
    hideNotePopup();
    for (const note of notation.notes) {
      // Animated visual indicator.
      const el = document.createElement('div');
      const size = note.durationTicks >= 192 ? 13 : note.durationTicks >= 96 ? 11 : note.durationTicks <= 12 ? 6 : note.durationTicks <= 24 ? 7 : 9;
      el.style.cssText = `position:absolute;width:${size}px;height:${size}px;border:1px solid ${note.color};border-radius:50%;background:${note.color}44;box-shadow:0 0 5px ${note.color};transform:translate(-50%,-50%);will-change:transform,opacity;`;
      notationEffects.appendChild(el);
      noteEls.push(el);

      // Static hit target for stat popup (pointer-events:auto overrides ancestor none).
      const hit = document.createElement('div');
      hit.dataset['noteHit'] = '1';
      hit.style.cssText = `position:absolute;left:${note.x}px;top:${note.y}px;width:24px;height:24px;transform:translate(-50%,-50%);pointer-events:auto;cursor:pointer;border-radius:50%;`;
      notationHitLayer.appendChild(hit);

      const onEnter = () => { if (!popupPinnedNote) showNotePopup(note, hit); };
      const onLeave = () => { if (!popupPinnedNote) hideNotePopup(); };
      const onClick = (e: Event) => {
        e.stopPropagation();
        if (popupPinnedNote === note) { hideNotePopup(); }
        else { popupPinnedNote = note; showNotePopup(note, hit); }
      };
      hit.addEventListener('mouseenter', onEnter);
      hit.addEventListener('mouseleave', onLeave);
      hit.addEventListener('click', onClick);
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
    font-size:1.2rem;font-weight:800;color:#cc88ff;text-align:center;z-index:160;pointer-events:none;
    text-shadow:0 0 20px #cc88ff,0 0 50px #ffdd66,0 0 90px #cc88ff44;
    transition:transform 0.5s cubic-bezier(0.22,1.2,0.36,1),opacity 0.5s;
    max-width:82%;line-height:1.5;
    background:rgba(7,3,16,0.88);border:1.5px solid #cc88ff66;border-radius:16px;
    padding:18px 28px;
  `;
  app.appendChild(cipherBanner);

  // ── Camera controls ───────────────────────────────────────────────────────
  const detachCamera = attachCameraControls(viewport, camera, {
    zoomSensitivity: () => save.settings.zoomSensitivity,
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
        } else {
          placementError = 'Tower blocked: choose an open grid tile, not the enemy track.';
          flashState(placementError, '#ff6677', 1800);
        }
      }
    },
    onChanged: applyCamera,
  });

  function updateTowerDrag(clientX: number, clientY: number): void {
    const r = viewport.getBoundingClientRect();
    const w = camera.screenToWorld(clientX - r.left, clientY - r.top);
    placement.tile = [Math.floor(w.x / TILE_PX), Math.floor(w.y / TILE_PX)];
    placementError = '';
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
    } else {
      placementError = 'Tower blocked: choose an open grid tile, not the enemy track.';
      flashState(placementError, '#ff6677', 1800);
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

  function effectiveWaveScore(): WaveScore {
    return levelMusic?.getMidiScore(waveIndex) ?? currentWaveScore();
  }

  function waveSeed(): number {
    return combineSeeds(hashString(worldId), waveIndex, runSeed, endlessActive ? endlessCount : 0);
  }

  let cachedTraffic = new Map<string, SignalEvent[]>();
  let cachedActivity = new Map<string, number>();
  let cachedEventsByOutput = new Map<string, SignalEvent[]>();
  let cachedPreviewEventsByOutput = new Map<string, SignalEvent[]>();
  let previewAudioScheduledIds = new Set<string>();

  function refreshPreviewTraffic(): void {
    const seed = waveSeed();
    const result = evaluatePatch(graph, { startTick: 0, endTick: SIGNAL_PREVIEW_LOOP_TICKS, seedBase: seed, upgradeLevels: upgradeLevels(save) });
    cachedTraffic = result.cableTraffic;
    cachedActivity = result.moduleActivity;
    cachedPreviewEventsByOutput = result.eventsByOutput;
    previewAudioScheduledIds = new Set();
    rack.setTraffic(cachedTraffic, cachedActivity);
  }

  function recompilePreview(): void {
    refreshPreviewTraffic();
    const notationScore = effectiveWaveScore();
    const total = notationScore.measures * TICKS_PER_MEASURE;
    // Evaluate the patch over the active wave window for combat analysis.
    const seed = waveSeed();
    const result = evaluatePatch(graph, { startTick: 0, endTick: total + PPQ * 4, seedBase: seed, upgradeLevels: upgradeLevels(save) });
    cachedEventsByOutput = result.eventsByOutput;

    // Notation render — prefer MIDI score if available, fall back to authored.
    effectiveCompiled = compileScore(notationScore);
    rebuildNotation(notationScore);
    refreshPatchPanel();

    // Trigger Hz tutorial when wave has non-mid band enemies (band matching matters).
    if (effectiveCompiled.spawns.some(s => s.band !== 'mid')) {
      tut.trigger('hz-match');
    }
  }

  function markGraphDirty(): void { graphDirty = true; }

  function isRackPreviewActive(): boolean {
    return runState === 'ready' || runState === 'cleared';
  }

  function isSynthPreviewAudible(): boolean {
    const out = graph.modules.find(m => m.typeId === 'output');
    return out?.settings['synthOn'] === true && !save.settings.masterMuted && audio.unlocked;
  }

  function previewTickFor(globalTick: number): number {
    return ((globalTick % SIGNAL_PREVIEW_LOOP_TICKS) + SIGNAL_PREVIEW_LOOP_TICKS) % SIGNAL_PREVIEW_LOOP_TICKS;
  }

  function previewCycleFor(globalTick: number): number {
    return Math.floor(globalTick / SIGNAL_PREVIEW_LOOP_TICKS);
  }

  function processRackPreviewVisuals(globalTick: number): void {
    if (!isRackPreviewActive()) return;
    const localTick = previewTickFor(globalTick);
    const loopIndex = previewCycleFor(globalTick);
    for (const [outputId, events] of cachedPreviewEventsByOutput) {
      let didFire = false;
      for (const event of events) {
        if (event.tick > localTick) break;
        if (event.tick !== localTick) continue;
        combat.previewFire(outputId, event, globalTick);
        didFire = true;
      }
      if (didFire) rack.flashModule(outputId);
    }
  }

  function scheduleRackPreviewAudio(tickFloat: number): void {
    if (!isRackPreviewActive() || !isSynthPreviewAudible()) {
      previewAudioScheduledIds = new Set();
      return;
    }
    const startTick = Math.floor(tickFloat);
    const endTick = startTick + PREVIEW_AUDIO_LOOKAHEAD_TICKS;
    const keepIds = new Set<string>();
    for (const [, events] of cachedPreviewEventsByOutput) {
      for (let cycleTick = startTick; cycleTick <= endTick; cycleTick++) {
        const localTick = previewTickFor(cycleTick);
        const loopIndex = previewCycleFor(cycleTick);
        for (const event of events) {
          if (event.tick > localTick) break;
          if (event.tick !== localTick) continue;
          const previewId = `preview:${loopIndex}:${event.id}`;
          keepIds.add(previewId);
          if (previewAudioScheduledIds.has(previewId)) continue;
          previewAudioScheduledIds.add(previewId);
          const audioTime = audio.currentTime + ticksToSec(cycleTick - tickFloat, world.bpm);
          audio.scheduleEvent({ ...event, id: previewId, tick: 0 }, audioTime, world.bpm);
        }
      }
    }
    previewAudioScheduledIds = new Set([...previewAudioScheduledIds].filter(id => keepIds.has(id)));
  }

  function rebuildSignalsForWave(score: WaveScore = effectiveWaveScore()): ReturnType<typeof evaluatePatch> {
    const total = score.measures * TICKS_PER_MEASURE;
    const seed = waveSeed();
    const result = evaluatePatch(graph, { startTick: 0, endTick: total + PPQ * 4, seedBase: seed, upgradeLevels: upgradeLevels(save) });
    cachedEventsByOutput = result.eventsByOutput;
    refreshPreviewTraffic();
    return result;
  }

  // ── Wave flow ─────────────────────────────────────────────────────────────
  function startWave(): void {
    if (runState !== 'ready' && runState !== 'cleared') return;
    hideNotePopup();
    const v = validateGraph(graph);
    if (v.status === 'cycle' || v.status === 'no-output-route' || v.status === 'missing-starter' || v.status === 'incompatible' || v.status === 'invalid') {
      flashState(patchErrorMessage(v), '#ff6677', 2600);
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
    const effectiveScore = effectiveWaveScore();
    effectiveCompiled = compileScore(effectiveScore);
    waveTotalTicks = effectiveScore.measures * TICKS_PER_MEASURE;

    // Re-render notation with the MIDI score if available.
    if (midiScore) {
      rebuildNotation(midiScore);
    }

    const evaluation = rebuildSignalsForWave(effectiveScore);
    const missing = [...evaluation.eventsByOutput.keys()].filter(outputId => !towers.has(outputId));
    if (missing.length > 0) {
      flashState('OUTPUT HAS NO TOWER: drag the OUT tower silhouette onto an open grid tile.', '#ff6677', 2600);
      tut.trigger('tower');
      return;
    }
    const localEvents = evaluation.events;
    audio.cancelAll();
    previewAudioScheduledIds = new Set();
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
    tut.trigger('start-wave');
    tut.trigger('bands');
    tut.trigger('osc-combat');
    tut.trigger('clock-combat');
    if (graph.modules.some(m => m.typeId === 'delay')) tut.trigger('delay-combat');
    refreshHud();
  }

  function onWaveCleared(): void {
    levelMusic?.setActiveWave(null);
    const stats = combat.getWaveStats();
    const modLines = modifierSummaryLines(stats.modifiers);
    const modSuffix = modLines.length > 0 ? ` · ${modLines[0]}` : '';
    lastWaveSummary = `KO ${stats.enemiesDefeated} · ESC ${waveEscapes} · SHOTS ${stats.shotsFired} · MATCH ${stats.matchedHits} · RESIST ${stats.resistedHits}${modSuffix}`;
    flashState(waveEscapes === 0 ? 'WAVE CLEARED · PERFECT ✓' : 'WAVE CLEARED ✓', '#33ff88', 2400);
    combat.clearWave();
    if (endlessActive) {
      endlessCount++;
      const loops = earnInfinityLoops(save, endlessWaveReward(endlessCount));
      if (loops > 0) flashState(`+${loops} ${INFINITY_SYMBOL}`, '#aa66ff');
      if (endlessCount > worldSave.endlessBest) worldSave.endlessBest = endlessCount;
      host.persist();
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
    levelMusic?.setActiveWave(null);
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
    overlayTitle.style.color = aesthetic.glow;
    let subHtml = `${world.name} cleared! &nbsp;+${world.completionReward} ${CURRENCY_SYMBOL} Resonance${awarded === 0 ? ' (already claimed)' : ''}`;
    if (granted.length > 0) {
      subHtml += '<br><br>';
      for (const typeId of granted) {
        const def = getModuleType(typeId);
        if (!def) { subHtml += `<span style="color:#33dd88">+ ${typeId.toUpperCase()} unlocked</span><br>`; continue; }
        subHtml += `
          <div style="background:#0a1a10;border:1px solid #33dd8855;border-radius:8px;padding:6px 10px;margin:4px 0;text-align:left;">
            <div style="color:#33dd88;font-size:0.72rem;font-weight:800;letter-spacing:0.06em;">+ ${def.name.toUpperCase()} UNLOCKED</div>
            <div style="color:#99ccaa;font-size:0.58rem;line-height:1.4;margin-top:2px;">${def.tooltip}</div>
          </div>`;
      }
    }
    // w180: add cipher challenge clue (fires when cipher not yet unlocked or revealed).
    if (worldId === 'w180' && !save.secretRevealed) {
      subHtml += `
        <div style="background:#140828;border:1px solid #cc88ff44;border-radius:8px;padding:7px 10px;margin:8px 0 0;text-align:left;">
          <div style="color:#cc88ff;font-size:0.66rem;font-weight:800;letter-spacing:0.07em;">✦ SIGNAL CIPHER CHALLENGE UNLOCKED</div>
          <div style="color:#8866bb;font-size:0.57rem;line-height:1.4;margin-top:3px;">${CIPHER_POST_VICTORY_CLUE}</div>
        </div>`;
    }

    // w200: grand final completion.
    if (worldId === 'w200') {
      save.finalBossDefeated = true;
      overlayTitle.textContent = '✦ THE FINAL MEASURE RESOLVES ✦';
      overlayTitle.style.cssText += `;text-shadow:0 0 30px #ffdd66,0 0 60px #cc88ff;`;
      subHtml = `
        <div style="color:#ffdd66;font-size:0.72rem;font-weight:800;letter-spacing:0.1em;margin-bottom:8px;">SIGNAL CIPHER — COMPLETE</div>
        ${subHtml}
        <div style="color:#8866bb;font-size:0.6rem;margin-top:10px;line-height:1.5;">
          You have resolved the hidden composition.<br>
          The rack falls silent. The measure is complete.
        </div>
      `;
    }
    overlaySub.innerHTML = subHtml;
    overlayBtns.innerHTML = '';
    addOverlayBtn('↩ WORLD MAP', aesthetic.primary, () => host.exitToMap());
    addOverlayBtn('∞ ENDLESS', worldId === 'w200' ? '#ffdd66' : '#aa66ff', () => { hideOverlay(); beginEndless(); });
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
    const result = evaluatePatch(graph, { startTick: 0, endTick: PPQ * 2, seedBase: 12345, injectAtSources: [pulse], upgradeLevels: upgradeLevels(save) });
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
      cipherBanner.innerHTML = `
        <div style="font-size:0.72rem;letter-spacing:0.18em;color:#ffdd66;margin-bottom:6px;">✦ SIGNAL CIPHER RESOLVED ✦</div>
        THE HIDDEN MEASURE REVEALS ITSELF
        <div style="font-size:0.66rem;color:#cc88ff;margin-top:8px;font-weight:600;letter-spacing:0.06em;">
          A ninth world appears on the map — The Final Measure, 200 BPM.
        </div>
        <div style="font-size:0.55rem;color:#8866bb;margin-top:4px;">Return to the world map to enter.</div>
      `;
      cipherBanner.style.transform = 'translate(-50%,-50%) scale(1)';
      cipherBanner.style.opacity = '1';
      setTimeout(() => { cipherBanner.style.opacity = '0'; cipherBanner.style.transform = 'translate(-50%,-50%) scale(0.8)'; }, 5500);
    }
  }

  // ── Synth toggle ──────────────────────────────────────────────────────────
  function applyCurrentAudioPrefs(synthOnOverride?: boolean): void {
    const out = graph.modules.find(m => m.typeId === 'output');
    audio.setPrefs({
      synthOn: synthOnOverride ?? out?.settings['synthOn'] === true,
      synthVolume: typeof out?.settings['synthVolume'] === 'number' ? out.settings['synthVolume'] as number : 0.5,
      masterMuted: save.settings.masterMuted,
      masterVolume: save.settings.masterVolume,
      percussionVolume: save.settings.percussionVolume,
      sfxVolume: save.settings.sfxVolume,
      towersVolume: save.settings.towersVolume,
      beatLoopVolume: save.settings.beatLoopVolume,
      bgLoopVolume: save.settings.bgLoopVolume,
      enemyNotesVolume: save.settings.enemyNotesVolume,
    });
  }

  function toggleSynth(): void {
    const out = graph.modules.find(m => m.typeId === 'output');
    if (!out) return;
    const next = !(out.settings['synthOn'] === true);
    out.settings['synthOn'] = next;
    void audio.unlock().then(() => applyCurrentAudioPrefs(next));
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
      onUpgrade: (typeId) => {
        const r = purchaseUpgrade(save, typeId);
        if (r.ok) { host.persist(); markGraphDirty(); refreshHud(); }
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
  function openReportUI(): void {
    openCopyPanel(app, 'BUG / FEEDBACK REPORT', createBugReportText({
      save,
      worldId,
      waveIndex,
      runState,
      graph,
      placedOutputTowerCount: towers.size,
      lastVisibleStateText: stateEl.textContent ?? undefined,
    }));
  }

  let stateFlash = '';
  let stateFlashColor = '';
  let stateFlashUntil = 0;
  function flashState(text: string, color: string, durationMs = 1600): void {
    stateFlash = text; stateFlashColor = color; stateFlashUntil = performance.now() + durationMs;
  }

  function refreshHud(): void {
    const totalWaves = endlessActive ? '∞' : world.waves.length;
    const wn = endlessActive ? endlessCount + 1 : waveIndex + 1;
    waveEl.textContent = `WAVE ${wn} / ${totalWaves}`;
    hpEl.textContent = `BASE ${baseHp}/${MAX_BASE_HP}`;
    hpEl.style.color = baseHp <= 3 ? '#ff3344' : baseHp <= 6 ? '#ffcc00' : '#33ff88';
    resEl.textContent = `${CURRENCY_SYMBOL} ${save.resonance}`;
    loopEl.style.display = (save.infinityLoops > 0 || endlessActive) ? 'block' : 'none';
    loopEl.textContent = `${INFINITY_SYMBOL} ${save.infinityLoops}`;

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

    const panelVisible = runState === 'ready' || runState === 'cleared';
    patchPanel.style.display = panelVisible ? 'block' : 'none';
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
        processRackPreviewVisuals(t);
        if (runState === 'countin' && t >= waveStartTick) { runState = 'wave'; levelMusic?.setActiveWave(waveIndex); }
        if (runState === 'wave') {
          const outcome = combat.processTick(t);
          for (const spawned of outcome.spawnedEvents) flashResolvedNote(spawned.spawnIndex);
          if (outcome.escapes > 0) {
            waveEscapes += outcome.escapes;
            baseHp -= outcome.escapes;
            if (!devMode && baseHp <= 0) { triggerDamageFlash(); onFailed(); break; }
            triggerDamageFlash();
            flashState(`BASE HIT · ${baseHp}/${MAX_BASE_HP} HP`, '#ff3344', 1200);
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
    scheduleRackPreviewAudio(tickFloat);

    // Per-frame combat animation/collision.
    fluid.setLowGraphicsMode(save.settings.reducedMotion);
    if (runState === 'ready' || runState === 'cleared') {
      fluid.seedColor(aesthetic.fluidSeed[0], aesthetic.fluidSeed[1], aesthetic.fluidSeed[2], aesthetic.fluidSeedStrength);
    }
    fluid.step(Math.min(dt * 1000, 100));
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

    // Rack pulses run on a looping preview clock, even between waves.
    rack.setCurrentTick(((tickFloat % SIGNAL_PREVIEW_LOOP_TICKS) + SIGNAL_PREVIEW_LOOP_TICKS) % SIGNAL_PREVIEW_LOOP_TICKS);
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
    combat.draw(ctx, canvas, camera, tickFloat, placement, save.settings.reducedMotion, placementError);

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
      ? `0 0 ${8 + (1 - beatPhase) * 14}px ${aesthetic.primary}44`
      : `0 0 18px ${aesthetic.primary}22`;
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
  applyCurrentAudioPrefs();
  refreshHud();
  tut.trigger('camera');
  setTimeout(() => { if (runState === 'ready') tut.trigger('first-patch'); }, 1800);
  setTimeout(() => { if (runState === 'ready') tut.trigger('score'); }, 3600);
  // Proactively explain two-lane strategy when entering a multi-lane world.
  if (world.lanes.length >= 2) {
    setTimeout(() => { if (runState === 'ready') tut.trigger('two-lanes'); }, 5400);
  }
  const WORLD_ENTRY_TUTORIALS: Record<string, string> = {
    w100: 'timing', w120: 'mixing', w140: 'filtering', w160: 'sequencing',
    w180: 'target-lock',
  };
  const entryTut = WORLD_ENTRY_TUTORIALS[worldId];
  if (entryTut) {
    setTimeout(() => { if (runState === 'ready') tut.trigger(entryTut); }, 7000);
  }
  if (worldSave.completed && canAttemptCipher(save, CAMPAIGN_ORDER) && !save.secretRevealed) {
    setTimeout(() => tut.trigger('cipher'), 5200);
  }
  rafId = requestAnimationFrame(frame);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  return () => {
    cancelAnimationFrame(rafId);
    ro.disconnect();
    window.removeEventListener('orientationchange', onOrient);
    window.removeEventListener('resize', updateResponsiveChrome);
    window.removeEventListener('pointermove', onTowerPointerMove);
    window.removeEventListener('pointerup', onTowerPointerUp);
    window.removeEventListener('pointercancel', onTowerPointerUp);
    document.removeEventListener('click', onDocClickForPopup);
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
