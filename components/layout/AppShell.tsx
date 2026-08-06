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

    const onTouchStart = (e: TouchEvent) => {
      lastTouchY = e.touches[0]?.clientY ?? 0;
      scroller = findScroller(e.target as Element);
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

    document.addEventListener('touchstart', onTouchStart, { passive: true });
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
