// File: app/static/js/history.js
/**
 * Undo/Redo history for grid state.
 *
 * Stores serialized snapshots of the world and re-applies them on navigation.
 * - Bounded stack with tail-drop policy
 * - Notifies UI on changes (canUndo/canRedo)
 */

import { state, cellPx } from './state.js';
import { rot } from './dom.js';
import { serializeState, deserializeState, updateURLWithSerialized } from './urlState.js';
import { createBlock, validateAllObjects } from './blocks.js';
import { renderUserTiles, recomputePaint, renderObjectLayer } from './render.js';
import { createObjectLayer } from './objectLayer.js';
import { refreshControlPoints } from './interactions/objectLayer.js';
import { makeMovable } from './interactions/drag.js';
import { updateAllCounts } from './counters.js';

/** Max number of snapshots kept in history. Oldest entries are dropped. */
const HISTORY_LIMIT = 100;

/** @typedef {{ stack:string[], index:number, onChange: (null | ((canUndo:boolean, canRedo:boolean)=>void)) }} HistoryState */

/** @type {HistoryState} */
const historyState = {
  stack: [],
  index: -1,
  onChange: null,
};

/* ---------------------------------------------
 * Internal helpers
 * ------------------------------------------- */

/** Notify subscribers (e.g., toolbar buttons) about undo/redo availability. */
function notify() {
  historyState.onChange?.(canUndo(), canRedo());
}

/**
 * Apply a serialized snapshot to the DOM and in-memory state.
 * Uses a `_restoring` guard to batch recompute/validate at the end.
 * @param {string} qs
 */
function applySerialized(qs) {
  const parsed = deserializeState(qs);
  const c = cellPx();

  // Clear existing non-immutable blocks only (preserve castle, turrets, fortresses)
  rot.querySelectorAll('.block:not([data-immutable])').forEach((el) => el.remove());
  state.blocks = state.blocks.filter((b) => b.immutable);
  state.paintedSet.clear();
  state.userPaint = new Set(parsed.red || []);
  state.objectLayers = [];
  state.selectedObjectId = null;
  renderUserTiles();

  // Rebuild (defer heavy ops until done)
  state._restoring = true;
  for (const it of parsed.blocks) {
    const left = it.cx * c;
    const top = it.cy * c;

    const el = createBlock(it.kind, it.size, left, top, it.width, it.height);

    // Restore city and custom block labels if any
    if ((it.kind === 'city' || it.kind === 'custom') && it.label) {
      const lbl = el.querySelector('.label');
      if (lbl) lbl.textContent = it.label;
    }

    makeMovable(el);
  }

  // Rebuild object layers
  if (parsed.objectLayers?.length) {
    for (const it of parsed.objectLayers) {
      const left = it.cx * c;
      const top = it.cy * c;
      const obj = createObjectLayer(left, top, it.baseWidth, it.baseHeight, it.color);
      obj.topEdge = it.topEdge;
      obj.rightEdge = it.rightEdge;
      obj.bottomEdge = it.bottomEdge;
      obj.leftEdge = it.leftEdge;
      if (it.label) obj.label = it.label;
    }
  }
  state._restoring = false;

  // Single recompute/validate pass
  recomputePaint();
  renderObjectLayer();
  refreshControlPoints();
  validateAllObjects();
  updateAllCounts();

  // Sync URL (no re-serialize needed; we already have `qs`)
  updateURLWithSerialized(qs);
}

/* ---------------------------------------------
 * Public API
 * ------------------------------------------- */

/** Initialize history with the current state as the first snapshot. */
export function initHistoryWithCurrent() {
  const qs = serializeState();
  historyState.stack = [qs];
  historyState.index = 0;
  notify();
}

/** Push a new snapshot if it differs from the current one; enforce size bound. */
export function saveCheckpoint() {
  const qs = serializeState();
  const cur = historyState.stack[historyState.index];
  if (qs === cur) return; // no-op

  // Drop future states if we branched
  historyState.stack = historyState.stack.slice(0, historyState.index + 1);
  historyState.stack.push(qs);

  // Enforce limit (drop from the head)
  if (historyState.stack.length > HISTORY_LIMIT) {
    const drop = historyState.stack.length - HISTORY_LIMIT;
    historyState.stack.splice(0, drop);
    historyState.index = Math.max(0, historyState.index - drop);
  }

  historyState.index = historyState.stack.length - 1;
  notify();
}

/** @returns {boolean} */
export function canUndo() {
  return historyState.index > 0;
}

/** @returns {boolean} */
export function canRedo() {
  return historyState.index < historyState.stack.length - 1;
}

/** Step backward in history and re-apply. */
export function undo() {
  if (!canUndo()) return;
  historyState.index -= 1;
  applySerialized(historyState.stack[historyState.index]);
  notify();
}

/** Step forward in history and re-apply. */
export function redo() {
  if (!canRedo()) return;
  historyState.index += 1;
  applySerialized(historyState.stack[historyState.index]);
  notify();
}

/**
 * Subscribe to history changes. The callback is immediately invoked
 * with the current `canUndo` / `canRedo` snapshot.
 * @param {(canUndo:boolean, canRedo:boolean)=>void} cb
 */
export function onHistoryChange(cb) {
  historyState.onChange = cb;
  notify();
}
