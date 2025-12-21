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

import { state, cellPx } from './state.js';
import { world } from './dom.js';
import { PAINTER_KINDS, cellsForKindAt, areaBoundingBox } from './painter.js';
import { posToCell } from './transform.js';
import { t } from './i18n.js';

/* ================= Common utils ================= */

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

/** Resolve CSS color string to [r,g,b,a] using a tiny canvas. */
function cssColorToRgbaTuple(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b, a]; // a is 0..255
}

/** Trim outer edges that are exactly the background color; returns a new canvas if trimmed. */
function trimCanvasByBackground(inCanvas, bgColor) {
  const w = inCanvas.width;
  const h = inCanvas.height;
  if (!w || !h) return inCanvas;

  const ctx = inCanvas.getContext('2d');
  const data = ctx.getImageData(0, 0, w, h).data;
  const [br, bg, bb, ba] = cssColorToRgbaTuple(bgColor);

  // Helper: test pixel at (x, y) equals background
  const isBg = (x, y) => {
    const i = (y * w + x) * 4;
    return data[i + 0] === br && data[i + 1] === bg && data[i + 2] === bb && data[i + 3] === ba;
  };

  // Find bounds (minX, minY, maxX, maxY) where pixel != background
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;

  // Scan rows/cols; early breaks keep it linear-ish in practice
  for (let y = 0; y < h; y++) {
    let rowHasInk = false;
    for (let x = 0; x < w; x++) {
      if (!isBg(x, y)) {
        rowHasInk = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    if (rowHasInk) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  // If nothing drawn (shouldn't happen), return original
  if (maxX < 0 || maxY < 0) return inCanvas;

  // Add a tiny 1px safety padding
  minX = Math.max(0, minX - 1);
  minY = Math.max(0, minY - 1);
  maxX = Math.min(w - 1, maxX + 1);
  maxY = Math.min(h - 1, maxY + 1);

  const outW = maxX - minX + 1;
  const outH = maxY - minY + 1;

  // If already tight, return original
  if (outW === w && outH === h) return inCanvas;

  const out = document.createElement('canvas');
  out.width = outW;
  out.height = outH;
  const octx = out.getContext('2d');
  octx.drawImage(inCanvas, minX, minY, outW, outH, 0, 0, outW, outH);
  return out;
}

/** Compute blue painted union (flag/HQ) in real-time, excluding immutable blocks. */
function computePaintedSet() {
  const set = new Set();
  for (const b of state.blocks) {
    // Skip immutable blocks
    if (b.immutable) continue;
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
 * Collect all cells covered by placed blocks (their footprint), excluding immutable blocks.
 * @returns {Set<string>}
 */
function cellsCoveredByBlocks() {
  const out = new Set();
  for (const b of state.blocks) {
    // Skip immutable blocks
    if (b.immutable) continue;
    const { cx, cy } = posToCell(b.left, b.top);
    const width = b.kind === 'custom' ? b.width || b.size : b.size;
    const height = b.kind === 'custom' ? b.height || b.size : b.size;
    for (let y = cy; y < cy + height; y++) {
      for (let x = cx; x < cx + width; x++) {
        out.add(`${x},${y}`);
      }
    }
  }
  return out;
}

/**
 * Compute the bounding box of all used cells (painter union, block coverage).
 * EXCLUDES red paint (userPaint) and immutable blocks.
 * Returns null if nothing is used.
 * @returns {{minx:number,miny:number,maxx:number,maxy:number,painted:Set<string>}|null}
 */
function usedCellsBBox() {
  const used = new Set();

  // SKIP red paint - don't include state.userPaint
  const painted = computePaintedSet(); // blue (from non-immutable painters)
  for (const k of painted) used.add(k);
  const cover = cellsCoveredByBlocks(); // blocks (excluding immutable)
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
  const c = cellPx();
  const px = x * c,
    py = y * c;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  if (dashed) ctx.setLineDash([6, 6]);

  if (!has(x, y - 1)) {
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + c, py);
    ctx.stroke();
  }
  if (!has(x + 1, y)) {
    ctx.beginPath();
    ctx.moveTo(px + c, py);
    ctx.lineTo(px + c, py + c);
    ctx.stroke();
  }
  if (!has(x, y + 1)) {
    ctx.beginPath();
    ctx.moveTo(px, py + c);
    ctx.lineTo(px + c, py + c);
    ctx.stroke();
  }
  if (!has(x - 1, y)) {
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, py + c);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Return block fill/stroke styles based on validity against the painted set.
 * @param {{left:number, top:number, size:number, kind:string, el?:HTMLElement}} b
 * @param {Set<string>} paintedSet
 * @returns {{fill:string, stroke:string}}
 */
function styleForBlock(b, paintedSet) {
  // If block element exists, read actual computed styles
  if (b.el) {
    const computed = getComputedStyle(b.el);
    return {
      fill: computed.backgroundColor || cssVar('--ok-bg', '#fafafa'),
      stroke: computed.borderColor || cssVar('--ok-border', '#555'),
    };
  }

  // Fallback: use CSS variables based on kind and validity
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

/* ===== Same transform as screen (excluding zoom) =====
 * CSS: translate(W·k, (W+H)·k) rotate(45deg) scale(-1)
 * Linear part L = -R = [[-k, +k], [-k, -k]]
 */
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
  const W = world.clientWidth;
  const H = world.clientHeight;

  const P = [
    [offX, offY],
    [offX + widthPx, offY],
    [offX, offY + heightPx],
    [offX + widthPx, offY + heightPx],
  ];

  const proj = P.map(([x, y]) => projectRaw(W, H, x, y));

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

  // Slight margin to avoid AA clipping
  const margin = 1;

  const boxW = Math.ceil(maxX - minX) + margin * 2;
  const boxH = Math.ceil(maxY - minY) + margin * 2;

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

export async function exportPNG() {
  const bbox = usedCellsBBox();
  if (!bbox) throw new Error('No used grid. Place objects or paint before exporting.');

  const { minx, miny, maxx, maxy, painted } = bbox;
  const cellSize = cellPx();

  const gridColor = cssVar('--grid-bold', '#d0d0d0');
  const bgColor = cssVar('--bg', '#ffffff');
  const blueFill = cssVar('--paint-blue', 'rgba(66,133,244,0.25)');
  const blueEdge = cssVar('--paint-blue-border', 'rgba(66,133,244,0.9)');

  // Crop region in unrotated space
  const offX = minx * cellSize;
  const offY = miny * cellSize;
  const widthCells = maxx - minx + 1;
  const heightCells = maxy - miny + 1;
  const widthPx = widthCells * cellSize;
  const heightPx = heightCells * cellSize;

  // Canvas box & shift
  const { boxW, boxH, shiftX, shiftY, W, H } = computeCanvasBoxAndShift(
    offX,
    offY,
    widthPx,
    heightPx,
  );

  const dpr = window.devicePixelRatio || 1;

  // Calculate canvas dimensions with DPR
  const canvasWidth = Math.max(1, Math.floor(boxW * dpr));
  const canvasHeight = Math.max(1, Math.floor(boxH * dpr));

  // Limit canvas size to prevent memory errors
  // Most browsers have a max canvas area of ~16,777,216 pixels (4096x4096)
  // We'll use a conservative limit of 8,000,000 pixels
  const MAX_CANVAS_AREA = 8000000;
  const MAX_DIMENSION = 4000;

  let finalWidth = canvasWidth;
  let finalHeight = canvasHeight;
  let scaleFactor = dpr;

  // Check if canvas exceeds size limits
  if (finalWidth > MAX_DIMENSION || finalHeight > MAX_DIMENSION || finalWidth * finalHeight > MAX_CANVAS_AREA) {
    // Calculate the scale factor needed to fit within limits
    const dimensionScale = Math.min(MAX_DIMENSION / finalWidth, MAX_DIMENSION / finalHeight);
    const areaScale = Math.sqrt(MAX_CANVAS_AREA / (finalWidth * finalHeight));
    const limitScale = Math.min(dimensionScale, areaScale);

    finalWidth = Math.floor(finalWidth * limitScale);
    finalHeight = Math.floor(finalHeight * limitScale);
    scaleFactor = dpr * limitScale;

    console.warn(`Canvas size reduced from ${canvasWidth}x${canvasHeight} to ${finalWidth}x${finalHeight} to prevent memory errors`);
  }

  // Draw on a work canvas first (we may trim it later)
  const work = document.createElement('canvas');
  work.width = finalWidth;
  work.height = finalHeight;
  const ctx = work.getContext('2d');
  ctx.scale(scaleFactor, scaleFactor);

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, boxW, boxH);

  // Apply same transform as screen + shift
  const { a, b, c, d } = linearForWorld();
  const e = W * k + shiftX;
  const f = (W + H) * k + shiftY;
  ctx.setTransform(a, b, c, d, e, f);

  /* 1) Grid major lines */
  ctx.save();
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  for (let x = offX; x <= offX + widthPx + 0.1; x += cellSize) {
    ctx.beginPath();
    ctx.moveTo(x, offY);
    ctx.lineTo(x, offY + heightPx);
    ctx.stroke();
  }
  for (let y = offY; y <= offY + heightPx + 0.1; y += cellSize) {
    ctx.beginPath();
    ctx.moveTo(offX, y);
    ctx.lineTo(offX + widthPx, y);
    ctx.stroke();
  }
  ctx.restore();

  /* 2) Red paint - SKIP (exclude from export) */
  // Red paint is not exported

  /* 3) Blue paint + perimeters */
  ctx.save();
  ctx.fillStyle = blueFill;
  for (const key of painted) {
    const [x, y] = key.split(',').map(Number);
    if (x < minx || x > maxx || y < miny || y > maxy) continue;
    ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
  }
  for (const key of painted) {
    const [x, y] = key.split(',').map(Number);
    if (x < minx || x > maxx || y < miny || y > maxy) continue;
    strokeCellPerimeter(ctx, painted, x, y, blueEdge, 2, false);
  }
  ctx.restore();

  /* 4) Painter area dashed boxes (flag/HQ) - excluding immutable blocks */
  ctx.save();
  ctx.strokeStyle = blueEdge;
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 2;
  for (const b of state.blocks) {
    // Skip immutable blocks
    if (b.immutable) continue;
    if (!PAINTER_KINDS.has(b.kind)) continue;
    const { cx, cy } = posToCell(b.left, b.top);
    const centerCx = cx + Math.floor(b.size / 2);
    const centerCy = cy + Math.floor(b.size / 2);
    const { minx: ax, miny: ay, maxx: bx, maxy: by } = areaBoundingBox(b.kind, centerCx, centerCy);
    const x = ax * cellSize,
      y = ay * cellSize,
      w = (bx - ax + 1) * cellSize,
      h = (by - ay + 1) * cellSize;
    const inX = !(x + w < offX || x > offX + widthPx);
    const inY = !(y + h < offY || y > offY + heightPx);
    if (inX && inY) ctx.strokeRect(x, y, w, h);
  }
  ctx.restore();

  /* 5) Blocks + labels (labels localized via i18n) - excluding immutable blocks */
  for (const b of state.blocks) {
    // Skip immutable blocks
    if (b.immutable) continue;

    const st = styleForBlock(b, painted);
    const { cx, cy } = posToCell(b.left, b.top);
    const width = b.kind === 'custom' ? b.width || b.size : b.size;
    const height = b.kind === 'custom' ? b.height || b.size : b.size;
    const x = cx * cellSize,
      y = cy * cellSize,
      w = width * cellSize,
      h = height * cellSize;

    // Skip outside crop
    if (x > offX + widthPx || x + w < offX || y > offY + heightPx || y + h < offY) continue;

    // Box
    ctx.save();
    ctx.fillStyle = st.fill;
    ctx.strokeStyle = st.stroke;
    ctx.lineWidth = 1.5;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();

    // Label text — use i18n defaults; preserve city/custom/turret edits
    const labelEl = b.el?.querySelector('.label');
    const userText = (labelEl?.textContent || '').trim();

    let text;

    // For turret and fortress blocks, use i18n with Roman numeral from label
    if ((b.kind === 'turret' || b.kind === 'fortress') && userText) {
      text = t(`palette.${b.kind}`, userText);
    }
    // For city and custom blocks, preserve user edits
    else if ((b.kind === 'city' || b.kind === 'custom') && userText) {
      text = userText;
    }
    // Otherwise use i18n defaults
    else {
      text =
        b.kind === 'flag'
          ? t('palette.flag')
          : b.kind === 'hq'
            ? t('palette.hq')
            : b.kind === 'city'
              ? t('palette.city')
              : b.kind === 'resource'
                ? t('palette.resource')
                : b.kind === 'trap'
                  ? t('palette.trap')
                  : b.kind === 'castle'
                    ? t('palette.castle')
                    : b.kind === 'turret'
                      ? t('palette.turret', userText)
                      : b.kind === 'fortress'
                        ? t('palette.fortress', userText)
                        : b.kind === 'custom'
                          ? t('palette.custom')
                          : `${b.size}×${b.size}`;
    }

    // Label is drawn horizontally in projected coordinates
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

  // Tight-trim: remove right/bottom (and any) extra background margins
  const trimmed = trimCanvasByBackground(work, bgColor);

  // Return PNG Blob
  return await new Promise((resolve) => trimmed.toBlob(resolve, 'image/png'));
}
