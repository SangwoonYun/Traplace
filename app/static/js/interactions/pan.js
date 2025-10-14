import { state } from '../state.js';
import { viewport } from '../dom.js';

export function setupPan(expand){
  viewport.addEventListener('pointerdown', (e)=>{
    if (e.button !== 1) return;
    e.preventDefault();
    viewport.setPointerCapture?.(e.pointerId);
    state.panning = {
      pointerId: e.pointerId,
      startX: e.clientX, startY: e.clientY,
      startLeft: viewport.scrollLeft, startTop: viewport.scrollTop
    };
    viewport.classList.add('panning');
    window.addEventListener('pointermove', onPanMove);
    window.addEventListener('pointerup', onPanEnd, { once:true });
  });

  function onPanMove(e){
    if (!state.panning || e.pointerId !== state.panning.pointerId) return;
    const dx = e.clientX - state.panning.startX;
    const dy = e.clientY - state.panning.startY;
    viewport.scrollLeft = state.panning.startLeft - dx;
    viewport.scrollTop  = state.panning.startTop  - dy;
    expand();
  }

  function onPanEnd(e){
    if (!state.panning || e.pointerId !== state.panning.pointerId){
      state.panning=null; viewport.classList.remove('panning'); return;
    }
    state.panning=null; viewport.classList.remove('panning');
    window.removeEventListener('pointermove', onPanMove);
  }

  viewport.addEventListener('auxclick', (e)=>{ if (e.button===1) e.preventDefault(); });
}

