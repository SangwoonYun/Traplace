// File: app/static/js/interactions/hscroll.js
/**
 * Drag-to-scroll helper for a horizontally scrollable element (mouse & touch).
 * Keeps a 'is-dragging' class and sets data-scrolling='1' while dragging.
 * No pointer capture is used; window-level mouseup ends the gesture.
 */

/* ---------------------------------------------
 * Public API
 * ------------------------------------------- */

/**
 * Enable horizontal drag-to-scroll interactions on the given element.
 * @param {HTMLElement} el The scrollable container (with overflow-x)
 */
export function enableDragScroll(el) {
  if (!el) return;

  let dragging = false;
  let startX = 0; // clientX at gesture start
  let startScrollLeft = 0; // el.scrollLeft at gesture start

  /* -------------------------------------------
   * Helpers
   * ----------------------------------------- */

  /** Get the current clientX from mouse or the first touch. */
  const getClientX = (e) => (e.touches?.[0]?.clientX ?? e.clientX);

  /* -------------------------------------------
   * Handlers
   * ----------------------------------------- */

  /** mousedown / touchstart */
  const onDown = (e) => {
    // Accept left mouse button or any touch
    if (e.button != null && e.button !== 0) return;

    dragging = true;
    startX = getClientX(e);
    startScrollLeft = el.scrollLeft;

    el.classList.add('is-dragging');
    el.dataset.scrolling = '1';
  };

  /** mousemove / touchmove */
  const onMove = (e) => {
    if (!dragging) return;

    // Convert pan gesture into scroll (touchmove is passive:false)
    e.preventDefault();

    const dx = getClientX(e) - startX;
    el.scrollLeft = startScrollLeft - dx;
  };

  /** mouseup / touchend / touchcancel */
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('is-dragging');
    delete el.dataset.scrolling;
  };

  /* -------------------------------------------
   * Wiring
   * ----------------------------------------- */

  // Mouse
  el.addEventListener('mousedown', onDown);
  el.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);

  // Touch
  // - touchstart is passive:true (no preventDefault there)
  // - touchmove is passive:false because we call preventDefault
  el.addEventListener('touchstart', onDown, { passive: true });
  el.addEventListener('touchmove', onMove, { passive: false });
  el.addEventListener('touchend', onUp);
  el.addEventListener('touchcancel', onUp);
}
