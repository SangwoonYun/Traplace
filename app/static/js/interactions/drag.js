import { state } from '../state.js';
import { previewLayer, outlinesPreviewLayer, snapEl, palette, trash } from '../dom.js';
import { clientToLocalRot, snapLocal } from '../transform.js';
import { PAINTER_KINDS } from '../painter.js';
import { showPreview, clearPreview } from '../render.js';
import { createBlock, updateBlockPosition, deleteBlock } from '../blocks.js';
import { t } from '../i18n.js';
import { onDeleteBlock } from '../counters.js';

function updateGhost(clientX, clientY, px){
  if (!state.drag?.ghost) return;
  state.drag.ghost.style.left = (clientX - px/2) + 'px';
  state.drag.ghost.style.top  = (clientY - px/2) + 'px';
}

function inTrash(clientX, clientY){
  if (!trash) return false;
  const r = trash.getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

function onPointerMove(e){
  if (!state.drag || e.pointerId !== state.drag.pointerId) return;

  const overTrash = inTrash(e.clientX, e.clientY);
  trash?.classList.toggle('active', overTrash);

  const { x, y } = clientToLocalRot(e.clientX, e.clientY);
  const size = state.drag.size;
  const left = x - (size*parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell')))/2;
  const top  = y - (size*parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell')))/2;
  const snapped = snapLocal(left, top, size);

  snapEl.style.display='block';
  snapEl.style.left = snapped.left + 'px';
  snapEl.style.top  = snapped.top  + 'px';
  snapEl.style.width  = (size*parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell')))+'px';
  snapEl.style.height = (size*parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell')))+'px';

  if (PAINTER_KINDS.has(state.drag.kind)) showPreview(state.drag.kind, snapped.left, snapped.top, size, true);
  else { outlinesPreviewLayer.innerHTML = ''; previewLayer.innerHTML = ''; }

  if (state.drag.mode === 'new') updateGhost(e.clientX, e.clientY, size*parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell')));
}

function onPointerUp(e){
  if (!state.drag || e.pointerId !== state.drag.pointerId) { cleanupDrag(); return; }

  const droppingInTrash = inTrash(e.clientX, e.clientY);

  if (state.drag.mode === 'new') {
    if (state.drag.ghost?.parentNode) state.drag.ghost.parentNode.removeChild(state.drag.ghost);
    if (!droppingInTrash){
      const { x, y } = clientToLocalRot(e.clientX, e.clientY);
      const size = state.drag.size;
      const cell = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell'));
      const left = x - (size*cell)/2;
      const top  = y - (size*cell)/2;
      const snapped = snapLocal(left, top, size);
      const el = createBlock(state.drag.kind, size, snapped.left, snapped.top);
      makeMovable(el);
    }
    cleanupDrag();
    return;
  }

  if (state.drag.mode === 'move' && state.drag.node) {
    if (droppingInTrash){
      const b = state.blocks.find(x => x.el === state.drag.node);
      if (b) onDeleteBlock(b);
      deleteBlock(state.drag.node);
    } else {
      const { x, y } = clientToLocalRot(e.clientX, e.clientY);
      const size = state.drag.size;
      const cell = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell'));
      const left = x - (size*cell)/2;
      const top  = y - (size*cell)/2;
      const snapped = snapLocal(left, top, size);
      updateBlockPosition(state.drag.node, snapped.left, snapped.top);
    }
  }
  cleanupDrag();
}

function cleanupDrag(){
  snapEl.style.display='none';
  clearPreview();
  trash?.classList.remove('active');
  if (state.drag?.ghost?.parentNode) state.drag.ghost.parentNode.removeChild(state.drag.ghost);
  window.removeEventListener('pointermove', onPointerMove);
  state.drag = null;
}

export function setupPaletteDrag(){
  palette.querySelectorAll('.palette-item').forEach(item=>{
    item.addEventListener('pointerdown', (e)=>{
      if (e.button !== 0) return;
      e.preventDefault();
      item.setPointerCapture(e.pointerId);

      const size = parseInt(item.dataset.size, 10);
      const kind = item.dataset.kind;
      const ghost = document.createElement('div');
      ghost.className='ghost';
      const cell = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell'));
      const px = size*cell;
      ghost.style.width = px+'px';
      ghost.style.height= px+'px';
      ghost.textContent =
        kind === 'hq'       ? t('palette.hq') :
        kind === 'flag'     ? t('palette.flag') :
        kind === 'trap'     ? t('palette.trap') :
        kind === 'city'     ? t('palette.city') :
        kind === 'resource' ? t('palette.resource') :
      document.body.appendChild(ghost);

      state.drag = { mode:'new', size, kind, ghost, pointerId: e.pointerId };
      updateGhost(e.clientX, e.clientY, px);

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp, { once:true });
    });
  });
}

export function makeMovable(el){
  el.addEventListener('pointerdown', (e)=>{
    if (e.button !== 0) return;
    if (el.dataset.editing === '1') return; // 편집 중엔 이동 금지
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    const size = parseInt(el.dataset.size, 10);
    const kind = el.dataset.kind;
    state.drag = { mode:'move', size, kind, node: el, pointerId: e.pointerId };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once:true });
  });
}

