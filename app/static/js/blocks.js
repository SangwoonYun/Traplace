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
  const styles = getComputedStyle(document.documentElement);

  if (invalid) {
    el.style.background = styles.getPropertyValue('--warn-bg');
    el.style.borderColor = styles.getPropertyValue('--warn-border');
    return;
  }

  switch (b.kind) {
    case 'resource':
      el.style.background = styles.getPropertyValue('--resource-bg');
      el.style.borderColor = styles.getPropertyValue('--resource-border');
      return;

    case 'hq':
    case 'flag':
      el.style.background = styles.getPropertyValue('--flag-bg');
      el.style.borderColor = styles.getPropertyValue('--flag-border');
      return;

    case 'trap':
      el.style.background = styles.getPropertyValue('--trap-bg');
      el.style.borderColor = styles.getPropertyValue('--trap-border');
      return;

    case 'city':
      el.style.background = styles.getPropertyValue('--city-bg');
      el.style.borderColor = styles.getPropertyValue('--city-border');
      return;

    case 'castle':
      el.style.background = styles.getPropertyValue('--castle-bg');
      el.style.borderColor = styles.getPropertyValue('--castle-border');
      return;

    case 'turret':
      el.style.background = styles.getPropertyValue('--turret-bg');
      el.style.borderColor = styles.getPropertyValue('--turret-border');
      return;

    case 'fortress':
      el.style.background = styles.getPropertyValue('--fortress-bg');
      el.style.borderColor = styles.getPropertyValue('--fortress-border');
      return;

    case 'sanctuary':
      el.style.background = styles.getPropertyValue('--sanctuary-bg');
      el.style.borderColor = styles.getPropertyValue('--sanctuary-border');
      return;

    case 'block':
      if (b.size === 1 || b.size === 2 || b.size === 3) {
        el.style.background = styles.getPropertyValue('--block123-bg');
        el.style.borderColor = styles.getPropertyValue('--block123-border');
        return;
      }
      break;

    case 'custom':
      el.style.background = styles.getPropertyValue('--block123-bg');
      el.style.borderColor = styles.getPropertyValue('--block123-border');
      return;
  }

  el.style.background = styles.getPropertyValue('--ok-bg');
  el.style.borderColor = styles.getPropertyValue('--ok-border');
}

/* ---------------------------------------------
 * Validation (based on union of blue painted cells)
 * ------------------------------------------- */
/**
 * Validate all blocks against the painted set and apply styles.
 * Only city and trap blocks need to be within the painted area.
 */
export function validateAllObjects() {
  for (const b of state.blocks) {
    // Only validate city and trap blocks against painted area
    const needsValidation = b.kind === 'city' || b.kind === 'trap';
    let invalid = false;

    if (needsValidation) {
      const { cx, cy } = posToCell(b.left, b.top);
      const width = b.kind === 'custom' ? b.width || b.size : b.size;
      const height = b.kind === 'custom' ? b.height || b.size : b.size;

      for (let y = cy; y < cy + height && !invalid; y++) {
        for (let x = cx; x < cx + width; x++) {
          if (!state.paintedSet.has(`${x},${y}`)) {
            invalid = true;
            break;
          }
        }
      }
    }

    applyBlockStyle(b, invalid);
  }
}

/* ---------------------------------------------
 * Label Editing (city and custom blocks)
 * ------------------------------------------- */
/**
 * Start inline editing for a city or custom block's label.
 * @param {HTMLElement} blockEl
 */
function startEditLabel(blockEl) {
  const b = state.blocks.find((x) => x.el === blockEl);
  if (!b || (b.kind !== 'city' && b.kind !== 'custom')) return;

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

  // Get default label based on block kind
  const defaultLabel =
    b.kind === 'city'
      ? t('palette.city')
      : b.kind === 'custom'
        ? `${b.width || b.size}×${b.height || b.size}`
        : '';

  if (cancel) {
    label.textContent = b._labelOriginal ?? defaultLabel;
  } else {
    const txt = (label.textContent || '').trim();
    if (!txt) {
      label.textContent = defaultLabel;
      b.customLabel = false;
    } else if (txt === defaultLabel || (b.kind === 'city' && txt === 'City')) {
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
 * @param {'hq'|'flag'|'trap'|'city'|'resource'|'block'|'custom'|'castle'|'turret'|'fortress'|'sanctuary'} kind
 * @param {number} size - For square blocks; ignored for custom blocks
 * @param {number} left
 * @param {number} top
 * @param {number} [width] - For custom blocks only
 * @param {number} [height] - For custom blocks only
 * @param {boolean} [immutable=false] - If true, block cannot be moved or deleted
 * @param {string} [customName] - Custom display name for the block
 * @returns {HTMLElement}
 */
export function createBlock(
  kind,
  size,
  left,
  top,
  width,
  height,
  immutable = false,
  customName = null,
  fontSize = 14,
  wordWrap = false,
) {
  const cell =
    parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell')) || 48;

  const el = document.createElement('div');
  el.className = 'block';
  el.dataset.kind = kind;

  // Mark immutable blocks
  if (immutable) {
    el.dataset.immutable = 'true';
  }

  // Custom blocks use width x height
  let blockWidth, blockHeight, displayText;
  if (kind === 'custom' && width && height) {
    blockWidth = width;
    blockHeight = height;
    el.dataset.size = String(Math.max(width, height));
    displayText = `${width}×${height}`;
  } else {
    blockWidth = blockHeight = size;
    el.dataset.size = String(size);

    // Use customName if provided, otherwise use translation or default
    if (customName) {
      displayText = customName;
    } else {
      displayText =
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
                  : kind === 'castle'
                    ? t('palette.castle')
                    : kind === 'turret'
                      ? t('palette.turret')
                      : kind === 'fortress'
                        ? t('palette.fortress')
                        : kind === 'sanctuary'
                          ? t('palette.sanctuary')
                          : `${size}×${size}`;
    }
  }

  el.style.width = `${blockWidth * cell}px`;
  el.style.height = `${blockHeight * cell}px`;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;

  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = displayText;

  if (fontSize) {
    label.style.fontSize = `${fontSize}px`;
  }
  if (wordWrap) {
    label.style.whiteSpace = 'normal';
    label.style.wordBreak = 'break-word';
    label.style.padding = '4px';
  } else {
    label.style.whiteSpace = 'nowrap';
  }

  el.appendChild(label);

  if (kind === 'city' || kind === 'custom') {
    el.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startEditLabel(el);
    });
  }

  rot.appendChild(el);

  /** @type {{el:HTMLElement, kind:string, size:number, left:number, top:number, customLabel:boolean, immutable?:boolean, width?:number, height?:number}} */
  const b = {
    el,
    kind,
    size: blockWidth === blockHeight ? blockWidth : Math.max(blockWidth, blockHeight),
    left,
    top,
    customLabel: false,
    fontSize: fontSize || 14,
    wordWrap: !!wordWrap,
  };
  if (kind === 'custom') {
    b.width = blockWidth;
    b.height = blockHeight;
  }
  if (immutable) {
    b.immutable = true;
  }
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
 * Update a custom block's size and propagate validation/serialization.
 * @param {HTMLElement} el
 * @param {number} newWidth - new width in cells
 * @param {number} newHeight - new height in cells
 */
export function updateBlockSize(el, newWidth, newHeight) {
  const cell =
    parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell')) || 48;

  el.style.width = `${newWidth * cell}px`;
  el.style.height = `${newHeight * cell}px`;

  const b = state.blocks.find((x) => x.el === el);
  if (b && b.kind === 'custom') {
    b.width = newWidth;
    b.height = newHeight;
    b.size = Math.max(newWidth, newHeight);

    // Update label if it's still the default WxH format
    const labelEl = el.querySelector('.label');
    if (labelEl && !b.customLabel) {
      labelEl.textContent = `${newWidth}×${newHeight}`;
    }

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

/**
 * Update block font settings.
 * @param {HTMLElement} el
 * @param {{fontSize?: number, wordWrap?: boolean}} settings
 */
export function updateBlockFont(el, settings) {
  const b = state.blocks.find((x) => x.el === el);
  if (!b) return;

  const label = el.querySelector('.label');
  if (!label) return;

  if (settings.fontSize !== undefined) {
    b.fontSize = settings.fontSize;
    label.style.fontSize = `${b.fontSize}px`;
  }

  if (settings.wordWrap !== undefined) {
    b.wordWrap = settings.wordWrap;
    if (b.wordWrap) {
      label.style.whiteSpace = 'normal';
      label.style.wordBreak = 'break-word';
      label.style.padding = '4px';
    } else {
      label.style.whiteSpace = 'nowrap';
      label.style.padding = '';
    }
  }

  if (!state._restoring) {
    queueSaveToURL();
    saveCheckpoint();
  }
}
