/**
 * worldmap.ts — Campaign map. World cards with summaries, locked/unlocked
 * state, the hidden secret world (revealed only after the cipher), secret
 * hints, currency, and settings access.
 */

import { WORLDS, CAMPAIGN_ORDER, SECRET_WORLD_ID, WorldDef, getWorld } from '../data/worlds';
import { SaveData, getWorldSave, SaveStorage, defaultWorldSave } from '../state/save';
import {
  isWorldUnlocked, isWorldVisible, secretHintLevel, SECRET_HINTS, completedWorldCount,
  blueprintsUnlockedBy,
} from '../state/progression';
import { CURRENCY_SYMBOL } from '../state/economy';
import { getModuleType, MODULE_TYPES } from '../core/modules';
import { openSettings } from './settings-ui';
import { getAudioEngine } from './audio-engine';

const FF = `font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;`;

export interface WorldMapOpts {
  save: SaveData;
  storage: SaveStorage;
  onEnterWorld(worldId: string): void;
  onSaveChanged(): void;
  onReset(): void;
}

export function showWorldMap(app: HTMLElement, opts: WorldMapOpts): void {
  getAudioEngine().suspend();
  const save = opts.save;
  app.innerHTML = '';
  app.style.cssText = `position:fixed;inset:0;overflow:auto;background:radial-gradient(circle at 50% 18%, #0a1428 0%, #03060f 70%);${FF}`;

  const root = document.createElement('div');
  root.style.cssText = 'min-height:100%;display:flex;flex-direction:column;align-items:center;gap:1.2rem;padding:2rem 1rem 3rem;';
  app.appendChild(root);

  // Header.
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:0.3rem;';
  const title = document.createElement('div');
  title.textContent = 'ModSynth TD';
  title.style.cssText = 'font-size:2rem;font-weight:800;color:#dff6ff;letter-spacing:0.04em;text-shadow:0 0 24px rgba(0,200,255,0.5);';
  const sub = document.createElement('div');
  sub.textContent = 'BUILD THE RACK · CONDUCT THE DEFENSE';
  sub.style.cssText = 'font-size:0.66rem;color:#5577aa;letter-spacing:0.18em;';
  header.append(title, sub);
  root.appendChild(header);

  // Top bar: currency + settings.
  const topBar = document.createElement('div');
  topBar.style.cssText = 'display:flex;align-items:center;gap:1rem;';
  const currency = document.createElement('div');
  currency.textContent = `${CURRENCY_SYMBOL} ${save.resonance} Resonance`;
  currency.style.cssText = 'font-size:0.8rem;font-weight:800;color:#00ddcc;text-shadow:0 0 10px #00ddcc44;';
  const settingsBtn = document.createElement('button');
  settingsBtn.textContent = '⚙ Settings';
  settingsBtn.style.cssText = `${FF}font-size:0.66rem;font-weight:700;background:rgba(8,15,28,0.85);border:1px solid #2a3d65;color:#88aacc;border-radius:6px;padding:5px 12px;cursor:pointer;`;
  settingsBtn.addEventListener('click', () => {
    openSettings(app, {
      save, storage: opts.storage,
      onSaveChanged: opts.onSaveChanged,
      onRackPositionChanged: () => undefined,
      onWireDisplayChanged: () => undefined,
      onReset: opts.onReset,
    });
  });
  const devBtn = document.createElement('button');
  devBtn.textContent = 'DEV';
  devBtn.title = 'Dev mode: unlock everything + infinite money';
  devBtn.style.cssText = `${FF}font-size:0.56rem;font-weight:700;background:rgba(8,15,28,0.85);border:1px solid #2a2a1a;color:#665500;border-radius:6px;padding:5px 10px;cursor:pointer;letter-spacing:0.08em;`;
  devBtn.addEventListener('click', () => openDevModal(app, save, opts));
  topBar.append(currency, settingsBtn, devBtn);
  root.appendChild(topBar);

  // Progress + secret hint.
  const completed = completedWorldCount(save, CAMPAIGN_ORDER);
  const progress = document.createElement('div');
  progress.textContent = `Campaign: ${completed} / ${CAMPAIGN_ORDER.length} worlds complete`;
  progress.style.cssText = 'font-size:0.64rem;color:#5577aa;letter-spacing:0.06em;';
  root.appendChild(progress);

  const hint = SECRET_HINTS[secretHintLevel(save, CAMPAIGN_ORDER)];
  if (hint && !save.secretRevealed) {
    const hintEl = document.createElement('div');
    hintEl.textContent = `✦ ${hint}`;
    hintEl.style.cssText = 'font-size:0.66rem;font-style:italic;color:#aa88dd;letter-spacing:0.04em;max-width:440px;text-align:center;text-shadow:0 0 10px #aa66ff33;';
    root.appendChild(hintEl);
  }

  // World grid.
  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:1rem;justify-content:center;max-width:880px;';
  root.appendChild(grid);

  for (const world of WORLDS) {
    if (!isWorldVisible(save, world.worldId, CAMPAIGN_ORDER)) continue;
    grid.appendChild(makeWorldCard(world, opts));
  }

  if (save.finalBossDefeated) {
    const banner = document.createElement('div');
    banner.textContent = '★ CAMPAIGN COMPLETE — The Final Measure has been resolved ★';
    banner.style.cssText = 'font-size:0.78rem;font-weight:800;color:#fff;text-shadow:0 0 18px #88ccff;letter-spacing:0.06em;margin-top:0.5rem;';
    root.appendChild(banner);
  }
}

function makeWorldCard(world: WorldDef, opts: WorldMapOpts): HTMLElement {
  const save = opts.save;
  const unlocked = isWorldUnlocked(save, world.worldId, CAMPAIGN_ORDER);
  const ws = getWorldSave(save, world.worldId);
  const secret = world.worldId === SECRET_WORLD_ID;

  const card = document.createElement('button');
  card.disabled = !unlocked;
  const accent = secret ? '#ffffff' : world.theme.primary;
  card.style.cssText = `
    display:flex;flex-direction:column;align-items:center;gap:0.5rem;
    background:#0a0f1c;border:1.5px solid ${unlocked ? (secret ? '#88ccff' : '#2a3d65') : '#151e30'};
    border-radius:14px;padding:1rem;width:180px;
    cursor:${unlocked ? 'pointer' : 'not-allowed'};opacity:${unlocked ? '1' : '0.5'};
    ${FF}transition:border-color 0.15s,box-shadow 0.15s,transform 0.1s;
    ${secret ? 'box-shadow:0 0 22px rgba(120,200,255,0.25);' : ''}
  `;
  if (unlocked) {
    card.addEventListener('mouseenter', () => { card.style.borderColor = world.theme.glow; card.style.boxShadow = `0 0 22px ${world.theme.primary}33`; card.style.transform = 'translateY(-2px)'; });
    card.addEventListener('mouseleave', () => { card.style.borderColor = secret ? '#88ccff' : '#2a3d65'; card.style.boxShadow = secret ? '0 0 22px rgba(120,200,255,0.25)' : ''; card.style.transform = ''; });
    card.addEventListener('click', () => opts.onEnterWorld(world.worldId));
  }

  // Level preview.
  const preview = document.createElement('canvas');
  preview.width = 132; preview.height = 88;
  preview.style.cssText = 'width:132px;height:88px;border-radius:10px;display:block;';
  drawLevelPreview(preview, world, unlocked);
  card.appendChild(preview);

  const name = document.createElement('div');
  name.textContent = unlocked ? world.name : '???';
  name.style.cssText = `font-size:0.84rem;font-weight:800;color:${unlocked ? '#dff6ff' : '#445566'};`;
  card.appendChild(name);

  const bpm = document.createElement('div');
  bpm.textContent = `${world.bpm} BPM`;
  bpm.style.cssText = `font-size:0.66rem;font-weight:800;color:${unlocked ? accent : '#2a4444'};letter-spacing:0.06em;`;
  card.appendChild(bpm);

  if (unlocked) {
    const lesson = document.createElement('div');
    lesson.textContent = world.lesson;
    lesson.style.cssText = 'font-size:0.54rem;color:#5577aa;text-align:center;line-height:1.4;min-height:2.6em;';
    card.appendChild(lesson);

    // Summary: best wave, modules, shelves, output route.
    const summary = document.createElement('div');
    summary.style.cssText = 'font-size:0.54rem;color:#44608a;text-align:center;line-height:1.5;';
    const moduleCount = ws.rack.modules.length;
    const validOutput = ws.rack.modules.some(m => m.typeId === 'output') && ws.rack.cables.some(c => {
      const to = ws.rack.modules.find(m => m.instanceId === c.toModuleId);
      return to?.typeId === 'output';
    });
    const best = secret
      ? (ws.completed ? 'CLEARED' : `${ws.bestWave}/${world.waves.length}`)
      : `${ws.bestWave}/${world.waves.length}`;
    summary.innerHTML = `best wave ${best}<br>${moduleCount} modules · ${ws.shelfCount} shelf${ws.shelfCount > 1 ? 'ves' : ''}<br><span style="color:${validOutput ? '#33dd88' : '#aa6677'}">${validOutput ? '◈ output routed' : '○ no output route'}</span>`;
    card.appendChild(summary);

    if (ws.completed) {
      const done = document.createElement('div');
      done.textContent = '✓ COMPLETE';
      done.style.cssText = `font-size:0.56rem;font-weight:800;color:${accent};letter-spacing:0.1em;`;
      card.appendChild(done);
    } else {
      const enter = document.createElement('div');
      enter.textContent = 'ENTER';
      enter.style.cssText = 'font-size:0.58rem;color:#5577aa;letter-spacing:0.12em;';
      card.appendChild(enter);
    }
  } else {
    const lock = document.createElement('div');
    const prevIdx = CAMPAIGN_ORDER.indexOf(world.worldId) - 1;
    const prevWorld = prevIdx >= 0 ? getWorld(CAMPAIGN_ORDER[prevIdx]) : null;
    lock.textContent = prevWorld ? `🔒 Clear ${prevWorld.name}` : '🔒 LOCKED';
    lock.style.cssText = 'font-size:0.56rem;color:#2a3a4a;letter-spacing:0.08em;text-align:center;';
    card.appendChild(lock);
  }

  return card;
}

// ── Dev mode ──────────────────────────────────────────────────────────────────

function applyDevMode(save: SaveData): void {
  // Infinite money.
  save.resonance = 99999;

  // Unlock all worlds: mark every campaign world completed + claim rewards.
  for (const worldId of CAMPAIGN_ORDER) {
    const ws = getWorldSave(save, worldId);
    const world = getWorld(worldId);
    if (!ws.completed) {
      ws.completed = true;
      ws.completionClaimed = true;
      if (world) {
        ws.bestWave = world.waves.length;
        ws.claimedWaveReward = world.rewardTable[world.rewardTable.length - 1] ?? 0;
      }
      if (ws.shelfCount < 2) ws.shelfCount = 2;
    }
  }

  // Unlock all blueprints from the module registry.
  for (const mod of MODULE_TYPES) {
    if (mod.unlockAfterWorld !== null && !save.blueprints.includes(mod.typeId)) {
      save.blueprints.push(mod.typeId);
    }
  }

  // Reveal secret world and cipher.
  save.secretRevealed = true;
  save.cipherChallengeUnlocked = true;
}

function openDevModal(app: HTMLElement, save: SaveData, opts: WorldMapOpts): void {
  const backdrop = document.createElement('div');
  backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:300;display:flex;align-items:center;justify-content:center;';

  const modal = document.createElement('div');
  modal.style.cssText = `
    background:#080f1e;border:1.5px solid #665500;border-radius:14px;
    padding:1.6rem 2rem;display:flex;flex-direction:column;align-items:center;gap:0.9rem;
    max-width:320px;text-align:center;${FF}
    box-shadow:0 0 40px #ffcc0022;
  `;

  const title = document.createElement('div');
  title.textContent = '⚠ DEV MODE';
  title.style.cssText = 'font-size:1rem;font-weight:800;color:#ffcc00;letter-spacing:0.1em;';

  const desc = document.createElement('div');
  desc.style.cssText = 'font-size:0.64rem;color:#88aacc;line-height:1.6;';
  desc.innerHTML = 'This will:<br>• Set Resonance to <b style="color:#ffcc00">99,999</b><br>• Mark all worlds <b style="color:#33dd88">complete</b><br>• Unlock all <b style="color:#aa66ff">module blueprints</b><br>• Reveal the <b style="color:#88ccff">secret world</b>';

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:0.8rem;margin-top:0.3rem;';

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = 'APPLY';
  confirmBtn.style.cssText = `${FF}font-size:0.7rem;font-weight:800;letter-spacing:0.08em;background:#ffcc0022;border:1.5px solid #ffcc00;color:#ffcc00;border-radius:8px;padding:7px 20px;cursor:pointer;`;
  confirmBtn.addEventListener('click', () => {
    applyDevMode(save);
    opts.onSaveChanged();
    backdrop.remove();
    showWorldMap(app, opts); // re-render with updated state
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'CANCEL';
  cancelBtn.style.cssText = `${FF}font-size:0.7rem;font-weight:700;letter-spacing:0.08em;background:transparent;border:1.5px solid #2a3d65;color:#5577aa;border-radius:8px;padding:7px 20px;cursor:pointer;`;
  cancelBtn.addEventListener('click', () => backdrop.remove());

  btnRow.append(confirmBtn, cancelBtn);
  modal.append(title, desc, btnRow);
  backdrop.appendChild(modal);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
  app.appendChild(backdrop);
}

function drawLevelPreview(canvas: HTMLCanvasElement, world: WorldDef, unlocked: boolean): void {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height;

  // Deterministic RNG seeded on worldId + bpm.
  let seed = 0;
  for (let i = 0; i < world.worldId.length; i++) seed = (seed * 31 + world.worldId.charCodeAt(i)) >>> 0;
  seed = (seed ^ (world.bpm * 2654435761)) >>> 0;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };

  const primary = world.theme.primary;
  const glow = world.theme.glow;

  // Dark background.
  ctx.fillStyle = '#040810';
  ctx.fillRect(0, 0, W, H);

  // Map world grid coords to canvas px, with a small margin.
  const mx = 6, my = 5;
  const scaleX = (W - mx * 2) / world.gridWidth;
  const scaleY = (H - my * 2) / world.gridHeight;
  const toX = (gx: number) => mx + gx * scaleX;
  const toY = (gy: number) => my + gy * scaleY;

  // Subtle grid.
  ctx.strokeStyle = 'rgba(30,50,80,0.55)';
  ctx.lineWidth = 0.5;
  for (let gx = 0; gx <= world.gridWidth; gx++) {
    ctx.beginPath(); ctx.moveTo(toX(gx), my); ctx.lineTo(toX(gx), H - my); ctx.stroke();
  }
  for (let gy = 0; gy <= world.gridHeight; gy++) {
    ctx.beginPath(); ctx.moveTo(mx, toY(gy)); ctx.lineTo(W - mx, toY(gy)); ctx.stroke();
  }

  // Lanes: draw each as a glowing polyline through tile centers.
  for (const lane of world.lanes) {
    if (lane.length < 2) continue;
    // Outer glow pass.
    ctx.save();
    ctx.strokeStyle = `${primary}44`;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = glow;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(toX(lane[0][0] + 0.5), toY(lane[0][1] + 0.5));
    for (let i = 1; i < lane.length; i++) ctx.lineTo(toX(lane[i][0] + 0.5), toY(lane[i][1] + 0.5));
    ctx.stroke();
    ctx.restore();
    // Core bright line.
    ctx.save();
    ctx.strokeStyle = unlocked ? primary : `${primary}66`;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(toX(lane[0][0] + 0.5), toY(lane[0][1] + 0.5));
    for (let i = 1; i < lane.length; i++) ctx.lineTo(toX(lane[i][0] + 0.5), toY(lane[i][1] + 0.5));
    ctx.stroke();
    ctx.restore();

    // Start marker (hollow circle at lane[0]).
    const sx = toX(lane[0][0] + 0.5), sy = toY(lane[0][1] + 0.5);
    ctx.save();
    ctx.strokeStyle = unlocked ? glow : `${glow}55`;
    ctx.lineWidth = 1.2;
    ctx.shadowColor = glow;
    ctx.shadowBlur = unlocked ? 5 : 0;
    ctx.beginPath(); ctx.arc(sx, sy, 2.8, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // Finish marker (filled diamond at lane[last]).
    const last = lane[lane.length - 1];
    const fx = toX(last[0] + 0.5), fy = toY(last[1] + 0.5);
    ctx.save();
    ctx.fillStyle = unlocked ? glow : `${glow}55`;
    ctx.shadowColor = glow;
    ctx.shadowBlur = unlocked ? 6 : 0;
    ctx.beginPath();
    ctx.moveTo(fx, fy - 3.5); ctx.lineTo(fx + 3, fy); ctx.lineTo(fx, fy + 3.5); ctx.lineTo(fx - 3, fy);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // Tower-start marker (small cross).
  const [tx, ty] = world.towerStart;
  const tpx = toX(tx + 0.5), tpy = toY(ty + 0.5);
  ctx.save();
  ctx.strokeStyle = unlocked ? '#ffcc44aa' : '#ffcc4433';
  ctx.lineWidth = 1.2;
  ctx.shadowColor = '#ffcc44';
  ctx.shadowBlur = unlocked ? 4 : 0;
  const arm = 3;
  ctx.beginPath(); ctx.moveTo(tpx - arm, tpy); ctx.lineTo(tpx + arm, tpy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(tpx, tpy - arm); ctx.lineTo(tpx, tpy + arm); ctx.stroke();
  ctx.restore();

  // Ambient theme-colored dots (deterministic).
  const dotCount = 12 + Math.floor(rng() * 6);
  for (let i = 0; i < dotCount; i++) {
    const dx = mx + rng() * (W - mx * 2);
    const dy = my + rng() * (H - my * 2);
    const r = 0.8 + rng() * 1.4;
    const alpha = unlocked ? (0.25 + rng() * 0.45) : (0.08 + rng() * 0.12);
    ctx.save();
    ctx.fillStyle = i % 3 === 0 ? `rgba(200,220,255,${alpha * 0.5})` : primary + Math.round(alpha * 255).toString(16).padStart(2, '0');
    ctx.shadowColor = glow;
    ctx.shadowBlur = unlocked ? 4 : 0;
    ctx.beginPath(); ctx.arc(dx, dy, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Locked overlay: dim the whole preview.
  if (!unlocked) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
  }
}
