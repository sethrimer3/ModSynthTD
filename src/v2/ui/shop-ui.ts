/**
 * shop-ui.ts — Module shop / browser. Shows every catalog module with its
 * purpose, ports, cost, lock state, owned count, width, and a faceplate
 * preview. Buys create one instance in the current world's rack.
 */

import { SaveData } from '../state/save';
import { MODULE_TYPES, ModuleTypeDef } from '../core/modules';
import { isBlueprintUnlocked, ownedCount, CURRENCY_SYMBOL, moduleTypeForShop } from '../state/economy';
import {
  isUpgradeable, moduleUpgradeLevel, upgradeCost, MAX_UPGRADE_LEVEL,
  INFINITY_SYMBOL, UPGRADE_EFFECTS,
} from '../state/upgrades';
import { getWorld } from '../data/worlds';

const FF = `font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;`;

const CATEGORY_LABEL: Record<string, string> = {
  timing: 'TIMING', pitch: 'PITCH', routing: 'ROUTE', gain: 'GAIN', filter: 'FILTER', output: 'OUTPUT',
};
const CATEGORY_COLOR: Record<string, string> = {
  timing: '#66ddff', pitch: '#cc44ff', routing: '#33dd88', gain: '#ffaa44', filter: '#ffdd55', output: '#ffcc00',
};

/** Modules especially worth buying in each world. */
const WORLD_FEATURED: Record<string, string[]> = {
  w40:  ['pitchDial', 'amp'],
  w60:  ['octaveSwitch', 'resonator'],
  w80:  ['splitter', 'resonator'],
  w100: ['delay', 'phase'],
  w120: ['mixer', 'harmonizer', 'pitchRouter'],
  w140: ['filter', 'envelope', 'clockdiv', 'pitchFilter'],
  w160: ['router', 'sequencer', 'arp', 'probability'],
  w180: ['targetTuner', 'pitchMemory'],
  w200: ['targetTuner', 'pitchMemory'],
};

const DOMAIN_DOT: Record<string, string> = {
  trigger: '#33dd88', voice: '#cc44ff', either: '#88aacc', output: '#ffcc00',
};

export interface ShopUIOpts {
  save: SaveData;
  worldId: string;
  isLive(): boolean;
  onBuy(typeId: string): { ok: boolean; error?: string };
  onUpgrade(typeId: string): { ok: boolean; error?: string; level?: number };
  onClose(): void;
}

export function openShop(parent: HTMLElement, opts: ShopUIOpts): void {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,3,10,0.86);z-index:180;
    display:flex;align-items:center;justify-content:center;${FF}
  `;
  const panel = document.createElement('div');
  panel.style.cssText = `
    background:#070d1a;border:1.5px solid #2a3d65;border-radius:14px;
    padding:1rem 1.1rem;display:flex;flex-direction:column;gap:0.7rem;
    width:min(640px, 94vw);max-height:88vh;color:#cfe6ff;
  `;
  overlay.appendChild(panel);

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:0.6rem;flex-wrap:wrap;';
  const title = document.createElement('div');
  title.textContent = 'MODULE SHOP';
  title.style.cssText = 'font-size:0.85rem;font-weight:800;letter-spacing:0.1em;color:#dff6ff;';
  const balance = document.createElement('div');
  balance.style.cssText = 'font-size:0.72rem;font-weight:800;color:#00ddcc;text-align:right;';
  const refreshBalance = () => {
    const loops = opts.save.infinityLoops > 0
      ? `<br><span style="color:#aa66ff">${INFINITY_SYMBOL} ${opts.save.infinityLoops} InfinityLoops</span>`
      : '';
    balance.innerHTML = `${CURRENCY_SYMBOL} ${opts.save.resonance} Resonance${loops}`;
  };
  refreshBalance();
  header.append(title, balance);
  panel.appendChild(header);

  if (opts.isLive()) {
    const warn = document.createElement('div');
    warn.textContent = 'The rack is LIVE — purchases unlock again during preparation.';
    warn.style.cssText = 'font-size:0.62rem;color:#ffaa44;letter-spacing:0.04em;';
    panel.appendChild(warn);
  }

  const status = document.createElement('div');
  status.style.cssText = 'font-size:0.6rem;min-height:1em;color:#88aacc;';

  const grid = document.createElement('div');
  grid.style.cssText = `
    display:grid;grid-template-columns:repeat(auto-fill, minmax(min(180px, 100%), 1fr));
    gap:0.5rem;overflow-y:auto;padding-right:4px;
  `;
  panel.appendChild(grid);

  const cards: Array<() => void> = [];

  for (const def of MODULE_TYPES) {
    if (!moduleTypeForShop(def)) continue;
    const card = document.createElement('div');
    card.style.cssText = `
      background:#0a1226;border:1.5px solid #1a2a44;border-radius:10px;
      padding:0.55rem 0.6rem;display:flex;flex-direction:column;gap:0.35rem;
    `;

    // Faceplate preview.
    const face = document.createElement('div');
    face.style.cssText = `
      height:40px;border-radius:6px;display:flex;align-items:center;justify-content:center;
      background:linear-gradient(180deg,#0c1428,#070c18);border:1px solid ${def.color}44;position:relative;
    `;
    const faceLabel = document.createElement('span');
    faceLabel.textContent = def.shortName;
    faceLabel.style.cssText = `font-size:0.7rem;font-weight:800;letter-spacing:0.12em;color:${def.color};text-shadow:0 0 8px ${def.color}66;`;
    face.appendChild(faceLabel);
    // Port dots.
    const portRow = (ports: typeof def.inputs, side: 'left' | 'right') => {
      const r = document.createElement('div');
      r.style.cssText = `position:absolute;${side}:4px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:3px;`;
      for (const p of ports) {
        const dot = document.createElement('div');
        dot.style.cssText = `width:6px;height:6px;border-radius:50%;background:${DOMAIN_DOT[p.domain] ?? '#888'};box-shadow:0 0 4px ${DOMAIN_DOT[p.domain] ?? '#888'};`;
        r.appendChild(dot);
      }
      return r;
    };
    if (def.inputs.length) face.appendChild(portRow(def.inputs, 'left'));
    if (def.outputs.length) face.appendChild(portRow(def.outputs, 'right'));
    card.appendChild(face);

    const nameRow = document.createElement('div');
    nameRow.style.cssText = 'display:flex;align-items:center;gap:5px;flex-wrap:wrap;';
    const name = document.createElement('div');
    name.textContent = def.name;
    name.style.cssText = 'font-size:0.7rem;font-weight:800;color:#dff6ff;flex:1;';
    nameRow.appendChild(name);
    if (def.category) {
      const catColor = CATEGORY_COLOR[def.category] ?? '#88aacc';
      const badge = document.createElement('span');
      badge.textContent = CATEGORY_LABEL[def.category] ?? def.category.toUpperCase();
      badge.style.cssText = `font-size:0.46rem;font-weight:800;letter-spacing:0.07em;color:${catColor};border:1px solid ${catColor}66;border-radius:4px;padding:1px 4px;`;
      nameRow.appendChild(badge);
    }
    const featured = (WORLD_FEATURED[opts.worldId] ?? []).includes(def.typeId);
    if (featured) {
      const rec = document.createElement('span');
      rec.textContent = '★ REC';
      rec.style.cssText = 'font-size:0.46rem;font-weight:800;letter-spacing:0.07em;color:#ffdd55;border:1px solid #ffdd5566;border-radius:4px;padding:1px 4px;';
      nameRow.appendChild(rec);
    }
    card.appendChild(nameRow);

    const tip = document.createElement('div');
    tip.textContent = def.tooltip;
    tip.style.cssText = 'font-size:0.56rem;line-height:1.4;color:#7c97bd;min-height:3em;';
    card.appendChild(tip);

    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:0.54rem;color:#5577aa;display:flex;justify-content:space-between;';
    const ports = document.createElement('span');
    ports.textContent = `${def.inputs.length}in · ${def.outputs.length}out · ${def.rackSize.w}×${def.rackSize.h}`;
    const owned = document.createElement('span');
    meta.append(ports, owned);
    card.appendChild(meta);

    const btn = document.createElement('button');
    card.appendChild(btn);

    // Upgrade row (InfinityLoops). Only for upgradeable types.
    const upgradeable = isUpgradeable(def.typeId);
    const upWrap = document.createElement('div');
    upWrap.style.cssText = 'display:flex;flex-direction:column;gap:3px;';
    const upInfo = document.createElement('div');
    upInfo.style.cssText = 'font-size:0.5rem;line-height:1.3;color:#9a7fd0;min-height:1.3em;';
    const upBtn = document.createElement('button');
    if (upgradeable) {
      upInfo.textContent = UPGRADE_EFFECTS[def.typeId] ?? '';
      upWrap.append(upInfo, upBtn);
      card.appendChild(upWrap);
    }

    const refreshUpgrade = () => {
      if (!upgradeable) return;
      const lvl = moduleUpgradeLevel(opts.save, def.typeId);
      const pips = '◆'.repeat(lvl) + '◇'.repeat(MAX_UPGRADE_LEVEL - lvl);
      if (lvl >= MAX_UPGRADE_LEVEL) {
        upBtn.disabled = true;
        upBtn.textContent = `${pips} MAX TIER`;
        upBtn.style.cssText = `${FF}font-size:0.56rem;font-weight:800;padding:4px;border-radius:6px;cursor:default;background:#160e26;border:1.5px solid #5a3d8a;color:#aa66ff;`;
        return;
      }
      const cost = upgradeCost(lvl);
      const can = opts.save.infinityLoops >= cost;
      upBtn.disabled = !can;
      upBtn.textContent = `${pips} UPGRADE · ${cost}${INFINITY_SYMBOL}`;
      upBtn.style.cssText = `${FF}font-size:0.56rem;font-weight:800;padding:4px;border-radius:6px;letter-spacing:0.03em;
        cursor:${can ? 'pointer' : 'not-allowed'};
        background:${can ? '#160e26' : '#0a1020'};border:1.5px solid ${can ? '#aa66ff' : '#223044'};color:${can ? '#cc99ff' : '#445a78'};`;
    };
    upBtn.addEventListener('click', () => {
      const r = opts.onUpgrade(def.typeId);
      if (!r.ok) {
        status.textContent = r.error ?? 'Upgrade failed.';
        status.style.color = '#ff6677';
      } else {
        status.textContent = `${def.name} upgraded to tier ${r.level}.`;
        status.style.color = '#aa66ff';
        refreshBalance();
        cards.forEach(f => f());
      }
    });

    const refresh = () => {
      refreshUpgrade();
      const unlocked = isBlueprintUnlocked(opts.save, def.typeId);
      const have = ownedCount(opts.save, opts.worldId, def.typeId);
      owned.textContent = `owned: ${have}`;
      const affordable = opts.save.resonance >= def.cost;
      const canBuy = unlocked && affordable && !opts.isLive();
      btn.disabled = !canBuy;
      if (!unlocked) {
        const w = getWorld(def.unlockAfterWorld ?? '');
        btn.textContent = `🔒 Complete ${w?.name ?? def.unlockAfterWorld}`;
        btn.style.cssText = `${FF}font-size:0.58rem;font-weight:800;padding:5px;border-radius:6px;cursor:not-allowed;background:#0a1020;border:1.5px solid #223044;color:#445a78;`;
      } else {
        btn.textContent = `BUY · ${def.cost}${CURRENCY_SYMBOL}`;
        btn.style.cssText = `${FF}font-size:0.62rem;font-weight:800;padding:5px;border-radius:6px;letter-spacing:0.04em;
          cursor:${canBuy ? 'pointer' : 'not-allowed'};
          background:${canBuy ? '#11281a' : '#0a1020'};border:1.5px solid ${canBuy ? '#33dd88' : '#223044'};color:${canBuy ? '#33dd88' : '#445a78'};`;
      }
    };
    btn.addEventListener('click', () => {
      const r = opts.onBuy(def.typeId);
      if (!r.ok) {
        status.textContent = r.error ?? 'Purchase failed.';
        status.style.color = '#ff6677';
      } else {
        status.textContent = `Bought ${def.name}.`;
        status.style.color = '#33dd88';
        refreshBalance();
        cards.forEach(f => f());
      }
    });
    refresh();
    cards.push(refresh);
    grid.appendChild(card);
  }

  panel.appendChild(status);

  const close = document.createElement('button');
  close.textContent = 'CLOSE';
  close.style.cssText = `${FF}font-size:0.68rem;font-weight:800;padding:6px;border-radius:8px;cursor:pointer;background:#0a1020;border:1.5px solid #2a3d65;color:#88aacc;`;
  close.addEventListener('click', () => { overlay.remove(); opts.onClose(); });
  panel.appendChild(close);

  overlay.addEventListener('pointerdown', (e) => {
    if (e.target === overlay) { overlay.remove(); opts.onClose(); }
  });
  parent.appendChild(overlay);
}
