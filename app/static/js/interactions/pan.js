// File: app/static/js/interactions/pan.js
/**
 * Middle-button panning for the viewport.
 * - Press and hold mouse wheel (button=1) to pan.
 * - Uses pointer capture to keep receiving move events.
 * - Calls `expand()` while panning to auto-grow the world if enabled.
 */

import { state } from '../state.js';
import { viewport, rot } from '../dom.js';

/**
 * Wire up panning behavior.
 * @param {() => void} expand Callback to attempt auto-expansion when near edges
 */
export function setupPan(expand) {
  const PAN_SLOP = 6; // px: 이만큼 움직여야 '패닝 시작'으로 간주

  function beginPan(e){
    // 실제 패닝 시작 시점에만 capture + preventDefault
    e.preventDefault();
    viewport.setPointerCapture?.(e.pointerId);
    state.panning.moved = true; // 확정
    viewport.classList.add('panning');
  }

  function clearPanListeners(){
    window.removeEventListener('pointermove', onPointerMovePassive);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
  }

  function onPointerMovePassive(e){
    // 아직 패닝 미시작 상태에서만 호출됨 (지연 시작)
    if (!state.panning || e.pointerId !== state.panning.pointerId) return;
    const dx = e.clientX - state.panning.startX;
    const dy = e.clientY - state.panning.startY;
    // 이미 드래그가 시작되면(롱프레스) 패닝 후보 취소
    if (state.drag) { state.panning = null; clearPanListeners(); return; }
    if (Math.abs(dx) < PAN_SLOP && Math.abs(dy) < PAN_SLOP) return;
    // ✅ 슬롭을 넘김 → 이제 진짜 패닝 시작
    beginPan(e);
    // move 핸들러를 실제 패닝용으로 교체
    window.removeEventListener('pointermove', onPointerMovePassive);
    window.addEventListener('pointermove', onPanMoveActive, { passive:false });
  }

  function onPanMoveActive(e){
    if (!state.panning || e.pointerId !== state.panning.pointerId) return;
    e.preventDefault();
    const dx = e.clientX - state.panning.startX;
    const dy = e.clientY - state.panning.startY;
    viewport.scrollLeft = state.panning.startLeft - dx;
    viewport.scrollTop  = state.panning.startTop  - dy;
    expand();
  }

  function onPointerUp(e){
    // 패닝이 확정되기 전에 손을 떼면 아무 일도 없게
    if (!state.panning || e.pointerId !== state.panning.pointerId){
      state.panning=null; clearPanListeners(); return;
    }
    if (!state.panning.moved){
      // 패닝 미시작 → 클릭/롱프레스 등 다른 제스처에 양보
      state.panning=null; clearPanListeners(); return;
    }
    // 패닝 확정 상태였다면 종료 처리
    viewport.classList.remove('panning');
    state.panning=null;
    window.removeEventListener('pointermove', onPanMoveActive);
    clearPanListeners();
  }

  function onPointerCancel(e){
    viewport.classList.remove('panning');
    state.panning=null;
    window.removeEventListener('pointermove', onPanMoveActive);
    clearPanListeners();
  }

  const bind = (targetEl) => targetEl.addEventListener('pointerdown', (e)=>{
    // 데스크탑: 휠버튼, 모바일: 터치 한 손가락
    const isMiddleMouse = e.button === 1 && e.pointerType === 'mouse';
    const isTouchOneFinger = e.button === 0 && e.pointerType === 'touch';
    if (!(isMiddleMouse || isTouchOneFinger)) return;

    // ⚠️ 여기서는 preventDefault/capture 하지 않음 (롱프레스가 필요할 수 있음)
    state.panning = {
      pointerId: e.pointerId,
      startX: e.clientX, startY: e.clientY,
      startLeft: viewport.scrollLeft, startTop: viewport.scrollTop,
      moved: false,
    };
    // 지연 시작용 리스너
    window.addEventListener('pointermove', onPointerMovePassive, { passive:true });
    window.addEventListener('pointerup', onPointerUp, { once:true });
    window.addEventListener('pointercancel', onPointerCancel, { once:true });
  });
  bind(viewport);
  bind(rot);

  function onPanMove(e) {
    if (!state.panning || e.pointerId !== state.panning.pointerId) return;
    e.preventDefault();
    const dx = e.clientX - state.panning.startX;
    const dy = e.clientY - state.panning.startY;
    if (!state.panning.moved) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      state.panning.moved = true;
      if (window.__cancelAllLongPress) window.__cancelAllLongPress();
    }
    viewport.scrollLeft = state.panning.startLeft - dx;
    viewport.scrollTop  = state.panning.startTop  - dy;
    expand();
  }

  function onPanEnd(e) {
    if (!state.panning || e.pointerId !== state.panning.pointerId){
      state.panning=null; viewport.classList.remove('panning'); return;
    }
    state.panning=null; viewport.classList.remove('panning');
    window.removeEventListener('pointermove', onPanMove);
  }

  function onPanCancel(e){
    if (!state.panning || e.pointerId !== state.panning.pointerId){
      state.panning=null; viewport.classList.remove('panning'); return;
    }
    state.panning=null; viewport.classList.remove('panning');
    window.removeEventListener('pointermove', onPanMove);
  }

  // Prevent default middle-click behavior (auto-scroll icons, etc.)
  viewport.addEventListener('auxclick', (e) => {
    if (e.button === 1) e.preventDefault();
  });
}