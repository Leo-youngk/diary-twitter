'use client';

import { useState, useMemo } from 'react';
import { useApp } from '@/lib/context';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import FeedList from '@/components/feed/FeedList';
import SpeechList from '@/components/article/DailyArticleCard';
import Avatar from '@/components/ui/Avatar';
import type { FeedTab } from '@/lib/types';
import { cn } from '@/lib/utils';

export default function HomePage() {
  const { posts, feedTab, setFeedTab, currentUser, openCompose } = useApp();
  const [initialLoading, setInitialLoading] = useState(false);
  const headerHidden = useScrollDirection();

  const filteredPosts = useMemo(() => {
    if (feedTab === 'thought') {
      return posts.filter((p) => p.entryType === 'thought');
    }
    if (feedTab === 'diary') {
      return posts.filter((p) => p.entryType === 'diary');
    }
    return posts;
  }, [posts, feedTab]);

  const handleTabChange = (tab: FeedTab) => {
    setInitialLoading(true);
    setFeedTab(tab);
    setTimeout(() => setInitialLoading(false), 300);
  };

  const tabs: { key: FeedTab; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'thought', label: '随想' },
    { key: 'diary', label: '日记' },
    { key: 'article', label: '英文' },
  ];

  return (
    <div>
      {/* Header — hides on scroll down, shows on scroll up (like Twitter) */}
      <div className={cn(
        'sticky z-10 bg-x-dark/80 backdrop-blur-md border-b border-x-border transition-all duration-300',
        headerHidden ? '-top-[110px]' : 'top-0'
      )}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Avatar src={currentUser.avatar} alt={currentUser.displayName} size="sm" className="md:hidden" />
          </div>
          <span className="text-x-blue">
            <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
              <path d="M22.585 6.614l-5.093-1.845c-.326-.118-.695-.015-.912.254L12 11.024l-4.58-5.001c-.218-.27-.587-.372-.913-.254L1.415 6.614c-.36.13-.575.496-.515.873L3.44 19.87c.06.377.377.649.759.649h3.567c.382 0 .699-.272.759-.649l1.282-8.085L12 15.976l2.593-3.542 1.282 8.085c.06.377.377.649.759.649h3.567c.382 0 .699-.272.759-.649l2.54-12.383c.06-.377-.155-.743-.515-.873z" />
            </svg>
          </span>
        </div>

        {/* Tabs */}
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={cn(
                'flex-1 py-3 text-center hover:bg-white/[0.03] transition-colors relative font-medium',
                feedTab === tab.key ? 'text-white' : 'text-x-gray'
              )}
            >
              {tab.label}
              {feedTab === tab.key && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-1 bg-x-blue rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {feedTab === 'article' ? (
        /* Speech / English reading list */
        <SpeechList />
      ) : (
        <>
          {/* Compose Input (inline) */}
          <div className="border-b border-x-border p-4">
            <div className="flex gap-3">
              <Avatar src={currentUser.avatar} alt={currentUser.displayName} size="md" />
              <button
                onClick={openCompose}
                className="flex-1 text-x-gray text-xl text-left outline-none"
              >
                记录点什么...
              </button>
            </div>
            <div className="flex justify-end mt-2">
              <button
                onClick={openCompose}
                className="bg-x-blue hover:bg-x-blue-hover text-white font-bold rounded-full px-5 py-2 text-sm transition-colors"
              >
                记录
              </button>
            </div>
          </div>

          {/* Feed */}
          <FeedList posts={filteredPosts} loading={initialLoading} />
        </>
      )}
    </div>
  );
}
