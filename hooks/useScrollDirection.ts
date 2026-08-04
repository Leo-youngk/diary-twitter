'use client';

import { useState, useEffect, useRef } from 'react';

export function useScrollDirection(threshold = 10) {
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    // The app shell scrolls inside <main data-scroll-root>, not the window —
    // html/body are fixed to kill iOS rubber-band bounce (see globals.css).
    const el = document.querySelector<HTMLElement>('[data-scroll-root]');
    if (!el) return;

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;

      requestAnimationFrame(() => {
        const currentY = el.scrollTop;
        const diff = currentY - lastScrollY.current;

        if (Math.abs(diff) > threshold) {
          // Scrolling down & not at top → hide
          if (diff > 0 && currentY > 60) {
            setHidden(true);
          }
          // Scrolling up → show
          if (diff < 0) {
            setHidden(false);
          }
          lastScrollY.current = currentY;
        }

        ticking.current = false;
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [threshold]);

  return hidden;
}
