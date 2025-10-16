// File: app/static/js/interactions/pan.js
/**
 * Middle-button panning for the viewport.
 * - Press and hold mouse wheel (button=1) to pan.
 * - Uses pointer capture to keep receiving move events.
 * - Calls `expand()` while panning to auto-grow the world if enabled.
 */

import { state } from '../state.js';
import { viewport } from '../dom.js';

/**
 * Wire up panning behavior.
 * @param {() => void} expand Callback to attempt auto-expansion when near edges
 */
export function setupPan(expand) {
  viewport.addEventListener('pointerdown', (e) => {
    if (e.button !== 1) return; // middle button only
    e.preventDefault();

    viewport.setPointerCapture?.(e.pointerId);
    state.panning = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: viewport.scrollLeft,
      startTop: viewport.scrollTop,
    };

    viewport.classList.add('panning');
    window.addEventListener('pointermove', onPanMove, { passive: true });
    window.addEventListener('pointerup', onPanEnd, { once: true });
    window.addEventListener('pointercancel', onPanEnd, { once: true });
  });

  function onPanMove(e) {
    if (!state.panning || e.pointerId !== state.panning.pointerId) return;

    const dx = e.clientX - state.panning.startX;
    const dy = e.clientY - state.panning.startY;

    viewport.scrollLeft = state.panning.startLeft - dx;
    viewport.scrollTop = state.panning.startTop - dy;

    // Try to grow the world when approaching edges
    expand();
  }

  function onPanEnd(e) {
    if (!state.panning || e.pointerId !== state.panning.pointerId) {
      state.panning = null;
      viewport.classList.remove('panning');
      return;
    }
    state.panning = null;
    viewport.classList.remove('panning');
    window.removeEventListener('pointermove', onPanMove);
  }

  // Prevent default middle-click behavior (auto-scroll icons, etc.)
  viewport.addEventListener('auxclick', (e) => {
    if (e.button === 1) e.preventDefault();
  });
}
