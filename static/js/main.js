import { initialLayout, renderUserTiles, recomputePaint, updateBadge, centerToCell } from './render.js';
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
import { detectPreferredLang, loadLanguageOnline, currentLang, updateBlockLabelsForLocale } from './i18n.js';

window.addEventListener('load', async () => {
  // 초기 레이아웃
  initialLayout();

  const palette = document.getElementById('palette');
  if (palette) palette.style.pointerEvents = 'none';

  // i18n 로드
  const lang = detectPreferredLang();
  await loadLanguageOnline(lang);
  updateBlockLabelsForLocale(state);

  if (palette) palette.style.pointerEvents = '';

  // 언어 셀렉트 바인딩
  const sel = document.getElementById('langSelect');
  if (sel){
    sel.value = currentLang();
    sel.addEventListener('change', async ()=>{
      await loadLanguageOnline(sel.value);
      updateBlockLabelsForLocale(state);
      setTitles(); // 툴팁/단축키 텍스트 갱신
    });
  }

  // URL 복원 (블록 + 빨간 칠)
  const parsed = parseFromURL();
  if (parsed.blocks?.length){
    state._restoring = true;
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
    state._restoring = false;
  }
  if (parsed.red?.length){
    state.userPaint = new Set(parsed.red);
    renderUserTiles();
  }

  // 인터랙션
  setupPaletteDrag();
  setupPan(expand);
  setupZoom(expand);
  setupTileToggle();
  setupCursorBadge();
  setupActions();

  // 초기 렌더/검증
  recomputePaint();
  renderUserTiles();
  validateAllObjects();

  // 히스토리 초기 스냅샷
  initHistoryWithCurrent();
});

// 디버그용
Object.assign(window, { state, centerToCell, updateBadge, saveCheckpoint });
