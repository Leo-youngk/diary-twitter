'use client';

import { useState, useMemo } from 'react';
import { useApp } from '@/lib/context';
import FeedList from '@/components/feed/FeedList';

export default function ExplorePage() {
  const { posts, searchPosts } = useApp();
  const [query, setQuery] = useState('');

  const allTags = posts.flatMap((p) => p.tags || []);
  const tagCounts: Record<string, number> = {};
  allTags.forEach((t) => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    return searchPosts(query);
  }, [query, searchPosts]);

  const likedPosts = useMemo(() => posts.filter((p) => p.isLiked), [posts]);

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-x-dark border-b border-x-border px-4 py-3">
        <div className="flex items-center bg-x-search rounded-full border border-transparent focus-within:border-x-blue">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-x-gray ml-4 shrink-0">
            <path d="M10.25 3.75c-3.59 0-6.5 2.91-6.5 6.5s2.91 6.5 6.5 6.5c1.795 0 3.419-.726 4.596-1.904 1.178-1.177 1.904-2.801 1.904-4.596 0-3.59-2.91-6.5-6.5-6.5zm-8.5 6.5c0-4.694 3.806-8.5 8.5-8.5s8.5 3.806 8.5 8.5c0 1.986-.682 3.815-1.824 5.262l4.781 4.781-1.414 1.414-4.781-4.781c-1.447 1.142-3.276 1.824-5.262 1.824-4.694 0-8.5-3.806-8.5-8.5z" />
          </svg>
          <input
            type="text"
            placeholder="搜索你的记录..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="bg-transparent py-3 px-3 text-white placeholder-x-gray outline-none w-full text-[15px]"
          />
          {query && (
            <button onClick={() => setQuery('')} className="pr-4 text-x-gray hover:text-white">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* No query: show tags and liked posts */}
      {!query && (
        <>
          {/* Tags */}
          {topTags.length > 0 && (
            <div className="border-b border-x-border">
              <h2 className="text-xl font-extrabold px-4 pt-3 pb-2">标签</h2>
              <div className="flex flex-wrap gap-2 px-4 pb-4">
                {topTags.map(([tag, count]) => (
                  <button
                    key={tag}
                    onClick={() => setQuery(tag)}
                    className="px-3 py-1.5 bg-x-darker rounded-full text-sm text-x-blue hover:bg-x-blue/10 transition-colors"
                  >
                    #{tag} <span className="text-x-gray ml-1">{count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Liked / Bookmarked */}
          {likedPosts.length > 0 && (
            <div>
              <h2 className="text-xl font-extrabold px-4 pt-3 pb-2">收藏的记录</h2>
              <FeedList posts={likedPosts} />
            </div>
          )}

          {likedPosts.length === 0 && topTags.length === 0 && (
            <div className="px-4 py-12 text-center text-x-gray">
              <p className="text-lg mb-2">开始记录吧</p>
              <p className="text-sm">你的随想和日记会出现在这里</p>
            </div>
          )}
        </>
      )}

      {/* Search Results */}
      {query && (
        <>
          {searchResults.length > 0 ? (
            <>
              <p className="px-4 py-3 text-sm text-x-gray border-b border-x-border">
                找到 {searchResults.length} 条结果
              </p>
              <FeedList posts={searchResults} />
            </>
          ) : (
            <div className="px-4 py-12 text-center text-x-gray">
              <p className="text-lg mb-2">没有找到相关记录</p>
              <p className="text-sm">试试其他关键词</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
