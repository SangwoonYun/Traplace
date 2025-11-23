// File: app/static/js/interactions/pan.js
/**
 * Middle-button (and one-finger touch) panning for the viewport.
 * - Press and hold mouse wheel (button=1) to pan.
 * - Uses pointer capture after pan actually starts.
 * - Calls `expand()` while panning to auto-grow the world if enabled.
 */

import { state } from '../state.js';
import { viewport, rot } from '../dom.js';

/* ---------------------------------------------
 * Constants
 * ------------------------------------------- */

const PAN_SLOP = 6; // px: start panning after moving beyond this threshold

/* ---------------------------------------------
 * Utilities
 * ------------------------------------------- */

/** Safely call setPointerCapture; returns true if captured, else false. */
function safeSetPointerCapture(target, pointerId) {
  if (!target || typeof target.setPointerCapture !== 'function') return false;
  try {
    target.setPointerCapture(pointerId);
    return true;
  } catch {
    // Pointer could already be inactive; proceed without capture.
    return false;
  }
}

/* ---------------------------------------------
 * Main
 * ------------------------------------------- */

/**
 * Wire up panning behavior.
 * @param {() => void} expand Callback to attempt auto-expansion when near edges
 */
export function setupPan(expand) {
  /**
   * Start panning (after slop is exceeded).
   * Capture pointer and set visual state.
   * @param {PointerEvent} e
   */
  function beginPan(e) {
    e.preventDefault();
    safeSetPointerCapture(viewport, e.pointerId);
    state.panning.moved = true; // confirmed
    viewport.classList.add('panning');
    // Cancel any long-press interactions that may be arming elsewhere.
    window.__cancelAllLongPress?.();
  }

  /** Remove pending listeners registered for the current gesture. */
  function clearPanListeners() {
    window.removeEventListener('pointermove', onPointerMovePassive);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
  }

  /**
   * Passive move handler before panning actually starts.
   * Switches to active panning when the slop is exceeded.
   * @param {PointerEvent} e
   */
  function onPointerMovePassive(e) {
    if (!state.panning || e.pointerId !== state.panning.pointerId) return;

    const dx = e.clientX - state.panning.startX;
    const dy = e.clientY - state.panning.startY;

    // If dragging (long-press) has taken over, abort pan candidate.
    if (state.drag) {
      state.panning = null;
      clearPanListeners();
      return;
    }

    if (Math.abs(dx) < PAN_SLOP && Math.abs(dy) < PAN_SLOP) return;

    // Slop exceeded -> start real pan.
    beginPan(e);

    // Upgrade to active pan move handler.
    window.removeEventListener('pointermove', onPointerMovePassive);
    window.addEventListener('pointermove', onPanMoveActive, { passive: false });
  }

  /**
   * Active panning move handler.
   * @param {PointerEvent} e
   */
  function onPanMoveActive(e) {
    if (!state.panning || e.pointerId !== state.panning.pointerId) return;

    e.preventDefault();

    const dx = e.clientX - state.panning.startX;
    const dy = e.clientY - state.panning.startY;

    // Throttle updates using requestAnimationFrame for smoother performance
    if (state.panning.rafId) return;

    state.panning.rafId = requestAnimationFrame(() => {
      if (!state.panning) return; // Safety check

      viewport.scrollLeft = state.panning.startLeft - dx;
      viewport.scrollTop = state.panning.startTop - dy;
      state.panning.rafId = null;

      expand();
    });
  }

  /**
   * Pointer up handler (end of gesture).
   * - If pan never started, do nothing.
   * - If pan was active, clear visuals and listeners.
   * @param {PointerEvent} e
   */
  function onPointerUp(e) {
    if (!state.panning || e.pointerId !== state.panning.pointerId) {
      if (state.panning?.rafId) cancelAnimationFrame(state.panning.rafId);
      state.panning = null;
      clearPanListeners();
      return;
    }

    if (!state.panning.moved) {
      // Pan not started -> let other gestures (click/long-press) proceed.
      if (state.panning?.rafId) cancelAnimationFrame(state.panning.rafId);
      state.panning = null;
      clearPanListeners();
      return;
    }

    viewport.classList.remove('panning');
    if (state.panning?.rafId) cancelAnimationFrame(state.panning.rafId);
    state.panning = null;

    window.removeEventListener('pointermove', onPanMoveActive);
    clearPanListeners();
  }

  /**
   * Pointer cancel handler: always end pan cleanly.
   * @param {PointerEvent} _e
   */
  function onPointerCancel(_e) {
    viewport.classList.remove('panning');
    if (state.panning?.rafId) cancelAnimationFrame(state.panning.rafId);
    state.panning = null;

    window.removeEventListener('pointermove', onPanMoveActive);
    clearPanListeners();
  }

  /**
   * Bind a pointerdown entry for starting a pan candidate.
   * - Desktop: middle-button mouse.
   * - Touch: one-finger (button 0 + pointerType 'touch').
   * @param {HTMLElement} targetEl
   */
  const bind = (targetEl) =>
    targetEl.addEventListener('pointerdown', (e) => {
      const isMiddleMouse = e.button === 1 && e.pointerType === 'mouse';
      const isTouchOneFinger = e.button === 0 && e.pointerType === 'touch';
      if (!(isMiddleMouse || isTouchOneFinger)) return;

      // Do not preventDefault/capture here; we may need to allow long-press elsewhere.
      state.panning = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startLeft: viewport.scrollLeft,
        startTop: viewport.scrollTop,
        moved: false,
      };

      // Defer starting until the slop is exceeded.
      window.addEventListener('pointermove', onPointerMovePassive, { passive: false });
      window.addEventListener('pointerup', onPointerUp, { once: true });
      window.addEventListener('pointercancel', onPointerCancel, { once: true });
    });

  bind(viewport);
  bind(rot);

  // Prevent default middle-click behavior (auto-scroll icons, etc.)
  viewport.addEventListener('auxclick', (e) => {
    if (e.button === 1) e.preventDefault();
  });

  // Global cancel hook
  window.__cancelPan = () => {
    viewport.classList.remove('panning');
    if (state.panning?.rafId) cancelAnimationFrame(state.panning.rafId);
    state.panning = null;
    window.removeEventListener('pointermove', onPointerMovePassive);
    window.removeEventListener('pointermove', onPanMoveActive);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
  };

  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'touch') {
        window.__cancelPan?.();
      }
    },
    { capture: true },
  );
}
