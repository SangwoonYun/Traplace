// File: app/static/js/interactions/drag.js
/**
 * Drag & drop interactions:
 * - Drag from palette to create new blocks (with snap + preview)
 * - Drag existing blocks to move or delete (via trash zone)
 * - Shows snap rectangle and painter preview while dragging
 */

import { state, cell } from '../state.js';
import { previewLayer, outlinesPreviewLayer, snapEl, palette, trash, viewport } from '../dom.js';
import { clientToLocalRot, snapLocal } from '../transform.js';
import { PAINTER_KINDS } from '../painter.js';
import { showPreview, clearPreview } from '../render.js';
import { createBlock, updateBlockPosition, deleteBlock } from '../blocks.js';
import { t } from '../i18n.js';

// Edge auto-scroll constants
const EDGE_MARGIN = 72;      // px from each edge to begin auto-scroll
const MAX_SPEED  = 500;      // px/sec at the very edge

// Reusable style getter
const getCellPx = () =>
  parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell')) || 48;

// Update all drag visuals from a client coordinate (shared by pointermove & autosroll tick)
function updateDragAt(clientX, clientY){
  if (!state.drag) return;
  state.drag.lastClientX = clientX;
  state.drag.lastClientY = clientY;

  const { x, y } = clientToLocalRot(clientX, clientY);
  const size = state.drag.size;
  const cellPx = getCellPx();
  const left = x - (size*cellPx)/2;
  const top  = y - (size*cellPx)/2;
  const snapped = snapLocal(left, top, size);

  snapEl.style.display='block';
  snapEl.style.left = snapped.left + 'px';
  snapEl.style.top  = snapped.top  + 'px';
  snapEl.style.width  = (size*cellPx)+'px';
  snapEl.style.height = (size*cellPx)+'px';

  if (PAINTER_KINDS.has(state.drag.kind)) {
    showPreview(state.drag.kind, snapped.left, snapped.top, size, true);
  } else {
    outlinesPreviewLayer.innerHTML = '';
    previewLayer.innerHTML = '';
  }

  // ghost follows in both modes
  if (state.drag.ghost) {
    updateGhost(clientX, clientY, size*cellPx);
  }
}

let __lastVibeAt = 0;

if (!window.__ctxmenuBound) {
  window.__suppressContextMenu = false;
  document.addEventListener(
    'contextmenu',
    (e) => {
      if (window.__suppressContextMenu) e.preventDefault();
    },
    { capture: true }
  );
  window.__ctxmenuBound = true;
}

function hapticTap(duration = 12) {
  try {
    const now = Date.now();
    if (now - __lastVibeAt < 120) return; // throttle
    if (navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate(duration);
      __lastVibeAt = now;
    }
  } catch (_) {
    // ignore
  }
}

function getRects() {
  const vp = viewport.getBoundingClientRect();
  const toolbarEl = document.getElementById('toolbar'); // 고정 상단
  const sidebarEl = document.querySelector('.sidebar'); // 좌측 사이드바(데스크탑에서만 좌측)
  const paletteEl = document.getElementById('palette'); // 모바일에선 상단 바 형태

  const tb = toolbarEl ? toolbarEl.getBoundingClientRect() : null;
  const sb = sidebarEl ? sidebarEl.getBoundingClientRect() : null;
  const pl = paletteEl ? paletteEl.getBoundingClientRect() : null;
  const tr = trash ? trash.getBoundingClientRect() : null;

  return { vp, tb, sb, pl, tr };
}

/**
 * 실제 “사용 가능한” 가동 영역(에지 판정용)을 계산:
 *  - 상단: toolbar / palette가 겹치면 그 아래부터
 *  - 좌측: 사이드바가 겹치면 그 오른쪽부터
 *  - 하단: trash-zone이 겹쳐도 “trash의 바닥까지”를 하단으로 간주(= 더 아래까지 edge로 판단)
 *  - 우측: 그대로
 */
function computeEffectiveRect() {
  const { vp, tb, sb, pl, tr } = getRects();
  let left   = vp.left;
  let top    = vp.top;
  let right  = vp.right;
  let bottom = vp.bottom;

  // ── 상단 오버레이(툴바/팔레트) → "아래로 줄이기"
  const intersectsH = (a, b) => a.left < b.right && a.right > b.left;
  if (tb && tb.bottom > top && intersectsH(tb, vp)) {
    top = Math.max(top, tb.bottom);
  }
  if (pl && pl.bottom > top && intersectsH(pl, vp)) {
    top = Math.max(top, pl.bottom);
  }

  // ── 좌측 오버레이(진짜 '사이드바'일 때만)
  // 조건: 왼쪽 모서리에 거의 붙어 있고, 세로로 화면의 절반 이상을 차지, 폭이 화면의 60% 미만
  if (sb && sb.top < bottom && sb.bottom > top) {
    const vpW = vp.right - vp.left;
    const vpH = vp.bottom - vp.top;
    const sbW = sb.right - sb.left;
    const sbH = sb.bottom - sb.top;
    const looksLikeLeftSidebar =
      (sb.left <= vp.left + 8) &&           // 왼쪽 모서리에 닿아 있고
      (sbW < vpW * 0.6) &&                  // 전체 폭의 60% 미만(상단바 아님)
      (sbH > vpH * 0.5);                    // 세로로 절반 이상
    if (looksLikeLeftSidebar) {
      left = Math.max(left, sb.right);
    }
  }

  // ── 하단 오버레이(trash-zone) → "위로 줄이기" (확장 금지)
  if (tr && tr.top < bottom && intersectsH(tr, vp)) {
    bottom = Math.min(bottom, tr.top);
  }

  // 안전장치: 비정상 범위 방지
  if (left >= right)  left = right - 1;
  if (top >= bottom)  top  = bottom - 1;
  return { left, top, right, bottom };
}

/* ---------------------------------------------
 * Internal helpers
 * ------------------------------------------- */

/** Position the floating ghost under the cursor (screen coordinates). */
function updateGhost(clientX, clientY, px) {
  if (!state.drag?.ghost) return;
  state.drag.ghost.style.left = `${clientX - px / 2}px`;
  state.drag.ghost.style.top = `${clientY - px / 2}px`;
}

function computeEdgeVelocity(clientX, clientY){
  const vp = computeEffectiveRect();
  const ease = (d) => Math.min(1, Math.max(0, d / EDGE_MARGIN)); // 0..1 (far→0, near edge→1)
  let vx = 0, vy = 0;
  // left / right
  if (clientX < vp.left + EDGE_MARGIN) {
    const f = 1 - ease(clientX - vp.left);
    vx = -MAX_SPEED * f;
  } else if (clientX > vp.right - EDGE_MARGIN) {
    const f = 1 - ease(vp.right - clientX);
    vx = MAX_SPEED * f;
  }
  // top / bottom
  if (clientY < vp.top + EDGE_MARGIN) {
    const f = 1 - ease(clientY - vp.top);
    vy = -MAX_SPEED * f;
  } else if (clientY > vp.bottom - EDGE_MARGIN) {
    const f = 1 - ease(vp.bottom - clientY);
    vy = MAX_SPEED * f;
  }
  return { vx, vy };
}

function startEdgeAutoScroll(){
  if (!state.drag) return;
  if (state.drag.edgeScroll?.rafId) return; // already running
  const es = (state.drag.edgeScroll = {
    vx: 0, vy: 0, rafId: 0, lastTs: 0,
  });
  const tick = (ts) => {
    if (!state.drag || !state.drag.edgeScroll) return;
    if (!es.lastTs) es.lastTs = ts;
    const dt = Math.min(48, ts - es.lastTs); // clamp to avoid huge jumps
    es.lastTs = ts;
    if (es.vx !== 0 || es.vy !== 0){
      viewport.scrollLeft += (es.vx * dt) / 1000;
      viewport.scrollTop  += (es.vy * dt) / 1000;
      // keep drag visuals in sync while pointer stays near edge
      if (state.drag.lastClientX != null) {
        updateDragAt(state.drag.lastClientX, state.drag.lastClientY);
      }
      es.rafId = requestAnimationFrame(tick);
    } else {
      es.rafId = 0;
    }
  };
  es.rafId = requestAnimationFrame(tick);
}

function stopEdgeAutoScroll(){
  if (state.drag?.edgeScroll?.rafId) cancelAnimationFrame(state.drag.edgeScroll.rafId);
  if (state.drag) state.drag.edgeScroll = null;
}

/** Check if the pointer is currently inside the trash zone. */
function inTrash(clientX, clientY) {
  if (!trash) return false;
  const r = trash.getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
}

/* ---------------------------------------------
 * Pointer handlers (shared for new/move)
 * ------------------------------------------- */

function onPointerMove(e) {
  if (!state.drag || e.pointerId !== state.drag.pointerId) return;

  // Visual feedback for trash zone
  const overTrash = inTrash(e.clientX, e.clientY);
  trash?.classList.toggle('active', overTrash);

  // Update visuals from current pointer
  updateDragAt(e.clientX, e.clientY);

  // Edge auto-scroll
  const { vx, vy } = computeEdgeVelocity(e.clientX, e.clientY);
  if (!state.drag.edgeScroll) state.drag.edgeScroll = { vx:0, vy:0, rafId:0, lastTs:0 };
  state.drag.edgeScroll.vx = vx;
  state.drag.edgeScroll.vy = vy;
  if (vx !== 0 || vy !== 0) startEdgeAutoScroll(); else stopEdgeAutoScroll();
}

function onPointerUp(e) {
  if (!state.drag || e.pointerId !== state.drag.pointerId) {
    cleanupDrag();
    return;
  }

  const droppingInTrash = inTrash(e.clientX, e.clientY);

  if (state.drag.mode === 'new') {
    // Remove ghost
    state.drag.ghost?.parentNode?.removeChild(state.drag.ghost);

    // Create the block unless dropped in trash
    if (!droppingInTrash) {
      const { x, y } = clientToLocalRot(e.clientX, e.clientY);
      const size = state.drag.size;

      const left = x - (size * cell) / 2;
      const top = y - (size * cell) / 2;
      const snapped = snapLocal(left, top, size);

      const el = createBlock(state.drag.kind, size, snapped.left, snapped.top);
      makeMovable(el);
    }

    cleanupDrag();
    return;
  }

  // Move existing node or delete it
  if (state.drag.mode === 'move' && state.drag.node) {
    if (droppingInTrash) {
      // Counters are updated inside deleteBlock(), so no explicit onDeleteBlock() here.
      deleteBlock(state.drag.node);
    } else {
      const { x, y } = clientToLocalRot(e.clientX, e.clientY);
      const size = state.drag.size;

      const left = x - (size * cell) / 2;
      const top = y - (size * cell) / 2;
      const snapped = snapLocal(left, top, size);

      updateBlockPosition(state.drag.node, snapped.left, snapped.top);
    }
  }

  cleanupDrag();
}

/** Tear down drag visuals/state and listeners. */
function cleanupDrag() {
  snapEl.style.display = 'none';
  clearPreview();
  trash?.classList.remove('active');
  stopEdgeAutoScroll();
  if (state.drag?.ghost?.parentNode) state.drag.ghost.parentNode.removeChild(state.drag.ghost);
  // remove lifted class from original block, if any
  if (state.drag?.node) state.drag.node.classList.remove('is-lifted');

  // Remove ghost if still present
  state.drag?.ghost?.parentNode?.removeChild(state.drag.ghost);

  window.removeEventListener('pointermove', onPointerMove);
  state.drag = null;
}

/* ---------------------------------------------
 * Public API
 * ------------------------------------------- */

/**
 * Enable dragging from palette to create new blocks.
 */
export function setupPaletteDrag() {
  if (!palette) return;

  const LONG_PRESS_MS = 250;  // touch long-press threshold
  const MOVE_TOL = 8;         // px, gesture slop

  palette.querySelectorAll('.palette-item').forEach((item) => {
    item.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;

      const isTouch = e.pointerType === 'touch';
      const startX = e.clientX, startY = e.clientY;
      let pressed = false;
      let moved = false;
      let timer = null;

      e.preventDefault();
      item.setPointerCapture(e.pointerId);

      const startDrag = () => {
        hapticTap(15);
        window.__suppressContextMenu = true;
        if (palette?.dataset?.scrolling === '1') delete palette.dataset.scrolling;
        const size = parseInt(item.dataset.size, 10);
        const kind = item.dataset.kind;
        const ghost = document.createElement('div');
        ghost.className = 'ghost';
        const cellPx = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell'));
        const px = size * cellPx;
        ghost.style.width  = px + 'px';
        ghost.style.height = px + 'px';
        // inner label to keep text upright
        const gl = document.createElement('div');
        gl.className = 'ghost-label';
        gl.textContent =
          kind === 'hq'       ? t('palette.hq') :
          kind === 'flag'     ? t('palette.flag') :
          kind === 'trap'     ? t('palette.trap') :
          kind === 'city'     ? t('palette.city') :
          kind === 'resource' ? t('palette.resource') :
          `${size}×${size}`;
        ghost.appendChild(gl);
        document.body.appendChild(ghost);
        state.drag = { mode:'new', size, kind, ghost, pointerId: e.pointerId };
        updateGhost(e.clientX, e.clientY, px);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp, { once:true });
      };
    if (isTouch){
      // wait for long-press unless user moves (scroll gesture)
      window.__suppressContextMenu = true;
      timer = setTimeout(() => { pressed = true; startDrag(); }, LONG_PRESS_MS);
      const onMoveCheck = (ev) => {
        const dx = Math.abs(ev.clientX - startX);
        const dy = Math.abs(ev.clientY - startY);
        if (dx > MOVE_TOL || dy > MOVE_TOL){
          // treat as scroll; cancel drag creation
          if (timer) clearTimeout(timer);
          moved = true;
          item.releasePointerCapture(e.pointerId);
          item.removeEventListener('pointermove', onMoveCheck);
          window.__suppressContextMenu = false;
        }
      };
      item.addEventListener('pointermove', onMoveCheck, { once:false });
      item.addEventListener('pointerup', () => {
        if (timer) clearTimeout(timer);
        item.removeEventListener('pointermove', onMoveCheck);
        window.__suppressContextMenu = false;
      }, { once:true });
    } else {
      // mouse: start immediately (desktop)
      startDrag();
    }
    });
  });
}

/**
 * Make an existing block movable (drag to reposition/delete).
 * @param {HTMLElement} el
 */
export function makeMovable(el) {
  el.addEventListener('pointerdown', (e)=>{
    if (e.button !== 0) return;
    if (el.dataset.editing === '1') return; // while editing city label
    const isTouch = e.pointerType === 'touch';
    const LONG_PRESS_MS = 250;
    const MOVE_TOL = 6;
    let timer = null, moved = false;
    const sx = e.clientX, sy = e.clientY;

    const startMove = () => {
      if (state.panning && state.panning.moved) return;
      hapticTap(15);
      window.__suppressContextMenu = true;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      const size = parseInt(el.dataset.size, 10);
      const kind = el.dataset.kind;
      const cellPx = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell'));
      const px = size*cellPx;
      const ghost = document.createElement('div');
      ghost.className = 'ghost';
      ghost.style.width  = px + 'px';
      ghost.style.height = px + 'px';
      const gl = document.createElement('div');
      gl.className = 'ghost-label';
      const labelEl = el.querySelector('.label');
      gl.textContent = (labelEl?.textContent || '').trim() || `${size}×${size}`;
      ghost.appendChild(gl);
      document.body.appendChild(ghost);

      // lifted visual on original
      el.classList.add('is-lifted');

      state.drag = { mode:'move', size, kind, node: el, ghost, pointerId: e.pointerId };
      updateGhost(e.clientX, e.clientY, px);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp, { once:true });
    };

    if (isTouch){
      window.__suppressContextMenu = true;
      timer = setTimeout(startMove, LONG_PRESS_MS);
      const onMoveCheck = (ev) => {
        const dx = Math.abs(ev.clientX - sx);
        const dy = Math.abs(ev.clientY - sy);
        if (dx > MOVE_TOL || dy > MOVE_TOL){
          moved = true;
          if (timer) clearTimeout(timer);
          el.removeEventListener('pointermove', onMoveCheck);
          // treat as viewport pan/scroll -> do nothing
          window.__suppressContextMenu = false;
        }
      };
      el.addEventListener('pointermove', onMoveCheck);
      el.addEventListener('pointerup', () => {
        if (timer) clearTimeout(timer);
        el.removeEventListener('pointermove', onMoveCheck);
        // short tap ends here (no move)
        window.__suppressContextMenu = false;
      }, { once:true });
    } else {
      // mouse: immediate
      startMove();
    }
  });
}