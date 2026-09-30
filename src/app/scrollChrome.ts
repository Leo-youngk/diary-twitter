import { useEffect, type RefObject } from 'react';
import { chromeExperiment } from './perfProbe';

/**
 * X-style chrome while reading: scrolling down a little tucks the header and
 * the bottom tab bar away, scrolling back up brings them back, and near the
 * top they are always shown.
 *
 * The chrome is only switched when the direction settles; the slide itself is
 * a CSS transition. Moving it frame by frame with the finger made a fast flick
 * stall on iPhone (设置 → 性能诊断 comparison, 2026-09-30): the list is the
 * same on the profile page, which never stalled, and keeping the chrome still
 * removed the stall with or without the blur.
 */

const TRAVEL_PX = 24;
const SLIDE_MS = 220;
// How far the tab bar travels to be fully out of sight (its height plus gap and shadow).
const NAV_TRAVEL_PX = 110;

let navElement: HTMLElement | null = null;

/** The tab bar registers itself here (a ref callback). */
export function setNavElement(element: HTMLElement | null): void {
  navElement = element;
}

function place(header: HTMLElement | null, hidden: boolean): void {
  const transition = `transform ${SLIDE_MS}ms ease-out, opacity ${SLIDE_MS}ms ease-out`;
  if (header) {
    header.style.transition = transition;
    header.style.transform = hidden ? 'translate3d(0, -100%, 0)' : '';
  }
  if (navElement) {
    navElement.style.transition = transition;
    navElement.style.transform = hidden ? `translate3d(0, ${NAV_TRAVEL_PX}px, 0)` : '';
    navElement.style.opacity = hidden ? '0' : '';
    navElement.style.pointerEvents = hidden ? 'none' : '';
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
    let hidden = false;
    let travel = 0;
    let last = scroller.scrollTop;

    const set = (next: boolean) => {
      if (next === hidden) return;
      hidden = next;
      place(header, next);
    };

    const onScroll = () => {
      if (!mobile.matches) return;
      const top = scroller.scrollTop;
      const delta = top - last;
      last = top;
      if (top <= (header?.offsetHeight ?? 0)) { travel = 0; set(false); return; }
      travel = Math.sign(travel) === Math.sign(delta) ? travel + delta : delta;
      if (travel > TRAVEL_PX) set(true);
      else if (travel < -TRAVEL_PX) set(false);
    };

    const onWidth = () => { travel = 0; last = scroller.scrollTop; set(false); };
    mobile.addEventListener('change', onWidth);
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      mobile.removeEventListener('change', onWidth);
      // Leaving a tab never leaves the chrome tucked away.
      place(header, false);
    };
  }, [scrollRef, headerRef, active]);
}
