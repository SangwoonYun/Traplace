// File: app/static/js/blocks.js
/**
 * Block management: style, validation, label editing, and CRUD.
 */

import { state } from './state.js';
import { rot } from './dom.js';
import { recomputePaint } from './render.js';
import { posToCell } from './transform.js';
import { queueSaveToURL } from './urlState.js';
import { saveCheckpoint } from './history.js';
import { t } from './i18n.js';
import { onCreateBlock, onDeleteBlock } from './counters.js';

/* ---------------------------------------------
 * Map Z-Index Management
 * ------------------------------------------- */

/**
 * Update map layers z-index to stay below all blocks
 */
export function updateMapZIndex() {
  // Find the minimum z-index among all blocks
  const minBlockZIndex = state.blocks.reduce((min, b) => {
    const z = b.zIndex !== undefined ? b.zIndex : 1;
    return Math.min(min, z);
  }, 1);

  // Set map z-index to 1 below the minimum block z-index
  const mapZIndex = minBlockZIndex - 1;

  // Apply to all map layers including the grid
  const mapLayers = ['tiles', 'tilesPreview', 'outlines', 'outlinesPreview', 'tilesUser'];
  mapLayers.forEach(id => {
    const layer = document.getElementById(id);
    if (layer) {
      layer.style.zIndex = String(mapZIndex);
    }
  });

  // Also apply to grid element (selected by class)
  const gridEl = document.querySelector('.grid');
  if (gridEl) {
    gridEl.style.zIndex = String(mapZIndex);
  }
}

/* ---------------------------------------------
 * Styling
 * ------------------------------------------- */

/**
 * Check if two blocks overlap
 * @param {{left:number, top:number, size:number}} b1
 * @param {{left:number, top:number, size:number}} b2
 * @returns {boolean}
 */
function blocksOverlap(b1, b2) {
  const cell = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell')) || 48;
  
  const b1Right = b1.left + b1.size * cell;
  const b1Bottom = b1.top + b1.size * cell;
  const b2Right = b2.left + b2.size * cell;
  const b2Bottom = b2.top + b2.size * cell;

  // Check if rectangles overlap
  return !(b1Right <= b2.left || 
           b1.left >= b2Right || 
           b1Bottom <= b2.top || 
           b1.top >= b2Bottom);
}

/**
 * Move block to the front (above all overlapping blocks)
 * @param {{el:HTMLElement, left:number, top:number, size:number, zIndex:number}} block
 */
function bringToFront(block) {
  // Find all blocks that overlap with this one
  const overlapping = state.blocks.filter(b => 
    b !== block && blocksOverlap(block, b)
  );

  if (overlapping.length === 0) {
    // No overlapping blocks, just ensure it's at least 1
    block.zIndex = Math.max(1, block.zIndex !== undefined ? block.zIndex : 1);
  } else {
    // Find the max z-index among overlapping blocks
    const maxZ = Math.max(...overlapping.map(b => b.zIndex !== undefined ? b.zIndex : 1));
    // Set this block's z-index to be above all overlapping blocks
    block.zIndex = maxZ + 1;
  }

  block.el.style.zIndex = String(block.zIndex);
  block.el.dataset.zIndex = String(block.zIndex);
  
  // Visual feedback
  flashBlock(block.el);
  
  // Adjust map z-index to stay below all blocks
  updateMapZIndex();
}

/**
 * Send block to the back (below all overlapping blocks)
 * @param {{el:HTMLElement, left:number, top:number, size:number, zIndex:number}} block
 */
function sendToBack(block) {
  // Find all blocks that overlap with this one
  const overlapping = state.blocks.filter(b => 
    b !== block && blocksOverlap(block, b)
  );

  if (overlapping.length === 0) {
    // No overlapping blocks, set to 0
    block.zIndex = 0;
  } else {
    // Find the min z-index among overlapping blocks
    const minZ = Math.min(...overlapping.map(b => b.zIndex !== undefined ? b.zIndex : 1));
    // Set this block's z-index to be below all overlapping blocks (allow negative values)
    block.zIndex = minZ - 1;
  }

  block.el.style.zIndex = String(block.zIndex);
  block.el.dataset.zIndex = String(block.zIndex);
  
  // Visual feedback
  flashBlock(block.el);
  
  // Adjust map z-index to stay below all blocks
  updateMapZIndex();
}

/**
 * Flash animation to indicate z-index change
 * @param {HTMLElement} el
 */
function flashBlock(el) {
  el.style.transition = 'opacity 0.2s';
  el.style.opacity = '0.5';
  setTimeout(() => {
    el.style.opacity = '1';
    setTimeout(() => {
      el.style.transition = '';
    }, 200);
  }, 100);
}

/**
 * Apply visual style to a block based on validity and kind.
 * @param {{el:HTMLElement, kind:string, customColor?:object}} b
 * @param {boolean} invalid
 */
function applyBlockStyle(b, invalid) {
  const el = b.el;
  
  // If block has custom color, use it
  if (b.customColor) {
    el.style.background = b.customColor.bg;
    el.style.borderColor = b.customColor.border;
    return;
  }
  
  if (b.kind === 'resource') {
    el.style.background = 'var(--resource-bg)';
    el.style.borderColor = 'var(--resource-border)';
    return;
  }
  if (b.kind === 'city') {
    el.style.background = 'var(--city-bg)';
    el.style.borderColor = 'var(--city-border)';
    return;
  }
  if (invalid) {
    el.style.background = 'var(--warn-bg)';
    el.style.borderColor = 'var(--warn-border)';
  } else {
    el.style.background = 'var(--ok-bg)';
    el.style.borderColor = 'var(--ok-border)';
  }
}

/* ---------------------------------------------
 * Validation (based on union of blue painted cells)
 * ------------------------------------------- */
/**
 * Validate all blocks against the painted set and apply styles.
 */
export function validateAllObjects() {
  for (const b of state.blocks) {
    const { cx, cy } = posToCell(b.left, b.top);
    let invalid = false;

    for (let y = cy; y < cy + b.size && !invalid; y++) {
      for (let x = cx; x < cx + b.size; x++) {
        if (!state.paintedSet.has(`${x},${y}`)) {
          invalid = true;
          break;
        }
      }
    }
    applyBlockStyle(b, invalid);
  }
}

/* ---------------------------------------------
 * Label Editing (city and block)
 * ------------------------------------------- */
/**
 * Start inline editing for a city's or block's label.
 * @param {HTMLElement} blockEl
 */
function startEditLabel(blockEl) {
  const b = state.blocks.find((x) => x.el === blockEl);
  if (!b || (b.kind !== 'city' && b.kind !== 'block')) return;

  const label = blockEl.querySelector('.label');
  if (!label) return;

  blockEl.dataset.editing = '1';
  b._labelOriginal = label.textContent;

  label.classList.add('editing');
  label.contentEditable = 'true';
  label.spellcheck = false;
  label.setAttribute('role', 'textbox');
  label.focus();

  // Select all text on first focus
  requestAnimationFrame(() => {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(label);
    sel.removeAllRanges();
    sel.addRange(range);
  });

  // Use event listeners to avoid clobbering potential external handlers
  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finishEditLabel(blockEl, false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finishEditLabel(blockEl, true);
    }
  };
  const onBlur = () => finishEditLabel(blockEl, false);

  label.addEventListener('keydown', onKeyDown, { once: false });
  label.addEventListener('blur', onBlur, { once: true });

  // Store to remove if needed later (defensive)
  b._labelHandlers = { onKeyDown, onBlur, labelEl: label };
}

/**
 * Finish label editing, optionally canceling and restoring previous value.
 * @param {HTMLElement} blockEl
 * @param {boolean} cancel
 */
function finishEditLabel(blockEl, cancel) {
  const b = state.blocks.find((x) => x.el === blockEl);
  const label = blockEl.querySelector('.label');
  if (!b || !label) return;

  const defaultLabel = b.kind === 'city' ? t('palette.city') : `${b.size}×${b.size}`;

  if (cancel) {
    label.textContent = b._labelOriginal ?? defaultLabel;
  } else {
    const txt = (label.textContent || '').trim();
    if (!txt) {
      label.textContent = defaultLabel;
      b.customLabel = false;
    } else if (txt === defaultLabel) {
      b.customLabel = false;
    } else {
      b.customLabel = true;
    }
  }

  delete b._labelOriginal;

  // Clean up editing state
  label.classList.remove('editing');
  label.contentEditable = 'false';
  blockEl.removeAttribute('data-editing');

  // Remove listeners if stored
  if (b._labelHandlers) {
    const { onKeyDown, onBlur, labelEl } = b._labelHandlers;
    labelEl.removeEventListener('keydown', onKeyDown);
    labelEl.removeEventListener('blur', onBlur);
    delete b._labelHandlers;
  }

  // Persist changes
  queueSaveToURL();
  saveCheckpoint();
}

/* ---------------------------------------------
 * CRUD
 * ------------------------------------------- */
/**
 * Create a new block element and register it in state.
 * @param {'hq'|'flag'|'trap'|'city'|'resource'|'block'} kind
 * @param {number} size
 * @param {number} left
 * @param {number} top
 * @returns {HTMLElement}
 */
export function createBlock(kind, size, left, top) {
  const cell =
    parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell')) || 48;

  const el = document.createElement('div');
  el.className = 'block';
  el.dataset.size = String(size);
  el.dataset.kind = kind;
  el.style.width = `${size * cell}px`;
  el.style.height = `${size * cell}px`;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;

  const label = document.createElement('div');
  label.className = 'label';
  label.textContent =
    kind === 'hq'
      ? t('palette.hq')
      : kind === 'flag'
        ? t('palette.flag')
        : kind === 'trap'
          ? t('palette.trap')
          : kind === 'city'
            ? t('palette.city')
            : kind === 'resource'
              ? t('palette.resource')
              : `${size}×${size}`;
  el.appendChild(label);

  // Add z-index controls
  const controls = document.createElement('div');
  controls.className = 'block-controls';
  
  const btnForward = document.createElement('button');
  btnForward.className = 'z-control z-forward';
  btnForward.textContent = '▲';
  btnForward.title = 'Avancer d\'un plan';
  
  const btnBackward = document.createElement('button');
  btnBackward.className = 'z-control z-backward';
  btnBackward.textContent = '▼';
  btnBackward.title = 'Reculer d\'un plan';
  
  controls.appendChild(btnForward);
  controls.appendChild(btnBackward);
  el.appendChild(controls);

  if (kind === 'city' || kind === 'block') {
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startEditLabel(el);
    });
    
    // Mobile: double-tap to edit
    let lastTap = 0;
    el.addEventListener('touchend', (e) => {
      const now = Date.now();
      const DOUBLE_TAP_DELAY = 300; // ms
      
      if (now - lastTap < DOUBLE_TAP_DELAY) {
        e.preventDefault();
        e.stopPropagation();
        startEditLabel(el);
        lastTap = 0;
      } else {
        lastTap = now;
      }
    });
  }

  rot.appendChild(el);

  /** @type {{el:HTMLElement, kind:string, size:number, left:number, top:number, customLabel:boolean, zIndex:number, customColor?:object}} */
  const b = { el, kind, size, left, top, customLabel: false, zIndex: 1 };
  state.blocks.push(b);
  applyBlockStyle(b, false);

  // Wire up z-index controls
  btnForward.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    bringToFront(b);
    queueSaveToURL();
    saveCheckpoint();
  });

  btnBackward.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    sendToBack(b);
    queueSaveToURL();
    saveCheckpoint();
  });

  // Prevent all drag-related events on z-control buttons
  const preventDrag = (e) => {
    e.stopPropagation();
    e.preventDefault();
  };

  btnForward.addEventListener('mousedown', preventDrag);
  btnForward.addEventListener('dragstart', preventDrag);
  btnForward.addEventListener('drag', preventDrag);
  
  btnBackward.addEventListener('mousedown', preventDrag);
  btnBackward.addEventListener('dragstart', preventDrag);
  btnBackward.addEventListener('drag', preventDrag);

  // Also prevent on the controls container
  controls.addEventListener('mousedown', preventDrag);
  controls.addEventListener('dragstart', preventDrag);

  if (!state._restoring) {
    recomputePaint();
    validateAllObjects();
    queueSaveToURL();
    saveCheckpoint();
    updateMapZIndex();
  }

  onCreateBlock(b);
  return el;
}

/**
 * Update a block's snapped position and propagate validation/serialization.
 * @param {HTMLElement} el
 * @param {number} snappedLeft
 * @param {number} snappedTop
 */
export function updateBlockPosition(el, snappedLeft, snappedTop) {
  el.style.left = `${snappedLeft}px`;
  el.style.top = `${snappedTop}px`;

  const b = state.blocks.find((x) => x.el === el);
  if (b) {
    b.left = snappedLeft;
    b.top = snappedTop;

    if (!state._restoring) {
      recomputePaint();
      validateAllObjects();
      queueSaveToURL();
      saveCheckpoint();
    }
  }
}

/**
 * Delete a block and update state/serialization.
 * @param {HTMLElement} el
 */
export function deleteBlock(el) {
  el.remove();

  const idx = state.blocks.findIndex((b) => b.el === el);
  if (idx >= 0) {
    const [removed] = state.blocks.splice(idx, 1);
    try {
      onDeleteBlock?.(removed);
    } catch {
      /* no-op */
    }
  }

  if (!state._restoring) {
    recomputePaint();
    validateAllObjects();
    queueSaveToURL();
    saveCheckpoint();
    updateMapZIndex();
  }
}
