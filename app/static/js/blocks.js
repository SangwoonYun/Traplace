import { state } from './state.js';
import { rot } from './dom.js';
import { recomputePaint } from './render.js';
import { posToCell } from './transform.js';
import { queueSaveToURL } from './urlState.js';
import { saveCheckpoint } from './history.js';
import { t } from './i18n.js';
import { onCreateBlock, onDeleteBlock } from './counters.js';

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

/* 라벨 편집 (도시 전용) */
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

  requestAnimationFrame(() => {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(label);
    sel.removeAllRanges();
    sel.addRange(range);
  });

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

  const defaultCity = t('palette.city'); // 현재 언어의 기본 도시 라벨

  if (cancel){
    label.textContent = b._labelOriginal ?? defaultCity;
  }else{
    // 비었으면 기본값
    const txt = (label.textContent||'').trim();
    if (!txt){
      label.textContent = defaultCity;
      b.customLabel = false;                 // ✅ 기본 라벨
    }else if (txt === defaultCity){
      b.customLabel = false;                 // ✅ 기본 라벨
    }else{
      b.customLabel = true;                  // ✅ 사용자 정의
    }
  }

  delete b._labelOriginal;
  label.classList.remove('editing');
  label.contentEditable = 'false';
  blockEl.removeAttribute('data-editing');

  // 라벨 변경 → URL/히스토리 갱신
  queueSaveToURL();
  saveCheckpoint();
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
    kind === 'hq'       ? t('palette.hq') :
    kind === 'flag'     ? t('palette.flag') :
    kind === 'trap'     ? t('palette.trap') :
    kind === 'city'     ? t('palette.city') :
    kind === 'resource' ? t('palette.resource') :
    `${size}×${size}`;
  el.appendChild(label);

  if (kind === 'city'){
    el.addEventListener('dblclick', (e)=>{
      e.stopPropagation();
      startEditLabel(el);
    });
  }

  rot.appendChild(el);
  const b = { el, kind, size, left, top, customLabel: false };
  state.blocks.push(b);
  applyBlockStyle(b, false);

  if (!state._restoring){
    recomputePaint();
    validateAllObjects();
    queueSaveToURL();
    saveCheckpoint();
  }
  onCreateBlock(b);
  return el;
}

export function updateBlockPosition(el, snappedLeft, snappedTop){
  el.style.left = snappedLeft + 'px';
  el.style.top  = snappedTop  + 'px';
  const b = state.blocks.find(x => x.el === el);
  if (b){
    b.left = snappedLeft;
    b.top  = snappedTop;
    if (!state._restoring){
      recomputePaint();
      validateAllObjects();
      queueSaveToURL();
      saveCheckpoint();
    }
  }
}

export function deleteBlock(el){
  el.remove();
  const idx = state.blocks.findIndex(b => b.el === el);
  if (idx >= 0) state.blocks.splice(idx, 1);
  if (!state._restoring){
    recomputePaint();
    validateAllObjects();
    queueSaveToURL();
    saveCheckpoint();
  }
}
