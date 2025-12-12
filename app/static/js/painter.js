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

/** Red zone paint radii (in cell units from block edge) for castle/fortress/sanctuary. */
export const KIND_REDZONE_RADIUS = {
  castle: 8,    // 8 cells from castle edge
  fortress: 27, // 27 cells from fortress edge
  sanctuary: 27, // 27 cells from sanctuary edge
};

/** Set of kinds that generate red zone areas. */
export const REDZONE_KINDS = new Set(['castle', 'fortress', 'sanctuary']);

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

/**
 * Return all cells covered by red zone for a given kind centered at (centerCx, centerCy).
 * Red zone extends from the block's edge, not from its center.
 * @param {string} kind - Block kind (castle/fortress/sanctuary)
 * @param {number} centerCx - Block center X coordinate
 * @param {number} centerCy - Block center Y coordinate
 * @param {number} size - Block size in cells
 * @returns {{x:number, y:number}[]}
 */
export function redZoneCellsForKindAt(kind, centerCx, centerCy, size) {
  const edgeRange = KIND_REDZONE_RADIUS[kind] ?? 0;
  const cells = [];
  const c = cellPx();
  const maxX = Math.ceil(world.clientWidth / c);
  const maxY = Math.ceil(world.clientHeight / c);

  // Calculate block boundaries
  const halfSize = Math.floor(size / 2);
  const blockMinX = centerCx - halfSize;
  const blockMaxX = centerCx + halfSize + (size % 2 === 0 ? -1 : 0);
  const blockMinY = centerCy - halfSize;
  const blockMaxY = centerCy + halfSize + (size % 2 === 0 ? -1 : 0);

  // Red zone extends edgeRange cells from block edge
  const minx = Math.max(0, blockMinX - edgeRange);
  const maxx = Math.min(maxX - 1, blockMaxX + edgeRange);
  const miny = Math.max(0, blockMinY - edgeRange);
  const maxy = Math.min(maxY - 1, blockMaxY + edgeRange);

  for (let y = miny; y <= maxy; y++) {
    for (let x = minx; x <= maxx; x++) {
      // Exclude cells that are inside the block itself
      if (x >= blockMinX && x <= blockMaxX && y >= blockMinY && y <= blockMaxY) {
        continue;
      }
      cells.push({ x, y });
    }
  }
  return cells;
}
