'use client';

import { useState, useEffect, useCallback } from 'react';
import { Post } from '@/lib/types';

const PAGE_SIZE = 5;

export function useFeed(allPosts: Post[]) {
  const [displayedPosts, setDisplayedPosts] = useState<Post[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    setPage(0);
    setDisplayedPosts(allPosts.slice(0, PAGE_SIZE));
    setHasMore(allPosts.length > PAGE_SIZE);
  }, [allPosts]);

  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    setLoading(true);
    setTimeout(() => {
      const nextPage = page + 1;
      const start = nextPage * PAGE_SIZE;
      const newPosts = allPosts.slice(start, start + PAGE_SIZE);
      setDisplayedPosts((prev) => [...prev, ...newPosts]);
      setPage(nextPage);
      setHasMore(start + PAGE_SIZE < allPosts.length);
      setLoading(false);
    }, 500);
  }, [loading, hasMore, page, allPosts]);

  return { displayedPosts, loading, hasMore, loadMore };
}
