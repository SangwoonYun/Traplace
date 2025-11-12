// File: app/static/js/actions.js
/**
 * High-level UI actions and keyboard shortcuts.
 * - Sets toolbar titles (with platform-specific shortcuts)
 * - Applies city labels with distances to traps
 * - Reset / Copy URL / Export PNG / Undo / Redo behaviors
 */

import { state } from './state.js';
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
  btnUndo,
  btnRedo,
  btnHome,
  btnTrap,
  btnCityTrapDist,
} from './dom.js';
import { recomputePaint, renderUserTiles, centerToWorldCenter, centerToCell } from './render.js';
import { validateAllObjects } from './blocks.js';
import { updateAllCounts } from './counters.js';
import { saveToURLImmediate } from './urlState.js';
import { exportPNG } from './exportPNG.js';
import { undo, redo, onHistoryChange, saveCheckpoint } from './history.js';
import { posToCell } from './transform.js';
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
    dist: mac ? '⌥⌘D' : 'Ctrl+Alt+D',
  };
  if (btnUndo) btnUndo.title = `${t('ui.toolbar.undo')} (${sc.undo})`;
  if (btnRedo) btnRedo.title = `${t('ui.toolbar.redo')} (${sc.redo})`;
  if (btnReset) btnReset.title = `${t('ui.toolbar.reset')} (${sc.reset})`;
  if (btnCopyURL) btnCopyURL.title = `${t('ui.toolbar.copy')} (${sc.copy})`;
  if (btnExportPNG) btnExportPNG.title = `${t('ui.toolbar.export')} (${sc.export})`;
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

    rot.querySelectorAll('.block').forEach((el) => el.remove());
    state.blocks = [];
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

  // Copy URL (TTL 7 days via shortener) — on failure, fallback to full URL
  btnCopyURL?.addEventListener('click', async () => {
    const restoreIcon = () => setTimeout(() => (btnCopyURL.textContent = '🔗'), 1200);
    try {
      const shortUrl = await shortenCurrentUrl();
      await navigator.clipboard.writeText(shortUrl);
      btnCopyURL.textContent = t('msg.copiedShort');
      restoreIcon();
    } catch {
      // Fallback: copy full URL
      try {
        saveToURLImmediate();
        await navigator.clipboard.writeText(location.href);
        btnCopyURL.textContent = t('msg.copiedFull');
        restoreIcon();
      } catch {
        // Legacy fallback using a temporary textarea
        const ta = document.createElement('textarea');
        ta.value = location.href;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        btnCopyURL.textContent = t('msg.copiedFull');
        restoreIcon();
      }
    }
  });

  // Export PNG
  btnExportPNG?.addEventListener('click', async () => {
    try {
      const blob = await exportPNG();
      const a = document.createElement('a');
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      a.download = `grid-export-${ts}.png`;
      a.href = URL.createObjectURL(blob);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    } catch (e) {
      console.error(e);
      alert(t('alert.exportFail'));
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
  });
}
