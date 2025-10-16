// File: app/static/js/counters.js
/**
 * Palette counters: keep live counts of placed blocks per kind/size
 * and render them as badges on palette items.
 */

import { state } from './state.js';

/** @type {Map<string, number>} key -> count */
let counts = new Map();

/**
 * Build a stable key for a block kind/size pair.
 * For non-generic kinds, size is normalized to 0.
 * @param {string} kind
 * @param {number} size
 * @returns {string}
 */
const keyFor = (kind, size) => `${kind}:${kind === 'block' ? size : 0}`;

/* ---------------------------------------------
 * DOM helpers
 * ------------------------------------------- */

/**
 * Ensure each palette item has a `.pi-count` badge element.
 */
function ensureBadges() {
  document.querySelectorAll('.palette-item').forEach((el) => {
    if (!el.querySelector('.pi-count')) {
      const badge = document.createElement('span');
      badge.className = 'pi-count';
      badge.textContent = '0';
      el.appendChild(badge);
    }
  });
}

/**
 * Render current counts to the palette badges.
 */
function renderPaletteCounts() {
  ensureBadges();

  document.querySelectorAll('.palette-item').forEach((el) => {
    const kind = el.dataset.kind || '';
    const size = Number(el.dataset.size || 0);
    const key = keyFor(kind, size);
    const n = counts.get(key) ?? 0;

    const badge = el.querySelector('.pi-count');
    if (!badge) return;

    badge.textContent = String(n);
    // Visual hint: faded when zero, emphasized otherwise
    badge.classList.toggle('is-zero', n === 0);
  });
}

/* ---------------------------------------------
 * State computation
 * ------------------------------------------- */

/**
 * Recompute counts from the current `state.blocks`.
 */
function computeCountsFromState() {
  const m = new Map();
  for (const b of state.blocks) {
    const key = keyFor(b.kind, b.size);
    m.set(key, (m.get(key) || 0) + 1);
  }
  counts = m;
}

/* ---------------------------------------------
 * Public API
 * ------------------------------------------- */

/**
 * Initialize counters and render initial badges.
 */
export function initCounters() {
  ensureBadges();
  updateAllCounts();
}

/**
 * Recompute all counts from state and update the UI.
 */
export function updateAllCounts() {
  computeCountsFromState();
  renderPaletteCounts();
}

/**
 * Notify counters that a block has been created.
 * @param {{kind:string, size:number}} b
 */
export function onCreateBlock(b) {
  const key = keyFor(b.kind, b.size);
  counts.set(key, (counts.get(key) || 0) + 1);
  renderPaletteCounts();
}

/**
 * Notify counters that a block has been deleted.
 * @param {{kind:string, size:number}} b
 */
export function onDeleteBlock(b) {
  const key = keyFor(b.kind, b.size);
  const next = (counts.get(key) || 0) - 1;
  counts.set(key, Math.max(0, next));
  renderPaletteCounts();
}
