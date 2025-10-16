// File: app/static/js/interactions/drag.js
/**
 * Drag & drop interactions:
 * - Drag from palette to create new blocks (with snap + preview)
 * - Drag existing blocks to move or delete (via trash zone)
 * - Shows snap rectangle and painter preview while dragging
 */

import { state, cell } from '../state.js';
import { previewLayer, outlinesPreviewLayer, snapEl, palette, trash } from '../dom.js';
import { clientToLocalRot, snapLocal } from '../transform.js';
import { PAINTER_KINDS } from '../painter.js';
import { showPreview, clearPreview } from '../render.js';
import { createBlock, updateBlockPosition, deleteBlock } from '../blocks.js';
import { t } from '../i18n.js';

/* ---------------------------------------------
 * Internal helpers
 * ------------------------------------------- */

/** Position the floating ghost under the cursor (screen coordinates). */
function updateGhost(clientX, clientY, px) {
  if (!state.drag?.ghost) return;
  state.drag.ghost.style.left = `${clientX - px / 2}px`;
  state.drag.ghost.style.top = `${clientY - px / 2}px`;
}

/** Check if the pointer is currently inside the trash zone. */
function inTrash(clientX, clientY) {
  if (!trash) return false;
  const r = trash.getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

/* ---------------------------------------------
 * Pointer handlers (shared for new/move)
 * ------------------------------------------- */

function onPointerMove(e) {
  if (!state.drag || e.pointerId !== state.drag.pointerId) return;

  // Visual feedback for trash zone
  const overTrash = inTrash(e.clientX, e.clientY);
  trash?.classList.toggle('active', overTrash);

  // Compute snapped rect in local (rot) space
  const { x, y } = clientToLocalRot(e.clientX, e.clientY);
  const size = state.drag.size;

  const left = x - (size * cell) / 2;
  const top = y - (size * cell) / 2;
  const snapped = snapLocal(left, top, size);

  // Snap rectangle overlay
  snapEl.style.display = 'block';
  snapEl.style.left = `${snapped.left}px`;
  snapEl.style.top = `${snapped.top}px`;
  snapEl.style.width = `${size * cell}px`;
  snapEl.style.height = `${size * cell}px`;

  // Painter preview (Flag/HQ paints, others do not)
  if (PAINTER_KINDS.has(state.drag.kind)) {
    showPreview(state.drag.kind, snapped.left, snapped.top, size, true);
  } else {
    outlinesPreviewLayer.innerHTML = '';
    previewLayer.innerHTML = '';
  }

  // Move the ghost (for "new" drags)
  if (state.drag.mode === 'new') updateGhost(e.clientX, e.clientY, size * cell);
}

function onPointerUp(e) {
  if (!state.drag || e.pointerId !== state.drag.pointerId) {
    cleanupDrag();
    return;
  }

  const droppingInTrash = inTrash(e.clientX, e.clientY);

  if (state.drag.mode === 'new') {
    // Remove ghost
    state.drag.ghost?.parentNode?.removeChild(state.drag.ghost);

    // Create the block unless dropped in trash
    if (!droppingInTrash) {
      const { x, y } = clientToLocalRot(e.clientX, e.clientY);
      const size = state.drag.size;

      const left = x - (size * cell) / 2;
      const top = y - (size * cell) / 2;
      const snapped = snapLocal(left, top, size);

      const el = createBlock(state.drag.kind, size, snapped.left, snapped.top);
      makeMovable(el);
    }

    cleanupDrag();
    return;
  }

  // Move existing node or delete it
  if (state.drag.mode === 'move' && state.drag.node) {
    if (droppingInTrash) {
      // Counters are updated inside deleteBlock(), so no explicit onDeleteBlock() here.
      deleteBlock(state.drag.node);
    } else {
      const { x, y } = clientToLocalRot(e.clientX, e.clientY);
      const size = state.drag.size;

      const left = x - (size * cell) / 2;
      const top = y - (size * cell) / 2;
      const snapped = snapLocal(left, top, size);

      updateBlockPosition(state.drag.node, snapped.left, snapped.top);
    }
  }

  cleanupDrag();
}

/** Tear down drag visuals/state and listeners. */
function cleanupDrag() {
  snapEl.style.display = 'none';
  clearPreview();
  trash?.classList.remove('active');

  // Remove ghost if still present
  state.drag?.ghost?.parentNode?.removeChild(state.drag.ghost);

  window.removeEventListener('pointermove', onPointerMove);
  state.drag = null;
}

/* ---------------------------------------------
 * Public API
 * ------------------------------------------- */

/**
 * Enable dragging from palette to create new blocks.
 */
export function setupPaletteDrag() {
  if (!palette) return;

  palette.querySelectorAll('.palette-item').forEach((item) => {
    item.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      item.setPointerCapture(e.pointerId);

      const size = parseInt(item.dataset.size, 10);
      const kind = item.dataset.kind;

      // Build a simple ghost preview
      const ghost = document.createElement('div');
      ghost.className = 'ghost';
      const px = size * cell;
      ghost.style.width = `${px}px`;
      ghost.style.height = `${px}px`;
      ghost.textContent =
        kind === 'hq'       ? t('palette.hq') :
        kind === 'flag'     ? t('palette.flag') :
        kind === 'trap'     ? t('palette.trap') :
        kind === 'city'     ? t('palette.city') :
        kind === 'resource' ? t('palette.resource') :
        `${size}×${size}`;
      document.body.appendChild(ghost);

      state.drag = { mode: 'new', size, kind, ghost, pointerId: e.pointerId };
      updateGhost(e.clientX, e.clientY, px);

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp, { once: true });
    });
  });
}

/**
 * Make an existing block movable (drag to reposition/delete).
 * @param {HTMLElement} el
 */
export function makeMovable(el) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (el.dataset.editing === '1') return; // Blocked while label is being edited
    e.preventDefault();
    el.setPointerCapture(e.pointerId);

    const size = parseInt(el.dataset.size, 10);
    const kind = el.dataset.kind;
    state.drag = { mode: 'move', size, kind, node: el, pointerId: e.pointerId };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  });
}
