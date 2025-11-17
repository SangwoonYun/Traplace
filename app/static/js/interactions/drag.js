// File: app/static/js/interactions/drag.js
/**
 * Drag & drop interactions
 * - Drag from palette to create new blocks (snap + preview + ghost)
 * - Drag existing blocks to move or delete (via trash zone)
 * - Edge auto-scroll while dragging near viewport edges
 */

import { state, cellPx } from '../state.js';
import { previewLayer, outlinesPreviewLayer, snapEl, palette, trash, viewport } from '../dom.js';
import { clientToLocalRot, snapLocal } from '../transform.js';
import { setDragScrollLock } from './hscroll.js';
import { PAINTER_KINDS } from '../painter.js';
import { showPreview, clearPreview } from '../render.js';
import { createBlock, updateBlockPosition, deleteBlock, updateBlockSize } from '../blocks.js';
import { t } from '../i18n.js';
import { posToCell } from '../transform.js';

/* ---------------------------------------------
 * Constants
 * ------------------------------------------- */

const EDGE_MARGIN = 20; // px from each edge to begin auto-scroll
const BOTTOM_EDGE_MARGIN = 14; // px from bottom to begin auto-scroll (narrower near trash)
const MAX_SPEED = 500; // px/sec at the very edge
const NEW_SCROLL_GRACE_MS = 500; // suppress edge scroll right after a new-drag starts
const NEW_EDGE_DWELL_MS = 500; // require dwelling near an edge before scrolling (new-drag only)
const LONG_PRESS_MS = 250; // touch long-press threshold
const MOVE_TOL_CREATE = 8; // px slop when starting from palette
const MOVE_TOL_MOVE = 6; // px slop when moving existing block
const VIBRATE_MIN_GAP_MS = 120; // throttle for hapticTap

// Additional deadzone above trash to avoid accidental auto-scroll while aiming trash
const TRASH_DEADZONE = 56; // px

/* ---------------------------------------------
 * Utilities
 * ------------------------------------------- */

/** Global contextmenu suppression (once). */
if (!window.__ctxmenuBound) {
  window.__suppressContextMenu = false;
  document.addEventListener(
    'contextmenu',
    (e) => {
      if (window.__suppressContextMenu) e.preventDefault();
    },
    { capture: true },
  );
  window.__ctxmenuBound = true;
}

let lastVibeAt = 0;
/** Light haptic tap with throttling. */
function hapticTap(duration = 12) {
  try {
    const now = Date.now();
    if (now - lastVibeAt < VIBRATE_MIN_GAP_MS) return;
    if (!('vibrate' in navigator)) return;

    const ua = navigator.userActivation;
    if (ua && !ua.isActive) return;

    navigator.vibrate(duration);
    lastVibeAt = now;
  } catch {
    /* no-op */
  }
}

/** Cached DOM rects for edge calculations. */
function getRects() {
  const vp = viewport.getBoundingClientRect();
  const toolbarEl = document.getElementById('toolbar');
  const sidebarEl = document.querySelector('.sidebar');
  const paletteEl = document.getElementById('palette');

  const tb = toolbarEl ? toolbarEl.getBoundingClientRect() : null;
  const sb = sidebarEl ? sidebarEl.getBoundingClientRect() : null;
  const pl = paletteEl ? paletteEl.getBoundingClientRect() : null;
  const tr = trash ? trash.getBoundingClientRect() : null;

  return { vp, tb, sb, pl, tr };
}

/**
 * Compute effective viewport rect used for edge auto-scroll.
 * - Top excludes toolbar/palette overlays
 * - Left excludes a true vertical sidebar
 * - Bottom excludes trash-zone area
 */
function computeEffectiveRect() {
  const { vp, tb, sb, pl, tr } = getRects();
  let left = vp.left;
  let top = vp.top;
  const right = vp.right;
  let bottom = vp.bottom;

  const intersectsHoriz = (a, b) => a.left < b.right && a.right > b.left;

  // Top overlays
  if (tb && tb.bottom > top && intersectsHoriz(tb, vp)) {
    top = Math.max(top, tb.bottom);
  }
  if (pl && pl.bottom > top && intersectsHoriz(pl, vp)) {
    top = Math.max(top, pl.bottom);
  }

  // Left sidebar (shape heuristic)
  if (sb && sb.top < bottom && sb.bottom > top) {
    const vpW = vp.right - vp.left;
    const vpH = vp.bottom - vp.top;
    const sbW = sb.right - sb.left;
    const sbH = sb.bottom - sb.top;
    const looksLikeLeftSidebar = sb.left <= vp.left + 8 && sbW < vpW * 0.6 && sbH > vpH * 0.5;
    if (looksLikeLeftSidebar) {
      left = Math.max(left, sb.right);
    }
  }

  // Bottom trash-zone
  if (tr && tr.top < bottom && intersectsHoriz(tr, vp)) {
    bottom = Math.min(bottom, tr.top + TRASH_DEADZONE);
  }

  // Sanity
  if (left >= right) left = right - 1;
  if (top >= bottom) top = bottom - 1;

  return { left, top, right, bottom };
}

/** Safely call setPointerCapture; returns true if captured, else false. */
function safeSetPointerCapture(target, pointerId) {
  if (!target || typeof target.setPointerCapture !== 'function') return false;
  try {
    target.setPointerCapture(pointerId);
    return true;
  } catch {
    // pointer might be inactive (e.g., long-press cancelled) — ignore
    return false;
  }
}

/* ---------------------------------------------
 * Drag visuals update
 * ------------------------------------------- */

/**
 * Update all drag visuals (snap rect, painter preview, ghost) from a client point.
 * Shared by pointermove & auto-scroll tick.
 */
function updateDragAt(clientX, clientY) {
  if (!state.drag) return;

  state.drag.lastClientX = clientX;
  state.drag.lastClientY = clientY;

  const { x, y } = clientToLocalRot(clientX, clientY);
  const { size, kind, width, height } = state.drag;
  const cpx = cellPx();

  // Use width/height for custom blocks
  const w = width || size;
  const h = height || size;

  const left = x - (w * cpx) / 2;
  const top = y - (h * cpx) / 2;
  const snapped = snapLocal(left, top, Math.max(w, h));

  snapEl.style.display = 'block';
  snapEl.style.left = `${snapped.left}px`;
  snapEl.style.top = `${snapped.top}px`;
  snapEl.style.width = `${w * cpx}px`;
  snapEl.style.height = `${h * cpx}px`;

  if (PAINTER_KINDS.has(kind)) {
    showPreview(kind, snapped.left, snapped.top, size, true);
  } else {
    outlinesPreviewLayer.innerHTML = '';
    previewLayer.innerHTML = '';
  }

  if (state.drag.ghost) {
    updateGhost(clientX, clientY, w * cpx, h * cpx);
  }
}

/** Position the floating ghost under the cursor (screen coordinates). */
function updateGhost(clientX, clientY, pxW, pxH) {
  if (!state.drag?.ghost) return;
  const w = pxH !== undefined ? pxW : pxW;
  const h = pxH !== undefined ? pxH : pxW;
  state.drag.ghost.style.left = `${clientX - w / 2}px`;
  state.drag.ghost.style.top = `${clientY - h / 2}px`;
}

/* ---------------------------------------------
 * Edge auto-scroll
 * ------------------------------------------- */

/** Compute scrolling velocity based on proximity to edges. */
function computeEdgeVelocity(clientX, clientY) {
  // Grace: right after creating from palette, suppress auto-scroll briefly.
  if (state.drag?.mode === 'new') {
    const now = performance.now();
    const startedAt = state.drag.startedAt ?? now;
    if (now - startedAt < NEW_SCROLL_GRACE_MS) {
      return { vx: 0, vy: 0 };
    }
  }

  const vp = computeEffectiveRect();
  const ease = (d, margin) => Math.min(1, Math.max(0, d / margin)); // 0..1
  let vx = 0;
  let vy = 0;

  // Left / Right
  if (clientX < vp.left + EDGE_MARGIN) {
    const f = 1 - ease(clientX - vp.left, EDGE_MARGIN);
    vx = -MAX_SPEED * f;
  } else if (clientX > vp.right - EDGE_MARGIN) {
    const f = 1 - ease(vp.right - clientX, EDGE_MARGIN);
    vx = MAX_SPEED * f;
  }

  // Top / Bottom
  if (clientY < vp.top + EDGE_MARGIN) {
    const f = 1 - ease(clientY - vp.top, EDGE_MARGIN);
    vy = -MAX_SPEED * f;
  } else if (clientY > vp.bottom - BOTTOM_EDGE_MARGIN) {
    const f = 1 - ease(vp.bottom - clientY, BOTTOM_EDGE_MARGIN);
    vy = MAX_SPEED * f;
  }

  // Dwell: require staying near the same edge for a short time (new-drag only).
  if (state.drag?.mode === 'new' && (vx !== 0 || vy !== 0)) {
    const now = performance.now();
    // Determine which edge we're near (L/R/T/B)
    const key =
      clientX < vp.left + EDGE_MARGIN
        ? 'L'
        : clientX > vp.right - EDGE_MARGIN
          ? 'R'
          : clientY < vp.top + EDGE_MARGIN
            ? 'T'
            : 'B';

    if (state.drag.edgeKey !== key) {
      state.drag.edgeKey = key;
      state.drag.edgeEnterAt = now;
      return { vx: 0, vy: 0 };
    }
    if (now - (state.drag.edgeEnterAt ?? now) < NEW_EDGE_DWELL_MS) {
      return { vx: 0, vy: 0 };
    }
  }

  return { vx, vy };
}

/** Ensure edge scroll loop is running if needed. */
function startEdgeAutoScroll() {
  if (!state.drag) return;
  if (state.drag.edgeScroll?.rafId) return;

  const es = (state.drag.edgeScroll = { vx: 0, vy: 0, rafId: 0, lastTs: 0 });

  const tick = (ts) => {
    if (!state.drag || !state.drag.edgeScroll) return;

    if (!es.lastTs) es.lastTs = ts;
    const dt = Math.min(48, ts - es.lastTs);
    es.lastTs = ts;

    if (es.vx !== 0 || es.vy !== 0) {
      viewport.scrollLeft += (es.vx * dt) / 1000;
      viewport.scrollTop += (es.vy * dt) / 1000;

      if (state.drag.lastClientX != null && state.drag.lastClientY != null) {
        updateDragAt(state.drag.lastClientX, state.drag.lastClientY);
      }
      es.rafId = requestAnimationFrame(tick);
    } else {
      es.rafId = 0;
    }
  };

  es.rafId = requestAnimationFrame(tick);
}

/** Stop edge auto-scroll and clear state. */
function stopEdgeAutoScroll() {
  if (state.drag?.edgeScroll?.rafId) {
    cancelAnimationFrame(state.drag.edgeScroll.rafId);
  }
  if (state.drag) state.drag.edgeScroll = null;
}

/* ---------------------------------------------
 * Hit testing
 * ------------------------------------------- */

/** Check if the pointer is currently inside the trash zone. */
function inTrash(clientX, clientY) {
  if (!trash) return false;
  const r = trash.getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

/** Check if the pointer is currently inside the palette area. */
function inPalette(clientX, clientY) {
  if (!palette) return false;
  const r = palette.getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

/** Lock/unlock palette horizontal drag-scroll. */
function lockPaletteScroll(v) {
  try {
    if (!palette) return;
    setDragScrollLock?.(palette, !!v);
    // Defensive: also hint the hscroll logic by clearing any in-progress flag
    if (v && palette.dataset.scrolling === '1') delete palette.dataset.scrolling;
  } catch {
    /* no-op */
  }
}

/* ---------------------------------------------
 * Pointer handlers (shared for create/move)
 * ------------------------------------------- */

function onPointerMove(e) {
  if (!state.drag || e.pointerId !== state.drag.pointerId) return;

  const overTrash = inTrash(e.clientX, e.clientY);
  trash?.classList.toggle('active', overTrash);

  updateDragAt(e.clientX, e.clientY);

  const { vx, vy } = computeEdgeVelocity(e.clientX, e.clientY);
  if (!state.drag.edgeScroll) state.drag.edgeScroll = { vx: 0, vy: 0, rafId: 0, lastTs: 0 };
  state.drag.edgeScroll.vx = vx;
  state.drag.edgeScroll.vy = vy;

  if (vx !== 0 || vy !== 0) startEdgeAutoScroll();
  else stopEdgeAutoScroll();
}

function onPointerUp(e) {
  if (!state.drag || e.pointerId !== state.drag.pointerId) {
    cleanupDrag();
    return;
  }

  const droppingInTrash = inTrash(e.clientX, e.clientY) || inPalette(e.clientX, e.clientY);

  if (state.drag.mode === 'new') {
    removeGhost();

    if (!droppingInTrash) {
      const { x, y } = clientToLocalRot(e.clientX, e.clientY);
      const { size, kind, width, height } = state.drag;
      const cpx = cellPx();
      const w = width || size;
      const h = height || size;
      const left = x - (w * cpx) / 2;
      const top = y - (h * cpx) / 2;
      const snapped = snapLocal(left, top, Math.max(w, h));

      const el = createBlock(kind, size, snapped.left, snapped.top, width, height);
      makeMovable(el);
    }

    cleanupDrag();
    return;
  }

  // Move existing node or delete it
  if (state.drag.mode === 'move' && state.drag.node) {
    if (droppingInTrash) {
      deleteBlock(state.drag.node);
    } else {
      const { x, y } = clientToLocalRot(e.clientX, e.clientY);
      const { size, width, height } = state.drag;
      const cpx = cellPx();
      const w = width || size;
      const h = height || size;
      const left = x - (w * cpx) / 2;
      const top = y - (h * cpx) / 2;
      const snapped = snapLocal(left, top, Math.max(w, h));

      updateBlockPosition(state.drag.node, snapped.left, snapped.top);
    }
  }

  cleanupDrag();
}

/* ---------------------------------------------
 * Cleanup
 * ------------------------------------------- */

/** Remove ghost element if present. */
function removeGhost() {
  const ghost = state.drag?.ghost;
  if (ghost?.parentNode) ghost.parentNode.removeChild(ghost);
}

/** Tear down drag visuals/state and listeners. */
function cleanupDrag() {
  snapEl.style.display = 'none';
  clearPreview();
  trash?.classList.remove('active');
  stopEdgeAutoScroll();

  // original element visual
  if (state.drag?.node) state.drag.node.classList.remove('is-lifted');

  removeGhost();
  lockPaletteScroll(false);

  window.removeEventListener('pointermove', onPointerMove);
  state.drag = null;
}

/* ---------------------------------------------
 * Public API
 * ------------------------------------------- */

/**
 * Enable dragging from palette to create new blocks.
 */
export function setupPaletteDrag() {
  if (!palette) return;

  palette.querySelectorAll('.palette-item').forEach((item) => {
    item.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;

      // Don't start drag when clicking on custom input fields
      if (e.target.matches('.custom-width, .custom-height')) {
        return;
      }

      const isTouch = e.pointerType === 'touch';
      const startX = e.clientX;
      const startY = e.clientY;
      let timer = null;

      e.preventDefault();
      safeSetPointerCapture(item, e.pointerId);

      const startDrag = () => {
        hapticTap(15);
        lockPaletteScroll(true);

        window.__suppressContextMenu = true;

        if (palette?.dataset?.scrolling === '1') delete palette.dataset.scrolling;

        const kind = item.dataset.kind;
        let size, width, height, px, ghostText;

        // Custom blocks use input values
        if (kind === 'custom') {
          const widthInput = item.querySelector('.custom-width');
          const heightInput = item.querySelector('.custom-height');
          // Clamp values between 1 and 30
          width = Math.min(30, Math.max(1, parseInt(widthInput?.value, 10) || 1));
          height = Math.min(30, Math.max(1, parseInt(heightInput?.value, 10) || 1));
          size = Math.max(width, height);
          px = size * cellPx();
          ghostText = `${width}×${height}`;
        } else {
          size = parseInt(item.dataset.size, 10);
          px = size * cellPx();
          ghostText =
            kind === 'hq'
              ? t('palette.hq')
              : kind === 'flag'
                ? t('palette.flag')
                : kind === 'trap'
                  ? t('palette.trap')
                  : kind === 'city'
                    ? t('palette.city')
                    : kind === 'resource'
                      ? t('palette.resource')
                      : `${size}×${size}`;
        }

        const ghost = document.createElement('div');
        ghost.className = 'ghost';
        ghost.style.width = `${(width || size) * cellPx()}px`;
        ghost.style.height = `${(height || size) * cellPx()}px`;

        const gl = document.createElement('div');
        gl.className = 'ghost-label';
        gl.textContent = ghostText;
        ghost.appendChild(gl);

        document.body.appendChild(ghost);

        state.drag = {
          mode: 'new',
          size,
          kind,
          width,
          height,
          ghost,
          pointerId: e.pointerId,
          startedAt: performance.now(),
          edgeKey: null,
          edgeEnterAt: 0,
        };
        updateGhost(e.clientX, e.clientY, (width || size) * cellPx(), (height || size) * cellPx());

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp, { once: true });
        window.addEventListener('pointercancel', () => cleanupDrag(), { once: true });
      };

      if (isTouch) {
        // long-press unless the user scrolls
        window.__suppressContextMenu = true;

        const onMoveCheck = (ev) => {
          const dx = Math.abs(ev.clientX - startX);
          const dy = Math.abs(ev.clientY - startY);
          if (dx > MOVE_TOL_CREATE || dy > MOVE_TOL_CREATE) {
            if (timer) clearTimeout(timer);
            item.releasePointerCapture(e.pointerId);
            item.removeEventListener('pointermove', onMoveCheck);
            window.__suppressContextMenu = false;
          }
        };

        timer = setTimeout(() => {
          startDrag();
        }, LONG_PRESS_MS);

        item.addEventListener('pointermove', onMoveCheck);
        item.addEventListener(
          'pointerup',
          () => {
            if (timer) clearTimeout(timer);
            item.removeEventListener('pointermove', onMoveCheck);
            window.__suppressContextMenu = false;
          },
          { once: true },
        );
      } else {
        // mouse: start immediately (desktop)
        startDrag();
      }
    });
  });

  // Add input validation for custom block size inputs
  const customWidthInput = palette.querySelector('.custom-width');
  const customHeightInput = palette.querySelector('.custom-height');

  const validateInput = (input) => {
    const max = 30;
    const min = 1;
    let value = parseInt(input.value, 10);

    if (isNaN(value) || value < min) {
      input.value = min;
    } else if (value > max) {
      input.value = max;
    }
  };

  if (customWidthInput) {
    customWidthInput.addEventListener('input', () => validateInput(customWidthInput));
    customWidthInput.addEventListener('blur', () => validateInput(customWidthInput));
  }

  if (customHeightInput) {
    customHeightInput.addEventListener('input', () => validateInput(customHeightInput));
    customHeightInput.addEventListener('blur', () => validateInput(customHeightInput));
  }
}

/**
 * Detect which edge of the block is being clicked
 *
 * The block has transform: rotate(45deg) scale(-1)
 * We need to transform mouse coordinates to the block's local coordinate system.
 *
 * @param {HTMLElement} el - Block element
 * @param {PointerEvent} e - Pointer event
 * @returns {string|null} - 'width' or 'height' to indicate which dimension to resize
 */
function getResizeEdge(el, e) {
  const rect = el.getBoundingClientRect();
  const threshold = 15; // pixels from edge in local coords

  // Get block state to know its actual width/height in cells
  const block = state.blocks.find(b => b.el === el);
  if (!block) return null;

  const cpx = cellPx();
  const actualWidth = (block.width || block.size) * cpx;
  const actualHeight = (block.height || block.size) * cpx;

  // Click position relative to block center (screen coords)
  const screenX = e.clientX - (rect.left + rect.width / 2);
  const screenY = e.clientY - (rect.top + rect.height / 2);

  // Apply inverse transform: scale(-1) then rotate(-45deg)
  // Inverse of rotate(45deg) scale(-1) is scale(-1) rotate(-45deg)

  // Step 1: Undo scale(-1) - negate both coordinates
  const afterUnscaleX = -screenX;
  const afterUnscaleY = -screenY;

  // Step 2: Undo rotate(45deg) - apply rotate(-45deg)
  const angle = -45 * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const localX = afterUnscaleX * cos - afterUnscaleY * sin;
  const localY = afterUnscaleX * sin + afterUnscaleY * cos;

  // Now localX and localY are in the block's internal coordinate system
  // where width is along X-axis and height is along Y-axis

  const halfW = actualWidth / 2;
  const halfH = actualHeight / 2;

  // Check if inside block bounds
  if (Math.abs(localX) > halfW || Math.abs(localY) > halfH) {
    return null; // Outside block
  }

  // Check distance to each edge (in local coords, edges are straight)
  // Edge mapping to visual positions:
  //   'left' (x = -halfW) → 우하 (bottom-right visually)
  //   'right' (x = halfW) → 좌상 (top-left visually)
  //   'top' (y = -halfH) → 좌하 (bottom-left visually)
  //   'bottom' (y = halfH) → 우상 (top-right visually)
  const distLeft = Math.abs(localX + halfW);     // Distance to left edge
  const distRight = Math.abs(localX - halfW);    // Distance to right edge
  const distTop = Math.abs(localY + halfH);      // Distance to top edge
  const distBottom = Math.abs(localY - halfH);   // Distance to bottom edge

  // Find minimum distance for width and height edges
  const minWidthDist = Math.min(distLeft, distRight);
  const minHeightDist = Math.min(distTop, distBottom);

  // Return which edge is closest
  if (minWidthDist < minHeightDist && minWidthDist <= threshold) {
    // Close to left or right edge → resize width
    return localX < 0 ? 'left' : 'right';
  } else if (minHeightDist <= threshold) {
    // Close to top or bottom edge → resize height
    return localY < 0 ? 'top' : 'bottom';
  }

  return null;
}

/**
 * Start resizing a custom block
 * @param {HTMLElement} el - Block element
 * @param {PointerEvent} e - Pointer event
 * @param {string} edge - Edge identifier
 */
function startResize(el, e, edge) {
  e.preventDefault();
  e.stopPropagation();

  const block = state.blocks.find(b => b.el === el);
  if (!block || block.kind !== 'custom') return;

  const cpx = cellPx();
  const startX = e.clientX;
  const startY = e.clientY;
  const startWidth = block.width || block.size;
  const startHeight = block.height || block.size;
  const startLeft = block.left;
  const startTop = block.top;

  // Add visual feedback
  el.classList.add('is-resizing');
  el.dataset.resizeEdge = edge;

  // Flag to prevent tile painting during resize
  state._isResizing = true;

  const onMove = (moveEvent) => {
    moveEvent.preventDefault();
    moveEvent.stopPropagation();

    const dx = moveEvent.clientX - startX;
    const dy = moveEvent.clientY - startY;

    // Transform screen delta to local coordinates (undo rotate(45deg) scale(-1))
    // Step 1: Undo scale(-1)
    const unscaledDx = -dx;
    const unscaledDy = -dy;

    // Step 2: Undo rotate(45deg) with rotate(-45deg)
    const angle = -45 * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const localDx = unscaledDx * cos - unscaledDy * sin;
    const localDy = unscaledDx * sin + unscaledDy * cos;

    // Now localDx affects block width, localDy affects block height

    let newWidth = startWidth;
    let newHeight = startHeight;
    let newLeft = startLeft;
    let newTop = startTop;

    // Edge mapping in local coordinates to visual positions:
    //   'left' (localX < 0)   → bottom-right visually
    //   'right' (localX > 0)  → top-left visually
    //   'top' (localY < 0)    → bottom-left visually
    //   'bottom' (localY > 0) → top-right visually (anchor point)

    if (edge === 'left') {
      // Resize width: bottom-right edge
      const widthDelta = -localDx / cpx;
      newWidth = Math.round(startWidth + widthDelta);
      newWidth = Math.max(1, Math.min(30, newWidth));

      // Adjust position to keep top-right anchor fixed
      const actualChange = newWidth - startWidth;
      newLeft = startLeft - actualChange * cpx;

    } else if (edge === 'right') {
      // Resize width: top-left edge
      const widthDelta = localDx / cpx;
      newWidth = Math.round(startWidth + widthDelta);
      newWidth = Math.max(1, Math.min(30, newWidth));
      // No position adjustment needed (anchor naturally stays fixed)

    } else if (edge === 'top') {
      // Resize height: bottom-left edge
      const heightDelta = -localDy / cpx;
      newHeight = Math.round(startHeight + heightDelta);
      newHeight = Math.max(1, Math.min(30, newHeight));

      // Adjust position to keep top-right anchor fixed
      const actualChange = newHeight - startHeight;
      newTop = startTop - actualChange * cpx;

    } else if (edge === 'bottom') {
      // Resize height: top-right edge (anchor point)
      const heightDelta = localDy / cpx;
      newHeight = Math.round(startHeight + heightDelta);
      newHeight = Math.max(1, Math.min(30, newHeight));
      // No position adjustment needed (this is the anchor)
    }

    // Clamp to valid range
    newWidth = Math.min(30, Math.max(1, newWidth));
    newHeight = Math.min(30, Math.max(1, newHeight));

    // Update visual size and position
    el.style.width = `${newWidth * cpx}px`;
    el.style.height = `${newHeight * cpx}px`;
    el.style.left = `${newLeft}px`;
    el.style.top = `${newTop}px`;

    // Update state temporarily
    block.width = newWidth;
    block.height = newHeight;
    block.size = Math.max(newWidth, newHeight);
    block.left = newLeft;
    block.top = newTop;


    // Update label if not custom
    if (!block.customLabel) {
      const labelEl = el.querySelector('.label');
      if (labelEl) {
        labelEl.textContent = `${newWidth}×${newHeight}`;
      }
    }
  };

  const onEnd = (endEvent) => {
    if (endEvent) {
      endEvent.preventDefault();
      endEvent.stopPropagation();
    }

    el.classList.remove('is-resizing');
    delete el.dataset.resizeEdge;
    delete state._isResizing;

    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onEnd);

    // Finalize with updateBlockSize
    updateBlockSize(el, block.width, block.height);
  };

  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onEnd, { once: true, passive: false });
}

/**
 * Get cursor style for resize edge
 * @param {string} edge - Edge identifier ('top', 'right', 'bottom', 'left')
 * @returns {string} - CSS cursor value
 */
function getCursorForEdge(edge) {
  // Block is rotated 45deg, so use diagonal cursors
  const cursorMap = {
    'top': 'nesw-resize',      // Top edge (visually top-left) → NW-SE diagonal
    'right': 'nwse-resize',    // Right edge (visually top-right) → NE-SW diagonal
    'bottom': 'nesw-resize',   // Bottom edge (visually bottom-right) → NW-SE diagonal
    'left': 'nwse-resize'      // Left edge (visually bottom-left) → NE-SW diagonal
  };
  return cursorMap[edge] || 'move';
}

/**
 * Make an existing block movable (drag to reposition/delete).
 * @param {HTMLElement} el
 */
export function makeMovable(el) {
  // Add hover effect for custom blocks to show resize cursor
  const block = state.blocks.find(b => b.el === el);
  if (block && block.kind === 'custom') {
    el.addEventListener('pointermove', (e) => {
      if (el.dataset.editing === '1') return;
      const edge = getResizeEdge(el, e);
      if (edge) {
        el.style.cursor = getCursorForEdge(edge);
      } else {
        el.style.cursor = 'move';
      }
    });

    el.addEventListener('pointerleave', () => {
      el.style.cursor = 'move';
    });
  }

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (el.dataset.editing === '1') return; // while editing city label
    if (state._isResizing) return; // Don't start anything if already resizing

    // Check if clicking on edge for custom blocks
    const block = state.blocks.find(b => b.el === el);
    if (block && block.kind === 'custom') {
      const resizeEdge = getResizeEdge(el, e);
      if (resizeEdge) {
        e.stopPropagation();
        e.preventDefault();
        startResize(el, e, resizeEdge);
        return; // IMPORTANT: stop here, don't setup move listeners
      }
    }

    const isTouch = e.pointerType === 'touch';
    const sx = e.clientX;
    const sy = e.clientY;
    let timer = null;

    const startMove = () => {
      if (state.panning && state.panning.moved) return;
      if (state._isResizing) return; // Don't start move if resizing
      lockPaletteScroll(true);

      hapticTap(15);
      window.__suppressContextMenu = true;
      e.preventDefault();

      safeSetPointerCapture(el, e.pointerId);

      const size = parseInt(el.dataset.size, 10);
      const kind = el.dataset.kind;

      // Get width and height from state for custom blocks
      const block = state.blocks.find(b => b.el === el);
      const width = block?.width;
      const height = block?.height;
      const w = width || size;
      const h = height || size;

      const ghost = document.createElement('div');
      ghost.className = 'ghost';
      ghost.style.width = `${w * cellPx()}px`;
      ghost.style.height = `${h * cellPx()}px`;

      const gl = document.createElement('div');
      gl.className = 'ghost-label';
      const labelEl = el.querySelector('.label');
      gl.textContent = (labelEl?.textContent || '').trim() || (width && height ? `${width}×${height}` : `${size}×${size}`);
      ghost.appendChild(gl);

      document.body.appendChild(ghost);

      // lifted visual on original
      el.classList.add('is-lifted');

      state.drag = { mode: 'move', size, kind, width, height, node: el, ghost, pointerId: e.pointerId };
      updateGhost(e.clientX, e.clientY, w * cellPx(), h * cellPx());

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp, { once: true });
      window.addEventListener('pointercancel', () => cleanupDrag(), { once: true });
    };

    if (isTouch) {
      window.__suppressContextMenu = true;

      const onMoveCheck = (ev) => {
        const dx = Math.abs(ev.clientX - sx);
        const dy = Math.abs(ev.clientY - sy);
        if (dx > MOVE_TOL_MOVE || dy > MOVE_TOL_MOVE) {
          if (timer) clearTimeout(timer);
          el.removeEventListener('pointermove', onMoveCheck);
          // treat as viewport pan/scroll
          window.__suppressContextMenu = false;
        }
      };

      timer = setTimeout(startMove, LONG_PRESS_MS);
      el.addEventListener('pointermove', onMoveCheck);
      el.addEventListener(
        'pointerup',
        () => {
          if (timer) clearTimeout(timer);
          el.removeEventListener('pointermove', onMoveCheck);
          // short tap ends here (no move)
          window.__suppressContextMenu = false;
        },
        { once: true },
      );
    } else {
      // mouse: immediate
      startMove();
    }
  });
}
