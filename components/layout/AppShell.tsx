'use client';

import { useEffect } from 'react';
import { useApp } from '@/lib/context';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { dbLoading } = useApp();

  // iOS Safari ignores overscroll-behavior and CSS overflow:hidden on html/body
  // still allows rubber-band drags, which makes the page feel like it scrolls
  // forever. A drag is only allowed to move the scrollable element it started
  // in — anywhere else, or past that element's edges, the touch is swallowed.
  // The scroller has to be resolved per gesture: modals and sheets live outside
  // [data-scroll-root] and scroll on their own.
  //
  // Separately: iOS PWAs added to the home screen still run WKWebView's native
  // edge-swipe back/forward navigation gesture whenever there's browser
  // history (e.g. right after navigating into a page). That gesture visually
  // drags the whole page horizontally and CSS touch-action: pan-y cannot stop
  // it — it's a system gesture recognizer that sits above the page's own
  // touch handling. The only web-side mitigation is to claim touches that
  // start within the gesture's activation zone at the screen edge before the
  // system recognizer does, via preventDefault on touchstart.
  const EDGE_GUARD_PX = 24;

  // See --vp-deficit in globals.css: iOS hands a standalone PWA a layout
  // viewport shorter than the screen, so bottom-anchored chrome stops short of
  // the real bottom edge. Publish the shortfall so the nav geometry can undo it.
  useEffect(() => {
    const sync = () => {
      const standalone = (window.navigator as unknown as { standalone?: boolean }).standalone;
      const shortfall = window.screen.height - window.innerHeight;
      // screen.height doesn't rotate on iOS, and the keyboard shrinks the
      // viewport too — both produce shortfalls far larger than a status bar.
      const isStatusBarShortfall =
        standalone === true &&
        window.innerHeight > window.innerWidth &&
        shortfall > 0 &&
        shortfall <= 80;
      document.documentElement.style.setProperty(
        '--vp-deficit',
        isStatusBarShortfall ? `${shortfall}px` : '0px'
      );
    };

    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, []);

  useEffect(() => {
    let scroller: HTMLElement | null = null;
    let lastTouchY = 0;

    const findScroller = (el: Element | null): HTMLElement | null => {
      while (el && el !== document.body) {
        const node = el as HTMLElement;
        const overflowY = getComputedStyle(node).overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
          return node;
        }
        el = node.parentElement;
      }
      return null;
    };

    // Elements that legitimately scroll sideways (e.g. filter-chip rows) opt
    // back in with `touch-auto`; the edge guard must not swallow their drags.
    const findHScroller = (el: Element | null): HTMLElement | null => {
      while (el && el !== document.body) {
        const node = el as HTMLElement;
        const overflowX = getComputedStyle(node).overflowX;
        if ((overflowX === 'auto' || overflowX === 'scroll') && node.scrollWidth > node.clientWidth) {
          return node;
        }
        el = node.parentElement;
      }
      return null;
    };

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      lastTouchY = touch?.clientY ?? 0;
      scroller = findScroller(e.target as Element);

      const x = touch?.clientX ?? 0;
      const nearEdge = x < EDGE_GUARD_PX || x > window.innerWidth - EDGE_GUARD_PX;
      if (nearEdge && !findHScroller(e.target as Element)) {
        e.preventDefault();
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!scroller) {
        e.preventDefault();
        return;
      }
      const y = e.touches[0]?.clientY ?? lastTouchY;
      const atTop = scroller.scrollTop <= 0;
      const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;
      if ((atTop && y > lastTouchY) || (atBottom && y < lastTouchY)) {
        e.preventDefault();
      }
      lastTouchY = y;
    };

    document.addEventListener('touchstart', onTouchStart, { passive: false });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  // Loading local/synced data — show blank (prevents flash of empty state)
  if (dbLoading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <svg className="animate-spin w-7 h-7 text-x-blue" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    );
  }

  return <>{children}</>;
}
