// File: app/static/js/interactions/tileToggle.js
/**
 * Handles left-click toggling of red user-painted tiles.
 * - Ignores clicks on blocks or during active drag.
 * - Updates visual layer and persists to URL/history.
 */

import { state } from '../state.js';
import { rot } from '../dom.js';
import { clientToLocalRot, pointToCell, keyOf } from '../transform.js';
import { renderUserTiles } from '../render.js';
import { queueSaveToURL } from '../urlState.js';
import { saveCheckpoint } from '../history.js';

/**
 * Enables click-to-toggle red paint on the grid.
 */
export function setupTileToggle() {
  rot.addEventListener('click', (e) => {
    // Ignore drag events, resizing, or clicks on existing blocks
    if (state.drag || state.panning || state._isResizing || e.target.closest('.block')) return;
    if (e.button !== 0) return; // left click only

    // Determine clicked cell
    const { x, y } = clientToLocalRot(e.clientX, e.clientY);
    const { cx, cy } = pointToCell(x, y);
    const k = keyOf(cx, cy);

    // Toggle user paint (red)
    if (state.userPaint.has(k)) state.userPaint.delete(k);
    else state.userPaint.add(k);

    // Re-render and persist
    renderUserTiles();
    queueSaveToURL();
    saveCheckpoint();
  });
}
