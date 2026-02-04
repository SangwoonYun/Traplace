// File: app/static/js/actions.js
/**
 * High-level UI actions and keyboard shortcuts.
 * - Sets toolbar titles (with platform-specific shortcuts)
 * - Applies city labels with distances to traps
 * - Reset / Copy URL / Export PNG / Undo / Redo behaviors
 */

import { state, cellPx } from './state.js';
import {
  tilesLayer,
  outlinesLayer,
  outlinesPreviewLayer,
  previewLayer,
  userLayer,
  rot,
  btnReset,
  btnCopyURL,
  btnExportPNG,
  btnImportPNG,
  pngFileInput,
  btnUndo,
  btnRedo,
  btnHome,
  btnTrap,
  btnCityTrapDist,
} from './dom.js';
import { recomputePaint, renderUserTiles, centerToWorldCenter, centerToCell } from './render.js';
import { validateAllObjects, createBlock } from './blocks.js';
import { updateAllCounts } from './counters.js';
import { saveToURLImmediate, deserializeState, updateURLWithSerialized } from './urlState.js';
import { exportPNG } from './exportPNG.js';
import { importPNG } from './importPNG.js';
import { undo, redo, onHistoryChange, saveCheckpoint } from './history.js';
import { posToCell } from './transform.js';
import { makeMovable } from './interactions/drag.js';
import { t } from './i18n.js';

/** Platform detection (used for shortcut hint labels). */
function isMac() {
  return /Mac|iPhone|iPad/.test(navigator.platform);
}

export function setTitles() {
  const mac = isMac();
  const sc = {
    undo: mac ? '⌘Z' : 'Ctrl+Z',
    redo: mac ? '⇧⌘Z' : 'Ctrl+Y',
    reset: mac ? '⌥⌘R' : 'Ctrl+Alt+R',
    copy: mac ? '⌥⌘C' : 'Ctrl+Alt+C',
    export: mac ? '⌥⌘E' : 'Ctrl+Alt+E',
    import: mac ? '⌥⌘I' : 'Ctrl+Alt+I',
    dist: mac ? '⌥⌘D' : 'Ctrl+Alt+D',
  };
  if (btnUndo) btnUndo.title = `${t('ui.toolbar.undo')} (${sc.undo})`;
  if (btnRedo) btnRedo.title = `${t('ui.toolbar.redo')} (${sc.redo})`;
  if (btnReset) btnReset.title = `${t('ui.toolbar.reset')} (${sc.reset})`;
  if (btnCopyURL) btnCopyURL.title = `${t('ui.toolbar.copy')} (${sc.copy})`;
  if (btnExportPNG) btnExportPNG.title = `${t('ui.toolbar.export')} (${sc.export})`;
  if (btnImportPNG) btnImportPNG.title = `${t('ui.toolbar.import')} (${sc.import})`;
  if (btnCityTrapDist) btnCityTrapDist.title = `${t('ui.toolbar.dist2label')} (${sc.dist})`;
}

/**
 * Compute the center of a block in cell units (fractional allowed).
 * @param {{left:number, top:number, size:number}} b
 * @returns {{x:number, y:number}}
 */
function blockCenterInCells(b) {
  const { cx, cy } = posToCell(b.left, b.top); // top-left cell
  return { x: cx + b.size / 2, y: cy + b.size / 2 };
}

/**
 * Update a label element to append/replace a trailing "(...)" part with valuesStr.
 * Keeps the base text if present; otherwise uses fallbackBaseText.
 * @param {HTMLElement} labelEl
 * @param {string} valuesStr
 * @param {string} fallbackBaseText
 */
function setParenValues(labelEl, valuesStr, fallbackBaseText) {
  const cur = (labelEl.textContent || '').trim();
  // Split base and trailing parenthesized values (only the last group)
  const m = cur.match(/^(.*?)(?:\s*\((.*?)\))?\s*$/);
  let base = m && m[1] ? m[1].trim() : '';
  if (!base) base = (fallbackBaseText || '').trim();

  labelEl.textContent = base ? `${base} (${valuesStr})` : `(${valuesStr})`;
}

/**
 * For every city label, compute distance to each trap (Euclidean),
 * multiply by 3.19, round to integer, and fill into trailing "(...)".
 * Keeps existing label base text and only updates the parentheses part.
 */
function applyCityLabelsWithTrapDistance() {
  const cities = state.blocks.filter((b) => b.kind === 'city');
  const traps = state.blocks.filter((b) => b.kind === 'trap');

  if (cities.length === 0) {
    alert(t('alert.noCities'));
    return;
  }
  if (traps.length === 0) {
    // Fixed: previously used 'noCities' for both cases
    alert(t('alert.noTraps'));
    return;
  }

  const trapCenters = traps.map(blockCenterInCells);

  for (const city of cities) {
    const c = blockCenterInCells(city);
    const values = trapCenters.map((tc) => {
      const dx = c.x - tc.x;
      const dy = c.y - tc.y;
      const d = Math.hypot(dx, dy);
      return Math.round(d * 3.19);
    });
    const valuesStr = values.join(',');

    const labelEl = city.el?.querySelector('.label');
    if (!labelEl) continue;

    const fallbackBase = t('palette.city');
    setParenValues(labelEl, valuesStr, fallbackBase);
  }

  // Persist URL and history snapshot
  saveToURLImmediate();
  saveCheckpoint();
}

/**
 * Shorten the current relative URL using the backend API.
 * Falls back to absolute if the server responds with a relative short path.
 * @returns {Promise<string>}
 */
async function shortenCurrentUrl() {
  saveToURLImmediate();

  const u = new URL(location.href);
  const rel = u.pathname + u.search + u.hash;

  const res = await fetch('/api/shorten', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: rel }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error('shorten-failed');

  const candidate = data.short_url;
  if (!candidate) throw new Error('shorten-missing');

  const out = candidate.startsWith('http')
    ? candidate
    : new URL(candidate, location.origin).toString();

  return out;
}

/**
 * Show modal with URL when clipboard copy fails.
 * @param {string} url - The URL to display in the modal
 */
function showUrlModal(url) {
  const modal = document.getElementById('urlModal');
  const input = document.getElementById('urlDisplayInput');
  const closeBtn = document.getElementById('urlModalClose');
  const copyBtn = document.getElementById('urlModalCopy');

  if (!modal || !input || !closeBtn || !copyBtn) {
    console.error('Modal elements not found');
    alert(t('msg.copyError') || 'Failed to copy to clipboard. URL: ' + url);
    return;
  }

  // Set URL in input
  input.value = url;

  // Show modal
  modal.style.display = 'flex';

  // Auto-select text
  setTimeout(() => {
    input.select();
    input.focus();
  }, 100);

  // Close button handler
  const closeModal = () => {
    modal.style.display = 'none';
  };

  closeBtn.onclick = closeModal;

  // Copy button handler
  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      copyBtn.textContent = t('msg.copied') || '✓ 복사됨';
      setTimeout(() => {
        copyBtn.textContent = t('modal.urlCopy.copyBtn') || '복사';
        closeModal();
      }, 1000);
    } catch (err) {
      console.error('Modal clipboard copy failed:', err);
      // Fallback: select all text
      input.select();
      input.setSelectionRange(0, 99999); // For mobile
      alert(t('msg.copyManual') || 'Ctrl+C / Cmd+C로 복사해주세요');
    }
  };

  // Click outside to close
  modal.onclick = (e) => {
    if (e.target === modal) {
      closeModal();
    }
  };

  // ESC key to close
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

// Track current HQ and Trap indices for sequential navigation
let currentHQIndex = -1;
let currentTrapIndex = -1;

export function setupActions() {
  setTitles();

  // Sync button enabled/disabled states based on history capability
  onHistoryChange((canUndo, canRedo) => {
    if (btnUndo) btnUndo.disabled = !canUndo;
    if (btnRedo) btnRedo.disabled = !canRedo;
  });

  // Home: navigate to HQs sequentially, or world center if no HQs exist
  btnHome?.addEventListener('click', (e) => {
    e.preventDefault();

    // Find all HQ blocks
    const hqBlocks = state.blocks.filter((b) => b.kind === 'hq');

    if (hqBlocks.length === 0) {
      // No HQs, go to world center
      currentHQIndex = -1;
      centerToWorldCenter();
      return;
    }

    // Move to next HQ (cycle through them)
    currentHQIndex = (currentHQIndex + 1) % hqBlocks.length;
    const targetHQ = hqBlocks[currentHQIndex];

    // Calculate center of the HQ block
    const center = blockCenterInCells(targetHQ);
    centerToCell(center.x, center.y);
  });

  // Trap: navigate to Traps sequentially, or world center if no Traps exist
  btnTrap?.addEventListener('click', (e) => {
    e.preventDefault();

    // Find all Trap blocks
    const trapBlocks = state.blocks.filter((b) => b.kind === 'trap');

    if (trapBlocks.length === 0) {
      // No Traps, go to world center
      currentTrapIndex = -1;
      centerToWorldCenter();
      return;
    }

    // Move to next Trap (cycle through them)
    currentTrapIndex = (currentTrapIndex + 1) % trapBlocks.length;
    const targetTrap = trapBlocks[currentTrapIndex];

    // Calculate center of the Trap block
    const center = blockCenterInCells(targetTrap);
    centerToCell(center.x, center.y);
  });

  // Undo / Redo
  btnUndo?.addEventListener('click', () => undo());
  btnRedo?.addEventListener('click', () => redo());

  // City labels <= distances to traps
  btnCityTrapDist?.addEventListener('click', () => {
    applyCityLabelsWithTrapDistance();
  });

  // Reset board
  btnReset?.addEventListener('click', () => {
    if (!confirm(t('alert.resetConfirm'))) return;

    // Remove only non-immutable blocks
    rot.querySelectorAll('.block').forEach((el) => {
      const block = state.blocks.find((b) => b.el === el);
      if (!block || !block.immutable) {
        el.remove();
      }
    });

    // Keep only immutable blocks
    state.blocks = state.blocks.filter((b) => b.immutable);
    state.paintedSet.clear();
    state.userPaint.clear();

    tilesLayer.innerHTML = '';
    userLayer.innerHTML = '';
    outlinesLayer.innerHTML = '';
    outlinesPreviewLayer.innerHTML = '';
    previewLayer.innerHTML = '';

    recomputePaint();
    renderUserTiles();
    validateAllObjects();
    updateAllCounts();

    saveToURLImmediate();
    saveCheckpoint(); // history snapshot
  });

  // Copy URL (TTL 7 days via shortener) — on failure, show modal
  btnCopyURL?.addEventListener('click', async () => {
    const restoreIcon = () => setTimeout(() => (btnCopyURL.textContent = '🔗'), 1200);

    // iOS requires clipboard write to happen immediately on user gesture
    // First, copy the full URL to clipboard synchronously
    saveToURLImmediate();
    const fullUrl = location.href;

    // Try to get shortened URL
    let urlToCopy = fullUrl;
    let isShortened = false;
    try {
      urlToCopy = await shortenCurrentUrl();
      isShortened = true;
    } catch (err) {
      console.warn('Shortening failed, using full URL:', err);
    }

    // Try to copy to clipboard
    try {
      await navigator.clipboard.writeText(urlToCopy);
      btnCopyURL.textContent = isShortened ? t('msg.copiedShort') : t('msg.copiedFull');
      restoreIcon();
    } catch (err) {
      console.error('Clipboard write failed:', err);
      // Show modal with URL
      showUrlModal(urlToCopy);
    }
  });

  // Export PNG
  btnExportPNG?.addEventListener('click', async () => {
    try {
      const blob = await exportPNG();
      if (!blob) {
        throw new Error('Export returned empty blob');
      }
      const a = document.createElement('a');
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      a.download = `grid-export-${ts}.png`;
      a.href = URL.createObjectURL(blob);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    } catch (e) {
      console.error('PNG export error:', e);
      // Check if it's a memory/canvas size error
      const errorMsg = e.message || '';
      if (
        errorMsg.includes('memory') ||
        errorMsg.includes('ImageData') ||
        errorMsg.includes('canvas') ||
        errorMsg.includes('too large')
      ) {
        alert(t('alert.exportAreaTooLarge'));
      } else {
        alert(t('alert.exportFail'));
      }
    }
  });

  // Import PNG
  btnImportPNG?.addEventListener('click', () => {
    pngFileInput?.click();
  });

  pngFileInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Extract hash from PNG metadata
      const hash = await importPNG(file);

      // Deserialize state from hash
      const parsed = deserializeState(hash);
      const c = cellPx();

      // Clear existing non-immutable blocks
      rot.querySelectorAll('.block:not([data-immutable])').forEach((el) => el.remove());
      state.blocks = state.blocks.filter((b) => b.immutable);
      state.paintedSet.clear();
      state.userPaint = new Set(parsed.red || []);
      renderUserTiles();

      // Restore blocks from parsed state
      state._restoring = true;
      for (const it of parsed.blocks) {
        const left = it.cx * c;
        const top = it.cy * c;

        const el = createBlock(
          it.kind,
          it.size,
          left,
          top,
          it.width,
          it.height,
          false,
          null,
          it.fontSize,
          it.wordWrap,
        );
        if (it.label) {
          const lbl = el.querySelector('.label');
          if (lbl) lbl.textContent = it.label;
        }

        makeMovable(el);
      }
      state._restoring = false;

      // Recompute and validate
      recomputePaint();
      validateAllObjects();
      updateAllCounts();

      // Update URL with imported state
      updateURLWithSerialized(hash);

      // Save to history
      saveCheckpoint();
    } catch (error) {
      console.error('PNG import error:', error);
      alert(error.message || t('alert.importFail') || 'Failed to import PNG');
    } finally {
      // Reset file input to allow re-importing the same file
      pngFileInput.value = '';
    }
  });

  // Keyboard shortcuts (Cmd/Ctrl modifiers)
  window.addEventListener('keydown', (e) => {
    const meta = e.metaKey || e.ctrlKey;
    if (!meta) return;

    const k = e.key.toLowerCase();

    // Undo: Cmd/Ctrl+Z
    if (k === 'z' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      undo();
      return;
    }
    // Redo: Shift+Cmd+Z or Ctrl+Y
    if ((k === 'z' && e.shiftKey) || k === 'y') {
      e.preventDefault();
      redo();
      return;
    }
    // Distance labels: Cmd/Ctrl+Alt+D
    if (k === 'd' && e.altKey) {
      e.preventDefault();
      btnCityTrapDist?.click();
      return;
    }
    // Reset: Cmd/Ctrl+Alt+R
    if (k === 'r' && e.altKey) {
      e.preventDefault();
      btnReset?.click();
      return;
    }
    // Copy URL: Cmd/Ctrl+Alt+C
    if (k === 'c' && e.altKey) {
      e.preventDefault();
      btnCopyURL?.click();
      return;
    }
    // Export PNG: Cmd/Ctrl+Alt+E
    if (k === 'e' && e.altKey) {
      e.preventDefault();
      btnExportPNG?.click();
      return;
    }
    // Import PNG: Cmd/Ctrl+Alt+I
    if (k === 'i' && e.altKey) {
      e.preventDefault();
      btnImportPNG?.click();
      return;
    }
  });
}
