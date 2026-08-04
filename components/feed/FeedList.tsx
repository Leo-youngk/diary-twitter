'use client';

import { useEffect, useRef } from 'react';
import { Post } from '@/lib/types';
import { useFeed } from '@/hooks/useFeed';
import PostCard from '@/components/feed/PostCard';
import { FeedSkeleton } from '@/components/common/Loading';

interface FeedListProps {
  posts: Post[];
  resetKey: string;
  loading?: boolean;
}

export default function FeedList({ posts, resetKey, loading: initialLoading }: FeedListProps) {
  const { displayedPosts, hasMore, loadMore } = useFeed(posts, resetKey);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  if (initialLoading) {
    return <FeedSkeleton />;
  }

  return (
    <div>
      {displayedPosts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}

      {/* Infinite scroll sentinel */}
      {hasMore && <div ref={sentinelRef} className="h-4" />}

      {!hasMore && displayedPosts.length > 0 && (
        <div className="py-8 text-center text-x-gray text-sm">
          没有更多了
        </div>
      )}

      {displayedPosts.length === 0 && (
        <div className="py-12 text-center text-x-gray">
          <p className="text-xl font-bold mb-2">还没有记录</p>
          <p className="text-sm">点击「记录」按钮开始写下你的想法</p>
        </div>
      )}
    </div>
  );
}
