import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { setDrawerOpen, useDrawerOpen } from '@/app/drawer';
import { useNav } from '@/app/nav';
import { toMarkdownPost } from '@/app/postOps';
import { toast } from '@/app/toast';
import { toPost, useAllReplyIds, usePostIds, useProfile, type Post } from '@/data/hooks';
import { store } from '@/data/store';
import { exportPostsMarkdown } from '@/lib/markdown';
import { cn } from '@/lib/utils';
import Avatar from './Avatar';
import Icon, { type IconName } from './Icon';

const CLOSE_DRAG_PX = 60;

function exportAll(): void {
  const posts = Object.entries(store.getTable('posts'))
    .map(([id, row]) => toPost(id, row))
    .filter((post): post is Post => post !== null)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (posts.length === 0) { toast('没有记录可导出', 'info'); return; }
  exportPostsMarkdown(posts.map(toMarkdownPost), `全部记录_${new Date().toISOString().slice(0, 10)}.md`);
  toast(`已导出 ${posts.length} 条`);
}

/**
 * Slides in from the left over the timeline. Hidden with visibility (not just
 * opacity), so nothing inside can take focus while it is closed.
 * Drag it left, or tap outside, to close.
 */
export default function ProfileDrawer() {
  const open = useDrawerOpen();
  const profile = useProfile();
  const postCount = usePostIds().length;
  const replyCount = useAllReplyIds().length;
  const { push } = useNav();
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; dx: number } | null>(null);

  const close = () => setDrawerOpen(false);
  const go = (action: () => void) => { close(); action(); };

  const items: Array<{ icon: IconName; label: string; run: () => void }> = [
    { icon: 'user', label: '个人资料', run: () => push('Profile', {}) },
    { icon: 'bookmark', label: '收藏', run: () => push('Profile', { tab: 'saved' }) },
    { icon: 'gear', label: '设置', run: () => push('Settings', {}) },
    { icon: 'download', label: '导出全部记录', run: exportAll },
  ];

  const setOffset = (dx: number | null) => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.transition = dx === null ? '' : 'none';
    panel.style.transform = dx === null ? '' : `translateX(${Math.min(0, dx)}px)`;
  };

  return createPortal(
    <div
      className={cn('overlay fixed inset-0 z-[70] overflow-hidden md:hidden', open && 'open')}
      aria-hidden={!open}
    >
      <div className="absolute inset-0 bg-black/40" onClick={close} />
      <div
        ref={panelRef}
        role="dialog"
        aria-label="我的"
        className={cn(
          'absolute inset-y-0 left-0 flex w-[min(300px,82vw)] flex-col bg-x-dark shadow-2xl transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        onTouchStart={(e) => { drag.current = { x: e.touches[0].clientX, dx: 0 }; }}
        onTouchMove={(e) => {
          if (!drag.current) return;
          drag.current.dx = e.touches[0].clientX - drag.current.x;
          if (drag.current.dx < 0) setOffset(drag.current.dx);
        }}
        onTouchEnd={() => {
          const dx = drag.current?.dx ?? 0;
          drag.current = null;
          setOffset(null);
          if (dx < -CLOSE_DRAG_PX) close();
        }}
      >
        <div className="px-6 pb-4 pt-6">
          <button type="button" onClick={() => go(() => push('Profile', {}))} className="pressable rounded-full" aria-label="个人资料">
            <Avatar src={profile.avatar} name={profile.displayName} size={48} />
          </button>
          <p className="mt-3 truncate text-[19px] font-bold leading-tight">{profile.displayName}</p>
          <p className="truncate text-[15px] text-x-gray">@{profile.username}</p>
          <p className="mt-3 text-[14px] text-x-gray">
            <span className="font-semibold text-x-fg">{postCount}</span> 条帖子
            <span className="mx-2">·</span>
            <span className="font-semibold text-x-fg">{replyCount}</span> 条追加
          </p>
        </div>
        <nav className="flex-1 overflow-y-auto py-2" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          {items.map(({ icon, label, run }) => (
            <button
              key={label}
              type="button"
              onClick={() => go(run)}
              className="flex w-full items-center gap-5 px-6 py-3.5 text-left text-[19px] font-semibold active:bg-x-hover"
            >
              <Icon name={icon} size={24} />
              {label}
            </button>
          ))}
        </nav>
      </div>
    </div>,
    document.body,
  );
}
