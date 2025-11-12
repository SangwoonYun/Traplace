// File: app/static/js/interactions/coordJump.js
/**
 * Coordinate jump functionality:
 * - Click badge text to enter edit mode
 * - Input coordinates in format "x, y"
 * - Press Enter to jump to coordinates
 * - Press Escape or blur to cancel
 */

import { badgeCoord, badgeInput } from '../dom.js';
import { centerToCell } from '../render.js';

/**
 * Setup coordinate jump interaction
 */
export function setupCoordJump() {
  if (!badgeCoord || !badgeInput) return;

  // Click on badge coord to enter edit mode
  badgeCoord.addEventListener('click', () => {
    // Extract current x, y from badge coord (format: "x:123, y:456")
    const match = badgeCoord.textContent.match(/x:(\d+),\s*y:(\d+)/);
    if (match) {
      const [, x, y] = match;
      badgeInput.value = `${x}, ${y}`;
    }

    // Switch to input mode
    badgeCoord.style.display = 'none';
    badgeInput.style.display = 'inline-block';
    badgeInput.focus();
    badgeInput.select();
  });

  // Handle input submission
  const submitCoordinates = () => {
    const input = badgeInput.value.trim();
    const match = input.match(/^\s*(\d+)\s*,\s*(\d+)\s*$/);

    if (match) {
      const [, x, y] = match;
      const cx = parseInt(x, 10);
      const cy = parseInt(y, 10);

      // Jump to the specified coordinates
      centerToCell(cx, cy);
    }

    // Return to display mode
    exitInputMode();
  };

  const exitInputMode = () => {
    badgeInput.style.display = 'none';
    badgeCoord.style.display = 'inline-block';
    badgeInput.value = '';
  };

  // Enter key to submit
  badgeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitCoordinates();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      exitInputMode();
    }
  });

  // Blur to cancel
  badgeInput.addEventListener('blur', () => {
    exitInputMode();
  });
}
