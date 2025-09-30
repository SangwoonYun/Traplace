// assets/js/blocks.js
import { state } from './state.js';
import { rot } from './dom.js';
import { renderOutlines, recomputePaint } from './render.js';
import { posToCell } from './transform.js';
import { queueSaveToURL } from './urlState.js';

/* 색상 적용 */
function applyBlockStyle(b, invalid){
  const el = b.el;
  if (b.kind === 'resource'){
    el.style.background = 'var(--resource-bg)';
    el.style.borderColor = 'var(--resource-border)';
    return;
  }
  if (invalid){
    el.style.background = 'var(--warn-bg)';
    el.style.borderColor = 'var(--warn-border)';
  } else {
    el.style.background = 'var(--ok-bg)';
    el.style.borderColor = 'var(--ok-border)';
  }
}

/* 유효성 검사(파란 합집합 기준) */
export function validateAllObjects(){
  for (const b of state.blocks){
    const { cx, cy } = posToCell(b.left, b.top);
    let invalid = false;
    for (let y=cy; y<cy + b.size && !invalid; y++){
      for (let x=cx; x<cx + b.size; x++){
        if (!state.paintedSet.has(`${x},${y}`)){
          invalid = true; break;
        }
      }
    }
    applyBlockStyle(b, invalid);
  }
}

/* 라벨 편집 (도시센터 전용) */
function startEditLabel(blockEl){
  const b = state.blocks.find(x => x.el === blockEl);
  if (!b || b.kind !== 'city') return;

  const label = blockEl.querySelector('.label');
  if (!label) return;

  blockEl.dataset.editing = '1';
  b._labelOriginal = label.textContent;

  label.classList.add('editing');
  label.contentEditable = 'true';
  label.spellcheck = false;
  label.setAttribute('role', 'textbox');

  label.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(label);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);

  label.onkeydown = (e)=>{
    if (e.key === 'Enter'){ e.preventDefault(); finishEditLabel(blockEl, false); }
    else if (e.key === 'Escape'){ e.preventDefault(); finishEditLabel(blockEl, true); }
  };
  label.onblur = ()=> finishEditLabel(blockEl, false);
}

function finishEditLabel(blockEl, cancel){
  const b = state.blocks.find(x => x.el === blockEl);
  const label = blockEl.querySelector('.label');
  if (!b || !label) return;

  if (cancel && typeof b._labelOriginal === 'string'){
    label.textContent = b._labelOriginal;
  }
  label.classList.remove('editing');
  label.contentEditable = 'false';
  label.removeAttribute('role');
  label.onkeydown = null;
  label.onblur = null;
  delete b._labelOriginal;

  delete blockEl.dataset.editing;

  // 라벨 변경 → URL 갱신
  queueSaveToURL(); // ⬅️ 추가
}

/* 블록 CRUD */
export function createBlock(kind, size, left, top){
  const cell = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell')) || 48;
  const el = document.createElement('div');
  el.className = 'block';
  el.dataset.size = String(size);
  el.dataset.kind = kind;
  el.style.width  = (size*cell) + 'px';
  el.style.height = (size*cell) + 'px';
  el.style.left   = left + 'px';
  el.style.top    = top  + 'px';

  const label = document.createElement('div');
  label.className = 'label';
  label.textContent =
    kind === 'flag'     ? '연맹깃발' :
    kind === 'hq'       ? '평원본부' :
    kind === 'city'     ? '도시센터' :
    kind === 'resource' ? '연맹자원' :
    kind === 'trap'     ? '사냥함정' :
    `${size}×${size}`;
  el.appendChild(label);

  if (kind === 'city'){
    el.addEventListener('dblclick', (e)=>{
      e.stopPropagation();
      startEditLabel(el);
    });
  }

  rot.appendChild(el);
  const b = { el, kind, size, left, top };
  state.blocks.push(b);
  applyBlockStyle(b, false);

  recomputePaint();
  validateAllObjects();

  queueSaveToURL();

  return el;
}

export function updateBlockPosition(el, snappedLeft, snappedTop){
  el.style.left = snappedLeft + 'px';
  el.style.top  = snappedTop  + 'px';
  const b = state.blocks.find(x => x.el === el);
  if (b){
    b.left = snappedLeft;
    b.top  = snappedTop;
    recomputePaint();
    validateAllObjects();
    queueSaveToURL();
  }
}

export function deleteBlock(el){
  el.remove();
  const idx = state.blocks.findIndex(b => b.el === el);
  if (idx >= 0) state.blocks.splice(idx, 1);
  recomputePaint();
  validateAllObjects();
  queueSaveToURL();
}

