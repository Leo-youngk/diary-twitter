'use client';

import { useState, useMemo, useCallback } from 'react';
import { Post } from '@/lib/types';

const PAGE_SIZE = 15;
const pageByTab = new Map<string, number>();
const scrollByTab = new Map<string, number>();

export function getFeedScrollTop(tab: string): number {
  return scrollByTab.get(tab) ?? 0;
}

export function setFeedScrollTop(tab: string, top: number): void {
  scrollByTab.set(tab, top);
}

// `displayedPosts` is derived, not stored — so editing a post (like, reply,
// delete) flows straight through. HomePage keys FeedList by tab, so this state
// survives tab switches and the home page being unmounted for a detail page.
export function useFeed(allPosts: Post[], resetKey: string) {
  const [page, setPage] = useState(() => pageByTab.get(resetKey) ?? 0);

  const displayedPosts = useMemo(
    () => allPosts.slice(0, (page + 1) * PAGE_SIZE),
    [allPosts, page]
  );

  const hasMore = allPosts.length > displayedPosts.length;
  const loadMore = useCallback(() => setPage((p) => {
    const next = p + 1;
    pageByTab.set(resetKey, next);
    return next;
  }), [resetKey]);

  return { displayedPosts, hasMore, loadMore };
}
