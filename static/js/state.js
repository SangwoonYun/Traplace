// 전역 상수/상태
export const BASE_CELLS_X = 1200;
export const BASE_CELLS_Y = 1200;
export const EXPAND_CELLS = 300;
export const EXPAND_MARGIN = 300; // px

export const cell = (() => {
  const v = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell'), 10);
  return Number.isFinite(v) && v > 0 ? v : 48;
})();

export const state = {
  zoom: 1,
  blocks: [],                 // {el, kind, size, left, top}
  paintedSet: new Set(),      // 파란 합집합
  userPaint: new Set(),       // 빨간 토글
  cursorCell: { x: 600, y: 600 },
  drag: null,                 // 드래그 상태
  panning: null,              // 패닝 상태
  AUTO_EXPAND: false          // 자동 확장 off (동작만 차단)
};

// 런타임 토글용 (콘솔)
export function setAutoExpand(v){ state.AUTO_EXPAND = !!v; }
window.setAutoExpand = setAutoExpand;

