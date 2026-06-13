import { hashString } from '../core/rng';

export type TowerShape = 'diamond' | 'circle' | 'hexagon' | 'triangle' | 'square' | 'chevron';

export interface TowerStyle {
  color: string;
  shape: TowerShape;
}

const COLORS = ['#ffcc00', '#00ddcc', '#ff55aa', '#88ff44', '#6699ff', '#ff8844'];
const SHAPES: TowerShape[] = ['diamond', 'circle', 'hexagon', 'triangle', 'square', 'chevron'];

export function towerStyleForOutput(outputModuleId: string): TowerStyle {
  const hash = hashString(outputModuleId);
  return {
    color: COLORS[hash % COLORS.length],
    shape: SHAPES[Math.floor(hash / COLORS.length) % SHAPES.length],
  };
}

export function traceTowerShape(ctx: CanvasRenderingContext2D, shape: TowerShape, radius: number): void {
  ctx.beginPath();
  if (shape === 'circle') {
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    return;
  }
  const sides = shape === 'triangle' ? 3 : shape === 'hexagon' ? 6 : 4;
  const rotation = shape === 'diamond' ? Math.PI / 4 : shape === 'triangle' ? -Math.PI / 2 : Math.PI / 4;
  if (shape === 'chevron') {
    ctx.moveTo(-radius, -radius * 0.6);
    ctx.lineTo(0, 0);
    ctx.lineTo(-radius, radius * 0.6);
    ctx.lineTo(-radius * 0.45, radius);
    ctx.lineTo(radius, 0);
    ctx.lineTo(-radius * 0.45, -radius);
    ctx.closePath();
    return;
  }
  for (let i = 0; i < sides; i++) {
    const a = rotation + i * Math.PI * 2 / sides;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}
