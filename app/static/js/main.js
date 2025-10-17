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
  recomputePaint,
  updateBadge,
  centerToCell,
  centerToWorldCenter,
} from './render.js';
import { setupPaletteDrag, makeMovable } from './interactions/drag.js';
import { setupPan } from './interactions/pan.js';
import { setupZoom } from './interactions/zoom.js';
import { setupTileToggle } from './interactions/tileToggle.js';
import { setupCursorBadge } from './interactions/cursor.js';
import { validateAllObjects, createBlock } from './blocks.js';
import { expand } from './interactions/expand.js';
import { parseFromURL } from './urlState.js';
import { cell, state } from './state.js';
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

window.addEventListener('load', async () => {
  /* ---------------------------------------------
   * Initial layout + counters
   * ------------------------------------------- */
  initialLayout();
  initCounters();

  /* ---------------------------------------------
   * i18n (temporarily disable palette hit-testing to avoid accidental drags)
   * ------------------------------------------- */
  const palette = document.getElementById('palette');
  if (palette) palette.style.pointerEvents = 'none';
  const lang = detectPreferredLang();
  await loadLanguageOnline(lang);
  updateBlockLabelsForLocale(state);
  if (palette) palette.style.pointerEvents = '';
  enableDragScroll(palette);

  // Bind language selector
  const sel = document.getElementById('langSelect');
  if (sel) {
    sel.value = currentLang();
    sel.addEventListener('change', async () => {
      await loadLanguageOnline(sel.value);
      updateBlockLabelsForLocale(state);
      setTitles(); // refresh tooltips / shortcut labels
    });
  }

  /* ---------------------------------------------
   * Restore from URL (blocks + red tiles)
   * ------------------------------------------- */
  const parsed = parseFromURL();

  if (parsed.blocks?.length) {
    state._restoring = true;
    for (const it of parsed.blocks) {
      const left = it.cx * cell;
      const top = it.cy * cell;
      const el = createBlock(it.kind, it.size, left, top);

      // Restore city label if present
      if (it.kind === 'city' && it.label) {
        const lbl = el.querySelector('.label');
        if (lbl) lbl.textContent = it.label;
      }

      makeMovable(el);
    }
    state._restoring = false;
  }

  if (parsed.red?.length) {
    state.userPaint = new Set(parsed.red);
    renderUserTiles();
  }

  updateAllCounts();

  /* ---------------------------------------------
   * Interactions
   * ------------------------------------------- */
  setupPaletteDrag();
  setupPan(expand);
  setupZoom(expand);
  setupTileToggle();
  setupCursorBadge();
  setupActions();

  /* ---------------------------------------------
   * Initial render & validation
   * ------------------------------------------- */
  recomputePaint();
  renderUserTiles();
  validateAllObjects();

  const ensureCenterOnMobile = (retries = 3) => {
    if (!window.matchMedia('(max-width: 991.98px)').matches) return;
    // 2-frame delay to let fixed toolbars/palette and CSS vars settle
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        centerToWorldCenter();
        // extra small retries guard for slow devices
        let left = retries;
        const tick = () => {
          centerToWorldCenter();
          if (--left > 0) setTimeout(tick, 50);
        };
        setTimeout(tick, 50);
      });
    });
  };
  ensureCenterOnMobile();
  // also on resize/orientation
  const onResize = () => ensureCenterOnMobile(2);
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  /* ---------------------------------------------
   * History: initial snapshot
   * ------------------------------------------- */
  initHistoryWithCurrent();
});

// Debug helpers (optional)
Object.assign(window, { state, centerToCell, updateBadge, saveCheckpoint });