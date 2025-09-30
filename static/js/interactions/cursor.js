 import { state } from '../state.js';
 import { rot } from '../dom.js';
 import { clientToLocalRot, pointToCell } from '../transform.js';
 import { updateBadge } from '../render.js';

 export function setupCursorBadge(){
   rot.addEventListener('pointermove', (e)=>{
     const { x, y } = clientToLocalRot(e.clientX, e.clientY);
     const { cx, cy } = pointToCell(x, y);
     state.cursorCell = { x: cy, y: cx };
     updateBadge();
   });
 }
