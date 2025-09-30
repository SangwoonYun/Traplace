import { state } from '../state.js';
import { viewport, world, rot } from '../dom.js';
import { clamp } from '../transform.js';
import { updateBadge } from '../render.js';

const ZOOM_MIN = 0.3, ZOOM_MAX = 4;

export function setupZoom(expand){
  function setZoom(newZoom, pivotClientX, pivotClientY){
    newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, newZoom));
    if (newZoom === state.zoom) return;

    // pivot의 로컬 좌표 기억
    const style = getComputedStyle(rot);
    const m = new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform);
    const worldRect = world.getBoundingClientRect();
    const T = new DOMMatrix().translateSelf(worldRect.left, worldRect.top).multiply(m);
    const inv = T.inverse();
    const localBefore = new DOMPoint(pivotClientX, pivotClientY).matrixTransform(inv);

    // 줌 변경
    state.zoom = newZoom;
    document.documentElement.style.setProperty('--zoom', String(state.zoom));
    updateBadge();

    // 줌 후, pivot 고정 유지
    const m2 = new DOMMatrixReadOnly(getComputedStyle(rot).transform);
    const T2 = new DOMMatrix().translateSelf(worldRect.left, worldRect.top).multiply(m2);
    const projected = new DOMPoint(localBefore.x, localBefore.y).matrixTransform(T2);
    const dx = pivotClientX - projected.x;
    const dy = pivotClientY - projected.y;

    viewport.scrollLeft = clamp(viewport.scrollLeft - dx, 0, world.scrollWidth - viewport.clientWidth);
    viewport.scrollTop  = clamp(viewport.scrollTop  - dy, 0, world.scrollHeight - viewport.clientHeight);

    expand();
  }

  // Ctrl/⌘ + Wheel → Zoom (스텝 5%, 감도 ½)
  viewport.addEventListener('wheel', (e)=>{
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const factor = Math.pow(1.05, -Math.sign(e.deltaY));
    setZoom(state.zoom * factor, e.clientX, e.clientY);
  }, { passive:false });

  // Pinch Zoom (감도 ½)
  const touches = new Map();
  let pinchStart = null; // {dist, zoom, centerX, centerY}

  function updatePinchZoom(){
    if (touches.size !== 2) return;
    const pts = [...touches.values()];
    const dx = pts[1].x - pts[0].x;
    const dy = pts[1].y - pts[0].y;
    const dist = Math.hypot(dx, dy);
    const cx = (pts[0].x + pts[1].x) / 2;
    const cy = (pts[0].y + pts[1].y) / 2;

    if (!pinchStart){
      pinchStart = { dist, zoom: state.zoom, centerX: cx, centerY: cy };
      return;
    }
    const raw = dist / (pinchStart.dist || 1);
    const scaled = 1 + (raw - 1) * 0.5;
    setZoom(pinchStart.zoom * scaled, cx, cy);
  }
  function endTouch(e){
    if (touches.has(e.pointerId)){
      touches.delete(e.pointerId);
      if (touches.size < 2) pinchStart = null;
    }
  }

  viewport.addEventListener('pointerdown', (e)=>{
    if (e.pointerType === 'touch'){
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      updatePinchZoom();
    }
  });
  viewport.addEventListener('pointermove', (e)=>{
    if (e.pointerType === 'touch' && touches.has(e.pointerId)){
      e.preventDefault();
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      updatePinchZoom();
    }
  }, { passive:false });
  viewport.addEventListener('pointerup', endTouch);
  viewport.addEventListener('pointercancel', endTouch);
  viewport.addEventListener('pointerout', endTouch);
  viewport.addEventListener('pointerleave', endTouch);
}

