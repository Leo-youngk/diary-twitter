'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/lib/context';
import { NavItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import Avatar from '@/components/ui/Avatar';

const navItems: { key: NavItem; label: string; href: string; icon: React.ReactNode }[] = [
  {
    key: 'home',
    label: '首页',
    href: '/',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
        <path d="M21.591 7.146L12.52 1.157c-.316-.21-.724-.21-1.04 0l-9.071 5.99c-.26.173-.409.456-.409.757v13.183c0 .502.418.913.929.913h5.025c.511 0 .929-.41.929-.913v-7.075h3.856v7.075c0 .502.418.913.929.913h5.025c.511 0 .929-.41.929-.913V7.903c0-.3-.15-.584-.41-.757z" />
      </svg>
    ),
  },
  {
    key: 'explore',
    label: '搜索',
    href: '/explore',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
        <path d="M10.25 3.75c-3.59 0-6.5 2.91-6.5 6.5s2.91 6.5 6.5 6.5c1.795 0 3.419-.726 4.596-1.904 1.178-1.177 1.904-2.801 1.904-4.596 0-3.59-2.91-6.5-6.5-6.5zm-8.5 6.5c0-4.694 3.806-8.5 8.5-8.5s8.5 3.806 8.5 8.5c0 1.986-.682 3.815-1.824 5.262l4.781 4.781-1.414 1.414-4.781-4.781c-1.447 1.142-3.276 1.824-5.262 1.824-4.694 0-8.5-3.806-8.5-8.5z" />
      </svg>
    ),
  },
  {
    key: 'calendar',
    label: '日历',
    href: '/calendar',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
        <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z" />
      </svg>
    ),
  },
  {
    key: 'profile',
    label: '我的',
    href: '/profile',
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
        <path d="M5.651 19h12.698c-.337-1.8-1.023-3.21-1.945-4.19C15.318 13.65 13.838 13 12 13s-3.317.65-4.404 1.81c-.922.98-1.608 2.39-1.945 4.19zm.486-5.56C7.627 11.85 9.648 11 12 11s4.373.85 5.863 2.44c1.477 1.58 2.366 3.8 2.632 6.46l.11 1.1H3.395l.11-1.1c.266-2.66 1.155-4.88 2.632-6.46zM12 4c-1.105 0-2 .9-2 2s.895 2 2 2 2-.9 2-2-.895-2-2-2zM8 6c0-2.21 1.791-4 4-4s4 1.79 4 4-1.791 4-4 4-4-1.79-4-4z" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const { activeNav, setActiveNav, currentUser, openCompose } = useApp();
  const pathname = usePathname();

  const getIsActive = (key: NavItem, href: string) => {
    if (key === 'home') return pathname === '/';
    if (key === 'profile') return pathname === '/profile';
    if (key === 'explore') return pathname === '/explore';
    if (key === 'calendar') return pathname === '/calendar';
    return activeNav === key;
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col items-end xl:items-start h-screen sticky top-0 py-2 pl-2 xl:pl-6 w-[72px] xl:w-[275px]">
        <div className="flex flex-col h-full w-full justify-between">
          <div className="flex flex-col space-y-1">
            {/* Logo */}
            <Link
              href="/"
              className="p-3 ml-0 xl:ml-1 rounded-full hover:bg-x-hover transition-colors w-fit"
            >
              <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white">
                <path d="M6 2c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6H6zm7 1.5L18.5 9H13V3.5zM6 4h5v7h7v9H6V4zm2 9v2h8v-2H8zm0 4v2h5v-2H8z" />
              </svg>
            </Link>

            {/* Nav Items */}
            {navItems.map((item) => {
              const isActive = getIsActive(item.key, item.href);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={() => setActiveNav(item.key)}
                  className={cn(
                    'flex items-center gap-4 px-3 py-3 rounded-full transition-colors hover:bg-x-hover w-fit',
                    isActive && 'font-bold'
                  )}
                >
                  <span className={isActive ? 'text-white' : 'text-x-gray'}>
                    {item.icon}
                  </span>
                  <span className="hidden xl:block text-xl">{item.label}</span>
                </Link>
              );
            })}

            {/* Post Button */}
            <button
              onClick={openCompose}
              className="mt-4 w-[50px] xl:w-full bg-x-blue hover:bg-x-blue-hover text-white font-bold rounded-full py-3 px-4 transition-colors"
            >
              <span className="hidden xl:block text-center">记录</span>
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5 fill-white xl:hidden mx-auto"
              >
                <path d="M23 3c-6.62-.1-10.38 2.421-13.424 6.614C7.045 13.074 5.15 18.18 5.15 18.18l-2.28-2.28c-.39-.39-1.03-.39-1.42 0l-1.42 1.42c-.39.39-.39 1.02 0 1.41l4.59 4.59c.39.39 1.02.39 1.41 0l1.42-1.42c.39-.39.39-1.02 0-1.41l-2.28-2.28s1.9-5.11 4.42-8.59C12.62 6.42 16.38 3.9 23 4V3z" />
              </svg>
            </button>
          </div>

          {/* User Account + Settings */}
          <div className="mb-3 space-y-1">
            <Link
              href="/settings"
              className="flex items-center gap-4 px-3 py-3 rounded-full transition-colors hover:bg-x-hover w-fit text-x-gray hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
                <path d="M10.54 1.75h2.92l1.57 2.36c.11.17.32.25.53.21l2.53-.59 2.17 1.26-0.01 2.59c-.01.21.11.39.29.47l2.4 1.07-.68 2.81-2.45.74c-.18.06-.32.21-.34.4l-.26 2.58-2.07 1.44-2.31-.93c-.18-.07-.38-.01-.5.14l-1.63 2.01-2.81.01-1.63-2.01c-.12-.15-.32-.21-.5-.14l-2.31.93-2.07-1.44-.26-2.58c-.02-.19-.16-.34-.34-.4l-2.45-.74-.68-2.81 2.4-1.07c.18-.08.3-.26.29-.47l-.01-2.59 2.17-1.26 2.53.59c.21.04.42-.04.53-.21l1.57-2.36zm1.46 2l-1.3 1.95c-.44.66-1.24 1.03-2.09.85l-2.09-.49-.7.4.01 2.14c.01.83-.44 1.59-1.15 1.9l-1.99.88.22.92 2.02.61c.8.24 1.39.94 1.44 1.78l.21 2.13.67.47 1.91-.77c.76-.31 1.64-.14 2.2.43l1.35 1.66.92-.01 1.35-1.66c.56-.57 1.44-.74 2.2-.43l1.91.77.67-.47.21-2.13c.05-.84.64-1.54 1.44-1.78l2.02-.61.22-.92-1.99-.88c-.71-.31-1.16-1.07-1.15-1.9l.01-2.14-.7-.4-2.09.49c-.85.18-1.65-.19-2.09-.85l-1.3-1.95h-.6zM12 8.5c-1.93 0-3.5 1.57-3.5 3.5s1.57 3.5 3.5 3.5 3.5-1.57 3.5-3.5-1.57-3.5-3.5-3.5zM12 10.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5.67-1.5 1.5-1.5z" />
              </svg>
              <span className="hidden xl:block text-base">设置</span>
            </Link>
            <Link
              href="/profile"
              className="flex items-center gap-3 p-3 rounded-full hover:bg-x-hover transition-colors w-full"
            >
              <Avatar src={currentUser.avatar} alt={currentUser.displayName} size="md" />
              <div className="hidden xl:block text-left flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{currentUser.displayName}</p>
                <p className="text-sm text-x-gray truncate">@{currentUser.username}</p>
              </div>
            </Link>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-x-dark border-t border-x-border z-50">
        <div className="flex justify-around items-center h-14">
          {navItems.map((item) => {
            const isActive = getIsActive(item.key, item.href);
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setActiveNav(item.key)}
                className={cn(
                  'p-3 rounded-full transition-colors',
                  isActive ? 'text-white' : 'text-x-gray'
                )}
              >
                {item.icon}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
