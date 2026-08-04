'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Post } from '@/lib/types';

const PAGE_SIZE = 15;

// `displayedPosts` is derived, not stored — so editing a post (like, reply,
// delete) flows straight through without resetting how far the user scrolled.
// Only a resetKey change (switching tabs) rewinds to the first page.
export function useFeed(allPosts: Post[], resetKey: string) {
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [resetKey]);

  const displayedPosts = useMemo(
    () => allPosts.slice(0, (page + 1) * PAGE_SIZE),
    [allPosts, page]
  );

  const hasMore = allPosts.length > displayedPosts.length;
  const loadMore = useCallback(() => setPage((p) => p + 1), []);

  return { displayedPosts, hasMore, loadMore };
}
