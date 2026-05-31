'use client';

import { useState } from 'react';
import { useApp } from '@/lib/context';

export default function RightPanel() {
  const { searchPosts, posts } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const filteredPosts = searchQuery ? searchPosts(searchQuery) : [];
  const hasResults = filteredPosts.length > 0;

  const totalPosts = posts.length;
  const thoughtCount = posts.filter((p) => p.entryType === 'thought').length;
  const diaryCount = posts.filter((p) => p.entryType === 'diary').length;
  const articleCount = posts.filter((p) => p.entryType === 'article').length;
  const likedCount = posts.filter((p) => p.isLiked).length;

  const allTags = posts.flatMap((p) => p.tags || []);
  const tagCounts: Record<string, number> = {};
  allTags.forEach((t) => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <aside className="hidden lg:block w-[350px] mr-6">
      <div className="sticky top-0 h-screen overflow-y-auto pt-2 pb-20 pl-6">
        {/* Search */}
        <div className="relative mb-4">
          <div
            className={`flex items-center rounded-full border ${
              searchFocused ? 'border-x-blue' : 'border-transparent'
            } bg-x-search`}
          >
            <svg
              viewBox="0 0 24 24"
              className={`w-5 h-5 ml-4 shrink-0 ${
                searchFocused ? 'fill-x-blue' : 'fill-x-gray'
              }`}
            >
              <path d="M10.25 3.75c-3.59 0-6.5 2.91-6.5 6.5s2.91 6.5 6.5 6.5c1.795 0 3.419-.726 4.596-1.904 1.178-1.177 1.904-2.801 1.904-4.596 0-3.59-2.91-6.5-6.5-6.5zm-8.5 6.5c0-4.694 3.806-8.5 8.5-8.5s8.5 3.806 8.5 8.5c0 1.986-.682 3.815-1.824 5.262l4.781 4.781-1.414 1.414-4.781-4.781c-1.447 1.142-3.276 1.824-5.262 1.824-4.694 0-8.5-3.806-8.5-8.5z" />
            </svg>
            <input
              type="text"
              placeholder="搜索记录..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
              className="bg-transparent py-3 px-3 text-white placeholder-x-gray outline-none w-full text-[15px]"
            />
          </div>

          {/* Search Results Dropdown */}
          {searchQuery && searchFocused && (
            <div className="absolute top-full left-0 right-0 bg-x-dark border border-x-border rounded-2xl mt-1 overflow-hidden shadow-lg z-50 max-h-[50vh] overflow-y-auto">
              {hasResults ? (
                filteredPosts.slice(0, 5).map((post) => (
                  <div
                    key={post.id}
                    className="px-4 py-3 hover:bg-x-hover transition-colors border-b border-x-border last:border-b-0"
                  >
                    <p className="text-xs text-x-gray mb-1">
                      {post.entryType === 'diary' ? '日记' : '随想'}
                      {post.title && ` · ${post.title}`}
                    </p>
                    <p className="text-sm line-clamp-2">{post.content}</p>
                  </div>
                ))
              ) : (
                <div className="px-4 py-6 text-center text-x-gray text-sm">
                  没有找到相关记录
                </div>
              )}
            </div>
          )}
        </div>

        {/* Writing Stats */}
        <div className="bg-x-darker rounded-2xl overflow-hidden mb-4">
          <h2 className="text-xl font-extrabold px-4 pt-3 pb-2">写作统计</h2>
          <div className="px-4 py-3 flex justify-between items-center border-b border-x-border/50">
            <span className="text-x-gray text-sm">总记录</span>
            <span className="font-bold">{totalPosts}</span>
          </div>
          <div className="px-4 py-3 flex justify-between items-center border-b border-x-border/50">
            <span className="text-x-gray text-sm">随想</span>
            <span className="font-bold text-x-blue">{thoughtCount}</span>
          </div>
          <div className="px-4 py-3 flex justify-between items-center border-b border-x-border/50">
            <span className="text-x-gray text-sm">日记</span>
            <span className="font-bold text-x-green">{diaryCount}</span>
          </div>
          {articleCount > 0 && (
            <div className="px-4 py-3 flex justify-between items-center border-b border-x-border/50">
              <span className="text-x-gray text-sm">英文收藏</span>
              <span className="font-bold text-amber-500">{articleCount}</span>
            </div>
          )}
          <div className="px-4 py-3 flex justify-between items-center">
            <span className="text-x-gray text-sm">已标星</span>
            <span className="font-bold text-x-danger">{likedCount}</span>
          </div>
        </div>

        {/* Tags */}
        {topTags.length > 0 && (
          <div className="bg-x-darker rounded-2xl overflow-hidden mb-4">
            <h2 className="text-xl font-extrabold px-4 pt-3 pb-2">常用标签</h2>
            {topTags.map(([tag, count]) => (
              <div
                key={tag}
                className="px-4 py-3 hover:bg-x-hover transition-colors cursor-pointer flex justify-between items-center"
              >
                <span className="text-[15px] text-x-blue">#{tag}</span>
                <span className="text-xs text-x-gray">{count} 条</span>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-4 text-xs text-x-gray">
          <span>我的日记本 · 云端同步 · 仅你可见</span>
        </div>
      </div>
    </aside>
  );
}
