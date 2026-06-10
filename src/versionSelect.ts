import { startGame } from './game';
import { startVersion2 } from './version2';

const PREVIEW_SIZE = 200;

// ── Version 1 preview ────────────────────────────────────────────────────
// Mimics the pixelated grid look: dark bg, cyan core tile, orange ore tiles.
function drawV1Preview(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  const tileSize = Math.floor(w / 20);

  ctx.fillStyle = '#04050a';
  ctx.fillRect(0, 0, w, h);

  // Grid lines (faint)
  ctx.strokeStyle = 'rgba(42,61,101,0.45)';
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= 20; x++) {
    ctx.beginPath(); ctx.moveTo(x * tileSize, 0); ctx.lineTo(x * tileSize, h); ctx.stroke();
  }
  for (let y = 0; y <= 20; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * tileSize); ctx.lineTo(w, y * tileSize); ctx.stroke();
  }

  // Ore deposit (orange square cluster)
  const oreColor = '#f0a600';
  const oreTiles = [[5, 10], [5, 11], [6, 10]];
  for (const [tx, ty] of oreTiles) {
    ctx.fillStyle = oreColor;
    ctx.fillRect(tx * tileSize + 1, ty * tileSize + 1, tileSize - 1, tileSize - 1);
  }

  // Core tile (cyan)
  const cx = 10 * tileSize + 1;
  const cy = 10 * tileSize + 1;
  ctx.fillStyle = '#33ffbb';
  ctx.fillRect(cx, cy, tileSize - 1, tileSize - 1);
}

// ── Version 2 preview ────────────────────────────────────────────────────
// Neon aesthetic: black bg, glowing cyan circle, pale-orange diamonds.
function drawV2Preview(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  // Ore diamonds
  const ores: [number, number, number][] = [
    [52, 100, 13], [44, 108, 9], [61, 109, 7],
    [148, 100, 11], [141, 109, 8], [156, 109, 10],
  ];
  for (const [ox, oy, size] of ores) {
    ctx.save();
    ctx.shadowColor = '#ff8833';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = '#ffb87a';
    ctx.lineWidth = 1.2;
    ctx.translate(ox, oy);
    ctx.rotate(Math.PI / 4);
    const half = size / 2;
    ctx.strokeRect(-half, -half, size, size);
    ctx.restore();
  }

  // Base circle
  ctx.save();
  ctx.shadowColor = '#00ffaa';
  ctx.shadowBlur = 16;
  ctx.strokeStyle = '#00ffcc';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 18, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ── Selector UI ───────────────────────────────────────────────────────────

export function showVersionSelect(): void {
  const appEl = document.getElementById('app')!;
  appEl.innerHTML = '';
  appEl.style.minHeight = '100vh';
  appEl.style.display = 'flex';
  appEl.style.alignItems = 'center';
  appEl.style.justifyContent = 'center';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    display:flex; flex-direction:column; align-items:center; gap:2rem;
    padding:2rem 1rem; width:100%; max-width:520px;
  `;

  const title = document.createElement('div');
  title.textContent = 'Tiny Base Idle';
  title.style.cssText = `
    font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;
    font-size:1.6rem; font-weight:800; color:#dff6ff;
    letter-spacing:0.04em; text-shadow:0 0 20px rgba(0,200,255,0.4);
  `;

  const subtitle = document.createElement('div');
  subtitle.textContent = 'Choose a version';
  subtitle.style.cssText = `
    font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;
    font-size:0.8rem; color:#5577aa; letter-spacing:0.12em;
    text-transform:uppercase; margin-top:-1.2rem;
  `;

  const cards = document.createElement('div');
  cards.style.cssText = `
    display:flex; gap:1.25rem; flex-wrap:wrap; justify-content:center;
  `;

  const makeCard = (
    versionLabel: string,
    drawPreview: (c: HTMLCanvasElement) => void,
    tagLine: string,
    onClick: () => void,
  ): HTMLElement => {
    const card = document.createElement('button');
    card.style.cssText = `
      display:flex; flex-direction:column; align-items:center; gap:0.6rem;
      background:#0a0f1c; border:1.5px solid #2a3d65; border-radius:12px;
      padding:1rem; cursor:pointer; transition:border-color 0.15s, box-shadow 0.15s;
      font-family:'Pixelify Sans','Trebuchet MS',system-ui,sans-serif;
    `;

    card.addEventListener('mouseenter', () => {
      card.style.borderColor = '#4a8fff';
      card.style.boxShadow = '0 0 18px rgba(60,150,255,0.25)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.borderColor = '#2a3d65';
      card.style.boxShadow = '';
    });

    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = PREVIEW_SIZE;
    previewCanvas.height = PREVIEW_SIZE;
    previewCanvas.style.cssText = `
      width:${PREVIEW_SIZE}px; height:${PREVIEW_SIZE}px;
      border-radius:6px; display:block; pointer-events:none;
    `;
    drawPreview(previewCanvas);

    const label = document.createElement('div');
    label.textContent = versionLabel;
    label.style.cssText = `color:#dff6ff; font-size:0.95rem; font-weight:800;`;

    const tag = document.createElement('div');
    tag.textContent = tagLine;
    tag.style.cssText = `color:#5577aa; font-size:0.62rem; letter-spacing:0.07em;`;

    card.append(previewCanvas, label, tag);
    card.addEventListener('click', onClick);
    return card;
  };

  const v1Card = makeCard(
    'Version 1',
    drawV1Preview,
    'Pixel grid · Classic',
    () => {
      appEl.innerHTML = '';
      appEl.style.cssText = '';
      startGame();
    },
  );

  const v2Card = makeCard(
    'Version 2',
    drawV2Preview,
    'Neon lines · Free placement',
    () => {
      appEl.innerHTML = '';
      appEl.style.cssText = '';
      startVersion2();
    },
  );

  cards.append(v1Card, v2Card);
  wrapper.append(title, subtitle, cards);
  appEl.append(wrapper);
}
