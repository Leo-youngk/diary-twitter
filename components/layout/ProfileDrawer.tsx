'use client';

import Link from 'next/link';
import { useApp } from '@/lib/context';
import Avatar from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';

interface ProfileDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function ProfileDrawer({ open, onClose }: ProfileDrawerProps) {
  const { currentUser, signOut, exportAll, posts, addToast } = useApp();

  const handleExportAll = () => {
    if (posts.length === 0) { addToast('没有记录可导出', 'info'); return; }
    exportAll(posts, `全部记录_${new Date().toISOString().slice(0, 10)}.md`);
    addToast(`已导出 ${posts.length} 条记录`);
    onClose();
  };

  const handleSignOut = async () => {
    await signOut();
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 bg-black/50 z-[90] md:hidden transition-opacity duration-300',
          open ? 'opacity-100' : 'opacity-0 pointer-events-none',
        )}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={cn(
          'fixed top-0 left-0 bottom-0 w-[280px] bg-x-dark border-r border-x-border z-[100]',
          'transition-transform duration-300 md:hidden flex flex-col',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* User card */}
        <div className="px-5 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-5">
          <Avatar src={currentUser.avatar} alt={currentUser.displayName} size="lg" />
          <h2 className="font-bold text-[18px] mt-3 leading-tight">{currentUser.displayName}</h2>
          <p className="text-x-gray text-sm mt-0.5">@{currentUser.username}</p>
        </div>

        <div className="border-t border-x-border/50 mx-4" />

        {/* Navigation */}
        <nav className="flex-1 py-3 overflow-y-auto">
          <Link
            href="/profile"
            onClick={onClose}
            className="flex items-center gap-3 px-5 py-3.5 hover:bg-x-hover transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current text-x-gray shrink-0">
              <path d="M5.651 19h12.698c-.337-1.8-1.023-3.21-1.945-4.19C15.318 13.65 13.838 13 12 13s-3.317.65-4.404 1.81c-.922.98-1.608 2.39-1.945 4.19zm.486-5.56C7.627 11.85 9.648 11 12 11s4.373.85 5.863 2.44c1.477 1.58 2.366 3.8 2.632 6.46l.11 1.1H3.395l.11-1.1c.266-2.66 1.155-4.88 2.632-6.46zM12 4c-1.105 0-2 .9-2 2s.895 2 2 2 2-.9 2-2-.895-2-2-2zM8 6c0-2.21 1.791-4 4-4s4 1.79 4 4-1.791 4-4 4-4-1.79-4-4z" />
            </svg>
            <span className="text-[15px]">我的记录</span>
          </Link>

          <Link
            href="/settings"
            onClick={onClose}
            className="flex items-center gap-3 px-5 py-3.5 hover:bg-x-hover transition-colors"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current text-x-gray shrink-0">
              <path d="M10.54 1.75h2.92l1.57 2.36c.11.17.32.25.53.21l2.53-.59 2.17 1.26-.01 2.59c-.01.21.11.39.29.47l2.4 1.07-.68 2.81-2.45.74c-.18.06-.32.21-.34.4l-.26 2.58-2.07 1.44-2.31-.93c-.18-.07-.38-.01-.5.14l-1.63 2.01-2.81.01-1.63-2.01c-.12-.15-.32-.21-.5-.14l-2.31.93-2.07-1.44-.26-2.58c-.02-.19-.16-.34-.34-.4l-2.45-.74-.68-2.81 2.4-1.07c.18-.08.3-.26.29-.47l-.01-2.59 2.17-1.26 2.53.59c.21.04.42-.04.53-.21l1.57-2.36zm1.46 2l-1.3 1.95c-.44.66-1.24 1.03-2.09.85l-2.09-.49-.7.4.01 2.14c.01.83-.44 1.59-1.15 1.9l-1.99.88.22.92 2.02.61c.8.24 1.39.94 1.44 1.78l.21 2.13.67.47 1.91-.77c.76-.31 1.64-.14 2.2.43l1.35 1.66.92-.01 1.35-1.66c.56-.57 1.44-.74 2.2-.43l1.91.77.67-.47.21-2.13c.05-.84.64-1.54 1.44-1.78l2.02-.61.22-.92-1.99-.88c-.71-.31-1.16-1.07-1.15-1.9l.01-2.14-.7-.4-2.09.49c-.85.18-1.65-.19-2.09-.85l-1.3-1.95h-.6zM12 8.5c-1.93 0-3.5 1.57-3.5 3.5s1.57 3.5 3.5 3.5 3.5-1.57 3.5-3.5-1.57-3.5-3.5-3.5zm0 2c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5.67-1.5 1.5-1.5z" />
            </svg>
            <span className="text-[15px]">设置</span>
          </Link>

          <button
            onClick={handleExportAll}
            className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-x-hover transition-colors text-left"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current text-x-gray shrink-0">
              <path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z" />
            </svg>
            <span className="text-[15px]">导出日记</span>
          </button>
        </nav>

        <div className="border-t border-x-border/50 mx-4" />

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-5 py-4 hover:bg-x-hover transition-colors text-x-danger"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current shrink-0">
            <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
          </svg>
          <span className="text-[15px]">退出登录</span>
        </button>
      </div>
    </>
  );
}
