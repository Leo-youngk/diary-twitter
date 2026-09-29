import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import PostRow from './PostRow';

interface TimelineProps {
  ids: string[];
  scrollRef: RefObject<HTMLElement | null>;
  empty?: React.ReactNode;
  /** Draws one row; posts by default. */
  renderRow?: (id: string) => React.ReactNode;
}

const PAGE = 40;
// Start rendering the next page this far before the end comes into view.
const PRELOAD_PX = 1500;

const renderPost = (id: string) => <PostRow id={id} />;

/**
 * A list of posts (unless told otherwise) that renders in pages: the first 40
 * rows right away, the next 40 whenever the end is getting close.
 *
 * Scrolling is left entirely to the browser. A virtualised list had to move
 * the scroll position whenever a row above the screen turned out taller or
 * shorter than estimated, and on iOS every such correction interrupts the
 * momentum of a flick — the stutter when scrolling fast right after launch.
 * Appending below the screen never moves anything.
 *
 * New posts arriving from another device are inserted above; the scroll
 * position shifts by exactly their height so what is being read stays put.
 */
export default function Timeline({ ids, scrollRef, empty, renderRow = renderPost }: TimelineProps) {
  const [limit, setLimit] = useState(PAGE);
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
      (entries) => { if (entries[0]?.isIntersecting) setLimit((current) => current + PAGE); },
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
    const inserted = ids.indexOf(before);
    if (inserted <= 0) return;
    let height = 0;
    for (let i = 0; i < inserted && i < list.children.length; i++) height += (list.children[i] as HTMLElement).offsetHeight;
    scroller.scrollTop += height;
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
