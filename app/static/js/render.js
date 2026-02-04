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
  objectLayer,
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

  console.log(
    `[RedZone] Recomputed ${state.redZone.size} cells from ${state.blocks.filter((b) => REDZONE_KINDS.has(b.kind)).length} blocks`,
  );
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

/* ---------------------------------------------
 * Object Layer Rendering
 * ------------------------------------------- */
/**
 * Compute SVG path string for an object layer polygon.
 * Each cell on the edge can extend outward as a rectangular block (tile-shaped).
 * Only draws the outermost boundary - no internal lines between adjacent cells with same offset.
 * @param {import('./state.js').ObjectLayerItem} obj
 * @param {number} cpx - cell size in pixels
 * @returns {string} SVG path d attribute
 */
export function computePolygonPath(obj, cpx) {
  const { left, top, baseWidth, baseHeight, topEdge, rightEdge, bottomEdge, leftEdge } = obj;

  const pathParts = [];

  // Helper to get offset safely
  const get = (arr, i) => arr[i] || 0;

  // Helper to get extension side offset
  const getExt = (edgeName, cellIdx, extIdx, side) =>
    obj[`${edgeName}ExtSides`]?.[cellIdx]?.[side]?.[extIdx] || 0;

  /**
   * Draw a vertical wall segment for top/bottom edge transitions,
   * accounting for side extensions. Walks from yFrom toward yTo (upward, yTo < yFrom).
   * wallX is the base X position of the wall.
   * leftExtCell/rightExtCell: cell indices whose side extensions affect this wall.
   * @param {number} wallX - Base X of the wall
   * @param {number} yBase - Y at the base edge (top or bottomY)
   * @param {number} fromOff - Previous column's offset (lower height)
   * @param {number} toOff - Current column's offset (higher height)
   * @param {number} prevCellIdx - The cell on the "from" side (may have pos side ext)
   * @param {number} currCellIdx - The cell on the "to" side (may have neg side ext)
   * @param {string} edgeName - 'top' or 'bottom'
   * @param {number} dir - -1 for top (upward), +1 for bottom (downward)
   */
  /**
   * @param {number} wallX - X coordinate of the wall boundary
   * @param {number} yBase - Y at the base edge
   * @param {number} leftOff - Offset of the cell to the LEFT of the wall
   * @param {number} rightOff - Offset of the cell to the RIGHT of the wall
   * @param {number} leftCellIdx - Cell index to the LEFT of the wall
   * @param {number} rightCellIdx - Cell index to the RIGHT of the wall
   * @param {string} edgeName - 'top' or 'bottom'
   * @param {number} dir - -1 for top (upward), +1 for bottom (downward)
   * @param {boolean} leftToRight - true if path traverses left to right at this wall
   */
  function drawVerticalWall(wallX, yBase, leftOff, rightOff, leftCellIdx, rightCellIdx, edgeName, dir, leftToRight) {
    const minOff = Math.min(leftOff, rightOff);
    const maxOff = Math.max(leftOff, rightOff);
    // The taller cell owns the exposed wall
    const tallerIsRight = rightOff > leftOff;
    const tallerIdx = tallerIsRight ? rightCellIdx : leftCellIdx;
    // Right cell's LEFT side (neg) faces the wall; left cell's RIGHT side (pos) faces it
    const side = tallerIsRight ? 'neg' : 'pos';
    const sideSign = side === 'neg' ? -1 : 1;
    // Determine if we're going from short to tall or tall to short
    const ascending = leftToRight ? rightOff > leftOff : leftOff > rightOff;

    if (ascending) {
      // Path arrives at fromOff height, needs to go to toOff (taller).
      // Draw from inner (minOff) to outer (maxOff).
      pathParts.push(`L ${wallX} ${yBase + dir * minOff * cpx}`);

      let prevSideOff = 0;
      for (let r = minOff; r < maxOff; r++) {
        const sideOff = getExt(edgeName, tallerIdx, r, side);
        const yInner = yBase + dir * r * cpx;
        const yOuter = yBase + dir * (r + 1) * cpx;

        if (sideOff !== prevSideOff) {
          pathParts.push(`L ${wallX + sideSign * prevSideOff * cpx} ${yInner}`);
          pathParts.push(`L ${wallX + sideSign * sideOff * cpx} ${yInner}`);
        }
        pathParts.push(`L ${wallX + sideSign * sideOff * cpx} ${yOuter}`);
        prevSideOff = sideOff;
      }

      // Jog back to wallX at the tall height
      if (prevSideOff !== 0) {
        pathParts.push(`L ${wallX} ${yBase + dir * maxOff * cpx}`);
      }
    } else {
      // Path arrives at fromOff height (taller), needs to go to toOff (shorter).
      // Draw from outer (maxOff) to inner (minOff).
      // First jog out if the outermost row has a side offset
      const lastRowSideOff = getExt(edgeName, tallerIdx, maxOff - 1, side);
      if (lastRowSideOff !== 0) {
        pathParts.push(`L ${wallX} ${yBase + dir * maxOff * cpx}`);
        pathParts.push(`L ${wallX + sideSign * lastRowSideOff * cpx} ${yBase + dir * maxOff * cpx}`);
      }

      for (let r = maxOff - 1; r >= minOff; r--) {
        const sideOff = getExt(edgeName, tallerIdx, r, side);
        const yInner = yBase + dir * r * cpx;

        // Vertical segment from outer to inner of this row
        pathParts.push(`L ${wallX + sideSign * sideOff * cpx} ${yInner}`);

        // Check if next row (r-1) has a different side offset
        const nextSideOff = r > minOff ? getExt(edgeName, tallerIdx, r - 1, side) : 0;
        if (sideOff !== nextSideOff) {
          pathParts.push(`L ${wallX + sideSign * nextSideOff * cpx} ${yInner}`);
        }
      }

      // Ensure we end at wallX at the short height
      pathParts.push(`L ${wallX} ${yBase + dir * minOff * cpx}`);
    }
  }

  /**
   * Draw a horizontal wall segment for left/right edge transitions,
   * accounting for side extensions. Similar logic but rotated 90 degrees.
   */
  /**
   * @param {number} wallY - Y coordinate of the wall boundary
   * @param {number} xBase - X at the base edge
   * @param {number} topOff - Offset of the cell ABOVE the wall
   * @param {number} bottomOff - Offset of the cell BELOW the wall
   * @param {number} topCellIdx - Cell index ABOVE the wall
   * @param {number} bottomCellIdx - Cell index BELOW the wall
   * @param {string} edgeName - 'right' or 'left'
   * @param {number} dir - 1 for right (rightward), -1 for left (leftward)
   * @param {boolean} topToBottom - true if path traverses top to bottom at this wall
   */
  function drawHorizontalWall(wallY, xBase, topOff, bottomOff, topCellIdx, bottomCellIdx, edgeName, dir, topToBottom) {
    const minOff = Math.min(topOff, bottomOff);
    const maxOff = Math.max(topOff, bottomOff);
    const tallerIsBottom = bottomOff > topOff;
    const tallerIdx = tallerIsBottom ? bottomCellIdx : topCellIdx;
    // Bottom cell's TOP side (neg) faces the wall; top cell's BOTTOM side (pos) faces it
    const side = tallerIsBottom ? 'neg' : 'pos';
    const sideSign = side === 'neg' ? -1 : 1;
    const ascending = topToBottom ? bottomOff > topOff : topOff > bottomOff;

    if (ascending) {
      pathParts.push(`L ${xBase + dir * minOff * cpx} ${wallY}`);

      let prevSideOff = 0;
      for (let r = minOff; r < maxOff; r++) {
        const sideOff = getExt(edgeName, tallerIdx, r, side);
        const xInner = xBase + dir * r * cpx;
        const xOuter = xBase + dir * (r + 1) * cpx;

        if (sideOff !== prevSideOff) {
          pathParts.push(`L ${xInner} ${wallY + sideSign * prevSideOff * cpx}`);
          pathParts.push(`L ${xInner} ${wallY + sideSign * sideOff * cpx}`);
        }
        pathParts.push(`L ${xOuter} ${wallY + sideSign * sideOff * cpx}`);
        prevSideOff = sideOff;
      }

      if (prevSideOff !== 0) {
        pathParts.push(`L ${xBase + dir * maxOff * cpx} ${wallY}`);
      }
    } else {
      const lastRowSideOff = getExt(edgeName, tallerIdx, maxOff - 1, side);
      if (lastRowSideOff !== 0) {
        pathParts.push(`L ${xBase + dir * maxOff * cpx} ${wallY}`);
        pathParts.push(`L ${xBase + dir * maxOff * cpx} ${wallY + sideSign * lastRowSideOff * cpx}`);
      }

      for (let r = maxOff - 1; r >= minOff; r--) {
        const sideOff = getExt(edgeName, tallerIdx, r, side);
        const xInner = xBase + dir * r * cpx;

        pathParts.push(`L ${xInner} ${wallY + sideSign * sideOff * cpx}`);

        const nextSideOff = r > minOff ? getExt(edgeName, tallerIdx, r - 1, side) : 0;
        if (sideOff !== nextSideOff) {
          pathParts.push(`L ${xInner} ${wallY + sideSign * nextSideOff * cpx}`);
        }
      }

      pathParts.push(`L ${xBase + dir * minOff * cpx} ${wallY}`);
    }
  }

  // Start at top-left corner, considering first top offset and last left offset
  const firstTopOff = get(topEdge, 0);
  const firstLeftOff = get(leftEdge, 0);

  // Start from the top-left of the shape
  if (firstLeftOff > 0 && firstTopOff > 0) {
    pathParts.push(`M ${left - firstLeftOff * cpx} ${top}`);
    pathParts.push(`L ${left - firstLeftOff * cpx} ${top - firstTopOff * cpx}`);
    pathParts.push(`L ${left} ${top - firstTopOff * cpx}`);
  } else if (firstTopOff > 0) {
    pathParts.push(`M ${left} ${top - firstTopOff * cpx}`);
  } else if (firstLeftOff > 0) {
    pathParts.push(`M ${left - firstLeftOff * cpx} ${top}`);
    pathParts.push(`L ${left} ${top}`);
  } else {
    pathParts.push(`M ${left} ${top}`);
  }

  // Top edge: left to right
  for (let i = 0; i < baseWidth; i++) {
    const offset = get(topEdge, i);
    const prevOffset = i > 0 ? get(topEdge, i - 1) : firstLeftOff > 0 ? 0 : offset;
    const cellLeft = left + i * cpx;
    const cellRight = left + (i + 1) * cpx;

    if (i > 0 && offset !== prevOffset) {
      // Draw vertical wall with side extensions
      // Left of wall: column i-1 (prevOffset), right of wall: column i (offset)
      drawVerticalWall(cellLeft, top, prevOffset, offset, i - 1, i, 'top', -1, true);
    }

    // Draw horizontal at this offset level
    pathParts.push(`L ${cellRight} ${top - offset * cpx}`);
  }

  // Corner: top-right
  const lastTopOff = get(topEdge, baseWidth - 1);
  const firstRightOff = get(rightEdge, 0);
  const rightX = left + baseWidth * cpx;

  if (lastTopOff > 0 && firstRightOff > 0) {
    pathParts.push(`L ${rightX} ${top - lastTopOff * cpx}`);
    pathParts.push(`L ${rightX + firstRightOff * cpx} ${top - lastTopOff * cpx}`);
    pathParts.push(`L ${rightX + firstRightOff * cpx} ${top}`);
  } else if (lastTopOff > 0) {
    pathParts.push(`L ${rightX} ${top - lastTopOff * cpx}`);
    pathParts.push(`L ${rightX} ${top}`);
  } else if (firstRightOff > 0) {
    pathParts.push(`L ${rightX} ${top}`);
    pathParts.push(`L ${rightX + firstRightOff * cpx} ${top}`);
  }

  // Right edge: top to bottom
  for (let i = 0; i < baseHeight; i++) {
    const offset = get(rightEdge, i);
    const prevOffset = i > 0 ? get(rightEdge, i - 1) : offset;
    const cellTop = top + i * cpx;

    if (i > 0 && offset !== prevOffset) {
      // Above wall: row i-1 (prevOffset), below wall: row i (offset)
      drawHorizontalWall(cellTop, rightX, prevOffset, offset, i - 1, i, 'right', 1, true);
    }

    pathParts.push(`L ${rightX + offset * cpx} ${top + (i + 1) * cpx}`);
  }

  // Corner: bottom-right
  const lastRightOff = get(rightEdge, baseHeight - 1);
  const lastBottomOff = get(bottomEdge, baseWidth - 1);
  const bottomY = top + baseHeight * cpx;

  if (lastRightOff > 0 && lastBottomOff > 0) {
    pathParts.push(`L ${rightX + lastRightOff * cpx} ${bottomY}`);
    pathParts.push(`L ${rightX + lastRightOff * cpx} ${bottomY + lastBottomOff * cpx}`);
    pathParts.push(`L ${rightX} ${bottomY + lastBottomOff * cpx}`);
  } else if (lastRightOff > 0) {
    pathParts.push(`L ${rightX + lastRightOff * cpx} ${bottomY}`);
    pathParts.push(`L ${rightX} ${bottomY}`);
  } else if (lastBottomOff > 0) {
    pathParts.push(`L ${rightX} ${bottomY}`);
    pathParts.push(`L ${rightX} ${bottomY + lastBottomOff * cpx}`);
  }

  // Bottom edge: right to left
  for (let i = baseWidth - 1; i >= 0; i--) {
    const offset = get(bottomEdge, i);
    const prevOffset = i < baseWidth - 1 ? get(bottomEdge, i + 1) : offset;
    const cellRight = left + (i + 1) * cpx;

    if (i < baseWidth - 1 && offset !== prevOffset) {
      // Left of wall: column i (offset), right of wall: column i+1 (prevOffset)
      // Path goes right to left
      drawVerticalWall(cellRight, bottomY, offset, prevOffset, i, i + 1, 'bottom', 1, false);
    }

    pathParts.push(`L ${left + i * cpx} ${bottomY + offset * cpx}`);
  }

  // Corner: bottom-left
  const firstBottomOff = get(bottomEdge, 0);
  const lastLeftOff = get(leftEdge, baseHeight - 1);

  if (firstBottomOff > 0 && lastLeftOff > 0) {
    pathParts.push(`L ${left} ${bottomY + firstBottomOff * cpx}`);
    pathParts.push(`L ${left - lastLeftOff * cpx} ${bottomY + firstBottomOff * cpx}`);
    pathParts.push(`L ${left - lastLeftOff * cpx} ${bottomY}`);
  } else if (firstBottomOff > 0) {
    pathParts.push(`L ${left} ${bottomY + firstBottomOff * cpx}`);
    pathParts.push(`L ${left} ${bottomY}`);
  } else if (lastLeftOff > 0) {
    pathParts.push(`L ${left} ${bottomY}`);
    pathParts.push(`L ${left - lastLeftOff * cpx} ${bottomY}`);
  }

  // Left edge: bottom to top
  for (let i = baseHeight - 1; i >= 0; i--) {
    const offset = get(leftEdge, i);
    const prevOffset = i < baseHeight - 1 ? get(leftEdge, i + 1) : offset;
    const cellBottom = top + (i + 1) * cpx;

    if (i < baseHeight - 1 && offset !== prevOffset) {
      // Above wall: row i (offset), below wall: row i+1 (prevOffset)
      // Path goes bottom to top
      drawHorizontalWall(cellBottom, left, offset, prevOffset, i, i + 1, 'left', -1, false);
    }

    pathParts.push(`L ${left - offset * cpx} ${top + i * cpx}`);
  }

  // Close: back to start (top-left corner)
  if (firstLeftOff > 0 && firstTopOff > 0) {
    pathParts.push(`L ${left - firstLeftOff * cpx} ${top}`);
  } else if (firstLeftOff > 0) {
    pathParts.push(`L ${left - firstLeftOff * cpx} ${top}`);
  } else if (firstTopOff > 0) {
    pathParts.push(`L ${left} ${top}`);
    pathParts.push(`L ${left} ${top - firstTopOff * cpx}`);
  }

  pathParts.push('Z');
  return pathParts.join(' ');
}

/**
 * Render all object layers as SVG paths with optional labels.
 */
export function renderObjectLayer() {
  if (!objectLayer) return;

  objectLayer.innerHTML = '';
  const cpx = cellPx();
  const style = getComputedStyle(document.documentElement);
  const defaultColor = style.getPropertyValue('--object-bg').trim() || 'rgba(144, 238, 144, 0.6)';
  const borderColor = style.getPropertyValue('--object-border').trim() || 'rgba(60, 179, 113, 0.8)';

  for (const obj of state.objectLayers) {
    const pathData = computePolygonPath(obj, cpx);
    if (!pathData) continue;

    // Create a group to hold path and label
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.setAttribute('data-id', obj.id);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    path.setAttribute('fill', obj.color || defaultColor);
    path.setAttribute('stroke', borderColor);
    path.setAttribute('stroke-width', '2');
    path.setAttribute('data-id', obj.id);

    if (state.selectedObjectId === obj.id) {
      path.classList.add('selected');
    }

    group.appendChild(path);

    // Add label if exists
    if (obj.label) {
      const centerX = obj.left + (obj.baseWidth * cpx) / 2;
      const centerY = obj.top + (obj.baseHeight * cpx) / 2;

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(centerX));
      text.setAttribute('y', String(centerY));
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('class', 'object-label');
      text.setAttribute('data-id', obj.id);
      // Counter-rotate to match block label orientation inside rotated .rot
      text.setAttribute(
        'transform',
        `translate(${centerX}, ${centerY}) scale(-1, -1) rotate(-45) translate(${-centerX}, ${-centerY})`,
      );
      text.textContent = obj.label;

      group.appendChild(text);
    }

    objectLayer.appendChild(group);
  }
}
