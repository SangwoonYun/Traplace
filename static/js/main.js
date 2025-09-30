// assets/js/main.js
import { initialLayout, renderUserTiles, recomputePaint, updateBadge, setWorldSizeCells, centerToCell } from './render.js';
import { setupPaletteDrag, makeMovable } from './interactions/drag.js';
import { setupPan } from './interactions/pan.js';
import { setupZoom } from './interactions/zoom.js';
import { setupTileToggle } from './interactions/tileToggle.js';
import { setupCursorBadge } from './interactions/cursor.js';
import { validateAllObjects, createBlock } from './blocks.js';
import { expand } from './interactions/expand.js';
import { parseFromURL } from './urlState.js';
import { cell, state } from './state.js';
import { setupActions } from './actions.js';

window.addEventListener('load', () => {
  // 1) 초기 레이아웃: 1200×1200 & (600,600)
  initialLayout();

  // 2) URL 복원 (블록 + 빨간 칠)
  const parsed = parseFromURL();
  if (parsed.blocks?.length){
    for (const it of parsed.blocks){
      const left = it.cx * cell;
      const top  = it.cy * cell;
      const el = createBlock(it.kind, it.size, left, top);
      if (it.kind === 'city' && it.label){
        const lbl = el.querySelector('.label');
        if (lbl) lbl.textContent = it.label;
      }
      makeMovable(el);
    }
  }
  if (parsed.red?.length){
    state.userPaint = new Set(parsed.red);
    renderUserTiles();
  }

  // 3) 인터랙션 연결
  setupPaletteDrag();
  setupPan(expand);
  setupZoom(expand);
  setupTileToggle();
  setupCursorBadge();
  setupActions();

  // 4) 초기 렌더/검증
  recomputePaint();
  renderUserTiles();
  validateAllObjects();
});

// 디버그/도움용
Object.assign(window, { state, centerToCell, updateBadge });

