/**
 * iOS touch handling that CSS alone cannot do in a standalone web app.
 *
 * 1. Modern browsers use CSS overscroll-behavior for scroll boundaries. Only
 *    older browsers need the JS fallback that cancels boundary drags.
 * 2. System back gesture: WKWebView keeps its own edge-swipe navigation when
 *    there is history. Touches that start at the very edge are claimed before
 *    the system recogniser sees them; the app's own swipe-back (Stackflow)
 *    still receives them. The zone stays inside the page gutter so cards and
 *    buttons remain tappable.
 */

const EDGE_GUARD_PX = 12;

function findScroller(el: Element | null, axis: 'x' | 'y'): HTMLElement | null {
  while (el && el !== document.body) {
    const node = el as HTMLElement;
    const style = getComputedStyle(node);
    const overflow = axis === 'y' ? style.overflowY : style.overflowX;
    const scrollable = axis === 'y'
      ? node.scrollHeight > node.clientHeight
      : node.scrollWidth > node.clientWidth;
    if ((overflow === 'auto' || overflow === 'scroll') && scrollable) return node;
    el = node.parentElement;
  }
  return null;
}

export function installTouchGuard(): void {
  const nativeBoundaries = CSS.supports('overscroll-behavior-y', 'none');
  let scroller: HTMLElement | null = null;
  let lastY = 0;

  document.addEventListener('touchstart', (event) => {
    const touch = event.touches[0];
    if (!touch || event.touches.length !== 1) return;
    lastY = touch?.clientY ?? 0;
    const target = event.target as Element;
    if (!nativeBoundaries) scroller = findScroller(target, 'y');
    const x = touch?.clientX ?? 0;
    const nearEdge = x < EDGE_GUARD_PX || x > window.innerWidth - EDGE_GUARD_PX;
    if (nearEdge && !target.closest('button, a, input, textarea, select') && !findScroller(target, 'x')) event.preventDefault();
  }, { passive: false });

  if (nativeBoundaries) return;

  document.addEventListener('touchmove', (event) => {
    if (event.touches.length !== 1) return;
    if (!scroller) {
      event.preventDefault();
      return;
    }
    const y = event.touches[0]?.clientY ?? lastY;
    const atTop = scroller.scrollTop <= 0;
    const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
    if ((atTop && y > lastY) || (atBottom && y < lastY)) event.preventDefault();
    lastY = y;
  }, { passive: false });
}
