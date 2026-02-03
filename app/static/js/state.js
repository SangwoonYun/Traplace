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
 * @property {'hq'|'flag'|'trap'|'city'|'resource'|'block'|'castle'|'turret'} kind
 * @property {number} size
 * @property {number} left
 * @property {number} top
 * @property {boolean} [customLabel]
 * @property {boolean} [immutable]
 */

/**
 * @typedef {Object} ObjectLayerItem
 * @property {string} id - Unique identifier
 * @property {number} left - Top-left x position (pixels)
 * @property {number} top - Top-left y position (pixels)
 * @property {number} baseWidth - Base width in cells
 * @property {number} baseHeight - Base height in cells
 * @property {string} color - Fill color (hex or rgba)
 * @property {string} [label] - Optional label text
 * @property {number[]} topEdge - Array of offsets for each cell on top edge
 * @property {number[]} rightEdge - Array of offsets for each cell on right edge
 * @property {number[]} bottomEdge - Array of offsets for each cell on bottom edge
 * @property {number[]} leftEdge - Array of offsets for each cell on left edge
 */

export const state = {
  zoom: 1,

  /** @type {Block[]} */
  blocks: [],

  /** Union of blue painter coverage ("x,y" keys). */
  paintedSet: new Set(),

  /** Red zone tiles (light red, around castle and fortresses) ("x,y" keys). */
  redZone: new Set(),

  /** User red paint toggles ("x,y" keys). */
  userPaint: new Set(),

  /** @type {ObjectLayerItem[]} */
  objectLayers: [],

  /** Currently selected object layer item ID for editing */
  selectedObjectId: null,

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
