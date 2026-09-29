import { useRef, useState } from 'react';
import type { ActivityComponentType } from '@stackflow/react';
import { useFlow } from '@stackflow/react';
import { AppScreen } from '@stackflow/plugin-basic-ui';
import { toMarkdownPost } from '@/app/postOps';
import { toast } from '@/app/toast';
import ActionSheet from '@/components/ActionSheet';
import Avatar from '@/components/Avatar';
import Icon from '@/components/Icon';
import ReplyListItem from '@/components/ReplyListItem';
import ScreenHeader from '@/components/ScreenHeader';
import Timeline from '@/components/Timeline';
import { imageSrc } from '@/data/blobs';
import { toPost, useAllReplyIds, useLikedPostIds, usePostIds, useProfile, type Post } from '@/data/hooks';
import { store } from '@/data/store';
import { exportPostsMarkdown } from '@/lib/markdown';
import { cn } from '@/lib/utils';

type Tab = 'posts' | 'replies' | 'saved';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'posts', label: '帖子' },
  { key: 'replies', label: '追加' },
  { key: 'saved', label: '收藏' },
];
const EMPTY: Record<Tab, string> = {
  posts: '还没有帖子。',
  replies: '还没有追加。在帖子下面接着写，就会出现在这里。',
  saved: '点帖子下方的书签，就会收进这里。',
};
const renderReply = (id: string) => <ReplyListItem id={id} />;

function allPosts(): Post[] {
  return Object.entries(store.getTable('posts'))
    .map(([id, row]) => toPost(id, row))
    .filter((post): post is Post => post !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

const ProfileActivity: ActivityComponentType<'Profile'> = () => {
  const profile = useProfile();
  const postIds = usePostIds();
  const replyIds = useAllReplyIds();
  const savedIds = useLikedPostIds();
  const { push } = useFlow();
  const scrollRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>('posts');
  const [exportOpen, setExportOpen] = useState(false);

  const ids = tab === 'posts' ? postIds : tab === 'replies' ? replyIds : savedIds;

  const select = (next: Tab) => {
    setTab(next);
    // Keep the tabs where they are if they are pinned; never jump past them.
    const scroller = scrollRef.current;
    const tabsTop = tabsRef.current?.offsetTop ?? 0;
    if (scroller && scroller.scrollTop > tabsTop) scroller.scrollTop = tabsTop;
  };

  const exportSome = (label: string, since: number) => {
    const chosen = allPosts().filter((post) => Date.parse(post.createdAt) >= since);
    if (chosen.length === 0) { toast('没有符合条件的记录', 'info'); return; }
    exportPostsMarkdown(chosen.map(toMarkdownPost), `${label}_${new Date().toISOString().slice(0, 10)}.md`);
    toast(`已导出 ${chosen.length} 条`);
  };
  const monthStart = () => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1).getTime(); };
  const yearStart = () => new Date(new Date().getFullYear(), 0, 1).getTime();

  return (
    <AppScreen>
      <div className="flex h-full flex-col">
        <ScreenHeader
          title={profile.displayName}
          right={(
            <button type="button" onClick={() => push('Settings', {})} className="pressable rounded-full p-2" aria-label="设置">
              <Icon name="gear" size={21} />
            </button>
          )}
        />
        <div ref={scrollRef} data-scroll-root className="relative flex-1 overflow-y-auto pb-10">
          {profile.banner && (
            <img src={imageSrc(profile.banner)} alt="" className="h-32 w-full object-cover" />
          )}
          <div className="px-4 pt-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="truncate text-[24px] font-bold leading-tight">{profile.displayName}</h2>
                <p className="text-[15px] text-x-gray">@{profile.username}</p>
              </div>
              <Avatar src={profile.avatar} name={profile.displayName} size={72} className={cn(profile.banner && '-mt-12 ring-4 ring-[var(--color-x-dark)]')} />
            </div>
            {profile.bio && <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed">{profile.bio}</p>}
            <p className="mt-2 text-[14px] text-x-gray">
              <span className="font-semibold text-x-fg">{postIds.length}</span> 条帖子 ·{' '}
              <span className="font-semibold text-x-fg">{replyIds.length}</span> 条追加
              {profile.joinedDate && <> · 始于 {profile.joinedDate}</>}
            </p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => push('Settings', {})} className="pressable flex-1 rounded-xl border border-x-border py-2 text-[15px] font-semibold">编辑资料</button>
              <button type="button" onClick={() => setExportOpen(true)} className="pressable flex-1 rounded-xl border border-x-border py-2 text-[15px] font-semibold">导出记录</button>
            </div>
          </div>
          <div ref={tabsRef} className="sticky top-0 z-10 mt-4 flex border-b border-x-border bg-x-dark" role="tablist">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => select(key)}
                className={cn('relative flex-1 py-3 text-[15px]', tab === key ? 'font-semibold' : 'text-x-gray')}
              >
                {label}
                {tab === key && <span className="absolute bottom-0 left-1/2 h-[3px] w-10 -translate-x-1/2 rounded-full bg-x-blue" />}
              </button>
            ))}
          </div>
          <Timeline
            key={tab}
            ids={ids}
            scrollRef={scrollRef}
            renderRow={tab === 'replies' ? renderReply : undefined}
            empty={<p className="px-8 py-16 text-center text-[15px] text-x-gray">{EMPTY[tab]}</p>}
          />
        </div>
      </div>
      <ActionSheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        actions={[
          { label: '导出全部', onSelect: () => exportSome('全部记录', 0) },
          { label: '导出本月', onSelect: () => exportSome('本月记录', monthStart()) },
          { label: '导出本年', onSelect: () => exportSome('本年记录', yearStart()) },
        ]}
      />
    </AppScreen>
  );
};

export default ProfileActivity;
