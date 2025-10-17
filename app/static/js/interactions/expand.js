// File: app/static/js/interactions/expand.js
/**
 * Auto-expand the world when the user scrolls near the right/bottom edges.
 * - Expands by EXPAND_CELLS (in cell units) per axis when within EXPAND_MARGIN px.
 * - Respects the runtime toggle: state.AUTO_EXPAND
 */

import { state, cellPx, EXPAND_CELLS, EXPAND_MARGIN } from '../state.js';
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

  if (!nearRight && !nearBottom) return;

  // Current dimensions (in cells)
  const c = cellPx();
  const curCols = Math.ceil(world.clientWidth / c);
  const curRows = Math.ceil(world.clientHeight / c);

  // Compute new dimensions in a single pass to avoid overwriting one axis
  const newCols = curCols + (nearRight ? EXPAND_CELLS : 0);
  const newRows = curRows + (nearBottom ? EXPAND_CELLS : 0);

  // If nothing actually changes, bail out
  if (newCols === curCols && newRows === curRows) return;

  setWorldSizeCells(newCols, newRows);

  // Repaint overlays based on the enlarged world
  renderUserTiles();
  recomputePaint();
}
