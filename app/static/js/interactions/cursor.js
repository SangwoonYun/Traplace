// File: app/static/js/interactions/cursor.js
/**
 * Cursor tracking and badge update module.
 * - Converts pointer coordinates into cell coordinates (rotated grid space).
 * - Updates the global cursorCell state and HUD badge.
 */

import { state } from '../state.js';
import { rot } from '../dom.js';
import { clientToLocalRot, pointToCell } from '../transform.js';
import { updateBadge } from '../render.js';

/**
 * Initialize the cursor badge updater.
 * Attaches a pointermove listener on the rotated world layer.
 */
export function setupCursorBadge() {
  rot.addEventListener('pointermove', (e) => {
    // Convert pointer position to rotated local coordinates
    const { x, y } = clientToLocalRot(e.clientX, e.clientY);

    // Convert to clamped cell coordinates
    const { cx, cy } = pointToCell(x, y);

    // NOTE: The axis swap (x: cy, y: cx) aligns with the 45° rotated world
    state.cursorCell = { x: cy, y: cx };

    // Update the HUD badge display
    updateBadge();
  });
}
