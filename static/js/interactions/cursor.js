import { state } from '../state.js';
import { rot } from '../dom.js';
import { clientToLocalRot, pointToCell } from '../transform.js';
import { updateBadge } from '../render.js';

export function setupCursorBadge(){
  rot.addEventListener('pointermove', (e)=>{
    const { x, y } = clientToLocalRot(e.clientX, e.clientY);
    const { cx, cy } = pointToCell(x, y);
    state.cursorCell = { x: cx, y: cy };
    updateBadge();
  });
  rot.addEventListener('pointerleave', ()=>{
    state.cursorCell = { x: null, y: null };
    updateBadge();
  });
}

