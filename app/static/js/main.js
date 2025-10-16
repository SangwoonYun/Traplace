// File: app/static/js/main.js
/**
 * App bootstrap
 * - Initialize layout, i18n, counters
 * - Restore state from URL
 * - Wire up interactions (drag / pan / zoom / tile toggle / cursor / actions)
 * - Initial render + history snapshot
 */

import { setupActions, setTitles } from './actions.js';
import { validateAllObjects, createBlock } from './blocks.js';
import { initCounters, updateAllCounts } from './counters.js';
import { enableDragScroll } from './interactions/hscroll.js';
import { expand } from './interactions/expand.js';
import { setupPaletteDrag, makeMovable } from './interactions/drag.js';
import { setupCursorBadge } from './interactions/cursor.js';
import { setupPan } from './interactions/pan.js';
import { setupTileToggle } from './interactions/tileToggle.js';
import { setupZoom } from './interactions/zoom.js';
import {
  currentLang,
  detectPreferredLang,
  loadLanguageOnline,
  updateBlockLabelsForLocale,
} from './i18n.js';
import { initHistoryWithCurrent, saveCheckpoint } from './history.js';
import {
  centerToCell,
  centerToWorldCenter,
  initialLayout,
  recomputePaint,
  renderUserTiles,
  updateBadge,
} from './render.js';
import { cell, state } from './state.js';
import { parseFromURL } from './urlState.js';

window.addEventListener(
  'load',
  async () => {
    /* ---------------------------------------------
     * 1) Layout + counters
     * ------------------------------------------- */
    initialLayout();
    initCounters();

    /* ---------------------------------------------
     * 2) i18n (pause palette hit-testing during load)
     * ------------------------------------------- */
    const palette = document.getElementById('palette');
    if (palette) palette.style.pointerEvents = 'none';

    const lang = detectPreferredLang();
    await loadLanguageOnline(lang);
    updateBlockLabelsForLocale(state);

    if (palette) {
      palette.style.pointerEvents = '';
      enableDragScroll(palette);
    }

    // Language selector
    const langSelect = document.getElementById('langSelect');
    if (langSelect) {
      langSelect.value = currentLang();
      langSelect.addEventListener('change', async () => {
        await loadLanguageOnline(langSelect.value);
        updateBlockLabelsForLocale(state);
        setTitles(); // refresh tooltips / shortcut labels
      });
    }

    /* ---------------------------------------------
     * 3) State restore (blocks + red tiles)
     * ------------------------------------------- */
    const parsed = parseFromURL();

    if (parsed.blocks?.length) {
      state._restoring = true;
      for (const it of parsed.blocks) {
        const left = it.cx * cell;
        const top = it.cy * cell;
        const el = createBlock(it.kind, it.size, left, top);

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
     * 4) Interactions
     * ------------------------------------------- */
    setupPaletteDrag();
    setupPan(expand);
    setupZoom(expand);
    setupTileToggle();
    setupCursorBadge();
    setupActions();

    /* ---------------------------------------------
     * 5) Initial render + validation
     * ------------------------------------------- */
    recomputePaint();
    renderUserTiles();
    validateAllObjects();

    /* ---------------------------------------------
     * 6) Ensure center on mobile (after fixed bars settle)
     *    - run twice via rAF to wait for layout
     *    - small timed retries for slow devices
     * ------------------------------------------- */
    const ensureCenterOnMobile = (retries = 3) => {
      if (!window.matchMedia('(max-width: 991.98px)').matches) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          centerToWorldCenter();
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

    // Re-center when rotating or resizing (reduced retries)
    const onResize = () => ensureCenterOnMobile(2);
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize);

    /* ---------------------------------------------
     * 7) History snapshot
     * ------------------------------------------- */
    initHistoryWithCurrent();
  },
  { once: true },
);

// Debug helpers (optional)
Object.assign(window, { state, centerToCell, updateBadge, saveCheckpoint });
