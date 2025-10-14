import { cell } from './state.js';
import { world } from './dom.js';

export const KIND_PAINT_RADIUS = { flag: 3, hq: 7 };
export const PAINTER_KINDS = new Set(['flag', 'hq']);

export function cellsForKindAt(kind, centerCx, centerCy){
  const r = KIND_PAINT_RADIUS[kind] ?? 0;
  const cells = [];
  const maxX = Math.ceil(world.clientWidth / cell);
  const maxY = Math.ceil(world.clientHeight / cell);
  const minx = Math.max(0, centerCx - r);
  const maxx = Math.min(maxX - 1, centerCx + r);
  const miny = Math.max(0, centerCy - r);
  const maxy = Math.min(maxY - 1, centerCy + r);
  for (let y=miny; y<=maxy; y++){
    for (let x=minx; x<=maxx; x++){
      cells.push({x,y});
    }
  }
  return cells;
}

export function areaBoundingBox(kind, centerCx, centerCy){
  const r = KIND_PAINT_RADIUS[kind] ?? 0;
  const maxX = Math.ceil(world.clientWidth / cell);
  const maxY = Math.ceil(world.clientHeight / cell);
  return {
    minx: Math.max(0, centerCx - r),
    miny: Math.max(0, centerCy - r),
    maxx: Math.min(maxX - 1, centerCx + r),
    maxy: Math.min(maxY - 1, centerCy + r),
  };
}

