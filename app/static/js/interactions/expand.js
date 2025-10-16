// File: app/static/js/interactions/expand.js
/**
 * Auto-expand the world when the user scrolls near the right/bottom edges.
 * - Expands by EXPAND_CELLS (in cell units) per axis when within EXPAND_MARGIN px.
 * - Respects the runtime toggle: state.AUTO_EXPAND
 */

import { state, cell, EXPAND_CELLS, EXPAND_MARGIN } from '../state.js';
import { viewport, world } from '../dom.js';
import { renderUserTiles, recomputePaint, setWorldSizeCells } from '../render.js';

/**
 * Check scroll position and grow the world if needed.
 * Call this from pan/zoom handlers (throttled/debounced upstream).
 */
export function expand() {
  if (!state.AUTO_EXPAND) return;

  // Near-edge detection (within EXPAND_MARGIN px of the scrollable bounds)
  const nearRight =
    viewport.scrollLeft + viewport.clientWidth > viewport.scrollWidth - EXPAND_MARGIN;
  const nearBottom =
    viewport.scrollTop + viewport.clientHeight > viewport.scrollHeight - EXPAND_MARGIN;

  let grew = false;

  // Current dimensions (in cells)
  const curCols = Math.round(world.clientWidth / cell);
  const curRows = Math.round(world.clientHeight / cell);

  if (nearRight) {
    setWorldSizeCells(curCols + EXPAND_CELLS, curRows);
    grew = true;
  }
  if (nearBottom) {
    setWorldSizeCells(curCols, curRows + EXPAND_CELLS);
    grew = true;
  }

  if (grew) {
    // Repaint overlays based on the enlarged world
    renderUserTiles();
    recomputePaint();
  }
}
