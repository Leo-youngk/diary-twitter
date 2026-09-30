import { useEffect, type RefObject } from 'react';
import { chromeExperiment } from './perfProbe';

/**
 * X-style chrome while reading: the header and the bottom tab bar move with
 * the finger — scroll 20px down and they are 20px further out of view,
 * scroll back and they come back just as far. When the scrolling stops half
 * way, they settle to fully shown or fully hidden. Near the top they are
 * always shown.
 *
 * Positions are written straight to the elements once per frame; React is
 * not involved, so scrolling never re-renders anything.
 */

const SETTLE_AFTER_MS = 120;
const SETTLE_MS = 220;
const FALLBACK_RANGE_PX = 56;
// How far the tab bar travels to be fully out of sight (its height plus gap and shadow).
const NAV_TRAVEL_PX = 110;

let navElement: HTMLElement | null = null;

/** The tab bar registers itself here (a ref callback). */
export function setNavElement(element: HTMLElement | null): void {
  navElement = element;
}

function place(header: HTMLElement | null, fraction: number, animate: boolean): void {
  const transition = animate ? `transform ${SETTLE_MS}ms ease-out, opacity ${SETTLE_MS}ms ease-out` : 'none';
  if (header) {
    header.style.transition = transition;
    header.style.transform = fraction > 0 ? `translate3d(0, ${-fraction * 100}%, 0)` : '';
  }
  if (navElement) {
    navElement.style.transition = transition;
    navElement.style.transform = fraction > 0 ? `translate3d(0, ${fraction * NAV_TRAVEL_PX}px, 0)` : '';
    navElement.style.opacity = fraction > 0 ? String(1 - fraction * 0.9) : '';
    navElement.style.pointerEvents = fraction > 0.5 ? 'none' : '';
  }
}

/** Drive the chrome from this scroller while `active` (the tab that is showing). */
export function useScrollChrome(scrollRef: RefObject<HTMLElement | null>, headerRef: RefObject<HTMLElement | null> | null, active: boolean): void {
  useEffect(() => {
    const scroller = scrollRef.current;
    // TEMPORARY: the scroll experiment in 设置 → 性能诊断 can keep the chrome still.
    if (!scroller || !active || chromeExperiment() !== 'follow') return;
    const header = headerRef?.current ?? null;
    const mobile = window.matchMedia('(max-width: 767px)');
    let max = header?.offsetHeight || FALLBACK_RANGE_PX;
    const observer = new ResizeObserver(() => { max = header?.offsetHeight || FALLBACK_RANGE_PX; });
    if (header) observer.observe(header);
    let hidden = 0; // px of the range currently tucked away
    let last = scroller.scrollTop;
    let frame = 0;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const draw = (animate: boolean) => { frame = 0; place(header, hidden / max, animate); };

    const onScroll = () => {
      if (!mobile.matches) return;
      const top = scroller.scrollTop;
      const delta = top - last;
      last = top;
      // Never more tucked away than the distance from the top.
      hidden = Math.max(0, Math.min(max, hidden + delta, top));
      if (!frame) frame = requestAnimationFrame(() => draw(false));
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        if (hidden <= 0 || hidden >= max) return;
        hidden = hidden > max / 2 && scroller.scrollTop > max ? max : 0;
        cancelAnimationFrame(frame);
        draw(true);
      }, SETTLE_AFTER_MS);
    };

    const onWidth = () => { hidden = 0; last = scroller.scrollTop; place(header, 0, false); };
    mobile.addEventListener('change', onWidth);

    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
      clearTimeout(settleTimer);
      mobile.removeEventListener('change', onWidth);
      observer.disconnect();
      // Leaving a tab never leaves the chrome tucked away.
      place(header, 0, true);
    };
  }, [scrollRef, headerRef, active]);
}
