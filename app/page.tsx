'use client';

import { useState, useMemo } from 'react';
import { useApp } from '@/lib/context';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import FeedList from '@/components/feed/FeedList';
import SpeechList from '@/components/article/DailyArticleCard';
import Avatar from '@/components/ui/Avatar';
import type { FeedTab } from '@/lib/types';
import { cn } from '@/lib/utils';
import ProfileDrawer from '@/components/layout/ProfileDrawer';

export default function HomePage() {
  const { posts, feedTab, setFeedTab, currentUser } = useApp();
  const [showDrawer, setShowDrawer] = useState(false);
  const headerHidden = useScrollDirection();

  const filteredPosts = useMemo(() => {
    if (feedTab === 'thought') return posts.filter((p) => p.entryType === 'thought');
    if (feedTab === 'diary') return posts.filter((p) => p.entryType === 'diary');
    return posts;
  }, [posts, feedTab]);

  const tabs: { key: FeedTab; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'thought', label: '随想' },
    { key: 'diary', label: '日记' },
    { key: 'article', label: '英文' },
  ];

  return (
    <>
      <ProfileDrawer open={showDrawer} onClose={() => setShowDrawer(false)} />
      <div>
        {/* Sticky header — hides on scroll-down, reveals on scroll-up */}
        <div className={cn(
          'sticky z-10 bg-x-dark border-b border-x-border transition-all duration-300',
          headerHidden ? '-top-[80px]' : 'top-0'
        )}>
          <div className="flex items-center justify-between px-4 py-1.5">
            <button
              onClick={() => setShowDrawer(true)}
              className="md:hidden rounded-full focus:outline-none shrink-0"
              aria-label="个人菜单"
            >
              <Avatar src={currentUser.avatar} alt={currentUser.displayName} size="sm" />
            </button>
            <h1 className="md:hidden flex-1 text-center text-base font-bold truncate px-2">
              {currentUser.displayName}
            </h1>
            {/* Brand badge — paper plane, matches public/icon.svg */}
            <span className="md:hidden shrink-0 w-8 h-8 rounded-full bg-x-blue flex items-center justify-center overflow-hidden">
              <svg viewBox="0 0 512 512" className="w-[70%] h-[70%]">
                <path d="M 420 108  L 88 392  L 260 274 Z" fill="#c8daea" />
                <path d="M 260 274  L 88 392  L 188 348 Z" fill="#a9c9dd" />
                <path d="M 420 108  L 88 172  L 260 274 Z" fill="white" />
                <path d="M 260 274  L 420 108  L 300 248 Z" fill="#daeaf5" />
              </svg>
            </span>
            {/* Desktop: page title */}
            <h1 className="hidden md:block text-xl font-bold">首页</h1>
          </div>

          {/* Tabs */}
          <div className="flex" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFeedTab(tab.key)}
                role="tab"
                aria-selected={feedTab === tab.key}
                className={cn(
                  'flex-1 py-2.5 flex items-center justify-center hover:bg-white/[0.03] transition-colors',
                  feedTab === tab.key ? 'text-white font-semibold' : 'text-x-gray font-normal'
                )}
              >
                <span className="inline-block relative">
                  {tab.label}
                  {feedTab === tab.key && (
                    <span
                      className="absolute left-0 w-full h-[3px] bg-x-blue rounded-full"
                      style={{ bottom: '-10px' }}
                    />
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>

        {feedTab === 'article' ? (
          <SpeechList />
        ) : (
          <FeedList posts={filteredPosts} resetKey={feedTab} />
        )}
      </div>
    </>
  );
}
