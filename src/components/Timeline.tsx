import { startTransition, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import PostRow from './PostRow';

interface TimelineProps {
  ids: string[];
  scrollRef: RefObject<HTMLElement | null>;
  empty?: React.ReactNode;
  /** Draws one row; posts by default. */
  renderRow?: (id: string) => React.ReactNode;
}

const INITIAL_ROWS = 16;
const PAGE = 4;
// Start rendering the next page this far before the end comes into view.
const PRELOAD_PX = 2200;

const renderPost = (id: string) => <PostRow id={id} />;

/**
 * Render enough rows for the first screen, then small batches ahead of the
 * viewport. A concurrent update lets input interrupt the rendering work.
 *
 * Scrolling is left entirely to the browser. A virtualised list had to move
 * the scroll position whenever a row above the screen turned out taller or
 * shorter than estimated, and on iOS every such correction interrupts the
 * momentum of a flick — the stutter when scrolling fast right after launch.
 * Appending below the screen never moves anything.
 *
 * Browsers with scroll anchoring keep incoming posts above the reader from
 * moving the viewport. Older Safari versions receive that compensation here.
 */
export default function Timeline({ ids, scrollRef, empty, renderRow = renderPost }: TimelineProps) {
  const [limit, setLimit] = useState(INITIAL_ROWS);
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const shown = ids.length > limit ? ids.slice(0, limit) : ids;
  const hasMore = ids.length > shown.length;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!hasMore || !sentinel || !root) return;
    // Re-created after every page, so it fires again if the end is still near.
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        startTransition(() => setLimit((current) => current + PAGE));
      },
      { root, rootMargin: `0px 0px ${PRELOAD_PX}px 0px` },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [scrollRef, hasMore, limit]);

  const previousFirst = useRef(ids[0]);
  useLayoutEffect(() => {
    const before = previousFirst.current;
    previousFirst.current = ids[0];
    const scroller = scrollRef.current;
    const list = listRef.current;
    if (!before || before === ids[0] || !scroller || !list || scroller.scrollTop <= 0) return;
    // Reading scrollTop already applies native anchoring. Adding the inserted
    // height again would move the reader twice (Chrome and Safari 27+).
    if (CSS.supports('overflow-anchor', 'auto')) return;
    const inserted = ids.indexOf(before);
    if (inserted <= 0) return;
    const added = Array.from(list.children).slice(0, inserted) as HTMLElement[];
    const readHeight = () => added.reduce((total, row) => total + row.offsetHeight, 0);
    let height = readHeight();
    scroller.scrollTop += height;
    // A newly inserted long paragraph gets its expansion button after layout.
    // Compensate that height too, only for rows inserted above the reader.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const next = readHeight();
      if (scroller.scrollTop > 0 && next !== height) scroller.scrollTop += next - height;
      height = next;
    });
    added.forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [ids, scrollRef]);

  if (ids.length === 0) return <>{empty}</>;

  return (
    <>
      <div ref={listRef}>
        {shown.map((id) => <div key={id}>{renderRow(id)}</div>)}
      </div>
      {hasMore && <div ref={sentinelRef} className="h-px" aria-hidden="true" />}
    </>
  );
}
