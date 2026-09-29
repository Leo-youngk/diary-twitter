import { useEffect, useState, useSyncExternalStore, type RefObject } from 'react';

const TOP_ZONE_PX = 56;
const TRAVEL_PX = 24;

// The bottom tab bar follows whichever tab is showing.
let navHidden = false;
const navListeners = new Set<() => void>();

export function setNavHidden(next: boolean): void {
  if (next === navHidden) return;
  navHidden = next;
  navListeners.forEach((listener) => listener());
}

export function useNavHidden(): boolean {
  return useSyncExternalStore(
    (listener) => { navListeners.add(listener); return () => navListeners.delete(listener); },
    () => navHidden,
  );
}

/**
 * X-style chrome: scrolling down tucks the header (and, for the tab that is
 * showing, the bottom tab bar) away, any scroll back up brings them back, and
 * they are always shown near the top. State changes only when the direction
 * settles, so scrolling itself causes no re-renders.
 */
export function useHideOnScroll(scrollRef: RefObject<HTMLElement | null>, active: boolean): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !active) return;
    let last = el.scrollTop;
    let travel = 0;
    let current = false;
    const set = (next: boolean) => {
      if (next === current) return;
      current = next;
      setHidden(next);
      setNavHidden(next);
    };
    const onScroll = () => {
      const top = el.scrollTop;
      const delta = top - last;
      last = top;
      if (top <= TOP_ZONE_PX) { travel = 0; set(false); return; }
      travel = Math.sign(travel) === Math.sign(delta) ? travel + delta : delta;
      if (travel > TRAVEL_PX) set(true);
      else if (travel < -TRAVEL_PX) set(false);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      // Leaving a tab (or the tab bar) never leaves the chrome tucked away.
      setHidden(false);
      setNavHidden(false);
    };
  }, [scrollRef, active]);
  return hidden;
}
