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
  redZoneLayer,
  userLayer,
  outlinesLayer,
  outlinesPreviewLayer,
  previewLayer,
  badgeCoord,
  badgeZoom,
} from './dom.js';
import {
  PAINTER_KINDS,
  cellsForKindAt,
  areaBoundingBox,
  REDZONE_KINDS,
  redZoneCellsForKindAt,
  KIND_REDZONE_RADIUS,
} from './painter.js';
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

/**
 * Center view with priority: HQ -> Trap -> World Center
 */
export function centerToInitialPosition() {
  const hqBlocks = state.blocks.filter((b) => b.kind === 'hq');
  const trapBlocks = state.blocks.filter((b) => b.kind === 'trap');

  if (hqBlocks.length > 0) {
    // Center on first HQ
    const hq = hqBlocks[0];
    const { cx, cy } = posToCell(hq.left, hq.top);
    centerToCell(cx + hq.size / 2, cy + hq.size / 2);
  } else if (trapBlocks.length > 0) {
    // Center on first Trap
    const trap = trapBlocks[0];
    const { cx, cy } = posToCell(trap.left, trap.top);
    centerToCell(cx + trap.size / 2, cy + trap.size / 2);
  } else {
    // Default: center of the world
    centerToWorldCenter();
  }
}

/* ---------------------------------------------
 * Core painters
 * ------------------------------------------- */

/**
 * Per-layer state for renderCells diff: tracks the previous cell set and the
 * DOM element for each cell key so we can add/remove only what changed.
 * @type {WeakMap<HTMLElement, {keys: Set<string>, els: Map<string, HTMLElement>}>}
 */
const _layerState = new WeakMap();

/**
 * Render a set of cells onto a layer as blue tiles with perimeter borders.
 * Diffs against the previous call for the same layer — only adds/removes
 * tiles that changed, and re-styles neighbours whose border edges may have
 * flipped.
 * @param {HTMLElement} layer
 * @param {{x:number,y:number}[]} cellList
 * @param {{dashed?: boolean}} [opts]
 */
export function renderCells(layer, cellList, opts) {
  const cpx = cellPx();
  const dashed = opts?.dashed ? 'dashed' : 'solid';
  const style = getComputedStyle(document.documentElement);
  const col = style.getPropertyValue('--paint-blue-border').trim() || 'rgba(66,133,244,0.9)';
  const thickness = '2px';

  const newKeys = new Set(cellList.map((c) => keyOf(c.x, c.y)));

  /** Build / update one tile element for position (x, y). */
  function makeTile(x, y) {
    const t = document.createElement('div');
    t.className = 'tile';
    t.style.left = `${x * cpx}px`;
    t.style.top = `${y * cpx}px`;
    t.style.width = `${cpx}px`;
    t.style.height = `${cpx}px`;
    return t;
  }

  /** Apply border style to an existing tile element. */
  function styleTile(t, x, y) {
    const top = !newKeys.has(keyOf(x, y - 1));
    const right = !newKeys.has(keyOf(x + 1, y));
    const bottom = !newKeys.has(keyOf(x, y + 1));
    const left = !newKeys.has(keyOf(x - 1, y));
    t.style.borderTop = top ? `${thickness} ${dashed} ${col}` : '0';
    t.style.borderRight = right ? `${thickness} ${dashed} ${col}` : '0';
    t.style.borderBottom = bottom ? `${thickness} ${dashed} ${col}` : '0';
    t.style.borderLeft = left ? `${thickness} ${dashed} ${col}` : '0';
  }

  const prev = _layerState.get(layer);

  // First render for this layer — build everything from scratch.
  if (!prev) {
    const els = new Map();
    for (const c of cellList) {
      const k = keyOf(c.x, c.y);
      const t = makeTile(c.x, c.y);
      styleTile(t, c.x, c.y);
      layer.appendChild(t);
      els.set(k, t);
    }
    _layerState.set(layer, { keys: newKeys, els });
    return;
  }

  const { keys: oldKeys, els } = prev;

  // Collect keys whose border appearance may have changed (neighbours of
  // added/removed cells).
  const toRestyle = new Set();

  // Remove tiles that are no longer in the set.
  for (const k of oldKeys) {
    if (!newKeys.has(k)) {
      const t = els.get(k);
      if (t) layer.removeChild(t);
      els.delete(k);

      // Neighbours may now have an exposed edge.
      const [x, y] = k.split(',').map(Number);
      for (const nk of [keyOf(x, y - 1), keyOf(x + 1, y), keyOf(x, y + 1), keyOf(x - 1, y)]) {
        if (newKeys.has(nk)) toRestyle.add(nk);
      }
    }
  }

  // Add tiles that are newly in the set.
  for (const k of newKeys) {
    if (!oldKeys.has(k)) {
      const [x, y] = k.split(',').map(Number);
      const t = makeTile(x, y);
      layer.appendChild(t);
      els.set(k, t);
      toRestyle.add(k);

      // Neighbours may now have a covered edge.
      for (const nk of [keyOf(x, y - 1), keyOf(x + 1, y), keyOf(x, y + 1), keyOf(x - 1, y)]) {
        if (newKeys.has(nk)) toRestyle.add(nk);
      }
    }
  }

  // Re-style only the affected tiles.
  for (const k of toRestyle) {
    const t = els.get(k);
    if (!t) continue;
    const [x, y] = k.split(',').map(Number);
    styleTile(t, x, y);
  }

  prev.keys = newKeys;
}

/**
 * Invalidate the renderCells diff cache for a layer.
 * Call this before clearing a layer's innerHTML outside of renderCells so the
 * next renderCells call treats it as a fresh render.
 * @param {HTMLElement} layer
 */
export function invalidateLayerCache(layer) {
  _layerState.delete(layer);
}

/**
 * Render red zone as simple CSS rectangles for each castle/fortress/sanctuary.
 * Each block gets one rectangle covering its entire red zone area.
 */
export function renderRedZone() {
  redZoneLayer.innerHTML = '';
  const cpx = cellPx();

  for (const b of state.blocks) {
    if (!REDZONE_KINDS.has(b.kind)) continue;

    const { cx, cy } = posToCell(b.left, b.top);
    const centerCx = cx + Math.floor(b.size / 2);
    const centerCy = cy + Math.floor(b.size / 2);

    // Get red zone radius from painter config
    const edgeRange = KIND_REDZONE_RADIUS[b.kind] ?? 0;
    const halfSize = Math.floor(b.size / 2);

    // Calculate red zone bounding box
    const minX = centerCx - halfSize - edgeRange;
    const minY = centerCy - halfSize - edgeRange;
    const width = b.size + 2 * edgeRange;
    const height = b.size + 2 * edgeRange;

    // Create single rectangle for this red zone
    const rect = document.createElement('div');
    rect.className = 'redzone-rect';
    rect.style.cssText = `left:${minX * cpx}px;top:${minY * cpx}px;width:${width * cpx}px;height:${height * cpx}px`;
    redZoneLayer.appendChild(rect);
  }
}

/** Render user-painted red tiles. */
export function renderUserTiles() {
  userLayer.innerHTML = '';
  const cpx = cellPx();
  const fragment = document.createDocumentFragment();

  for (const k of state.userPaint) {
    const [x, y] = k.split(',').map(Number);
    const d = document.createElement('div');
    d.className = 'tile-red';
    d.style.cssText = `transform:translate(${x * cpx}px,${y * cpx}px);width:${cpx}px;height:${cpx}px`;
    fragment.appendChild(d);
  }

  userLayer.appendChild(fragment);
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

/**
 * Recompute red zone coverage from all castle/fortress/sanctuary blocks.
 * Similar to recomputePaint but for redZone.
 */
export function recomputeRedZone() {
  state.redZone = new Set();

  for (const b of state.blocks) {
    if (!REDZONE_KINDS.has(b.kind)) continue;

    const { cx, cy } = posToCell(b.left, b.top);
    const centerCx = cx + Math.floor(b.size / 2);
    const centerCy = cy + Math.floor(b.size / 2);

    for (const c of redZoneCellsForKindAt(b.kind, centerCx, centerCy, b.size)) {
      state.redZone.add(keyOf(c.x, c.y));
    }
  }
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
  if (!show) {
    renderCells(previewLayer, []);
    return;
  }

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
  renderCells(previewLayer, []);
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
