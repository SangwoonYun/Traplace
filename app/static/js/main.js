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
  renderRedZone,
  renderRuins,
  renderRich,
  renderPlain,
  renderBarren,
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
import { parseFromURL, saveToURLImmediate } from './urlState.js';
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
  // Use placeholder names that will be replaced by i18n
  const turret4 = createBlock('turret', 2, 594 * c, 594 * c, undefined, undefined, true, '포탑 IV'); // 12 o'clock (top-left): Turret IV
  const turret3 = createBlock(
    'turret',
    2,
    604 * c,
    594 * c,
    undefined,
    undefined,
    true,
    '포탑 III',
  ); // 3 o'clock (top-right): Turret III
  const turret1 = createBlock('turret', 2, 604 * c, 604 * c, undefined, undefined, true, '포탑 I'); // 6 o'clock (bottom-right): Turret I
  const turret2 = createBlock('turret', 2, 594 * c, 604 * c, undefined, undefined, true, '포탑 II'); // 9 o'clock (bottom-left): Turret II

  // Store turret elements for i18n updates
  window.__turrets = { turret1, turret2, turret3, turret4 };

  // Create fortress blocks (6×6 each)
  const fortress1 = createBlock('fortress', 6, 800 * c, 597 * c, undefined, undefined, true, '성채 I'); // 12 o'clock
  const fortress2 = createBlock('fortress', 6, 597 * c, 400 * c, undefined, undefined, true, '성채 II'); // 3 o'clock
  const fortress3 = createBlock('fortress', 6, 400 * c, 597 * c, undefined, undefined, true, '성채 III'); // 6 o'clock
  const fortress4 = createBlock('fortress', 6, 597 * c, 800 * c, undefined, undefined, true, '성채 IV'); // 9 o'clock

  // Store fortress elements for i18n updates
  window.__fortresses = { fortress1, fortress2, fortress3, fortress4 };

  // Create sanctuary blocks (6×6 each) with Roman numerals
  const sanctuary1 = createBlock('sanctuary', 6, 828 * c, 237 * c, undefined, undefined, true, '유적 I');
  const sanctuary2 = createBlock('sanctuary', 6, 606 * c, 237 * c, undefined, undefined, true, '유적 II');
  const sanctuary3 = createBlock('sanctuary', 6, 348 * c, 237 * c, undefined, undefined, true, '유적 III');
  const sanctuary4 = createBlock('sanctuary', 6, 237 * c, 366 * c, undefined, undefined, true, '유적 IV');
  const sanctuary5 = createBlock('sanctuary', 6, 237 * c, 588 * c, undefined, undefined, true, '유적 V');
  const sanctuary6 = createBlock('sanctuary', 6, 237 * c, 846 * c, undefined, undefined, true, '유적 VI');
  const sanctuary7 = createBlock('sanctuary', 6, 348 * c, 957 * c, undefined, undefined, true, '유적 VII');
  const sanctuary8 = createBlock('sanctuary', 6, 606 * c, 957 * c, undefined, undefined, true, '유적 VIII');
  const sanctuary9 = createBlock('sanctuary', 6, 828 * c, 957 * c, undefined, undefined, true, '유적 IX');
  const sanctuary10 = createBlock('sanctuary', 6, 957 * c, 846 * c, undefined, undefined, true, '유적 X');
  const sanctuary11 = createBlock('sanctuary', 6, 957 * c, 606 * c, undefined, undefined, true, '유적 XI');
  const sanctuary12 = createBlock('sanctuary', 6, 957 * c, 366 * c, undefined, undefined, true, '유적 XII');

  // Store sanctuary elements for i18n updates
  window.__sanctuaries = {
    sanctuary1,
    sanctuary2,
    sanctuary3,
    sanctuary4,
    sanctuary5,
    sanctuary6,
    sanctuary7,
    sanctuary8,
    sanctuary9,
    sanctuary10,
    sanctuary11,
    sanctuary12,
  };

  // Create red zone tiles around castle (8 cells from castle edge)
  // Castle is at 594-605 (12x12), so red zone tiles are from 586-613 (28x28)
  const castleMinX = 594;
  const castleMaxX = 605;
  const castleMinY = 594;
  const castleMaxY = 605;
  const redZoneRange = 8;

  // Castle center is approximately at (599.5, 599.5)
  const castleCenterX = 599.5;
  const castleCenterY = 599.5;

  // Barren tiles cover entire map via CSS background - no need to fill state.barren

  // Create plain tiles in a square centered on castle
  // One corner of the square is at (899, 899)
  const plainCornerX = 899;
  const plainCornerY = 899;
  const plainDx = plainCornerX - castleCenterX;
  const plainDy = plainCornerY - castleCenterY;
  const plainHalfDiagonal = Math.sqrt(plainDx * plainDx + plainDy * plainDy);
  const plainHalfSide = plainHalfDiagonal / Math.sqrt(2);

  const plainMinX = Math.floor(castleCenterX - plainHalfSide);
  const plainMaxX = Math.ceil(castleCenterX + plainHalfSide);
  const plainMinY = Math.floor(castleCenterY - plainHalfSide);
  const plainMaxY = Math.ceil(castleCenterY + plainHalfSide);

  // Create rich tiles in a square centered on castle
  // One corner of the square is at (749, 749)
  const richCornerX = 749;
  const richCornerY = 749;
  const richDx = richCornerX - castleCenterX;
  const richDy = richCornerY - castleCenterY;
  const richHalfDiagonal = Math.sqrt(richDx * richDx + richDy * richDy);
  const richHalfSide = richHalfDiagonal / Math.sqrt(2);

  const richMinX = Math.floor(castleCenterX - richHalfSide);
  const richMaxX = Math.ceil(castleCenterX + richHalfSide);
  const richMinY = Math.floor(castleCenterY - richHalfSide);
  const richMaxY = Math.ceil(castleCenterY + richHalfSide);

  // Create ruins tiles in a square centered on castle
  // One corner of the square is at (647, 552)
  const ruinsCornerX = 647;
  const ruinsCornerY = 552;
  const ruinsDx = ruinsCornerX - castleCenterX;
  const ruinsDy = ruinsCornerY - castleCenterY;
  const ruinsHalfDiagonal = Math.sqrt(ruinsDx * ruinsDx + ruinsDy * ruinsDy);
  const ruinsHalfSide = ruinsHalfDiagonal / Math.sqrt(2);

  const ruinsMinX = Math.floor(castleCenterX - ruinsHalfSide);
  const ruinsMaxX = Math.ceil(castleCenterX + ruinsHalfSide);
  const ruinsMinY = Math.floor(castleCenterY - ruinsHalfSide);
  const ruinsMaxY = Math.ceil(castleCenterY + ruinsHalfSide);

  // Fill the square with plain tiles (excluding rich area)
  for (let y = plainMinY; y <= plainMaxY; y++) {
    for (let x = plainMinX; x <= plainMaxX; x++) {
      // Skip cells inside rich area
      if (x >= richMinX && x <= richMaxX && y >= richMinY && y <= richMaxY) {
        continue;
      }
      state.plain.add(`${x},${y}`);
    }
  }

  // Fill the square with rich tiles (excluding ruins area)
  for (let y = richMinY; y <= richMaxY; y++) {
    for (let x = richMinX; x <= richMaxX; x++) {
      // Skip cells inside ruins area
      if (x >= ruinsMinX && x <= ruinsMaxX && y >= ruinsMinY && y <= ruinsMaxY) {
        continue;
      }
      state.rich.add(`${x},${y}`);
    }
  }

  // Fill the square with ruins tiles (excluding red zone area)
  for (let y = ruinsMinY; y <= ruinsMaxY; y++) {
    for (let x = ruinsMinX; x <= ruinsMaxX; x++) {
      // Skip cells inside or near castle (red zone area)
      if (
        x >= castleMinX - redZoneRange &&
        x <= castleMaxX + redZoneRange &&
        y >= castleMinY - redZoneRange &&
        y <= castleMaxY + redZoneRange
      ) {
        continue;
      }
      state.ruins.add(`${x},${y}`);
    }
  }

  for (let y = castleMinY - redZoneRange; y <= castleMaxY + redZoneRange; y++) {
    for (let x = castleMinX - redZoneRange; x <= castleMaxX + redZoneRange; x++) {
      // Skip cells that are inside the castle
      if (x >= castleMinX && x <= castleMaxX && y >= castleMinY && y <= castleMaxY) {
        continue;
      }
      state.redZone.add(`${x},${y}`);
    }
  }

  // Create red zone tiles around fortresses
  // Each fortress has a 6×6 block with red zone around it
  // Fortress I red zone extends to (570, 774), which is 26 cells from fortress edge
  const fortressRedZoneRange = 27;

  // Fortress I: (597, 800) to (584, 805) - 6×6 block
  const fortress1MinX = 800;
  const fortress1MaxX = 805;
  const fortress1MinY = 597;
  const fortress1MaxY = 602;

  // Fortress II: (597, 400) to (602, 405)
  const fortress2MinX = 597;
  const fortress2MaxX = 602;
  const fortress2MinY = 400;
  const fortress2MaxY = 405;

  // Fortress III: (400, 597) to (405, 602)
  const fortress3MinX = 400;
  const fortress3MaxX = 405;
  const fortress3MinY = 597;
  const fortress3MaxY = 602;

  // Fortress IV: (800, 597) to (805, 602)
  const fortress4MinX = 597;
  const fortress4MaxX = 602;
  const fortress4MinY = 800;
  const fortress4MaxY = 805;

  // Add red zone tiles around Fortress I
  for (let y = fortress1MinY - fortressRedZoneRange; y <= fortress1MaxY + fortressRedZoneRange; y++) {
    for (let x = fortress1MinX - fortressRedZoneRange; x <= fortress1MaxX + fortressRedZoneRange; x++) {
      // Skip cells that are inside the fortress
      if (x >= fortress1MinX && x <= fortress1MaxX && y >= fortress1MinY && y <= fortress1MaxY) {
        continue;
      }
      state.redZone.add(`${x},${y}`);
    }
  }

  // Add red zone tiles around Fortress II
  for (let y = fortress2MinY - fortressRedZoneRange; y <= fortress2MaxY + fortressRedZoneRange; y++) {
    for (let x = fortress2MinX - fortressRedZoneRange; x <= fortress2MaxX + fortressRedZoneRange; x++) {
      // Skip cells that are inside the fortress
      if (x >= fortress2MinX && x <= fortress2MaxX && y >= fortress2MinY && y <= fortress2MaxY) {
        continue;
      }
      state.redZone.add(`${x},${y}`);
    }
  }

  // Add red zone tiles around Fortress III
  for (let y = fortress3MinY - fortressRedZoneRange; y <= fortress3MaxY + fortressRedZoneRange; y++) {
    for (let x = fortress3MinX - fortressRedZoneRange; x <= fortress3MaxX + fortressRedZoneRange; x++) {
      // Skip cells that are inside the fortress
      if (x >= fortress3MinX && x <= fortress3MaxX && y >= fortress3MinY && y <= fortress3MaxY) {
        continue;
      }
      state.redZone.add(`${x},${y}`);
    }
  }

  // Add red zone tiles around Fortress IV
  for (let y = fortress4MinY - fortressRedZoneRange; y <= fortress4MaxY + fortressRedZoneRange; y++) {
    for (let x = fortress4MinX - fortressRedZoneRange; x <= fortress4MaxX + fortressRedZoneRange; x++) {
      // Skip cells that are inside the fortress
      if (x >= fortress4MinX && x <= fortress4MaxX && y >= fortress4MinY && y <= fortress4MaxY) {
        continue;
      }
      state.redZone.add(`${x},${y}`);
    }
  }

  // Create red zone tiles around sanctuaries
  // Each sanctuary has a 6×6 block with red zone around it (same range as fortress)
  const sanctuaryRedZoneRange = 27;

  // Define sanctuary boundaries (6x6 blocks)
  const sanctuaries = [
    { minX: 828, maxX: 833, minY: 237, maxY: 242 }, // Sanctuary I
    { minX: 606, maxX: 611, minY: 237, maxY: 242 }, // Sanctuary II
    { minX: 348, maxX: 353, minY: 237, maxY: 242 }, // Sanctuary III
    { minX: 237, maxX: 242, minY: 366, maxY: 371 }, // Sanctuary IV
    { minX: 237, maxX: 242, minY: 588, maxY: 593 }, // Sanctuary V
    { minX: 237, maxX: 242, minY: 846, maxY: 851 }, // Sanctuary VI
    { minX: 348, maxX: 353, minY: 957, maxY: 962 }, // Sanctuary VII
    { minX: 606, maxX: 611, minY: 957, maxY: 962 }, // Sanctuary VIII
    { minX: 828, maxX: 833, minY: 957, maxY: 962 }, // Sanctuary IX
    { minX: 957, maxX: 962, minY: 846, maxY: 851 }, // Sanctuary X
    { minX: 957, maxX: 962, minY: 606, maxY: 611 }, // Sanctuary XI
    { minX: 957, maxX: 962, minY: 366, maxY: 371 }, // Sanctuary XII
  ];

  // Add red zone tiles around each sanctuary
  for (const sanctuary of sanctuaries) {
    for (
      let y = sanctuary.minY - sanctuaryRedZoneRange;
      y <= sanctuary.maxY + sanctuaryRedZoneRange;
      y++
    ) {
      for (
        let x = sanctuary.minX - sanctuaryRedZoneRange;
        x <= sanctuary.maxX + sanctuaryRedZoneRange;
        x++
      ) {
        // Skip cells that are inside the sanctuary
        if (
          x >= sanctuary.minX &&
          x <= sanctuary.maxX &&
          y >= sanctuary.minY &&
          y <= sanctuary.maxY
        ) {
          continue;
        }
        state.redZone.add(`${x},${y}`);
      }
    }
  }

  state._restoring = false;

  /* ---------------------------------------------
   * Restore from URL (blocks + red tiles)
   * ------------------------------------------- */
  const parsed = parseFromURL();

  // Track if we converted any legacy blocks
  let hasLegacyBlocks = false;

  if (parsed?.blocks?.length) {
    state._restoring = true;
    for (const it of parsed.blocks) {
      // Check if this was a legacy block (converted to custom)
      if (it.kind === 'custom' && it.width === it.height && !it.label) {
        hasLegacyBlocks = true;
      }

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

  // If we converted legacy blocks, update the URL to reflect the conversion
  if (hasLegacyBlocks) {
    saveToURLImmediate();
  }

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
  renderBarren();
  renderPlain();
  renderRich();
  renderRuins();
  renderRedZone();
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
let resizeTimeout = null;
function relayoutForCellChange() {
  // Recompute world px size against the latest cellPx()
  setWorldSizeCells(BASE_CELLS_X, BASE_CELLS_Y);
  // Repaint overlays (Plain/Rich/Ruins are CSS-only, no need to call)
  renderRedZone();
  renderUserTiles();
  recomputePaint();
  // Keep badge up to date
  updateBadge();
}

window.addEventListener('resize', () => {
  // Debounce to avoid excessive reflows
  if (resizeTimeout) clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    requestAnimationFrame(relayoutForCellChange);
  }, 150);
});

window.addEventListener('orientationchange', () => {
  // Some mobile browsers fire resize later; do one pass immediately
  updateAppVhVar();
  if (resizeTimeout) clearTimeout(resizeTimeout);
  requestAnimationFrame(relayoutForCellChange);
});

/* ---------------------------------------------
 * Debug helpers (optional)
 * ------------------------------------------- */

Object.assign(window, { state, centerToCell, updateBadge, saveCheckpoint });
