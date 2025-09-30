// assets/js/interactions/tileToggle.js
import { state } from '../state.js';
import { rot } from '../dom.js';
import { clientToLocalRot, pointToCell, keyOf } from '../transform.js';
import { renderUserTiles } from '../render.js';
import { queueSaveToURL } from '../urlState.js';

export function setupTileToggle(){
  rot.addEventListener('click', (e)=>{
    if (state.drag || e.target.closest('.block')) return;
    if (e.button !== 0) return;

    const { x, y } = clientToLocalRot(e.clientX, e.clientY);
    const { cx, cy } = pointToCell(x, y);
    const k = keyOf(cx, cy);
    if (state.userPaint.has(k)) state.userPaint.delete(k);
    else state.userPaint.add(k);

    renderUserTiles();
    queueSaveToURL();
  });
}

