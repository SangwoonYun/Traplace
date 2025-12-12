// File: app/static/js/interactions/remote.js
/**
 * Remote control functionality for moving all blocks and tiles diagonally.
 * Moves all non-immutable blocks and user paint tiles in the specified diagonal direction.
 */

import { state, cellPx } from '../state.js';
import { queueSaveToURL } from '../urlState.js';
import { saveCheckpoint } from '../history.js';
import { recomputePaint, renderUserTiles } from '../render.js';
import { validateAllObjects } from '../blocks.js';

/**
 * Move all non-immutable blocks and user paint tiles in the specified direction.
 * @param {number} dx - X direction offset in cells (-1, 0, or 1)
 * @param {number} dy - Y direction offset in cells (-1, 0, or 1)
 */
function moveAll(dx, dy) {
  if (dx === 0 && dy === 0) return;

  const c = cellPx();

  // Move all non-immutable blocks
  for (const block of state.blocks) {
    if (block.immutable) continue;

    block.left += dx * c;
    block.top += dy * c;

    if (block.el) {
      block.el.style.left = `${block.left}px`;
      block.el.style.top = `${block.top}px`;
    }
  }

  // Move all user paint tiles
  if (state.userPaint.size > 0) {
    const newPaint = new Set();
    for (const key of state.userPaint) {
      const [xStr, yStr] = key.split(',');
      const x = parseInt(xStr, 10);
      const y = parseInt(yStr, 10);

      if (Number.isFinite(x) && Number.isFinite(y)) {
        newPaint.add(`${x + dx},${y + dy}`);
      }
    }
    state.userPaint = newPaint;
  }

  // Re-render and update
  recomputePaint();
  renderUserTiles();
  validateAllObjects();

  // Save to URL and history
  queueSaveToURL();
  saveCheckpoint();
}

/**
 * Setup remote control button event listeners.
 */
export function setupRemoteControl() {
  const btnTL = document.querySelector('.remote-btn-tl'); // Top-left (↖)
  const btnTR = document.querySelector('.remote-btn-tr'); // Top-right (↗)
  const btnBL = document.querySelector('.remote-btn-bl'); // Bottom-left (↙)
  const btnBR = document.querySelector('.remote-btn-br'); // Bottom-right (↘)

  if (btnTL) {
    btnTL.addEventListener('click', () => {
      moveAll(1, 0); // Move left and up
    });
  }

  if (btnTR) {
    btnTR.addEventListener('click', () => {
      moveAll(0, 1); // Move right and up
    });
  }

  if (btnBL) {
    btnBL.addEventListener('click', () => {
      moveAll(0, -1); // Move left and down
    });
  }

  if (btnBR) {
    btnBR.addEventListener('click', () => {
      moveAll(-1, 0); // Move right and down
    });
  }
}
