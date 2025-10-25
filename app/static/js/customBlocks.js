// File: app/static/js/customBlocks.js
/**
 * Custom block creation with size and color controls.
 * Z-index management for layering blocks.
 */

import { state, cellPx } from './state.js';
import { createBlock } from './blocks.js';
import { makeMovable } from './interactions/drag.js';
import { saveCheckpoint } from './history.js';
import { queueSaveToURL } from './urlState.js';
import { viewport, rot } from './dom.js';

let selectedColor = { bg: '#fafafa', border: '#555' };

/**
 * Setup custom block creation and color picker
 */
export function setupCustomBlocks() {
  const createBtn = document.getElementById('createCustomBlock');
  const sizeInput = document.getElementById('customSize');
  const colorBtns = document.querySelectorAll('.color-btn');

  // Color picker
  colorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      colorBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedColor = {
        bg: btn.dataset.color,
        border: btn.dataset.border
      };
    });
  });

  // Create custom block button
  createBtn?.addEventListener('click', () => {
    const size = parseInt(sizeInput.value, 10);
    if (!size || size < 1 || size > 50) {
      alert('Taille invalide. Veuillez entrer un nombre entre 1 et 50.');
      return;
    }

    // Calculate center of current viewport
    const c = cellPx();
    
    // Get the transformation matrix of the rotated layer
    const m = new DOMMatrixReadOnly(getComputedStyle(rot).transform);
    const mInv = m.inverse();
    
    // Get viewport center in screen coordinates
    const centerScreenX = viewport.scrollLeft + viewport.clientWidth / 2;
    const centerScreenY = viewport.scrollTop + viewport.clientHeight / 2;
    
    // Transform back to world coordinates
    const worldPoint = new DOMPoint(centerScreenX, centerScreenY).matrixTransform(mInv);
    
    // Calculate position so that the CENTER of the block is at viewport center
    // We need to offset by half the block size
    const halfBlockSize = (size * c) / 2;
    const centerWorldX = worldPoint.x - halfBlockSize;
    const centerWorldY = worldPoint.y - halfBlockSize;
    
    // Snap to grid
    const cx = Math.floor(centerWorldX / c);
    const cy = Math.floor(centerWorldY / c);
    const left = cx * c;
    const top = cy * c;

    const el = createBlock('block', size, left, top);
    
    // Apply custom color
    el.style.background = selectedColor.bg;
    el.style.borderColor = selectedColor.border;
    
    // Store custom color in block data
    const b = state.blocks.find(x => x.el === el);
    if (b) {
      b.customColor = selectedColor;
    }

    makeMovable(el);
    queueSaveToURL();
    saveCheckpoint();
  });
}

/**
 * Restore z-index from saved state
 * @param {HTMLElement} blockEl 
 * @param {number} zIndex 
 */
export function restoreZIndex(blockEl, zIndex) {
  if (zIndex !== undefined) {
    blockEl.style.zIndex = String(zIndex);
    const b = state.blocks.find(x => x.el === blockEl);
    if (b) {
      b.zIndex = zIndex;
    }
  }
}

/**
 * Restore custom color from saved state
 * @param {HTMLElement} blockEl 
 * @param {{bg: string, border: string}} customColor 
 */
export function restoreCustomColor(blockEl, customColor) {
  if (customColor) {
    blockEl.style.background = customColor.bg;
    blockEl.style.borderColor = customColor.border;
    const b = state.blocks.find(x => x.el === blockEl);
    if (b) {
      b.customColor = customColor;
    }
  }
}
