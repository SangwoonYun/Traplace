// assets/js/history.js
import { state, cell } from './state.js';
import { rot } from './dom.js';
import { serializeState, deserializeState, updateURLWithSerialized } from './urlState.js';
import { createBlock } from './blocks.js';
import { renderUserTiles, recomputePaint } from './render.js';
import { validateAllObjects } from './blocks.js';
import { makeMovable } from './interactions/drag.js';

const LIMIT = 100;

const historyState = {
  stack: [], // [qsString, ...]
  index: -1,
  onChange: null, // (canUndo, canRedo) => void
};

function notify(){
  historyState.onChange?.(canUndo(), canRedo());
}

export function initHistoryWithCurrent(){
  const qs = serializeState();
  historyState.stack = [qs];
  historyState.index = 0;
  notify();
}

export function saveCheckpoint(){
  const qs = serializeState();
  const cur = historyState.stack[historyState.index];
  if (qs === cur) return; // 변화 없음
  // 미래 이력 제거 후 push
  historyState.stack = historyState.stack.slice(0, historyState.index + 1);
  historyState.stack.push(qs);
  // 용량 제한
  if (historyState.stack.length > LIMIT){
    const drop = historyState.stack.length - LIMIT;
    historyState.stack.splice(0, drop);
    historyState.index -= drop;
    if (historyState.index < 0) historyState.index = 0;
  }
  historyState.index = historyState.stack.length - 1;
  notify();
}

export function canUndo(){ return historyState.index > 0; }
export function canRedo(){ return historyState.index < historyState.stack.length - 1; }

export function undo(){
  if (!canUndo()) return;
  historyState.index -= 1;
  applySerialized(historyState.stack[historyState.index]);
  notify();
}
export function redo(){
  if (!canRedo()) return;
  historyState.index += 1;
  applySerialized(historyState.stack[historyState.index]);
  notify();
}

function applySerialized(qs){
  const parsed = deserializeState(qs);

  // 기존 제거
  rot.querySelectorAll('.block').forEach(el => el.remove());
  state.blocks = [];
  state.paintedSet.clear();
  state.userPaint = new Set(parsed.red || []);
  renderUserTiles();

  // 복원 (recompute/validate 한 번만)
  state._restoring = true;
  for (const it of parsed.blocks){
    const left = it.cx * cell;
    const top  = it.cy * cell;
    const el = createBlock(it.kind, it.size, left, top); // restoring=true라 내부 렌더 skip
    if (it.kind === 'city' && it.label){
      const lbl = el.querySelector('.label');
      if (lbl) lbl.textContent = it.label;
    }
    makeMovable(el);
  }
  state._restoring = false;
  recomputePaint();
  validateAllObjects();

  // URL 동기화
  updateURLWithSerialized(qs);
}

export function onHistoryChange(cb){
  historyState.onChange = cb;
  notify();
}
