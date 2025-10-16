// File: app/static/js/interactions/drag.js
/**
 * Drag & drop interactions
 * - Drag from the palette to create new blocks (snap + painter preview + ghost)
 * - Drag existing blocks to move or delete (via trash zone)
 * - Edge auto-scroll while dragging near viewport edges (desktop & mobile)
 * - Touch long-press to “pick up” (prevents accidental scroll taps)
 */

import { cell, state } from '../state.js';
import { palette, previewLayer, outlinesPreviewLayer, snapEl, trash, viewport } from '../dom.js';
import { clientToLocalRot, snapLocal } from '../transform.js';
import { PAINTER_KINDS } from '../painter.js';
import { clearPreview, showPreview } from '../render.js';
import { createBlock, deleteBlock, updateBlockPosition } from '../blocks.js';
import { t } from '../i18n.js';

/* ──────────────────────────────────────────────────────────────────────────────
 * Constants
 * ──────────────────────────────────────────────────────────────────────────── */
const LONG_PRESS_MS = 250; // touch long-press threshold
const MOVE_TOL = 8; // touch slop (px) before we treat as scroll/pan
const EDGE_MARGIN = 72; // px from each edge to begin auto-scroll
const MAX_SPEED = 500; // px/sec at the very edge

/* ──────────────────────────────────────────────────────────────────────────────
 * Utilities
 * ──────────────────────────────────────────────────────────────────────────── */
const getCellPx = () =>
  parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell'), 10) || 48;

/** Position the floating ghost under the cursor (screen coordinates). */
function updateGhost(clientX, clientY, px) {
  if (!state.drag?.ghost) return;
  state.drag.ghost.style.left = `${clientX - px / 2}px`;
  state.drag.ghost.style.top = `${clientY - px / 2}px`;
}

/** True if the pointer is currently inside the trash zone. */
function inTrash(clientX, clientY) {
  if (!trash) return false;
  const r = trash.getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

/** Small haptic “tick” for touch long-press pick-up (no-op if unsupported). */
let lastVibeAt = 0;
function hapticTap(duration = 12) {
  try {
    const now = Date.now();
    if (now - lastVibeAt < 120) return; // throttle a bit
    if (navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate(duration);
      lastVibeAt = now;
    }
  } catch {
    /* ignore */
  }
}

/** Read rects of overlay UI that may occlude the draggable area. */
function getOverlayRects() {
  const vp = viewport.getBoundingClientRect();
  const toolbarEl = document.getElementById('toolbar'); // fixed top toolbar
  const sidebarEl = document.querySelector('.sidebar'); // desktop left sidebar
  const paletteEl = document.getElementById('palette'); // mobile top palette bar
  const tb = toolbarEl ? toolbarEl.getBoundingClientRect() : null;
  const sb = sidebarEl ? sidebarEl.getBoundingClientRect() : null;
  const pl = paletteEl ? paletteEl.getBoundingClientRect() : null;
  const tr = trash ? trash.getBoundingClientRect() : null;
  return { vp, tb, sb, pl, tr };
}

/**
 * Compute the effective draggable viewport (for edge auto-scroll):
 *  - top is pushed down by toolbar/palette if they overlap the viewport
 *  - left is pushed right by a “true” left sidebar (desktop)
 *  - bottom is lifted to the trash zone top (don’t scroll into the bin)
 *  - right stays the same
 */
function computeEffectiveRect() {
  const { vp, tb, sb, pl, tr } = getOverlayRects();
  let left = vp.left;
  let top = vp.top;
  const right = vp.right;
  let bottom = vp.bottom;

  const intersectsHoriz = (a, b) => a.left < b.right && a.right > b.left;

  // Top overlays
  if (tb && tb.bottom > top && intersectsHoriz(tb, vp)) top = Math.max(top, tb.bottom);
  if (pl && pl.bottom > top && intersectsHoriz(pl, vp)) top = Math.max(top, pl.bottom);

  // Left sidebar (desktop)
  if (sb && sb.top < bottom && sb.bottom > top) {
    const vpW = vp.right - vp.left;
    const vpH = vp.bottom - vp.top;
    const sbW = sb.right - sb.left;
    const sbH = sb.bottom - sb.top;
    const looksLikeLeftSidebar = sb.left <= vp.left + 8 && sbW < vpW * 0.6 && sbH > vpH * 0.5;
    if (looksLikeLeftSidebar) left = Math.max(left, sb.right);
  }

  // Bottom: trash zone
  if (tr && tr.top < bottom && intersectsHoriz(tr, vp)) bottom = Math.min(bottom, tr.top);

  // Safety
  if (left >= right) left = right - 1;
  if (top >= bottom) top = bottom - 1;

  return { left, top, right, bottom };
}

/** Compute edge auto-scroll velocity (px/sec) from pointer coordinates. */
function computeEdgeVelocity(clientX, clientY) {
  const vp = computeEffectiveRect();
  const ease = (d) => Math.min(1, Math.max(0, d / EDGE_MARGIN)); // 0..1
  let vx = 0;
  let vy = 0;

  if (clientX < vp.left + EDGE_MARGIN) {
    const f = 1 - ease(clientX - vp.left);
    vx = -MAX_SPEED * f;
  } else if (clientX > vp.right - EDGE_MARGIN) {
    const f = 1 - ease(vp.right - clientX);
    vx = MAX_SPEED * f;
  }

  if (clientY < vp.top + EDGE_MARGIN) {
    const f = 1 - ease(clientY - vp.top);
    vy = -MAX_SPEED * f;
  } else if (clientY > vp.bottom - EDGE_MARGIN) {
    const f = 1 - ease(vp.bottom - clientY);
    vy = MAX_SPEED * f;
  }

  return { vx, vy };
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Drag visuals update (shared by pointermove & edge-scroll tick)
 * ──────────────────────────────────────────────────────────────────────────── */
function updateDragAt(clientX, clientY) {
  if (!state.drag) return;
  state.drag.lastClientX = clientX;
  state.drag.lastClientY = clientY;

  const { x, y } = clientToLocalRot(clientX, clientY);
  const { size, kind } = state.drag;
  const cellPx = getCellPx();
  const left = x - (size * cellPx) / 2;
  const top = y - (size * cellPx) / 2;
  const snapped = snapLocal(left, top, size);

  // Snap outline
  snapEl.style.display = 'block';
  snapEl.style.left = `${snapped.left}px`;
  snapEl.style.top = `${snapped.top}px`;
  snapEl.style.width = `${size * cellPx}px`;
  snapEl.style.height = `${size * cellPx}px`;

  // Painter preview
  if (PAINTER_KINDS.has(kind)) {
    showPreview(kind, snapped.left, snapped.top, size, true);
  } else {
    outlinesPreviewLayer.innerHTML = '';
    previewLayer.innerHTML = '';
  }

  // Ghost follows
  if (state.drag.ghost) updateGhost(clientX, clientY, size * cellPx);
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Edge auto-scroll loop
 * ──────────────────────────────────────────────────────────────────────────── */
function startEdgeAutoScroll() {
  if (!state.drag) return;
  if (state.drag.edgeScroll?.rafId) return;

  const es = (state.drag.edgeScroll = { vx: 0, vy: 0, rafId: 0, lastTs: 0 });

  const tick = (ts) => {
    if (!state.drag || !state.drag.edgeScroll) return;
    if (!es.lastTs) es.lastTs = ts;
    const dt = Math.min(48, ts - es.lastTs); // clamp to avoid jumps
    es.lastTs = ts;

    if (es.vx !== 0 || es.vy !== 0) {
      viewport.scrollLeft += (es.vx * dt) / 1000;
      viewport.scrollTop += (es.vy * dt) / 1000;

      // keep visuals in sync while pointer stays near edge
      if (state.drag.lastClientX != null) {
        updateDragAt(state.drag.lastClientX, state.drag.lastClientY);
      }
      es.rafId = requestAnimationFrame(tick);
    } else {
      es.rafId = 0;
    }
  };

  es.rafId = requestAnimationFrame(tick);
}

function stopEdgeAutoScroll() {
  if (state.drag?.edgeScroll?.rafId) cancelAnimationFrame(state.drag.edgeScroll.rafId);
  if (state.drag) state.drag.edgeScroll = null;
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Pointer handlers (shared for new & move)
 * ──────────────────────────────────────────────────────────────────────────── */
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
    state.drag.ghost?.remove();
    if (!droppingInTrash) {
      const { x, y } = clientToLocalRot(e.clientX, e.clientY);
      const { size, kind } = state.drag;
      const left = x - (size * cell) / 2;
      const top = y - (size * cell) / 2;
      const snapped = snapLocal(left, top, size);
      const el = createBlock(kind, size, snapped.left, snapped.top);
      // Make the newly created block movable
      makeMovable(el);
    }
    cleanupDrag();
    return;
  }

  if (state.drag.mode === 'move' && state.drag.node) {
    if (droppingInTrash) {
      deleteBlock(state.drag.node);
    } else {
      const { x, y } = clientToLocalRot(e.clientX, e.clientY);
      const size = state.drag.size;
      const left = x - (size * cell) / 2;
      const top = y - (size * cell) / 2;
      const snapped = snapLocal(left, top, size);
      updateBlockPosition(state.drag.node, snapped.left, snapped.top);
    }
  }

  cleanupDrag();
}

/** Tear down drag visuals/state and listeners. */
function cleanupDrag() {
  snapEl.style.display = 'none';
  clearPreview();
  trash?.classList.remove('active');
  stopEdgeAutoScroll();

  if (state.drag?.node) state.drag.node.classList.remove('is-lifted');
  state.drag?.ghost?.remove();

  window.removeEventListener('pointermove', onPointerMove);
  state.drag = null;
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Public API
 * ──────────────────────────────────────────────────────────────────────────── */
/**
 * Enable dragging from the palette to create new blocks.
 * - Mouse: pick up immediately.
 * - Touch: long-press to pick up (with haptic).
 */
export function setupPaletteDrag() {
  if (!palette) return;

  palette.querySelectorAll('.palette-item').forEach((item) => {
    item.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;

      const isTouch = e.pointerType === 'touch';
      const sx = e.clientX;
      const sy = e.clientY;
      let timer = null;
      let active = true;

      // We capture only after confirming long-press or for mouse immediate pickup.
      const startDrag = () => {
        if (!active) return;
        hapticTap(15);
        e.preventDefault();
        item.setPointerCapture?.(e.pointerId);
        if (!isTouch) {
          try { item.setPointerCapture?.(e.pointerId); } catch {}
          e.preventDefault();
        }

        const size = parseInt(item.dataset.size, 10);
        const kind = item.dataset.kind;
        const cellPx = getCellPx();
        const px = size * cellPx;

        const ghost = document.createElement('div');
        ghost.className = 'ghost';
        ghost.style.width = `${px}px`;
        ghost.style.height = `${px}px`;

        // Upright label inside the diamond ghost
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

        state.drag = { mode: 'new', size, kind, ghost, pointerId: e.pointerId };
        updateGhost(e.clientX, e.clientY, px);

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp, { once: true });
      };

      if (isTouch) {
        // Long-press to avoid accidental pick while horizontally scrolling the palette
        let canceledByMove = false;
        timer = setTimeout(startDrag, LONG_PRESS_MS);

        const onMoveCheck = (ev) => {
          const dx = Math.abs(ev.clientX - sx);
          const dy = Math.abs(ev.clientY - sy);
          if (dx > MOVE_TOL || dy > MOVE_TOL) {
            // treat as palette scroll; cancel pickup
            canceledByMove = true;
            clearTimeout(timer);
            item.removeEventListener('pointermove', onMoveCheck);
          }
        };

        item.addEventListener('pointermove', onMoveCheck);
        item.addEventListener(
          'pointerup',
          () => {
            active = false;
            clearTimeout(timer);
            item.removeEventListener('pointermove', onMoveCheck);
            if (!canceledByMove) {
              // short tap: do nothing (no pickup)
            }
          },
          { once: true },
        );
        item.addEventListener(
          'pointercancel',
          () => {
            active = false;
            clearTimeout(timer);
            item.removeEventListener('pointermove', onMoveCheck);
          },
          { once: true },
        );
      } else {
        // Mouse → immediate pickup
        startDrag();
      }
    });
  });
}

/**
 * Make an existing block movable (drag to reposition/delete).
 * - Mouse: pick up immediately.
 * - Touch: long-press to pick up (with haptic).
 * @param {HTMLElement} el
 */
export function makeMovable(el) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (el.dataset.editing === '1') return; // blocked while editing city label

    const isTouch = e.pointerType === 'touch';
    const sx = e.clientX;
    const sy = e.clientY;
    let timer = null;
    let active = true;

    const startMove = () => {
      if (!active) return;
      // If panning already started, don't steal the gesture
      if (state.panning && state.panning.moved) return;

      hapticTap(15);
      if (!isTouch) {
        try { el.setPointerCapture?.(e.pointerId); } catch {}
        e.preventDefault();
      }

      const size = parseInt(el.dataset.size, 10);
      const kind = el.dataset.kind;
      const cellPx = getCellPx();
      const px = size * cellPx;

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

      el.classList.add('is-lifted');

      state.drag = { mode: 'move', size, kind, node: el, ghost, pointerId: e.pointerId };
      updateGhost(e.clientX, e.clientY, px);

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp, { once: true });
    };

    if (isTouch) {
      timer = setTimeout(startMove, LONG_PRESS_MS);

      const onMoveCheck = (ev) => {
        const dx = Math.abs(ev.clientX - sx);
        const dy = Math.abs(ev.clientY - sy);
        if (dx > MOVE_TOL || dy > MOVE_TOL) {
          // treat as viewport pan/scroll -> cancel pickup
          clearTimeout(timer);
          el.removeEventListener('pointermove', onMoveCheck);
        }
      };

      el.addEventListener('pointermove', onMoveCheck);
      el.addEventListener(
        'pointerup',
        () => {
          active = false;
          clearTimeout(timer);
          el.removeEventListener('pointermove', onMoveCheck);
          // short tap → no pickup
        },
        { once: true },
      );
      el.addEventListener(
        'pointercancel',
        () => {
          active = false;
          clearTimeout(timer);
          el.removeEventListener('pointermove', onMoveCheck);
        },
        { once: true },
      );
    } else {
      // Mouse → immediate pickup
      startMove();
    }
  });
}
