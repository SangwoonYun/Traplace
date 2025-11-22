// File: app/static/js/main.js
/**
 * App bootstrap:
 * - Initialize layout, i18n, counters
 * - Restore state from URL
 * - Wire up interactions (drag/pan/zoom/tile toggle/cursor/info)
 * - Kick off initial render + history snapshot
 */

import {
  initialLayout,
  renderUserTiles,
  renderBaseTiles,
  recomputePaint,
  updateBadge,
  centerToCell,
  setWorldSizeCells,
  centerToInitialPosition,
} from './render.js';
import { setupPaletteDrag, makeMovable } from './interactions/drag.js';
import { setupPan } from './interactions/pan.js';
import { setupZoom } from './interactions/zoom.js';
import { setupTileToggle } from './interactions/tileToggle.js';
import { setupCursorBadge } from './interactions/cursor.js';
import { setupCoordJump } from './interactions/coordJump.js';
import { validateAllObjects, createBlock } from './blocks.js';
import { expand } from './interactions/expand.js';
import { parseFromURL } from './urlState.js';
import { state, cellPx, BASE_CELLS_X, BASE_CELLS_Y } from './state.js';
import { setupActions, setTitles } from './actions.js';
import { initHistoryWithCurrent, saveCheckpoint } from './history.js';
import {
  detectPreferredLang,
  loadLanguageOnline,
  currentLang,
  updateBlockLabelsForLocale,
} from './i18n.js';
import { initCounters, updateAllCounts } from './counters.js';
import { enableDragScroll } from './interactions/hscroll.js';
import { setupColorPicker } from './colorPicker.js';

/* ---------------------------------------------
 * Helper Functions
 * ------------------------------------------- */

/**
 * Update legal page links with current language parameter
 * @param {string} lang - Current language code
 */
function updateLegalLinks(lang) {
  const privacyLink = document.querySelector('a[data-i18n="ui.footer.privacy"]');
  const termsLink = document.querySelector('a[data-i18n="ui.footer.terms"]');

  if (privacyLink) {
    const privacyUrl = new URL(privacyLink.href);
    privacyUrl.searchParams.set('lang', lang);
    privacyLink.href = privacyUrl.toString();
  }

  if (termsLink) {
    const termsUrl = new URL(termsLink.href);
    termsUrl.searchParams.set('lang', lang);
    termsLink.href = termsUrl.toString();
  }
}

/* ---------------------------------------------
 * Bootstrap
 * ------------------------------------------- */

/** Initialize app once the window has fully loaded. */
window.addEventListener('load', async () => {
  /* ---------------------------------------------
   * Initial layout + counters
   * ------------------------------------------- */
  initialLayout();
  initCounters();

  /* ---------------------------------------------
   * i18n (temporarily disable palette hit-testing)
   * ------------------------------------------- */
  const palette = document.getElementById('palette');
  const prevPointerEvents = palette?.style.pointerEvents;
  try {
    if (palette) palette.style.pointerEvents = 'none';

    const lang = detectPreferredLang();
    await loadLanguageOnline(lang);
    updateBlockLabelsForLocale(state);
  } finally {
    if (palette) palette.style.pointerEvents = prevPointerEvents ?? '';
  }

  enableDragScroll(palette);

  // Bind language selector
  const sel = document.getElementById('langSelect');
  if (sel) {
    // Make sure currentLang is reflected in the selector
    sel.value = currentLang();
    sel.addEventListener('change', async () => {
      await loadLanguageOnline(sel.value);
      updateBlockLabelsForLocale(state);
      setTitles(); // refresh tooltips / shortcut labels
      updateLegalLinks(currentLang()); // Update footer legal links
    });
  }

  // Initial update of legal links
  updateLegalLinks(currentLang());

  /* ---------------------------------------------
   * Setup usage section toggle
   * ------------------------------------------- */
  const usageToggle = document.getElementById('usageToggle');
  const usageContent = document.getElementById('usageContent');

  if (usageToggle && usageContent) {
    // Load saved state from localStorage (default: collapsed)
    const savedState = localStorage.getItem('usageExpanded');

    // If user previously expanded it, restore that state
    if (savedState === 'true') {
      usageContent.classList.remove('collapsed');
      usageToggle.setAttribute('aria-expanded', 'true');
    }

    usageToggle.addEventListener('click', () => {
      const isExpanded = usageToggle.getAttribute('aria-expanded') === 'true';
      const newExpandedState = !isExpanded;

      usageToggle.setAttribute('aria-expanded', newExpandedState);
      usageContent.classList.toggle('collapsed');

      // Save expanded state to localStorage
      localStorage.setItem('usageExpanded', newExpandedState);
    });
  }

  /* ---------------------------------------------
   * Create default castle block (594-605, 594-605) and turrets
   * ------------------------------------------- */
  state._restoring = true;
  const c = cellPx();
  const castleLeft = 594 * c;
  const castleTop = 594 * c;
  createBlock('castle', 12, castleLeft, castleTop, undefined, undefined, true);

  // Create turrets at each corner (2x2 blocks)
  // Note: Labels will be set after i18n loads
  const turret4 = createBlock('turret', 2, 594 * c, 594 * c, undefined, undefined, true); // 12 o'clock (top-left): Turret IV
  const turret3 = createBlock('turret', 2, 604 * c, 594 * c, undefined, undefined, true); // 3 o'clock (top-right): Turret III
  const turret1 = createBlock('turret', 2, 604 * c, 604 * c, undefined, undefined, true); // 6 o'clock (bottom-right): Turret I
  const turret2 = createBlock('turret', 2, 594 * c, 604 * c, undefined, undefined, true); // 9 o'clock (bottom-left): Turret II

  // Store turret elements for i18n updates
  window.__turrets = { turret1, turret2, turret3, turret4 };

  // Create base tiles around castle (8 cells from castle edge)
  // Castle is at 594-605 (12x12), so base tiles are from 586-613 (28x28)
  const castleMinX = 594;
  const castleMaxX = 605;
  const castleMinY = 594;
  const castleMaxY = 605;
  const baseRange = 8;

  for (let y = castleMinY - baseRange; y <= castleMaxY + baseRange; y++) {
    for (let x = castleMinX - baseRange; x <= castleMaxX + baseRange; x++) {
      // Skip cells that are inside the castle
      if (x >= castleMinX && x <= castleMaxX && y >= castleMinY && y <= castleMaxY) {
        continue;
      }
      state.baseTiles.add(`${x},${y}`);
    }
  }

  renderBaseTiles();
  state._restoring = false;

  /* ---------------------------------------------
   * Restore from URL (blocks + red tiles)
   * ------------------------------------------- */
  const parsed = parseFromURL();

  if (parsed?.blocks?.length) {
    state._restoring = true;
    for (const it of parsed.blocks) {
      const c = cellPx();
      const left = it.cx * c;
      const top = it.cy * c;
      const el = createBlock(it.kind, it.size, left, top, it.width, it.height);

      // Restore city and custom block labels if present
      if ((it.kind === 'city' || it.kind === 'custom') && it.label) {
        const lbl = el.querySelector('.label');
        if (lbl) lbl.textContent = it.label;
      }

      makeMovable(el);
    }
    state._restoring = false;
  }

  if (parsed?.red?.length) {
    state.userPaint = new Set(parsed.red);
    renderUserTiles();
  }

  updateAllCounts();

  // Center view based on priority: HQ -> Trap -> World Center
  centerToInitialPosition();

  /* ---------------------------------------------
   * Interactions
   * ------------------------------------------- */
  setupPaletteDrag();
  setupPan(expand);
  setupZoom(expand);
  setupTileToggle();
  setupCursorBadge();
  setupCoordJump();
  setupActions();
  setupColorPicker();

  /* ---------------------------------------------
   * Initial render & validation
   * ------------------------------------------- */
  recomputePaint();
  renderBaseTiles();
  renderUserTiles();
  validateAllObjects();

  /* ---------------------------------------------
   * History: initial snapshot
   * ------------------------------------------- */
  initHistoryWithCurrent();
});

/* ---------------------------------------------
 * Visual viewport height variable (--app-vh)
 *  - Prevents 100vh white mask under mobile browser toolbars
 *  - Always stores px (e.g., "734px")
 * ------------------------------------------- */
function updateAppVhVar() {
  const vv = window.visualViewport;
  const h = Math.max(0, Math.floor(vv?.height || window.innerHeight));
  document.documentElement.style.setProperty('--app-vh', `${h}px`);
}

// Initialize once on load
updateAppVhVar();

// Keep in sync with viewport/toolbars movement
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    updateAppVhVar();
    // Layout depends on viewport height; keep world & overlays consistent
    requestAnimationFrame(relayoutForCellChange);
  });
  window.visualViewport.addEventListener('scroll', () => {
    // Some browsers change visual viewport on scroll (address bar hides/shows)
    updateAppVhVar();
    requestAnimationFrame(relayoutForCellChange);
  });
}

/* ---------------------------------------------
 * Resize / orientationchange reflow
 *  - Keep world pixel size in sync with dynamic --cell
 *  - Prevent stale scroll clamp after media query changes
 * ------------------------------------------- */
function relayoutForCellChange() {
  // Recompute world px size against the latest cellPx()
  setWorldSizeCells(BASE_CELLS_X, BASE_CELLS_Y);
  // Repaint overlays
  renderBaseTiles();
  renderUserTiles();
  recomputePaint();
  // Keep badge up to date
  updateBadge();
}

window.addEventListener('resize', () => {
  // Debounce-ish via rAF to avoid thrash
  requestAnimationFrame(relayoutForCellChange);
});

window.addEventListener('orientationchange', () => {
  // Some mobile browsers fire resize later; do one pass immediately
  updateAppVhVar();
  relayoutForCellChange();
});

/* ---------------------------------------------
 * Debug helpers (optional)
 * ------------------------------------------- */

Object.assign(window, { state, centerToCell, updateBadge, saveCheckpoint });
