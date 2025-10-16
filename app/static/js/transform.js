// File: app/static/js/transform.js
/**
 * Coordinate transforms and grid snapping utilities.
 * - Convert client (viewport) coordinates into the rotated world's local space
 * - Snap arbitrary pixel positions to the grid
 * - Convert positions/points to cell coordinates
 * - Common helpers: keyOf, clamp
 */

import { cell } from './state.js';
import { world, rot } from './dom.js';

/* ---------------------------------------------
 * Matrix / coordinate transforms
 * ------------------------------------------- */
/**
 * Map a client-space point (e.g., from mouse/touch) into the `.rot` local space,
 * accounting for the world's DOM offset and the CSS transform on `.rot`.
 * @param {number} clientX
 * @param {number} clientY
 * @returns {{x:number, y:number}}
 */
export function clientToLocalRot(clientX, clientY) {
  const worldRect = world.getBoundingClientRect();
  const style = getComputedStyle(rot);
  const m = new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform);

  // T maps `.rot` local -> client; we need T^-1
  const T = new DOMMatrix().translateSelf(worldRect.left, worldRect.top).multiply(m);
  const inv = T.inverse();

  const p = new DOMPoint(clientX, clientY).matrixTransform(inv);
  return { x: p.x, y: p.y };
}

/* ---------------------------------------------
 * Grid snapping
 * ------------------------------------------- */
/**
 * Snap a local-space top-left position to the nearest cell, clamped so that a
 * square of `size` cells remains fully inside the world.
 * @param {number} left  local-space x (px)
 * @param {number} top   local-space y (px)
 * @param {number} size  block size in cells (width = height = size*cell)
 * @returns {{left:number, top:number}}
 */
export function snapLocal(left, top, size) {
  let gx = Math.round(left / cell) * cell;
  let gy = Math.round(top / cell) * cell;

  const maxLeft = world.clientWidth - size * cell;
  const maxTop = world.clientHeight - size * cell;

  gx = Math.max(0, Math.min(gx, maxLeft));
  gy = Math.max(0, Math.min(gy, maxTop));
  return { left: gx, top: gy };
}

/* ---------------------------------------------
 * Pixel ↔︎ cell helpers
 * ------------------------------------------- */
/**
 * Convert a snapped pixel position to nearest cell coordinates (center rounding).
 * @param {number} left
 * @param {number} top
 * @returns {{cx:number, cy:number}}
 */
export function posToCell(left, top) {
  return { cx: Math.round(left / cell), cy: Math.round(top / cell) };
}

/**
 * Convert an arbitrary pixel point to a clamped cell coordinate within world bounds.
 * @param {number} px
 * @param {number} py
 * @returns {{cx:number, cy:number}}
 */
export function pointToCell(px, py) {
  let cx = Math.floor(px / cell);
  let cy = Math.floor(py / cell);

  const maxCx = Math.ceil(world.clientWidth / cell) - 1;
  const maxCy = Math.ceil(world.clientHeight / cell) - 1;

  cx = Math.max(0, Math.min(cx, maxCx));
  cy = Math.max(0, Math.min(cy, maxCy));
  return { cx, cy };
}

/* ---------------------------------------------
 * Small helpers
 * ------------------------------------------- */
/** Create a stable key for cell coordinates. */
export const keyOf = (x, y) => `${x},${y}`;

/** Clamp a value into [a, b]. */
export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}
