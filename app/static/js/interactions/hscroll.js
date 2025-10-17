// File: app/static/js/interactions/hscroll.js
// Drag-to-scroll helper for horizontal palette (mouse & touch).
export function enableDragScroll(el){
  if (!el) return;

  let dragging = false, sx = 0, sl = 0;

  const toX = (e) => (e.touches?.[0]?.clientX ?? e.clientX);

  const onDown = (e) => {
    // Left mouse button or touch start
    if (e.button != null && e.button !== 0) return;
    dragging = true;
    sx = toX(e);
    sl = el.scrollLeft;
    el.classList.add('is-dragging');
    el.dataset.scrolling = '1';
  };

  const onMove = (e) => {
    if (!dragging) return;
    // Prevent default to convert pan gesture into scroll
    e.preventDefault();
    const dx = toX(e) - sx;
    el.scrollLeft = sl - dx;
  };

  const onUp = () => {
    dragging = false;
    el.classList.remove('is-dragging');
    delete el.dataset.scrolling;
  };

  // Mouse
  el.addEventListener('mousedown', onDown);
  el.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);

  // Touch
  el.addEventListener('touchstart', onDown, { passive: true });
  el.addEventListener('touchmove', onMove, { passive: false });
  el.addEventListener('touchend', onUp);
  el.addEventListener('touchcancel', onUp);
}
