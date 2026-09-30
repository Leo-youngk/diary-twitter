import { useLayoutEffect, useState, type RefObject } from 'react';
import { cn } from '@/lib/utils';

/**
 * A main tab: on the phone its header floats over the scrolling content,
 * outside the scroller, so sliding the header away never touches what is
 * being scrolled. The content starts below the header. On wide screens the
 * header simply sits above the scroller.
 */
export default function PaneLayout({ header, headerRef, scrollRef, className, children }: {
  header: React.ReactNode;
  headerRef: RefObject<HTMLElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  className?: string;
  children: React.ReactNode;
}) {
  const [inset, setInset] = useState(0);

  useLayoutEffect(() => {
    const element = headerRef.current;
    if (!element) return;
    const update = () => setInset(getComputedStyle(element).position === 'absolute' ? element.offsetHeight : 0);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    const wide = window.matchMedia('(min-width: 768px)');
    wide.addEventListener('change', update);
    return () => { observer.disconnect(); wide.removeEventListener('change', update); };
  }, [headerRef]);

  return (
    <div className="relative flex h-full flex-col">
      {header}
      <div ref={scrollRef} data-scroll-root className={cn('relative min-h-0 flex-1 overflow-y-auto', className)} style={{ paddingTop: inset }}>
        {children}
      </div>
    </div>
  );
}
