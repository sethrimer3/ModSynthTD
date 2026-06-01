type Structure = 'empty' | 'wall' | 'turret' | 'radar';
type Tool = 'wall' | 'turret' | 'radar' | 'erase';

interface Enemy {
  xTile: number;
  yTile: number;
  hp: number;
  maxHp: number;
  speedTilePerSec: number;
  isBreaker: boolean;
}

interface Mote {
  progress: number;
}

interface ShotFlash {
  fromXPx: number;
  fromYPx: number;
  toXPx: number;
  toYPx: number;
  ageSec: number;
}

// ── Constants ──────────────────────────────────────────────────────────────
const tileSizePx = 12;
const gridWidthTile = 20;
const gridHeightTile = 12;
const nativeWidthPx = gridWidthTile * tileSizePx;
const nativeHeightPx = gridHeightTile * tileSizePx;
const coreTile = { x: Math.floor(gridWidthTile / 2), y: Math.floor(gridHeightTile / 2) };
const depositTile = { x: 3, y: 2 };
const entranceTile = { x: 6, y: coreTile.y };
const breakerTargetTile = { x: coreTile.x, y: 3 };
const currentBuildNumber = 2;
const turretRangeTile = 4.5;
const shotFlashDurationSec = 0.12;
const breakerArrivalDistanceTile = 0.2;
const coreHpHealthyThreshold = 60;
const coreHpDamagedThreshold = 30;

// ── DOM ────────────────────────────────────────────────────────────────────
const appElement = document.getElementById('app');
if (!appElement) {
  throw new Error('Missing app root');
}

const rootElement = document.createElement('div');
rootElement.className = 'gameRoot';

const hudElement = document.createElement('div');
hudElement.className = 'hud';

const hudLeftElement = document.createElement('div');
hudLeftElement.className = 'hudLeft';
const hudRightElement = document.createElement('div');
hudRightElement.className = 'hudRight';

const hudRow1 = document.createElement('div');
hudRow1.className = 'hudRow';
const hpSpan = document.createElement('span');
hpSpan.className = 'statChip';
const oreSpan = document.createElement('span');
oreSpan.className = 'statChip';
hudRow1.append(hpSpan, document.createTextNode(' · '), oreSpan);

const hudRow2 = document.createElement('div');
hudRow2.className = 'hudRow';
const waveSpan = document.createElement('span');
waveSpan.className = 'statChip';
const radarSpan = document.createElement('span');
radarSpan.className = 'statChip';
hudRow2.append(waveSpan, document.createTextNode(' · '), radarSpan);

hudLeftElement.append(hudRow1, hudRow2);

const hudRow3 = document.createElement('div');
hudRow3.className = 'hudRow';
const metaSpan = document.createElement('span');
metaSpan.className = 'statChip';
hudRow3.append(metaSpan);

const hudRow4 = document.createElement('div');
hudRow4.className = 'hudRow';
const nextWaveSpan = document.createElement('span');
nextWaveSpan.className = 'statChip';
hudRow4.append(nextWaveSpan);

hudRightElement.append(hudRow3, hudRow4);
hudElement.append(hudLeftElement, hudRightElement);

const canvasElement = document.createElement('canvas');
canvasElement.width = nativeWidthPx;
canvasElement.height = nativeHeightPx;
canvasElement.className = 'gameCanvas';
canvasElement.setAttribute('aria-label', 'Tiny Base Idle game board');

const toolbarElement = document.createElement('div');
toolbarElement.className = 'toolbar';

rootElement.append(hudElement, canvasElement, toolbarElement);
appElement.append(rootElement);

// ── Canvas context ─────────────────────────────────────────────────────────
const ctxValue = canvasElement.getContext('2d');
if (!ctxValue) {
  throw new Error('Could not create canvas context');
}
const ctx: CanvasRenderingContext2D = ctxValue;
ctx.imageSmoothingEnabled = false;

// ── Game state ─────────────────────────────────────────────────────────────
const terrainIsDebris: boolean[] = new Array(gridWidthTile * gridHeightTile).fill(false);
const structures: Structure[] = new Array(gridWidthTile * gridHeightTile).fill('empty');
const turretAngleRad = new Map<number, number>();

let metaCurrency = Number(localStorage.getItem('tiny-base-idle-meta') ?? '0');
let ore = 0;
let coreHp = 100;
let radarLevel = 1;
let revealRadiusTile = 5;
let elapsedSec = 0;
let waveIndex = 0;
let turretFireCooldownSec = 3;
let moteSpawnCooldownSec = 0.8;
let waveTimerSec = 8;
let isRunOver = false;
let gameOverDelaySec = 0;
let lastMetaEarned = 0;
let breakerTriggered = false;

let enemies: Enemy[] = [];
let motes: Mote[] = [];
let shotFlashes: ShotFlash[] = [];

let overlayText = '';
let overlayColor = '#ffee44';
let overlayTimerSec = 0;

let hoveredXTile = -1;
let hoveredYTile = -1;
let isPointerHeld = false;

// ── Tool setup ─────────────────────────────────────────────────────────────
interface ToolConfig {
  label: string;
  key: string;
  color: string;
}

const toolConfigs: Record<Tool, ToolConfig> = {
  wall:   { label: 'Wall',   key: 'W', color: '#6a8faf' },
  turret: { label: 'Turret', key: 'T', color: '#27e0ff' },
  radar:  { label: 'Radar',  key: 'R', color: '#8d68ff' },
  erase:  { label: 'Erase',  key: 'E', color: '#ff7060' },
};
const toolOrder: Tool[] = ['wall', 'turret', 'radar', 'erase'];
const toolButtons = new Map<Tool, HTMLButtonElement>();
let selectedTool: Tool = 'wall';

for (const tool of toolOrder) {
  const cfg = toolConfigs[tool];
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'toolButton';
  button.style.setProperty('--tool-color', cfg.color);
  const labelSpan = document.createElement('span');
  labelSpan.textContent = cfg.label;
  const keySpan = document.createElement('span');
  keySpan.className = 'toolKey';
  keySpan.textContent = `[${cfg.key}]`;
  button.append(labelSpan, keySpan);
  button.addEventListener('click', () => {
    selectedTool = tool;
    updateToolbarState();
  });
  toolbarElement.append(button);
  toolButtons.set(tool, button);
}
updateToolbarState();

// ── Keyboard shortcuts ─────────────────────────────────────────────────────
window.addEventListener('keydown', (event) => {
  const keyMap: Record<string, Tool> = {
    'w': 'wall',   '1': 'wall',
    't': 'turret', '2': 'turret',
    'r': 'radar',  '3': 'radar',
    'e': 'erase',  '4': 'erase',
  };
  const tool = keyMap[event.key.toLowerCase()];
  if (tool) {
    selectedTool = tool;
    updateToolbarState();
  }
});

// ── Terrain ────────────────────────────────────────────────────────────────
buildStarterTerrain();
let distanceField = computeDistanceField();

// ── Logic helpers ──────────────────────────────────────────────────────────

function updateToolbarState(): void {
  for (const [tool, button] of toolButtons) {
    button.classList.toggle('active', tool === selectedTool);
  }
}

function tileIndex(xTile: number, yTile: number): number {
  return yTile * gridWidthTile + xTile;
}

function buildStarterTerrain(): void {
  terrainIsDebris.fill(false);
  const minX = coreTile.x - 4;
  const maxX = coreTile.x + 4;
  const minY = coreTile.y - 3;
  const maxY = coreTile.y + 3;

  for (let yTile = minY; yTile <= maxY; yTile += 1) {
    for (let xTile = minX; xTile <= maxX; xTile += 1) {
      const isBorder = xTile === minX || xTile === maxX || yTile === minY || yTile === maxY;
      if (!isBorder) {
        continue;
      }
      const isOpening = xTile === entranceTile.x && yTile === entranceTile.y;
      if (!isOpening) {
        terrainIsDebris[tileIndex(xTile, yTile)] = true;
      }
    }
  }
}

function isInBounds(xTile: number, yTile: number): boolean {
  return xTile >= 0 && yTile >= 0 && xTile < gridWidthTile && yTile < gridHeightTile;
}

function isWalkableForEnemy(xTile: number, yTile: number): boolean {
  if (!isInBounds(xTile, yTile)) {
    return false;
  }
  const index = tileIndex(xTile, yTile);
  if (terrainIsDebris[index]) {
    return false;
  }
  return structures[index] === 'empty';
}

function computeDistanceField(): Int16Array {
  const distances = new Int16Array(gridWidthTile * gridHeightTile);
  distances.fill(-1);
  const queueXTile: number[] = [coreTile.x];
  const queueYTile: number[] = [coreTile.y];
  distances[tileIndex(coreTile.x, coreTile.y)] = 0;

  for (let queueIndex = 0; queueIndex < queueXTile.length; queueIndex += 1) {
    const xTile = queueXTile[queueIndex];
    const yTile = queueYTile[queueIndex];
    const currentDistance = distances[tileIndex(xTile, yTile)];

    const neighbors: [number, number][] = [
      [xTile + 1, yTile], [xTile - 1, yTile],
      [xTile, yTile + 1], [xTile, yTile - 1]
    ];

    for (const [nxTile, nyTile] of neighbors) {
      if (!isWalkableForEnemy(nxTile, nyTile)) {
        continue;
      }
      const neighborIndex = tileIndex(nxTile, nyTile);
      if (distances[neighborIndex] !== -1) {
        continue;
      }
      distances[neighborIndex] = (currentDistance + 1) as number;
      queueXTile.push(nxTile);
      queueYTile.push(nyTile);
    }
  }

  return distances;
}

function attemptPlaceStructure(xTile: number, yTile: number): void {
  if (!isInBounds(xTile, yTile)) {
    return;
  }
  if (xTile === coreTile.x && yTile === coreTile.y) {
    return;
  }
  if (xTile === depositTile.x && yTile === depositTile.y) {
    return;
  }

  const index = tileIndex(xTile, yTile);
  if (terrainIsDebris[index]) {
    return;
  }

  if (selectedTool === 'erase') {
    if (structures[index] !== 'empty') {
      structures[index] = 'empty';
      turretAngleRad.delete(index);
      distanceField = computeDistanceField();
    }
    return;
  }

  if (structures[index] !== 'empty') {
    return;
  }

  structures[index] = selectedTool;
  if (selectedTool === 'radar') {
    radarLevel += 1;
    revealRadiusTile = Math.min(10, revealRadiusTile + 1);
  }

  const nextDistanceField = computeDistanceField();
  if (nextDistanceField[tileIndex(entranceTile.x, entranceTile.y)] === -1) {
    structures[index] = 'empty';
    if (selectedTool === 'radar') {
      radarLevel -= 1;
      revealRadiusTile = Math.max(5, revealRadiusTile - 1);
    }
    return;
  }

  distanceField = nextDistanceField;
}

function getCanvasTile(clientX: number, clientY: number): [number, number] {
  const rect = canvasElement.getBoundingClientRect();
  const xPx = ((clientX - rect.left) / rect.width) * nativeWidthPx;
  const yPx = ((clientY - rect.top) / rect.height) * nativeHeightPx;
  return [Math.floor(xPx / tileSizePx), Math.floor(yPx / tileSizePx)];
}

canvasElement.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  isPointerHeld = true;
  canvasElement.setPointerCapture(event.pointerId);
  const [xTile, yTile] = getCanvasTile(event.clientX, event.clientY);
  hoveredXTile = xTile;
  hoveredYTile = yTile;
  attemptPlaceStructure(xTile, yTile);
});

canvasElement.addEventListener('pointermove', (event) => {
  const [xTile, yTile] = getCanvasTile(event.clientX, event.clientY);
  hoveredXTile = xTile;
  hoveredYTile = yTile;
  if (isPointerHeld) {
    attemptPlaceStructure(xTile, yTile);
  }
});

canvasElement.addEventListener('pointerup', () => {
  isPointerHeld = false;
});

canvasElement.addEventListener('pointercancel', () => {
  isPointerHeld = false;
});

canvasElement.addEventListener('pointerleave', () => {
  if (!isPointerHeld) {
    hoveredXTile = -1;
    hoveredYTile = -1;
  }
});

function showOverlay(text: string, color: string, durationSec: number): void {
  overlayText = text;
  overlayColor = color;
  overlayTimerSec = durationSec;
}

function spawnWave(): void {
  waveIndex += 1;
  const enemyCount = 3 + Math.floor(waveIndex * 0.5);

  for (let i = 0; i < enemyCount; i += 1) {
    const maxHp = 18 + waveIndex * 3;
    enemies.push({
      xTile: entranceTile.x,
      yTile: entranceTile.y,
      hp: maxHp,
      maxHp,
      speedTilePerSec: 1.2 + waveIndex * 0.05,
      isBreaker: false
    });
  }

  if (!breakerTriggered && waveIndex >= 5) {
    breakerTriggered = true;
    enemies.push({
      xTile: entranceTile.x,
      yTile: entranceTile.y,
      hp: 45,
      maxHp: 45,
      speedTilePerSec: 0.85,
      isBreaker: true
    });
  }

  showOverlay(`WAVE ${waveIndex}`, '#ffee44', 2);
}

function resetRun(): void {
  metaCurrency += Math.max(1, lastMetaEarned);
  localStorage.setItem('tiny-base-idle-meta', String(metaCurrency));

  ore = 0;
  coreHp = 100;
  radarLevel = 1;
  revealRadiusTile = 5;
  elapsedSec = 0;
  waveIndex = 0;
  waveTimerSec = 8;
  turretFireCooldownSec = 3;
  moteSpawnCooldownSec = 0.8;
  isRunOver = false;
  gameOverDelaySec = 0;
  enemies = [];
  motes = [];
  shotFlashes = [];
  breakerTriggered = false;
  structures.fill('empty');
  turretAngleRad.clear();
  buildStarterTerrain();
  distanceField = computeDistanceField();
  showOverlay('', '', 0);
}

function updateEnemies(dtSec: number): void {
  for (let enemyIndex = enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
    const enemy = enemies[enemyIndex];

    if (enemy.isBreaker && terrainIsDebris[tileIndex(breakerTargetTile.x, breakerTargetTile.y)]) {
      const dxTile = breakerTargetTile.x - enemy.xTile;
      const dyTile = breakerTargetTile.y - enemy.yTile;
      const breakerDistance = Math.hypot(dxTile, dyTile);
      if (breakerDistance < breakerArrivalDistanceTile) {
        terrainIsDebris[tileIndex(breakerTargetTile.x, breakerTargetTile.y)] = false;
        distanceField = computeDistanceField();
        enemies.splice(enemyIndex, 1);
        showOverlay('BREACH!', '#ff42d2', 3);
        continue;
      }
      const stepTile = (enemy.speedTilePerSec * dtSec) / Math.max(0.0001, breakerDistance);
      enemy.xTile += dxTile * stepTile;
      enemy.yTile += dyTile * stepTile;
      continue;
    }

    const xTile = Math.round(enemy.xTile);
    const yTile = Math.round(enemy.yTile);
    if (!isInBounds(xTile, yTile)) {
      enemies.splice(enemyIndex, 1);
      continue;
    }

    if (xTile === coreTile.x && yTile === coreTile.y) {
      coreHp -= 8;
      enemies.splice(enemyIndex, 1);
      if (coreHp <= 0 && !isRunOver) {
        isRunOver = true;
        lastMetaEarned = Math.max(1, Math.floor(ore / 8 + waveIndex * 2 + elapsedSec / 12));
        gameOverDelaySec = 3;
        showOverlay('GAME OVER', '#ff5533', 999);
      }
      continue;
    }

    const currentIndex = tileIndex(xTile, yTile);
    const currentDistance = distanceField[currentIndex];
    if (currentDistance <= 0) {
      continue;
    }

    let bestXTile = xTile;
    let bestYTile = yTile;
    let bestDistance = currentDistance;

    const neighbors: [number, number][] = [
      [xTile + 1, yTile], [xTile - 1, yTile],
      [xTile, yTile + 1], [xTile, yTile - 1]
    ];

    for (const [nxTile, nyTile] of neighbors) {
      if (!isInBounds(nxTile, nyTile)) {
        continue;
      }
      const neighborDistance = distanceField[tileIndex(nxTile, nyTile)];
      if (neighborDistance >= 0 && neighborDistance < bestDistance) {
        bestDistance = neighborDistance;
        bestXTile = nxTile;
        bestYTile = nyTile;
      }
    }

    const dxTile = bestXTile - enemy.xTile;
    const dyTile = bestYTile - enemy.yTile;
    const distance = Math.hypot(dxTile, dyTile);
    if (distance > 0.001) {
      const moveStep = (enemy.speedTilePerSec * dtSec) / distance;
      enemy.xTile += dxTile * Math.min(1, moveStep);
      enemy.yTile += dyTile * Math.min(1, moveStep);
    }
  }
}

function updateTurrets(dtSec: number): void {
  turretFireCooldownSec -= dtSec;
  if (turretFireCooldownSec <= 0) {
    turretFireCooldownSec = 0.35;

    for (let yTile = 0; yTile < gridHeightTile; yTile += 1) {
      for (let xTile = 0; xTile < gridWidthTile; xTile += 1) {
        const idx = tileIndex(xTile, yTile);
        if (structures[idx] !== 'turret') {
          continue;
        }

        let targetEnemy: Enemy | undefined;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const enemy of enemies) {
          const dxTile = enemy.xTile - xTile;
          const dyTile = enemy.yTile - yTile;
          const dist = Math.hypot(dxTile, dyTile);
          if (dist < turretRangeTile && dist < bestDistance) {
            bestDistance = dist;
            targetEnemy = enemy;
          }
        }

        if (!targetEnemy) {
          continue;
        }

        targetEnemy.hp -= 10;
        turretAngleRad.set(idx, Math.atan2(targetEnemy.yTile - yTile, targetEnemy.xTile - xTile));

        const half = tileSizePx / 2;
        shotFlashes.push({
          fromXPx: xTile * tileSizePx + half,
          fromYPx: yTile * tileSizePx + half,
          toXPx: Math.round(targetEnemy.xTile * tileSizePx + half),
          toYPx: Math.round(targetEnemy.yTile * tileSizePx + half),
          ageSec: 0
        });
      }
    }
  }

  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    if (enemies[i].hp <= 0) {
      enemies.splice(i, 1);
      ore += 2;
    }
  }

  for (let i = shotFlashes.length - 1; i >= 0; i -= 1) {
    shotFlashes[i].ageSec += dtSec;
    if (shotFlashes[i].ageSec > shotFlashDurationSec) {
      shotFlashes.splice(i, 1);
    }
  }
}

function updateMotes(dtSec: number): void {
  moteSpawnCooldownSec -= dtSec;
  if (moteSpawnCooldownSec <= 0) {
    moteSpawnCooldownSec = 0.65;
    motes.push({ progress: 0 });
  }

  for (let i = motes.length - 1; i >= 0; i -= 1) {
    motes[i].progress += dtSec * 0.4;
    if (motes[i].progress >= 1) {
      motes.splice(i, 1);
      ore += 1;
    }
  }
}

function update(dtSec: number): void {
  if (isRunOver) {
    if (gameOverDelaySec > 0) {
      gameOverDelaySec -= dtSec;
      if (gameOverDelaySec <= 0) {
        resetRun();
      }
    }
    return;
  }

  if (overlayTimerSec > 0) {
    overlayTimerSec -= dtSec;
  }

  elapsedSec += dtSec;
  waveTimerSec -= dtSec;
  if (waveTimerSec <= 0) {
    waveTimerSec = Math.max(3.5, 8 - waveIndex * 0.2);
    spawnWave();
  }

  updateEnemies(dtSec);
  updateTurrets(dtSec);
  updateMotes(dtSec);
}

// ── Draw helpers ───────────────────────────────────────────────────────────

function isTileVisible(xTile: number, yTile: number): boolean {
  const dxTile = xTile - coreTile.x;
  const dyTile = yTile - coreTile.y;
  return Math.hypot(dxTile, dyTile) <= revealRadiusTile;
}

function fillPx(xPx: number, yPx: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(xPx, yPx, w, h);
}

function drawGroundTile(xPx: number, yPx: number): void {
  fillPx(xPx, yPx, tileSizePx, tileSizePx, '#101829');
  fillPx(xPx + tileSizePx - 1, yPx, 1, tileSizePx, '#1b2a45');
  fillPx(xPx, yPx + tileSizePx - 1, tileSizePx, 1, '#1b2a45');
}

function drawDebrisTile(xPx: number, yPx: number): void {
  fillPx(xPx, yPx, tileSizePx, tileSizePx, '#242e3d');
  fillPx(xPx + 1, yPx + 1, 10, 10, '#2e3a4e');
  fillPx(xPx + 2, yPx + 2, 3, 1, '#49536e');
  fillPx(xPx + 6, yPx + 3, 3, 1, '#49536e');
  fillPx(xPx + 3, yPx + 7, 4, 1, '#49536e');
  fillPx(xPx + 8, yPx + 8, 2, 1, '#49536e');
  fillPx(xPx + 4, yPx + 5, 4, 1, '#1a2030');
  fillPx(xPx + 2, yPx + 9, 3, 1, '#1a2030');
}

function drawWallTile(xPx: number, yPx: number): void {
  fillPx(xPx, yPx, tileSizePx, tileSizePx, '#3d556a');
  fillPx(xPx + 1, yPx + 1, 10, 10, '#4f6a82');
  fillPx(xPx + 1, yPx + 1, 10, 1, '#72909e');
  fillPx(xPx + 1, yPx + 1, 1, 9, '#72909e');
  fillPx(xPx + 1, yPx + 10, 10, 1, '#1e3040');
  fillPx(xPx + 10, yPx + 1, 1, 10, '#1e3040');
}

function drawTurretTile(xPx: number, yPx: number, idx: number): void {
  fillPx(xPx, yPx, tileSizePx, tileSizePx, '#091c28');
  fillPx(xPx + 3, yPx + 3, 6, 6, '#155a6a');
  fillPx(xPx + 5, yPx + 5, 2, 2, '#27e0ff');
  const angle = turretAngleRad.get(idx) ?? 0;
  ctx.fillStyle = '#27e0ff';
  for (let step = 2; step <= 6; step += 1) {
    const bxOff = Math.round(5 + Math.cos(angle) * step);
    const byOff = Math.round(5 + Math.sin(angle) * step);
    if (bxOff >= 0 && bxOff < tileSizePx && byOff >= 0 && byOff < tileSizePx) {
      ctx.fillRect(xPx + bxOff, yPx + byOff, 1, 1);
    }
  }
  const tipXOff = Math.round(5 + Math.cos(angle) * 6);
  const tipYOff = Math.round(5 + Math.sin(angle) * 6);
  if (tipXOff >= 0 && tipXOff < tileSizePx && tipYOff >= 0 && tipYOff < tileSizePx) {
    fillPx(xPx + tipXOff, yPx + tipYOff, 1, 1, '#aaf8ff');
  }
}

function drawRadarTile(xPx: number, yPx: number): void {
  fillPx(xPx, yPx, tileSizePx, tileSizePx, '#0e0828');
  fillPx(xPx + 1, yPx + 6, 10, 1, '#2a1870');
  fillPx(xPx + 6, yPx + 1, 1, 10, '#2a1870');
  const ringPixels: [number, number][] = [
    [5, 3], [6, 3], [7, 3], [3, 5], [3, 6], [3, 7],
    [5, 9], [6, 9], [7, 9], [9, 5], [9, 6], [9, 7],
  ];
  ctx.fillStyle = '#4d30b0';
  for (const [rx, ry] of ringPixels) {
    ctx.fillRect(xPx + rx, yPx + ry, 1, 1);
  }
  fillPx(xPx + 5, yPx + 5, 2, 2, '#8d68ff');
  ctx.fillStyle = '#5d40d0';
  ctx.fillRect(xPx + 1, yPx + 1, 2, 1);
  ctx.fillRect(xPx + 1, yPx + 1, 1, 2);
  ctx.fillRect(xPx + 9, yPx + 1, 2, 1);
  ctx.fillRect(xPx + 10, yPx + 1, 1, 2);
  ctx.fillRect(xPx + 1, yPx + 10, 2, 1);
  ctx.fillRect(xPx + 1, yPx + 9, 1, 2);
  ctx.fillRect(xPx + 9, yPx + 10, 2, 1);
  ctx.fillRect(xPx + 10, yPx + 9, 1, 2);
}

function drawCoreTile(xPx: number, yPx: number): void {
  const coreColor = coreHp > coreHpHealthyThreshold ? '#33ffbb' : coreHp > coreHpDamagedThreshold ? '#ffee44' : '#ff5533';
  fillPx(xPx, yPx, tileSizePx, tileSizePx, '#050f0a');
  ctx.fillStyle = coreColor;
  ctx.fillRect(xPx + 4, yPx + 4, 4, 4);
  ctx.fillRect(xPx + 5, yPx + 2, 2, 2);
  ctx.fillRect(xPx + 5, yPx + 8, 2, 2);
  ctx.fillRect(xPx + 2, yPx + 5, 2, 2);
  ctx.fillRect(xPx + 8, yPx + 5, 2, 2);
}

function drawDepositTile(xPx: number, yPx: number): void {
  fillPx(xPx, yPx, tileSizePx, tileSizePx, '#1a1000');
  fillPx(xPx + 2, yPx + 3, 3, 3, '#b87000');
  fillPx(xPx + 6, yPx + 2, 3, 3, '#b87000');
  fillPx(xPx + 4, yPx + 7, 3, 3, '#b87000');
  fillPx(xPx + 2, yPx + 3, 1, 1, '#ffd677');
  fillPx(xPx + 6, yPx + 2, 1, 1, '#ffd677');
  fillPx(xPx + 4, yPx + 7, 1, 1, '#ffd677');
}

function drawEnemyHpBar(xPx: number, yPx: number, hp: number, maxHp: number): void {
  const barW = tileSizePx - 2;
  const barXPx = xPx + 1;
  const barYPx = yPx - 3;
  ctx.fillStyle = '#300000';
  ctx.fillRect(barXPx, barYPx, barW, 2);
  const fillW = Math.max(0, Math.round(barW * (hp / maxHp)));
  if (fillW > 0) {
    ctx.fillStyle = hp / maxHp > 0.5 ? '#44ff88' : '#ff8844';
    ctx.fillRect(barXPx, barYPx, fillW, 2);
  }
}

// ── Render ─────────────────────────────────────────────────────────────────
function render(): void {
  ctx.fillStyle = '#07090f';
  ctx.fillRect(0, 0, nativeWidthPx, nativeHeightPx);

  for (let yTile = 0; yTile < gridHeightTile; yTile += 1) {
    for (let xTile = 0; xTile < gridWidthTile; xTile += 1) {
      const xPx = xTile * tileSizePx;
      const yPx = yTile * tileSizePx;
      const index = tileIndex(xTile, yTile);

      if (!isTileVisible(xTile, yTile)) {
        fillPx(xPx, yPx, tileSizePx, tileSizePx, '#010206');
        continue;
      }

      if (terrainIsDebris[index]) {
        drawDebrisTile(xPx, yPx);
        continue;
      }

      drawGroundTile(xPx, yPx);

      const structure = structures[index];
      if (structure === 'wall') {
        drawWallTile(xPx, yPx);
      } else if (structure === 'turret') {
        drawTurretTile(xPx, yPx, index);
      } else if (structure === 'radar') {
        drawRadarTile(xPx, yPx);
      }
    }
  }

  drawCoreTile(coreTile.x * tileSizePx, coreTile.y * tileSizePx);
  drawDepositTile(depositTile.x * tileSizePx, depositTile.y * tileSizePx);

  // Dotted route line from deposit to core
  if (isTileVisible(depositTile.x, depositTile.y)) {
    const dxTile = coreTile.x - depositTile.x;
    const dyTile = coreTile.y - depositTile.y;
    ctx.fillStyle = '#2a1a00';
    for (let t = 0.08; t < 0.93; t += 0.1) {
      const rxPx = Math.round((depositTile.x + dxTile * t) * tileSizePx + tileSizePx / 2);
      const ryPx = Math.round((depositTile.y + dyTile * t) * tileSizePx + tileSizePx / 2);
      ctx.fillRect(rxPx, ryPx, 1, 1);
    }
  }

  // Radar reveal-radius ring
  {
    const cx = coreTile.x * tileSizePx + tileSizePx / 2;
    const cy = coreTile.y * tileSizePx + tileSizePx / 2;
    ctx.strokeStyle = 'rgba(141,104,255,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, revealRadiusTile * tileSizePx, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Ore motes (2×2 pixels)
  ctx.fillStyle = '#ffd677';
  for (const mote of motes) {
    const dxTile = coreTile.x - depositTile.x;
    const dyTile = coreTile.y - depositTile.y;
    const xPx = Math.round((depositTile.x + dxTile * mote.progress) * tileSizePx + tileSizePx / 2 - 1);
    const yPx = Math.round((depositTile.y + dyTile * mote.progress) * tileSizePx + tileSizePx / 2 - 1);
    ctx.fillRect(xPx, yPx, 2, 2);
  }

  // Shot flashes
  for (const flash of shotFlashes) {
    const alpha = Math.max(0, 1 - flash.ageSec / shotFlashDurationSec);
    ctx.strokeStyle = `rgba(39,224,255,${alpha})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(flash.fromXPx, flash.fromYPx);
    ctx.lineTo(flash.toXPx, flash.toYPx);
    ctx.stroke();
  }

  // Enemies and their HP bars
  for (const enemy of enemies) {
    const xPx = Math.round(enemy.xTile * tileSizePx);
    const yPx = Math.round(enemy.yTile * tileSizePx);
    ctx.fillStyle = enemy.isBreaker ? '#ff42d2' : '#ff5656';
    ctx.fillRect(xPx + tileSizePx / 2 - 2, yPx + tileSizePx / 2 - 2, 4, 4);
    if (enemy.hp < enemy.maxHp) {
      drawEnemyHpBar(xPx, yPx, enemy.hp, enemy.maxHp);
    }
  }

  // Hover ghost tile
  if (!isPointerHeld && hoveredXTile >= 0 && isInBounds(hoveredXTile, hoveredYTile)) {
    const xPx = hoveredXTile * tileSizePx;
    const yPx = hoveredYTile * tileSizePx;
    ctx.fillStyle = selectedTool === 'erase' ? 'rgba(255,100,80,0.28)' : 'rgba(100,180,255,0.18)';
    ctx.fillRect(xPx, yPx, tileSizePx, tileSizePx);
    ctx.strokeStyle = selectedTool === 'erase' ? 'rgba(255,100,80,0.55)' : 'rgba(100,200,255,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(xPx + 0.5, yPx + 0.5, tileSizePx - 1, tileSizePx - 1);
  }

  // Overlay (WAVE / BREACH / GAME OVER)
  if (overlayText && overlayTimerSec > 0) {
    const cx = nativeWidthPx / 2;
    ctx.save();
    if (overlayText === 'GAME OVER') {
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, nativeHeightPx / 2 - 22, nativeWidthPx, 44);
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = overlayColor;
      ctx.fillText('GAME OVER', cx, nativeHeightPx / 2 - 8);
      ctx.font = '7px monospace';
      ctx.fillStyle = '#aaccee';
      ctx.fillText(`+${lastMetaEarned} meta earned  ·  restarting…`, cx, nativeHeightPx / 2 + 7);
    } else {
      const fadeAlpha = Math.min(1, overlayTimerSec) * 0.9;
      ctx.fillStyle = `rgba(0,0,0,${fadeAlpha * 0.5})`;
      ctx.fillRect(cx - 42, 25, 84, 16);
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = fadeAlpha;
      ctx.fillStyle = overlayColor;
      ctx.fillText(overlayText, cx, 33);
    }
    ctx.restore();
  }

  // Build number (bottom-left corner)
  ctx.save();
  ctx.font = '5px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#2a3a50';
  ctx.fillText(`b${currentBuildNumber}`, 2, nativeHeightPx - 1);
  ctx.restore();

  // HUD spans
  const hpRatio = Math.max(0, coreHp) / 100;
  hpSpan.textContent = `HP ${Math.max(0, Math.ceil(coreHp))}`;
  hpSpan.style.color = hpRatio > coreHpHealthyThreshold / 100 ? '#33ffbb' : hpRatio > coreHpDamagedThreshold / 100 ? '#ffaa44' : '#ff4444';

  oreSpan.textContent = `Ore ${ore}`;
  oreSpan.style.color = '#f0a600';

  waveSpan.textContent = `Wave ${waveIndex}`;
  waveSpan.style.color = '#ff8844';

  radarSpan.textContent = `Radar ${radarLevel}`;
  radarSpan.style.color = '#8d68ff';

  metaSpan.textContent = `Meta ${metaCurrency}`;
  metaSpan.style.color = '#c0e8ff';

  nextWaveSpan.textContent = isRunOver ? 'restarting…' : `Next ${waveTimerSec.toFixed(1)}s`;
  nextWaveSpan.style.color = waveTimerSec < 2 && !isRunOver ? '#ff5522' : '#ffcc44';
}

export function startGame(): void {
  let lastTimeMs = performance.now();

  const loop = (timeMs: number): void => {
    const dtSec = Math.min(0.05, (timeMs - lastTimeMs) / 1000);
    lastTimeMs = timeMs;
    update(dtSec);
    render();
    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
}
