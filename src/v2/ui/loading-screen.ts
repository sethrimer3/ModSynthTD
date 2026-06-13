const SPRITESHEET_PATH = 'ASSETS/ANIMATIONS/computerBackground/spritesheet.png';
const SPRITESHEET_DATA_PATH = 'ASSETS/ANIMATIONS/computerBackground/spritesheet.json';
const FRAME_DURATION_MS = 1000 / 30;
const LAST_FRAME_HOLD_MS = 3000;
const MINIMUM_DISPLAY_MS = 4000;

interface AtlasFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AtlasData {
  frames: Record<string, { frame: AtlasFrame }>;
}

export interface LoadingScreen {
  readonly element: HTMLElement;
  fadeOut(): Promise<void>;
}

function delay(durationMs: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, durationMs));
}

export async function createLoadingScreen(): Promise<LoadingScreen> {
  const createdAtMs = performance.now();
  const overlay = document.createElement('div');
  overlay.className = 'loading-screen';

  const canvas = document.createElement('canvas');
  canvas.className = 'loading-animation';
  canvas.width = 720;
  canvas.height = 1280;
  canvas.setAttribute('aria-label', 'Loading ModSynth TD');
  overlay.appendChild(canvas);

  const context = canvas.getContext('2d');
  const spritesheet = new Image();
  let frames: AtlasFrame[] = [];
  let animationFrameId = 0;
  let animationStartMs = 0;

  const drawFrame = (frameIndex: number): void => {
    const frame = frames[frameIndex];
    if (!context || !frame) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(spritesheet, frame.x, frame.y, frame.w, frame.h, 0, 0, canvas.width, canvas.height);
  };

  const animate = (nowMs: number): void => {
    const cycleAnimationMs = frames.length * FRAME_DURATION_MS;
    const cycleDurationMs = cycleAnimationMs + LAST_FRAME_HOLD_MS;
    const cycleElapsedMs = (nowMs - animationStartMs) % cycleDurationMs;
    const frameIndex = cycleElapsedMs >= cycleAnimationMs
      ? frames.length - 1
      : Math.min(frames.length - 1, Math.floor(cycleElapsedMs / FRAME_DURATION_MS));
    drawFrame(frameIndex);
    animationFrameId = requestAnimationFrame(animate);
  };

  const spritesheetLoaded = new Promise<void>((resolve, reject) => {
    spritesheet.addEventListener('load', () => resolve(), { once: true });
    spritesheet.addEventListener('error', () => reject(new Error('Failed to load loading-screen spritesheet')), { once: true });
  });
  spritesheet.src = SPRITESHEET_PATH;

  Promise.all([
    spritesheetLoaded,
    fetch(SPRITESHEET_DATA_PATH).then(async response => {
      if (!response.ok) throw new Error(`Failed to load loading-screen atlas data: ${response.status}`);
      return response.json() as Promise<AtlasData>;
    }),
  ]).then(([, atlas]) => {
    frames = Object.entries(atlas.frames)
      .sort(([nameA], [nameB]) => nameA.localeCompare(nameB))
      .map(([, entry]) => entry.frame);
    const firstFrame = frames[0];
    if (!firstFrame) throw new Error('Loading-screen atlas contains no frames');
    canvas.width = firstFrame.w;
    canvas.height = firstFrame.h;
    animationStartMs = performance.now();
    animationFrameId = requestAnimationFrame(animate);
  }).catch(() => {
    canvas.classList.add('loading-animation--unavailable');
  });

  return {
    element: overlay,
    async fadeOut(): Promise<void> {
      const remainingDisplayMs = Math.max(0, MINIMUM_DISPLAY_MS - (performance.now() - createdAtMs));
      await delay(remainingDisplayMs);

      return new Promise(resolve => {
        let resolved = false;
        const finish = (): void => {
          if (resolved) return;
          resolved = true;
          cancelAnimationFrame(animationFrameId);
          overlay.remove();
          resolve();
        };

        overlay.classList.add('loading-screen--fade-out');
        overlay.addEventListener('transitionend', finish, { once: true });
        setTimeout(finish, 1000);
      });
    },
  };
}
