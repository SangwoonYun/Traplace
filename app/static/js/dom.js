// File: app/static/js/dom.js
/**
 * Cached DOM references used throughout the app.
 * Querying them once here improves performance and clarity.
 */

/* ---------------------------------------------
 * Core layout elements
 * ------------------------------------------- */
export const viewport = document.getElementById('viewport');
export const world = document.getElementById('world');
export const rot = document.getElementById('rot');

/* ---------------------------------------------
 * Tile and overlay layers
 * ------------------------------------------- */
export const tilesLayer = document.getElementById('tiles');
export const previewLayer = document.getElementById('tilesPreview');
export const outlinesLayer = document.getElementById('outlines');
export const outlinesPreviewLayer = document.getElementById('outlinesPreview');
export const userLayer = document.getElementById('tilesUser');
export const snapEl = document.getElementById('snap');

/* ---------------------------------------------
 * Status & utility UI
 * ------------------------------------------- */
export const badge = document.getElementById('badge');
export const badgeText = document.getElementById('badgeText'); // deprecated, for backward compatibility
export const badgeCoord = document.getElementById('badgeCoord');
export const badgeZoom = document.getElementById('badgeZoom');
export const badgeInput = document.getElementById('badgeInput');
export const btnHome = document.getElementById('btnHome');
export const btnTrap = document.getElementById('btnTrap');
export const trash = document.getElementById('trashZone');

/* ---------------------------------------------
 * Palette
 * ------------------------------------------- */
export const palette = document.getElementById('palette');

/* ---------------------------------------------
 * Toolbar buttons
 * ------------------------------------------- */
export const btnUndo = document.getElementById('btnUndo');
export const btnRedo = document.getElementById('btnRedo');
export const btnCityTrapDist = document.getElementById('btnCityTrapDist');
export const btnReset = document.getElementById('btnReset');
export const btnCopyURL = document.getElementById('btnCopyURL');
export const btnExportPNG = document.getElementById('btnExportPNG');
