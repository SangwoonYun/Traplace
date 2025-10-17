// File: app/static/js/painter.js
/**
 * Painter logic for alliance objects (Flag, HQ).
 * Defines how each object type paints the grid and computes affected areas.
 */

import { cellPx } from './state.js';
import { world } from './dom.js';

/** Paint radii (in cell units) for each painter kind. */
export const KIND_PAINT_RADIUS = {
  flag: 3,
  hq: 7,
};

/** Set of kinds that generate paint areas. */
export const PAINTER_KINDS = new Set(['flag', 'hq']);

/**
 * Return all cells covered by a given kind centered at (centerCx, centerCy).
 * The paint area is a square region clipped to world bounds.
 * @param {string} kind
 * @param {number} centerCx
 * @param {number} centerCy
 * @returns {{x:number, y:number}[]}
 */
export function cellsForKindAt(kind, centerCx, centerCy) {
  const r = KIND_PAINT_RADIUS[kind] ?? 0;
  const cells = [];
  const c = cellPx();
  const maxX = Math.ceil(world.clientWidth / c);
  const maxY = Math.ceil(world.clientHeight / c);

  const minx = Math.max(0, centerCx - r);
  const maxx = Math.min(maxX - 1, centerCx + r);
  const miny = Math.max(0, centerCy - r);
  const maxy = Math.min(maxY - 1, centerCy + r);

  for (let y = miny; y <= maxy; y++) {
    for (let x = minx; x <= maxx; x++) {
      cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * Return the bounding box of the painted area for a given kind and center.
 * @param {string} kind
 * @param {number} centerCx
 * @param {number} centerCy
 * @returns {{minx:number, miny:number, maxx:number, maxy:number}}
 */
export function areaBoundingBox(kind, centerCx, centerCy) {
  const r = KIND_PAINT_RADIUS[kind] ?? 0;
  const c = cellPx();
  const maxX = Math.ceil(world.clientWidth / c);
  const maxY = Math.ceil(world.clientHeight / c);

  return {
    minx: Math.max(0, centerCx - r),
    miny: Math.max(0, centerCy - r),
    maxx: Math.min(maxX - 1, centerCx + r),
    maxy: Math.min(maxY - 1, centerCy + r),
  };
}
