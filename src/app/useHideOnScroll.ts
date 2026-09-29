import { useEffect, useState, type RefObject } from 'react';

const TOP_ZONE_PX = 56;
const TRAVEL_PX = 24;

/**
 * X-style header: scrolling down tucks it away, any scroll back up brings it
 * back, and it is always shown near the top. State changes only when the
 * direction settles, so scrolling itself causes no re-renders.
 */
export function useHideOnScroll(scrollRef: RefObject<HTMLElement | null>): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let last = el.scrollTop;
    let travel = 0;
    let current = false;
    const set = (next: boolean) => { if (next !== current) { current = next; setHidden(next); } };
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
    return () => el.removeEventListener('scroll', onScroll);
  }, [scrollRef]);
  return hidden;
}
