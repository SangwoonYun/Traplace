// File: app/static/js/state.js
/**
 * Global constants and application state.
 * - Cell size is read from the CSS variable `--cell` with a safe fallback.
 * - `state` is the single source of truth for runtime data.
 */

/* ---------------------------------------------
 * Grid / world constants
 * ------------------------------------------- */
export const BASE_CELLS_X = 1200;
export const BASE_CELLS_Y = 1200;
export const EXPAND_CELLS = 300;
export const EXPAND_MARGIN = 300; // px

/* ---------------------------------------------
 * Cell size (px) from CSS variable with fallback
 * ------------------------------------------- */
// NOTE: Make cell size dynamic so that media queries / orientation changes
// don't desync world pixel size vs scrollable bounds.
export function cellPx() {
  const v = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell'), 10);
  return Number.isFinite(v) && v > 0 ? v : 48;
}
/* ---------------------------------------------
 * Runtime state
 * ------------------------------------------- */
/**
 * @typedef {Object} Block
 * @property {HTMLElement} el
 * @property {'hq'|'flag'|'trap'|'city'|'resource'|'block'} kind
 * @property {number} size
 * @property {number} left
 * @property {number} top
 * @property {boolean} [customLabel]
 */

export const state = {
  zoom: 1,

  /** @type {Block[]} */
  blocks: [],

  /** Union of blue painter coverage ("x,y" keys). */
  paintedSet: new Set(),

  /** User red paint toggles ("x,y" keys). */
  userPaint: new Set(),

  /** Last-known cursor cell (for HUD). */
  cursorCell: { x: 599, y: 599 },

  /** Drag interaction state (managed by interactions). */
  drag: null,

  /** Panning interaction state. */
  panning: null,

  /** Disable auto-expand behavior when true. */
  AUTO_EXPAND: false,

  /** Internal guard while restoring from URL/history. */
  _restoring: false,
};

/* ---------------------------------------------
 * Debug / runtime toggles
 * ------------------------------------------- */
/**
 * Toggle auto-expand behavior at runtime.
 * @param {boolean} v
 */
export function setAutoExpand(v) {
  state.AUTO_EXPAND = !!v;
}

// Expose for console debugging (no-op if window is unavailable)
if (typeof window !== 'undefined') {
  window.setAutoExpand = setAutoExpand;
}
