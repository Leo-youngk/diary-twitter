import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import PostRow from './PostRow';

interface TimelineProps {
  ids: string[];
  scrollRef: RefObject<HTMLElement | null>;
  empty?: React.ReactNode;
  /** Draws one row; posts by default. */
  renderRow?: (id: string) => React.ReactNode;
}

const renderPost = (id: string) => <PostRow id={id} />;

/**
 * A virtualised list (posts unless told otherwise): only the rows near the
 * screen exist in the DOM, so a thousand entries scroll like fifty.
 *
 * Rows measure themselves; when a row above the screen changes height the
 * virtualiser moves the scroll position with it. New posts arriving from
 * another device are inserted above without moving what is being read.
 */
export default function Timeline({ ids, scrollRef, empty, renderRow = renderPost }: TimelineProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: ids.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 150,
    overscan: 6,
    getItemKey: (index) => ids[index],
    scrollMargin: listRef.current?.offsetTop ?? 0,
    // Rows render from the first frame even if the list mounts before its
    // scroller has been measured (e.g. inside a panel that is sliding in).
    initialRect: { width: window.innerWidth, height: window.innerHeight },
  });

  // Keep the row being read in place when rows are added or removed above it.
  const anchor = useRef<{ key: string; offset: number } | null>(null);
  const previousIds = useRef(ids);
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (previousIds.current !== ids && scroller && anchor.current) {
      const item = virtualizer.getVirtualItems().find((v) => v.key === anchor.current!.key)
        ?? virtualizer.measurementsCache.find((m) => m.key === anchor.current!.key);
      if (item && scroller.scrollTop > 0) {
        const target = item.start - anchor.current.offset;
        if (Math.abs(target - scroller.scrollTop) > 1) scroller.scrollTop = target;
      }
    }
    previousIds.current = ids;
    const first = virtualizer.getVirtualItems().find((v) => v.end > (scroller?.scrollTop ?? 0));
    anchor.current = first && scroller ? { key: String(first.key), offset: first.start - scroller.scrollTop } : null;
  });

  if (ids.length === 0) return <>{empty}</>;

  const items = virtualizer.getVirtualItems();
  return (
    <div ref={listRef} style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
      {items.map((item) => (
        <div
          key={item.key}
          data-index={item.index}
          ref={virtualizer.measureElement}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)` }}
        >
          {renderRow(ids[item.index])}
        </div>
      ))}
    </div>
  );
}
