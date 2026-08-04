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
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setShowDrawer(true)}
              className="md:hidden rounded-full focus:outline-none"
              aria-label="个人菜单"
            >
              <Avatar src={currentUser.avatar} alt={currentUser.displayName} size="sm" />
            </button>
            <span className="text-x-blue md:hidden">
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
                <path d="M22.585 6.614l-5.093-1.845c-.326-.118-.695-.015-.912.254L12 11.024l-4.58-5.001c-.218-.27-.587-.372-.913-.254L1.415 6.614c-.36.13-.575.496-.515.873L3.44 19.87c.06.377.377.649.759.649h3.567c.382 0 .699-.272.759-.649l1.282-8.085L12 15.976l2.593-3.542 1.282 8.085c.06.377.377.649.759.649h3.567c.382 0 .699-.272.759-.649l2.54-12.383c.06-.377-.155-.743-.515-.873z" />
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
                  'flex-1 py-3 flex items-center justify-center hover:bg-white/[0.03] transition-colors',
                  feedTab === tab.key ? 'text-white font-semibold' : 'text-x-gray font-normal'
                )}
              >
                <span className="inline-block relative">
                  {tab.label}
                  {feedTab === tab.key && (
                    <span
                      className="absolute left-0 w-full h-[3px] bg-x-blue rounded-full"
                      style={{ bottom: '-12px' }}
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
