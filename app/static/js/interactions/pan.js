// File: app/static/js/interactions/pan.js
/**
 * Viewport panning (mouse middle-button or single-finger touch).
 *
 * Behavior
 * - Lazy start: do not capture/preventDefault until the pointer moves beyond SLOP.
 * - Once started, capture the pointer and preventDefault to keep smooth panning.
 * - Calls `expand()` while panning to allow auto-grow near edges.
 *
 * Notes
 * - Respects block long-press: if another gesture (drag) begins, pending pan is canceled.
 * - Middle-click default behavior (auto-scroll icon) is suppressed.
 */

import { state } from '../state.js';
import { viewport, rot } from '../dom.js';

const PAN_SLOP_PX = 6; // pixels required before we "commit" to panning

/**
 * Set up panning handlers.
 * @param {() => void} expand - Called during pan to auto-expand the world if enabled.
 */
export function setupPan(expand) {
  // ────────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ────────────────────────────────────────────────────────────────────────────

  function startPan(e) {
    // Commit to panning: capture pointer and switch cursor.
    viewport.setPointerCapture?.(e.pointerId);
    state.panning.moved = true;
    viewport.classList.add('panning');

    // Switch move listener from passive "probe" to active pan handler.
    window.removeEventListener('pointermove', onPointerMovePassive);
    window.addEventListener('pointermove', onPanMoveActive, { passive: false });
  }

  function endPan() {
    viewport.classList.remove('panning');
    window.removeEventListener('pointermove', onPointerMovePassive);
    window.removeEventListener('pointermove', onPanMoveActive);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    state.panning = null;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Event handlers
  // ────────────────────────────────────────────────────────────────────────────

  // 1) Before pan is committed: observe movement to decide if we start panning.
  function onPointerMovePassive(e) {
    if (!state.panning || e.pointerId !== state.panning.pointerId) return;

    // If a different gesture (e.g., long-press drag) started, abort pending panning.
    if (state.drag) {
      endPan();
      return;
    }

    const dx = e.clientX - state.panning.startX;
    const dy = e.clientY - state.panning.startY;
    if (Math.abs(dx) < PAN_SLOP_PX && Math.abs(dy) < PAN_SLOP_PX) return;

    // Crossed slop → begin real pan.
    startPan(e);

    // Apply the first movement immediately for responsiveness.
    doPanScroll(dx, dy);
  }

  // 2) After pan is committed: perform scrolling, keep pivoting around cursor.
  function onPanMoveActive(e) {
    if (!state.panning || e.pointerId !== state.panning.pointerId) return;
    e.preventDefault();
    const dx = e.clientX - state.panning.startX;
    const dy = e.clientY - state.panning.startY;
    doPanScroll(dx, dy);
  }

  function doPanScroll(dx, dy) {
    viewport.scrollLeft = state.panning.startLeft - dx;
    viewport.scrollTop = state.panning.startTop - dy;
    expand();
  }

  function onPointerUp(e) {
    if (!state.panning || e.pointerId !== state.panning.pointerId) {
      endPan();
      return;
    }
    // If we never crossed the slop, we never actually started panning.
    // In that case, simply clean up without side effects.
    endPan();
  }

  function onPointerCancel(e) {
    if (!state.panning || e.pointerId !== state.panning.pointerId) {
      endPan();
      return;
    }
    endPan();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Binding
  // ────────────────────────────────────────────────────────────────────────────

  function bindPanStart(targetEl) {
    targetEl.addEventListener('pointerdown', (e) => {
      // Desktop: middle button; Mobile: one-finger touch.
      const isMiddleMouse = e.pointerType === 'mouse' && e.button === 1;
      const isSingleTouch = e.pointerType === 'touch' && e.button === 0;
      if (!isMiddleMouse && !isSingleTouch) return;

      // Do not capture or preventDefault yet; we might long-press for drag.
      state.panning = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startLeft: viewport.scrollLeft,
        startTop: viewport.scrollTop,
        moved: false,
      };

      // Probe movement in passive mode; switch to active if we cross the slop.
      window.addEventListener('pointermove', onPointerMovePassive, { passive: true });
      window.addEventListener('pointerup', onPointerUp, { once: true });
      window.addEventListener('pointercancel', onPointerCancel, { once: true });
    });
  }

  bindPanStart(viewport);
  bindPanStart(rot);

  // Prevent default browser auto-scroll icon on middle-click.
  viewport.addEventListener('auxclick', (e) => {
    if (e.button === 1) e.preventDefault();
  });
}
