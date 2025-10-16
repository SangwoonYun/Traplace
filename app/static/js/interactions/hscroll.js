// File: app/static/js/interactions/hscroll.js
/**
 * Horizontal drag-to-scroll for the palette bar (mouse & touch via Pointer Events).
 * - Uses a small slop so short taps don't trigger scrolling.
 * - While actively scrolling, sets `data-scrolling="1"` on the element so
 *   palette long-press pick-up logic can cancel itself (see drag.js).
 * - Adds/removes a CSS helper class `.is-dragging` for cursor styling.
 */

const SLOP_PX = 6; // movement threshold before we consider it a scroll

export function enableDragScroll(el) {
  if (!el) return;

  let active = false;       // true once slop exceeded
  let tracking = false;     // true between pointerdown..up (before/after slop)
  let pid = null;           // pointerId we are tracking
  let startX = 0;           // pointerdown x
  let startScrollLeft = 0;  // scrollLeft at pointerdown

  const getX = (e) => (e.clientX ?? e.touches?.[0]?.clientX ?? 0);

  function beginScroll(e) {
    // Convert “candidate” into active drag-scroll
    active = true;
    el.classList.add('is-dragging');
    el.dataset.scrolling = '1';
    // Keep receiving moves even if pointer leaves the element
    el.setPointerCapture?.(pid);
    // Prevent context menu on long press while actively scrolling
    e.preventDefault();
  }

  function onPointerDown(e) {
    // Only left button (mouse) or primary touch
    if (e.button != null && e.button !== 0) return;
    if (tracking) return;

    tracking = true;
    active = false;
    pid = e.pointerId ?? 'mouse';
    startX = getX(e);
    startScrollLeft = el.scrollLeft;

    // We don't call preventDefault here to keep click/long-press semantics
    // until the gesture exceeds the slop (then beginScroll will preventDefault).
  }

  function onPointerMove(e) {
    if (!tracking || (pid !== (e.pointerId ?? 'mouse'))) return;

    const dx = getX(e) - startX;

    if (!active) {
      // Wait for slop before taking over the gesture
      if (Math.abs(dx) >= SLOP_PX) beginScroll(e);
      else return;
    }

    // Actively scrolling
    e.preventDefault(); // turn the gesture into a scroll
    el.scrollLeft = startScrollLeft - dx;
  }

  function endScroll() {
    if (!tracking) return;
    tracking = false;
    active = false;
    pid = null;
    el.classList.remove('is-dragging');
    delete el.dataset.scrolling;
  }

  function onPointerUp(e) {
    if (pid !== (e.pointerId ?? 'mouse')) return;
    endScroll();
  }

  function onPointerCancel(e) {
    if (pid !== (e.pointerId ?? 'mouse')) return;
    endScroll();
  }

  // Pointer Events cover both mouse and touch on modern browsers
  el.addEventListener('pointerdown', onPointerDown, { passive: true });
  el.addEventListener('pointermove', onPointerMove, { passive: false });
  el.addEventListener('pointerup', onPointerUp, { passive: true });
  el.addEventListener('pointercancel', onPointerCancel, { passive: true });
}
