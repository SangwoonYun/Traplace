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
 * Styling
 * ------------------------------------------- */
/**
 * Apply visual style to a block based on validity and kind.
 * @param {{el:HTMLElement, kind:string}} b
 * @param {boolean} invalid
 */
function applyBlockStyle(b, invalid) {
  const el = b.el;
  if (b.kind === 'resource') {
    el.style.background = 'var(--resource-bg)';
    el.style.borderColor = 'var(--resource-border)';
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
 * Label Editing (city only)
 * ------------------------------------------- */
/**
 * Start inline editing for a city's label.
 * @param {HTMLElement} blockEl
 */
function startEditLabel(blockEl) {
  const b = state.blocks.find((x) => x.el === blockEl);
  if (!b || b.kind !== 'city') return;

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

  const defaultCity = t('palette.city');

  if (cancel) {
    label.textContent = b._labelOriginal ?? defaultCity;
  } else {
    const txt = (label.textContent || '').trim();
    if (!txt) {
      label.textContent = defaultCity;
      b.customLabel = false;
    } else if (txt === defaultCity) {
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
    kind === 'hq' ? t('palette.hq') :
    kind === 'flag' ? t('palette.flag') :
    kind === 'trap' ? t('palette.trap') :
    kind === 'city' ? t('palette.city') :
    kind === 'resource' ? t('palette.resource') :
    `${size}×${size}`;
  el.appendChild(label);

  if (kind === 'city') {
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startEditLabel(el);
    });
  }

  rot.appendChild(el);

  /** @type {{el:HTMLElement, kind:string, size:number, left:number, top:number, customLabel:boolean}} */
  const b = { el, kind, size, left, top, customLabel: false };
  state.blocks.push(b);
  applyBlockStyle(b, false);

  if (!state._restoring) {
    recomputePaint();
    validateAllObjects();
    queueSaveToURL();
    saveCheckpoint();
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
  }
}
