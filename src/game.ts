type Structure = 'empty' | 'wall' | 'turret' | 'radar';
type Tool = 'wall' | 'turret' | 'radar' | 'erase';

interface Enemy {
  xTile: number;
  yTile: number;
  hp: number;
  speedTilePerSec: number;
  isBreaker: boolean;
}

interface Mote {
  progress: number;
}

const gridWidthTile = 20;
const gridHeightTile = 12;
const tileSizePx = 12;
const nativeWidthPx = gridWidthTile * tileSizePx;
const nativeHeightPx = gridHeightTile * tileSizePx;
const coreTile = { x: Math.floor(gridWidthTile / 2), y: Math.floor(gridHeightTile / 2) };
const depositTile = { x: 3, y: 2 };
const entranceTile = { x: 6, y: coreTile.y };
const breakerTarget = { x: coreTile.x, y: 3 };

const appElement = document.getElementById('app');
if (!appElement) {
  throw new Error('Missing app root');
}

const rootElement = document.createElement('div');
rootElement.className = 'gameRoot';

const hudElement = document.createElement('div');
hudElement.className = 'hud';

const topStatsElement = document.createElement('div');
const rightStatsElement = document.createElement('div');
rightStatsElement.className = 'rightStats';

const toolbarElement = document.createElement('div');
toolbarElement.className = 'toolbar';

const canvasElement = document.createElement('canvas');
canvasElement.width = nativeWidthPx;
canvasElement.height = nativeHeightPx;
canvasElement.className = 'gameCanvas';
canvasElement.setAttribute('aria-label', 'Tiny Base Idle game board');

hudElement.append(topStatsElement, rightStatsElement);
rootElement.append(hudElement, canvasElement, toolbarElement);
appElement.append(rootElement);

const ctx = canvasElement.getContext('2d');
if (!ctx) {
  throw new Error('Could not create canvas context');
}
ctx.imageSmoothingEnabled = false;

const terrainIsDebris: boolean[] = new Array(gridWidthTile * gridHeightTile).fill(false);
const structures: Structure[] = new Array(gridWidthTile * gridHeightTile).fill('empty');

const toolButtons = new Map<Tool, HTMLButtonElement>();
const tools: Tool[] = ['wall', 'turret', 'radar', 'erase'];
let selectedTool: Tool = 'wall';
for (const tool of tools) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'toolButton';
  button.textContent = tool[0].toUpperCase() + tool.slice(1);
  button.addEventListener('click', () => {
    selectedTool = tool;
    updateToolbarState();
  });
  toolbarElement.append(button);
  toolButtons.set(tool, button);
}
updateToolbarState();

let metaCurrency = Number(localStorage.getItem('tiny-base-idle-meta') ?? '0');
let ore = 0;
let coreHp = 100;
let radarLevel = 1;
let revealRadiusTile = 5;
let elapsedSec = 0;
let waveIndex = 0;
let enemySpawnCooldownSec = 3;
let moteSpawnCooldownSec = 0.8;
let waveTimerSec = 8;
let isRunOver = false;

let enemies: Enemy[] = [];
let motes: Mote[] = [];
let breakerTriggered = false;

buildStarterTerrain();

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
      [xTile + 1, yTile],
      [xTile - 1, yTile],
      [xTile, yTile + 1],
      [xTile, yTile - 1]
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

let distanceField = computeDistanceField();

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
    structures[index] = 'empty';
    distanceField = computeDistanceField();
    return;
  }

  if (structures[index] !== 'empty') {
    return;
  }

  structures[index] = selectedTool;
  if (selectedTool === 'radar') {
    radarLevel += 1;
    revealRadiusTile = Math.min(9, revealRadiusTile + 1);
  }

  const nextDistanceField = computeDistanceField();
  if (nextDistanceField[tileIndex(entranceTile.x, entranceTile.y)] === -1) {
    structures[index] = 'empty';
    return;
  }

  distanceField = nextDistanceField;
}

function handlePointer(clientX: number, clientY: number): void {
  const rect = canvasElement.getBoundingClientRect();
  const xPx = ((clientX - rect.left) / rect.width) * nativeWidthPx;
  const yPx = ((clientY - rect.top) / rect.height) * nativeHeightPx;
  const xTile = Math.floor(xPx / tileSizePx);
  const yTile = Math.floor(yPx / tileSizePx);
  attemptPlaceStructure(xTile, yTile);
}

canvasElement.addEventListener('pointerdown', (event) => {
  handlePointer(event.clientX, event.clientY);
});

function spawnWave(): void {
  waveIndex += 1;
  const enemyCount = 3 + Math.floor(waveIndex * 0.5);

  for (let i = 0; i < enemyCount; i += 1) {
    enemies.push({
      xTile: entranceTile.x,
      yTile: entranceTile.y,
      hp: 18 + waveIndex * 3,
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
      speedTilePerSec: 0.85,
      isBreaker: true
    });
  }
}

function resetRun(): void {
  const earnedMeta = Math.floor(ore / 8 + waveIndex * 2 + elapsedSec / 12);
  metaCurrency += Math.max(1, earnedMeta);
  localStorage.setItem('tiny-base-idle-meta', String(metaCurrency));

  ore = 0;
  coreHp = 100;
  radarLevel = 1;
  revealRadiusTile = 5;
  elapsedSec = 0;
  waveIndex = 0;
  waveTimerSec = 6;
  enemySpawnCooldownSec = 3;
  moteSpawnCooldownSec = 0.8;
  isRunOver = false;
  enemies = [];
  motes = [];
  breakerTriggered = false;
  structures.fill('empty');
  buildStarterTerrain();
  distanceField = computeDistanceField();
}

function updateEnemies(dtSec: number): void {
  for (let enemyIndex = enemies.length - 1; enemyIndex >= 0; enemyIndex -= 1) {
    const enemy = enemies[enemyIndex];

    if (enemy.isBreaker && terrainIsDebris[tileIndex(breakerTarget.x, breakerTarget.y)]) {
      const dxTile = breakerTarget.x - enemy.xTile;
      const dyTile = breakerTarget.y - enemy.yTile;
      const breakerDistance = Math.hypot(dxTile, dyTile);
      if (breakerDistance < 0.2) {
        terrainIsDebris[tileIndex(breakerTarget.x, breakerTarget.y)] = false;
        distanceField = computeDistanceField();
        enemies.splice(enemyIndex, 1);
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
      if (coreHp <= 0) {
        isRunOver = true;
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
      [xTile + 1, yTile],
      [xTile - 1, yTile],
      [xTile, yTile + 1],
      [xTile, yTile - 1]
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
  enemySpawnCooldownSec -= dtSec;
  if (enemySpawnCooldownSec <= 0) {
    enemySpawnCooldownSec = 0.35;

    for (let yTile = 0; yTile < gridHeightTile; yTile += 1) {
      for (let xTile = 0; xTile < gridWidthTile; xTile += 1) {
        if (structures[tileIndex(xTile, yTile)] !== 'turret') {
          continue;
        }

        let targetEnemy: Enemy | undefined;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const enemy of enemies) {
          const dxTile = enemy.xTile - xTile;
          const dyTile = enemy.yTile - yTile;
          const distance = Math.hypot(dxTile, dyTile);
          if (distance < 4.5 && distance < bestDistance) {
            bestDistance = distance;
            targetEnemy = enemy;
          }
        }

        if (!targetEnemy) {
          continue;
        }

        targetEnemy.hp -= 10;
      }
    }
  }

  for (let i = enemies.length - 1; i >= 0; i -= 1) {
    if (enemies[i].hp <= 0) {
      enemies.splice(i, 1);
      ore += 2;
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
    const mote = motes[i];
    mote.progress += dtSec * 0.4;
    if (mote.progress >= 1) {
      motes.splice(i, 1);
      ore += 1;
    }
  }
}

function update(dtSec: number): void {
  if (isRunOver) {
    resetRun();
    return;
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

function isTileVisible(xTile: number, yTile: number): boolean {
  const dxTile = xTile - coreTile.x;
  const dyTile = yTile - coreTile.y;
  return Math.hypot(dxTile, dyTile) <= revealRadiusTile;
}

function drawTileRect(xTile: number, yTile: number, fillStyle: string): void {
  ctx.fillStyle = fillStyle;
  ctx.fillRect(xTile * tileSizePx, yTile * tileSizePx, tileSizePx, tileSizePx);
}

function render(): void {
  ctx.fillStyle = '#07090f';
  ctx.fillRect(0, 0, nativeWidthPx, nativeHeightPx);

  for (let yTile = 0; yTile < gridHeightTile; yTile += 1) {
    for (let xTile = 0; xTile < gridWidthTile; xTile += 1) {
      const index = tileIndex(xTile, yTile);
      if (!isTileVisible(xTile, yTile)) {
        drawTileRect(xTile, yTile, '#010206');
        continue;
      }

      drawTileRect(xTile, yTile, '#101829');

      if (terrainIsDebris[index]) {
        drawTileRect(xTile, yTile, '#394154');
      }

      const structure = structures[index];
      if (structure === 'wall') {
        drawTileRect(xTile, yTile, '#4f6a88');
      } else if (structure === 'turret') {
        drawTileRect(xTile, yTile, '#27e0ff');
      } else if (structure === 'radar') {
        drawTileRect(xTile, yTile, '#8d68ff');
      }

      ctx.strokeStyle = '#1b2a45';
      ctx.strokeRect(xTile * tileSizePx + 0.5, yTile * tileSizePx + 0.5, tileSizePx, tileSizePx);
    }
  }

  drawTileRect(coreTile.x, coreTile.y, '#33ffbb');
  drawTileRect(depositTile.x, depositTile.y, '#f0a600');

  for (const mote of motes) {
    const xPx = depositTile.x * tileSizePx + tileSizePx * 0.5 + (coreTile.x - depositTile.x) * tileSizePx * mote.progress;
    const yPx = depositTile.y * tileSizePx + tileSizePx * 0.5 + (coreTile.y - depositTile.y) * tileSizePx * mote.progress;
    ctx.fillStyle = '#ffd677';
    ctx.fillRect(Math.round(xPx), Math.round(yPx), 1, 1);
  }

  for (const enemy of enemies) {
    const xPx = enemy.xTile * tileSizePx + tileSizePx * 0.5;
    const yPx = enemy.yTile * tileSizePx + tileSizePx * 0.5;
    ctx.fillStyle = enemy.isBreaker ? '#ff42d2' : '#ff5656';
    ctx.fillRect(Math.round(xPx) - 2, Math.round(yPx) - 2, 4, 4);
  }

  topStatsElement.textContent = `HP ${Math.max(0, Math.ceil(coreHp))} | Ore ${ore} | Wave ${waveIndex} | Radar ${radarLevel}`;
  rightStatsElement.textContent = `Meta ${metaCurrency} | Next wave ${waveTimerSec.toFixed(1)}s | Tool ${selectedTool}`;
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
