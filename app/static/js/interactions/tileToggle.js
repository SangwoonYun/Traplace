// File: app/static/js/interactions/tileToggle.js
/**
 * Handles left-click toggling of user-painted tiles.
 * - Base tiles (light red) toggle to user paint (dark red)
 * - User paint tiles toggle back to base tiles (or empty if no base)
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
 * Check if a given client coordinate is over a block element.
 */
function isOverBlock(clientX, clientY) {
  const elements = document.elementsFromPoint(clientX, clientY);
  return elements.some((el) => el.classList.contains('block'));
}

/**
 * Enables click-to-toggle paint on the grid.
 */
export function setupTileToggle() {
  rot.addEventListener('click', (e) => {
    // Ignore drag events, resizing, or clicks on existing blocks
    if (state.drag || state.panning || state._isResizing || e.target.closest('.block')) return;
    if (e.button !== 0) return; // left click only

    // Also check if click ended over a block (for drag cases)
    if (isOverBlock(e.clientX, e.clientY)) return;

    // Determine clicked cell
    const { x, y } = clientToLocalRot(e.clientX, e.clientY);
    const { cx, cy } = pointToCell(x, y);
    const k = keyOf(cx, cy);

    // Toggle logic:
    // - If user paint exists: remove it (back to base or empty)
    // - If no user paint but base tile exists: add user paint (dark red)
    // - If neither exists: add user paint (dark red)
    if (state.userPaint.has(k)) {
      state.userPaint.delete(k);
    } else {
      state.userPaint.add(k);
    }

    // Re-render and persist
    renderUserTiles();
    queueSaveToURL();
    saveCheckpoint();
  });
}
