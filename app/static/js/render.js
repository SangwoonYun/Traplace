// File: app/static/js/render.js
/**
 * Rendering and viewport utilities:
 * - World sizing & centering
 * - Blue paint computation (from painter kinds)
 * - Red tile rendering (user paint)
 * - Preview & outlines
 * - Badge updates
 */

import { cellPx, state, BASE_CELLS_X, BASE_CELLS_Y } from './state.js';
import {
  viewport,
  world,
  rot,
  tilesLayer,
  userLayer,
  outlinesLayer,
  outlinesPreviewLayer,
  previewLayer,
  badgeCoord,
  badgeZoom,
} from './dom.js';
import { PAINTER_KINDS, cellsForKindAt, areaBoundingBox } from './painter.js';
import { posToCell, keyOf, clamp } from './transform.js';

/* ---------------------------------------------
 * World sizing / centering
 * ------------------------------------------- */
/**
 * Set world size in cell units and sync CSS variables used by transforms.
 * @param {number} cols
 * @param {number} rows
 */
export function setWorldSizeCells(cols, rows) {
  const c = cellPx();
  const pxW = cols * c;
  const pxH = rows * c;

  world.style.width = `${pxW}px`;
  world.style.height = `${pxH}px`;

  // Update CSS variables consumed by the rotated/translated layer (.rot)
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--world-w', `${pxW}px`);
  rootStyle.setProperty('--world-h', `${pxH}px`);

  // (Keep any layer resize logic here if needed)
}

/**
 * Scroll the viewport so that a given cell (cx, cy) is centered.
 * @param {number} cx
 * @param {number} cy
 */
export function centerToCell(cx, cy) {
  const m = new DOMMatrixReadOnly(getComputedStyle(rot).transform);
  const c = cellPx();
  const p = new DOMPoint(cx * c, cy * c).matrixTransform(m);

  const maxLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
  const maxTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
  const targetLeft = clamp(p.x - viewport.clientWidth / 2, 0, maxLeft);
  const targetTop = clamp(p.y - viewport.clientHeight / 2, 0, maxTop);

  viewport.scrollLeft = targetLeft;
  viewport.scrollTop = targetTop;
}

/** Center the view to the geometric center of the world. */
export function centerToWorldCenter() {
  const c = cellPx();
  const cols = Math.round(world.clientWidth / c);
  const rows = Math.round(world.clientHeight / c);

  // Center cell (0-indexed). Example: 1200×1200 → 599,599
  const cx = Math.floor(cols / 2) - 1;
  const cy = Math.floor(rows / 2) - 1;

  centerToCell(cx, cy);
}

/* ---------------------------------------------
 * Core painters
 * ------------------------------------------- */
/**
 * Render a set of cells onto a layer as blue tiles with perimeter borders.
 * @param {HTMLElement} layer
 * @param {{x:number,y:number}[]} cellList
 * @param {{dashed?: boolean}} [opts]
 */
export function renderCells(layer, cellList, opts) {
  layer.innerHTML = '';

  const cpx = cellPx();
  const set = new Set(cellList.map((c) => keyOf(c.x, c.y)));
  const style = getComputedStyle(document.documentElement);
  const col = style.getPropertyValue('--paint-blue-border').trim() || 'rgba(66,133,244,0.9)';
  const thickness = '2px';
  const dashed = opts?.dashed ? 'dashed' : 'solid';

  for (const c of cellList) {
    const t = document.createElement('div');
    t.className = 'tile';
    t.style.left = `${c.x * cpx}px`;
    t.style.top = `${c.y * cpx}px`;
    t.style.width = `${cpx}px`;
    t.style.height = `${cpx}px`;

    const topMissing = !set.has(keyOf(c.x, c.y - 1));
    const rightMissing = !set.has(keyOf(c.x + 1, c.y));
    const bottomMissing = !set.has(keyOf(c.x, c.y + 1));
    const leftMissing = !set.has(keyOf(c.x - 1, c.y));

    t.style.borderTop = topMissing ? `${thickness} ${dashed} ${col}` : '0';
    t.style.borderRight = rightMissing ? `${thickness} ${dashed} ${col}` : '0';
    t.style.borderBottom = bottomMissing ? `${thickness} ${dashed} ${col}` : '0';
    t.style.borderLeft = leftMissing ? `${thickness} ${dashed} ${col}` : '0';

    layer.appendChild(t);
  }
}

/** Render user-painted red tiles. */
export function renderUserTiles() {
  userLayer.innerHTML = '';
  for (const k of state.userPaint) {
    const [x, y] = k.split(',').map(Number);
    const d = document.createElement('div');
    d.className = 'tile-red';
    const cpx = cellPx();
    d.style.left = `${x * cpx}px`;
    d.style.top = `${y * cpx}px`;
    d.style.width = `${cpx}px`;
    d.style.height = `${cpx}px`;
    userLayer.appendChild(d);
  }
}

/** Render dashed bounding boxes for painter areas (HQ/Flag). */
export function renderOutlines() {
  outlinesLayer.innerHTML = '';
  for (const b of state.blocks) {
    if (!PAINTER_KINDS.has(b.kind)) continue;

    const { cx, cy } = posToCell(b.left, b.top);
    const centerCx = cx + Math.floor(b.size / 2);
    const centerCy = cy + Math.floor(b.size / 2);
    const { minx, miny, maxx, maxy } = areaBoundingBox(b.kind, centerCx, centerCy);

    const el = document.createElement('div');
    el.className = 'area-outline';
    const cpx = cellPx();
    el.style.left = `${minx * cpx}px`;
    el.style.top = `${miny * cpx}px`;
    el.style.width = `${(maxx - minx + 1) * cpx}px`;
    el.style.height = `${(maxy - miny + 1) * cpx}px`;
    outlinesLayer.appendChild(el);
  }
}

/**
 * Recompute blue painted set from painter kinds and render tiles + outlines.
 * Block validity check is performed elsewhere (blocks.validateAllObjects).
 */
export function recomputePaint() {
  state.paintedSet = new Set();

  for (const b of state.blocks) {
    if (!PAINTER_KINDS.has(b.kind)) continue;

    const { cx, cy } = posToCell(b.left, b.top);
    const centerCx = cx + Math.floor(b.size / 2);
    const centerCy = cy + Math.floor(b.size / 2);

    for (const c of cellsForKindAt(b.kind, centerCx, centerCy)) {
      state.paintedSet.add(keyOf(c.x, c.y));
    }
  }

  const cells = [...state.paintedSet].map((k) => {
    const [x, y] = k.split(',').map(Number);
    return { x, y };
  });

  renderCells(tilesLayer, cells, { dashed: false });
  renderOutlines();
}

/* ---------------------------------------------
 * Preview
 * ------------------------------------------- */
/**
 * Show painter preview for a kind positioned at a snapped top-left point.
 * @param {'flag'|'hq'} kind
 * @param {number} snappedLeft
 * @param {number} snappedTop
 * @param {number} size
 * @param {boolean} [show=true]
 */
export function showPreview(kind, snappedLeft, snappedTop, size, show = true) {
  outlinesPreviewLayer.innerHTML = '';
  previewLayer.innerHTML = '';
  if (!show) return;

  const { cx, cy } = posToCell(snappedLeft, snappedTop);
  const centerCx = cx + Math.floor(size / 2);
  const centerCy = cy + Math.floor(size / 2);

  const cells = cellsForKindAt(kind, centerCx, centerCy);
  renderCells(previewLayer, cells, { dashed: true });

  const { minx, miny, maxx, maxy } = areaBoundingBox(kind, centerCx, centerCy);
  const rect = document.createElement('div');
  rect.className = 'area-outline';
  const cpx = cellPx();
  rect.style.left = `${minx * cpx}px`;
  rect.style.top = `${miny * cpx}px`;
  rect.style.width = `${(maxx - minx + 1) * cpx}px`;
  rect.style.height = `${(maxy - miny + 1) * cpx}px`;
  outlinesPreviewLayer.appendChild(rect);
}

/** Clear any active preview overlays. */
export function clearPreview() {
  outlinesPreviewLayer.innerHTML = '';
  previewLayer.innerHTML = '';
}

/* ---------------------------------------------
 * Badge / HUD
 * ------------------------------------------- */
/** Update the floating badge with cursor cell and zoom percentage. */
export function updateBadge() {
  const { x, y } = state.cursorCell || { x: 599, y: 599 };
  const zoomPct = Math.round((state.zoom || 1) * 100);

  if (badgeCoord) {
    badgeCoord.textContent = `x:${x}, y:${y}`;
  }
  if (badgeZoom) {
    badgeZoom.textContent = `${zoomPct}%`;
  }
}

/* ---------------------------------------------
 * Initial layout
 * ------------------------------------------- */
/** Apply initial world size, center the view, and update badge. */
export function initialLayout() {
  setWorldSizeCells(BASE_CELLS_X, BASE_CELLS_Y);
  centerToWorldCenter();
  updateBadge();
}
