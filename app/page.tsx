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
          'sticky z-10 bg-x-dark transition-all duration-300',
          headerHidden ? '-top-[80px]' : 'top-0'
        )}>
          <div className="flex items-center justify-between px-4 py-2">
            <button
              onClick={() => setShowDrawer(true)}
              className="md:hidden rounded-full focus:outline-none shrink-0"
              aria-label="个人菜单"
            >
              <Avatar src={currentUser.avatar} alt={currentUser.displayName} size="md" />
            </button>
            <h1 className="md:hidden flex-1 text-center text-lg font-bold truncate px-2">
              我的日记本
            </h1>
            {/* Spacer to balance the avatar button on the left */}
            <span className="md:hidden shrink-0 w-8" aria-hidden="true" />
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
                  'flex-1 py-3 flex items-center justify-center text-[15px] transition-colors relative',
                  feedTab === tab.key ? 'text-x-blue font-bold' : 'text-x-gray font-normal hover:text-x-blue/70'
                )}
              >
                {tab.label}
                {feedTab === tab.key && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-x-blue rounded-full" />
                )}
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
