import { state, EXPAND_CELLS } from '../state.js';
import { viewport, world } from '../dom.js';
import { renderUserTiles, recomputePaint, setWorldSizeCells } from '../render.js'; // setWorldSizeCells re-export 필요

// render.js에서 setWorldSizeCells를 export 했으니 import 가능
export function expand(){
  if (!state.AUTO_EXPAND) return;
  const EXPAND_MARGIN = 300; // px
  const cell = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell')) || 48;

  const nearRight  = viewport.scrollLeft + viewport.clientWidth  > viewport.scrollWidth  - EXPAND_MARGIN;
  const nearBottom = viewport.scrollTop  + viewport.clientHeight > viewport.scrollHeight - EXPAND_MARGIN;

  let grew = false;
  if (nearRight)  { setWorldSizeCells(Math.round(world.clientWidth/cell) + EXPAND_CELLS, Math.round(world.clientHeight/cell)); grew = true; }
  if (nearBottom) { setWorldSizeCells(Math.round(world.clientWidth/cell), Math.round(world.clientHeight/cell) + EXPAND_CELLS); grew = true; }
  if (grew) {
    renderUserTiles();
    recomputePaint();
  }
}

