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
import { PAINTER_KINDS } from '../painter.js';
import { showPreview, clearPreview } from '../render.js';
import { createBlock, updateBlockPosition, deleteBlock } from '../blocks.js';
import { t } from '../i18n.js';

/* ---------------------------------------------
 * Constants
 * ------------------------------------------- */

const EDGE_MARGIN = 72; // px from each edge to begin auto-scroll
const BOTTOM_EDGE_MARGIN = 24; // px from bottom to begin auto-scroll (narrower near trash)
const MAX_SPEED = 500; // px/sec at the very edge
const NEW_SCROLL_GRACE_MS = 180; // suppress edge scroll right after a new-drag starts
const NEW_EDGE_DWELL_MS = 120; // require dwelling near an edge before scrolling (new-drag only)
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
  const { size, kind } = state.drag;
  const cpx = cellPx();

  const left = x - (size * cpx) / 2;
  const top = y - (size * cpx) / 2;
  const snapped = snapLocal(left, top, size);

  snapEl.style.display = 'block';
  snapEl.style.left = `${snapped.left}px`;
  snapEl.style.top = `${snapped.top}px`;
  snapEl.style.width = `${size * cpx}px`;
  snapEl.style.height = `${size * cpx}px`;

  if (PAINTER_KINDS.has(kind)) {
    showPreview(kind, snapped.left, snapped.top, size, true);
  } else {
    outlinesPreviewLayer.innerHTML = '';
    previewLayer.innerHTML = '';
  }

  if (state.drag.ghost) {
    updateGhost(clientX, clientY, size * cpx);
  }
}

/** Position the floating ghost under the cursor (screen coordinates). */
function updateGhost(clientX, clientY, px) {
  if (!state.drag?.ghost) return;
  state.drag.ghost.style.left = `${clientX - px / 2}px`;
  state.drag.ghost.style.top = `${clientY - px / 2}px`;
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

  const droppingInTrash = inTrash(e.clientX, e.clientY);

  if (state.drag.mode === 'new') {
    removeGhost();

    if (!droppingInTrash) {
      const { x, y } = clientToLocalRot(e.clientX, e.clientY);
      const { size, kind } = state.drag;
      const cpx = cellPx();
      const left = x - (size * cpx) / 2;
      const top = y - (size * cpx) / 2;
      const snapped = snapLocal(left, top, size);

      const el = createBlock(kind, size, snapped.left, snapped.top);
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
      const size = state.drag.size;
      const cpx = cellPx();
      const left = x - (size * cpx) / 2;
      const top = y - (size * cpx) / 2;
      const snapped = snapLocal(left, top, size);

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

      const isTouch = e.pointerType === 'touch';
      const startX = e.clientX;
      const startY = e.clientY;
      let timer = null;

      e.preventDefault();
      safeSetPointerCapture(item, e.pointerId);

      const startDrag = () => {
        hapticTap(15);
        window.__suppressContextMenu = true;

        if (palette?.dataset?.scrolling === '1') delete palette.dataset.scrolling;

        const size = parseInt(item.dataset.size, 10);
        const kind = item.dataset.kind;
        const px = size * cellPx();

        const ghost = document.createElement('div');
        ghost.className = 'ghost';
        ghost.style.width = `${px}px`;
        ghost.style.height = `${px}px`;

        const gl = document.createElement('div');
        gl.className = 'ghost-label';
        gl.textContent =
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
        ghost.appendChild(gl);

        document.body.appendChild(ghost);

        state.drag = {
          mode: 'new',
          size,
          kind,
          ghost,
          pointerId: e.pointerId,
          startedAt: performance.now(),
          edgeKey: null,
          edgeEnterAt: 0,
        };
        updateGhost(e.clientX, e.clientY, px);

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp, { once: true });
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
}

/**
 * Make an existing block movable (drag to reposition/delete).
 * @param {HTMLElement} el
 */
export function makeMovable(el) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (el.dataset.editing === '1') return; // while editing city label

    const isTouch = e.pointerType === 'touch';
    const sx = e.clientX;
    const sy = e.clientY;
    let timer = null;

    const startMove = () => {
      if (state.panning && state.panning.moved) return;

      hapticTap(15);
      window.__suppressContextMenu = true;
      e.preventDefault();

      safeSetPointerCapture(el, e.pointerId);

      const size = parseInt(el.dataset.size, 10);
      const kind = el.dataset.kind;
      const px = size * cellPx();

      const ghost = document.createElement('div');
      ghost.className = 'ghost';
      ghost.style.width = `${px}px`;
      ghost.style.height = `${px}px`;

      const gl = document.createElement('div');
      gl.className = 'ghost-label';
      const labelEl = el.querySelector('.label');
      gl.textContent = (labelEl?.textContent || '').trim() || `${size}×${size}`;
      ghost.appendChild(gl);

      document.body.appendChild(ghost);

      // lifted visual on original
      el.classList.add('is-lifted');

      state.drag = { mode: 'move', size, kind, node: el, ghost, pointerId: e.pointerId };
      updateGhost(e.clientX, e.clientY, px);

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp, { once: true });
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
