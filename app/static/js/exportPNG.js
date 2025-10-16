// File: app/static/js/exportPNG.js
/**
 * Export the current world view to a PNG that matches the on-screen projection.
 *
 * Pipeline:
 *  1) Determine used cell bounds (from userPaint, painter union, and block coverage)
 *  2) Compute canvas bbox in projected screen space (matching CSS transform without zoom)
 *  3) Draw grid, red paint, blue paint + outlines, painter dashed areas, blocks + labels
 *  4) Return a PNG Blob
 */

import { state, cell } from './state.js';
import { world } from './dom.js';
import { PAINTER_KINDS, cellsForKindAt, areaBoundingBox } from './painter.js';
import { posToCell } from './transform.js';

/* ---------------------------------------------
 * Constants & CSS variable helper
 * ------------------------------------------- */

const k = Math.SQRT1_2; // √2/2

/**
 * Read a CSS variable from :root, with a fallback.
 * @param {string} name CSS var name (e.g., "--bg")
 * @param {string} fallback Fallback value if var is empty
 */
function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/* ---------------------------------------------
 * Painted / coverage sets & bounds
 * ------------------------------------------- */

/**
 * Compute the union of painter (blue) coverage in real-time.
 * Only counts blocks with kinds in PAINTER_KINDS.
 * @returns {Set<string>} keys are "x,y" in cell coordinates
 */
function computePaintedSet() {
  const set = new Set();
  for (const b of state.blocks) {
    if (!PAINTER_KINDS.has(b.kind)) continue;
    const { cx, cy } = posToCell(b.left, b.top);
    const centerCx = cx + Math.floor(b.size / 2);
    const centerCy = cy + Math.floor(b.size / 2);
    for (const c of cellsForKindAt(b.kind, centerCx, centerCy)) {
      set.add(`${c.x},${c.y}`);
    }
  }
  return set;
}

/**
 * Collect all cells covered by placed blocks (their footprint).
 * @returns {Set<string>}
 */
function cellsCoveredByBlocks() {
  const out = new Set();
  for (const b of state.blocks) {
    const { cx, cy } = posToCell(b.left, b.top);
    for (let y = cy; y < cy + b.size; y++) {
      for (let x = cx; x < cx + b.size; x++) {
        out.add(`${x},${y}`);
      }
    }
  }
  return out;
}

/**
 * Compute the bounding box of all used cells (red paint, painter union, block coverage).
 * Returns null if nothing is used.
 * @returns {{minx:number,miny:number,maxx:number,maxy:number,painted:Set<string>}|null}
 */
function usedCellsBBox() {
  const used = new Set();

  // Red paint (userPaint)
  for (const k of state.userPaint) used.add(k);

  // Blue painter union
  const painted = computePaintedSet();
  for (const k of painted) used.add(k);

  // Block footprint
  const cover = cellsCoveredByBlocks();
  for (const k of cover) used.add(k);

  if (!used.size) return null;

  let minx = Infinity,
    miny = Infinity,
    maxx = -Infinity,
    maxy = -Infinity;
  for (const key of used) {
    const [x, y] = key.split(',').map(Number);
    if (x < minx) minx = x;
    if (y < miny) miny = y;
    if (x > maxx) maxx = x;
    if (y > maxy) maxy = y;
  }
  return { minx, miny, maxx, maxy, painted };
}

/* ---------------------------------------------
 * Stroke helpers & block style
 * ------------------------------------------- */

/**
 * Stroke only the outer perimeter of a painted cell (blue region),
 * i.e., draw edges that have no neighbor in the set.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Set<string>} set painted set (x,y as "x,y")
 * @param {number} x cell x
 * @param {number} y cell y
 * @param {string} color stroke color
 * @param {number} [lineWidth=2]
 * @param {boolean} [dashed=false]
 */
function strokeCellPerimeter(ctx, set, x, y, color, lineWidth = 2, dashed = false) {
  const has = (xx, yy) => set.has(`${xx},${yy}`);
  const px = x * cell;
  const py = y * cell;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  if (dashed) ctx.setLineDash([6, 6]);

  if (!has(x, y - 1)) {
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + cell, py);
    ctx.stroke();
  }
  if (!has(x + 1, y)) {
    ctx.beginPath();
    ctx.moveTo(px + cell, py);
    ctx.lineTo(px + cell, py + cell);
    ctx.stroke();
  }
  if (!has(x, y + 1)) {
    ctx.beginPath();
    ctx.moveTo(px, py + cell);
    ctx.lineTo(px + cell, py + cell);
    ctx.stroke();
  }
  if (!has(x - 1, y)) {
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, py + cell);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Return block fill/stroke styles based on validity against the painted set.
 * @param {{left:number, top:number, size:number, kind:string}} b
 * @param {Set<string>} paintedSet
 * @returns {{fill:string, stroke:string}}
 */
function styleForBlock(b, paintedSet) {
  if (b.kind === 'resource') {
    return {
      fill: cssVar('--resource-bg', '#ffe5e5'),
      stroke: cssVar('--resource-border', '#d00000'),
    };
  }
  const { cx, cy } = posToCell(b.left, b.top);
  let invalid = false;
  for (let y = cy; y < cy + b.size && !invalid; y++) {
    for (let x = cx; x < cx + b.size; x++) {
      if (!paintedSet.has(`${x},${y}`)) {
        invalid = true;
        break;
      }
    }
  }
  if (invalid) {
    return {
      fill: cssVar('--warn-bg', '#ffe9e9'),
      stroke: cssVar('--warn-border', '#cc1e1e'),
    };
  }
  return {
    fill: cssVar('--ok-bg', '#fafafa'),
    stroke: cssVar('--ok-border', '#555'),
  };
}

/* ---------------------------------------------
 * World transform (match CSS without zoom)
 * ------------------------------------------- */
/*
CSS (for .rot):
  transform:
    translate(W*k, (W+H)*k)
    rotate(45deg)
    scale(-1)
Where rotate(45°) = [[ k, -k], [ k,  k]]
and scale(-1) = -I. So the linear part L = -R = [[-k, +k], [-k, -k]]
The translation T = (W*k, (W+H)*k).

Canvas setTransform(a,b,c,d,e,f) should use:
  a=-k, b=-k, c=+k, d=-k, e=W*k(+shift), f=(W+H)*k(+shift)
*/

/** @returns {{a:number,b:number,c:number,d:number}} */
function linearForWorld() {
  return { a: -k, b: -k, c: +k, d: -k };
}

/**
 * Raw projection (without additional shift) from world coords (X,Y) to canvas coords.
 * @param {number} W world width in px
 * @param {number} H world height in px
 * @param {number} X world x
 * @param {number} Y world y
 */
function projectRaw(W, H, X, Y) {
  const { a, b, c, d } = linearForWorld();
  const e = W * k;
  const f = (W + H) * k;
  return { x: a * X + c * Y + e, y: b * X + d * Y + f };
}

/**
 * Given a crop rectangle in un-rotated world coords, project the 4 corners,
 * compute the screen-space bbox, and the shift offsets to place minX/minY at (margin, margin).
 * @param {number} offX
 * @param {number} offY
 * @param {number} widthPx
 * @param {number} heightPx
 * @returns {{boxW:number,boxH:number,shiftX:number,shiftY:number,W:number,H:number}}
 */
function computeCanvasBoxAndShift(offX, offY, widthPx, heightPx) {
  const W = world.clientWidth; // px
  const H = world.clientHeight; // px

  // 4 corners (unrotated)
  const P = [
    [offX, offY],
    [offX + widthPx, offY],
    [offX, offY + heightPx],
    [offX + widthPx, offY + heightPx],
  ];

  // Project
  const proj = P.map(([x, y]) => projectRaw(W, H, x, y));

  // Bounding box
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of proj) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  // Small margin to avoid antialias clipping
  const margin = 1;

  const boxW = Math.ceil(maxX - minX) + margin * 2;
  const boxH = Math.ceil(maxY - minY) + margin * 2;

  // Final translation so (minX,minY) maps to (margin,margin)
  const shiftX = margin - minX;
  const shiftY = margin - minY;

  return { boxW, boxH, shiftX, shiftY, W, H };
}

/**
 * Project a point using the world linear transform with the computed shift applied.
 * Useful to render labels horizontally (resetting the canvas transform).
 */
function projectWithShift(W, H, shiftX, shiftY, X, Y) {
  const { a, b, c, d } = linearForWorld();
  const e = W * k + shiftX;
  const f = (W + H) * k + shiftY;
  return { x: a * X + c * Y + e, y: b * X + d * Y + f };
}

/* ---------------------------------------------
 * Main: PNG export
 * ------------------------------------------- */

/**
 * Render a PNG blob for the currently used area.
 * @returns {Promise<Blob>}
 */
export async function exportPNG() {
  const bbox = usedCellsBBox();
  if (!bbox) throw new Error('No used cells. Place objects or paint before exporting.');

  const { minx, miny, maxx, maxy, painted } = bbox;

  const gridColor = cssVar('--grid-bold', '#d0d0d0');
  const bgColor = cssVar('--bg', '#ffffff');
  const blueFill = cssVar('--paint-blue', 'rgba(66,133,244,0.25)');
  const blueEdge = cssVar('--paint-blue-border', 'rgba(66,133,244,0.9)');
  const redFill = cssVar('--paint-red', 'rgba(220,20,60,0.35)');

  // Crop region (unrotated)
  const offX = minx * cell;
  const offY = miny * cell;
  const widthCells = maxx - minx + 1;
  const heightCells = maxy - miny + 1;
  const widthPx = widthCells * cell;
  const heightPx = heightCells * cell;

  // Canvas bbox & shift
  const { boxW, boxH, shiftX, shiftY, W, H } = computeCanvasBoxAndShift(
    offX,
    offY,
    widthPx,
    heightPx,
  );

  // HiDPI
  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(boxW * dpr));
  canvas.height = Math.max(1, Math.floor(boxH * dpr));
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, boxW, boxH);

  // Apply world transform + shift (match CSS, excluding zoom)
  const { a, b, c, d } = linearForWorld();
  const e = W * k + shiftX;
  const f = (W + H) * k + shiftY;
  ctx.setTransform(a, b, c, d, e, f);

  /* 1) Grid (primary lines) */
  ctx.save();
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  for (let x = offX; x <= offX + widthPx + 0.1; x += cell) {
    ctx.beginPath();
    ctx.moveTo(x, offY);
    ctx.lineTo(x, offY + heightPx);
    ctx.stroke();
  }
  for (let y = offY; y <= offY + heightPx + 0.1; y += cell) {
    ctx.beginPath();
    ctx.moveTo(offX, y);
    ctx.lineTo(offX + widthPx, y);
    ctx.stroke();
  }
  ctx.restore();

  /* 2) Red paint */
  ctx.save();
  ctx.fillStyle = redFill;
  for (const key of state.userPaint) {
    const [x, y] = key.split(',').map(Number);
    if (x < minx || x > maxx || y < miny || y > maxy) continue;
    ctx.fillRect(x * cell, y * cell, cell, cell);
  }
  ctx.restore();

  /* 3) Blue paint + solid outlines */
  ctx.save();
  ctx.fillStyle = blueFill;
  for (const key of painted) {
    const [x, y] = key.split(',').map(Number);
    if (x < minx || x > maxx || y < miny || y > maxy) continue;
    ctx.fillRect(x * cell, y * cell, cell, cell);
  }
  for (const key of painted) {
    const [x, y] = key.split(',').map(Number);
    if (x < minx || x > maxx || y < miny || y > maxy) continue;
    strokeCellPerimeter(ctx, painted, x, y, blueEdge, 2, false);
  }
  ctx.restore();

  /* 4) Painter dashed areas (HQ/flag) */
  ctx.save();
  ctx.strokeStyle = blueEdge;
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 2;
  for (const b of state.blocks) {
    if (!PAINTER_KINDS.has(b.kind)) continue;
    const { cx, cy } = posToCell(b.left, b.top);
    const centerCx = cx + Math.floor(b.size / 2);
    const centerCy = cy + Math.floor(b.size / 2);
    const { minx: ax, miny: ay, maxx: bx, maxy: by } = areaBoundingBox(b.kind, centerCx, centerCy);
    const x = ax * cell,
      y = ay * cell,
      w = (bx - ax + 1) * cell,
      h = (by - ay + 1) * cell;

    // Skip if completely outside crop
    const inX = !(x + w < offX || x > offX + widthPx);
    const inY = !(y + h < offY || y > offY + heightPx);
    if (inX && inY) {
      ctx.strokeRect(x, y, w, h);
    }
  }
  ctx.restore();

  /* 5) Blocks + horizontal labels */
  for (const b of state.blocks) {
    const st = styleForBlock(b, painted);
    const { cx, cy } = posToCell(b.left, b.top);
    const x = cx * cell,
      y = cy * cell,
      w = b.size * cell,
      h = b.size * cell;

    // Skip if outside crop
    if (x > offX + widthPx || x + w < offX || y > offY + heightPx || y + h < offY) continue;

    // Block box
    ctx.save();
    ctx.fillStyle = st.fill;
    ctx.strokeStyle = st.stroke;
    ctx.lineWidth = 1.5;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();

    // Label text
    const labelEl = b.el?.querySelector('.label');
    let text =
      b.kind === 'flag'
        ? 'Alliance Flag'
        : b.kind === 'hq'
          ? 'Plains HQ'
          : b.kind === 'city'
            ? 'City'
            : b.kind === 'resource'
              ? 'Alliance Resource'
              : b.kind === 'trap'
                ? 'Hunting Trap'
                : `${b.size}×${b.size}`;
    const t2 = (labelEl?.textContent || '').trim();
    if (b.kind === 'city' && t2) text = t2;

    // Horizontal label: project center, reset transform, then draw
    const Xc = x + w / 2;
    const Yc = y + h / 2;
    const p = projectWithShift(W, H, shiftX, shiftY, Xc, Yc);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = 'bold 14px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#333';
    ctx.fillText(text, p.x, p.y);
    ctx.restore();
  }

  // Return PNG blob
  return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
