'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/lib/context';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { NavItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import Avatar from '@/components/ui/Avatar';

// Outline strokes are shared by every inactive mobile tab icon.
const strokeProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

const navItems: {
  key: NavItem;
  label: string;
  href: string;
  mobileVisible: boolean;
  icon: React.ReactNode;
  iconOutline: React.ReactNode;
}[] = [
  {
    key: 'home',
    label: '首页',
    href: '/',
    mobileVisible: true,
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
        <path d="M21.591 7.146L12.52 1.157c-.316-.21-.724-.21-1.04 0l-9.071 5.99c-.26.173-.409.456-.409.757v13.183c0 .502.418.913.929.913h5.025c.511 0 .929-.41.929-.913v-7.075h3.856v7.075c0 .502.418.913.929.913h5.025c.511 0 .929-.41.929-.913V7.903c0-.3-.15-.584-.41-.757z" />
      </svg>
    ),
    iconOutline: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" {...strokeProps}>
        <path d="M3.6 10.4 12 4.4l8.4 6v9.2a.9.9 0 0 1-.9.9h-4.4v-6.4H8.9v6.4H4.5a.9.9 0 0 1-.9-.9z" />
      </svg>
    ),
  },
  {
    key: 'explore',
    label: '发现',
    href: '/explore',
    mobileVisible: true,
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
        <path d="M10.25 3.75c-3.59 0-6.5 2.91-6.5 6.5s2.91 6.5 6.5 6.5c1.795 0 3.419-.726 4.596-1.904 1.178-1.177 1.904-2.801 1.904-4.596 0-3.59-2.91-6.5-6.5-6.5zm-8.5 6.5c0-4.694 3.806-8.5 8.5-8.5s8.5 3.806 8.5 8.5c0 1.986-.682 3.815-1.824 5.262l4.781 4.781-1.414 1.414-4.781-4.781c-1.447 1.142-3.276 1.824-5.262 1.824-4.694 0-8.5-3.806-8.5-8.5z" />
      </svg>
    ),
    iconOutline: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" {...strokeProps}>
        <circle cx="10.6" cy="10.6" r="6.85" />
        <path d="m15.6 15.6 4.8 4.8" />
      </svg>
    ),
  },
  {
    key: 'calendar',
    label: '日历',
    href: '/calendar',
    mobileVisible: true,
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
        <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z" />
      </svg>
    ),
    iconOutline: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" {...strokeProps}>
        <rect x="3.2" y="5.1" width="17.6" height="15.7" rx="2.6" />
        <path d="M3.2 10.1h17.6M7.8 2.9v4.2M16.2 2.9v4.2" />
      </svg>
    ),
  },
  {
    key: 'ledger',
    label: '账本',
    href: '/ledger',
    mobileVisible: true,
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
        <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12zM6 9h12v2H6V9zm0 4h8v2H6v-2z" />
      </svg>
    ),
    iconOutline: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" {...strokeProps}>
        <rect x="2.9" y="4.9" width="18.2" height="14.2" rx="2.4" />
        <path d="M6.6 10h10.8M6.6 14h6.8" />
      </svg>
    ),
  },
  {
    key: 'profile',
    label: '我的',
    href: '/profile',
    mobileVisible: false,  // profile moved to drawer on mobile
    icon: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="currentColor">
        <path d="M5.651 19h12.698c-.337-1.8-1.023-3.21-1.945-4.19C15.318 13.65 13.838 13 12 13s-3.317.65-4.404 1.81c-.922.98-1.608 2.39-1.945 4.19zm.486-5.56C7.627 11.85 9.648 11 12 11s4.373.85 5.863 2.44c1.477 1.58 2.366 3.8 2.632 6.46l.11 1.1H3.395l.11-1.1c.266-2.66 1.155-4.88 2.632-6.46zM12 4c-1.105 0-2 .9-2 2s.895 2 2 2 2-.9 2-2-.895-2-2-2zM8 6c0-2.21 1.791-4 4-4s4 1.79 4 4-1.791 4-4 4-4-1.79-4-4z" />
      </svg>
    ),
    iconOutline: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" {...strokeProps}>
        <circle cx="12" cy="7" r="3.6" />
        <path d="M4.6 20.2c.9-4.2 3.6-6.6 7.4-6.6s6.5 2.4 7.4 6.6" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const { activeNav, setActiveNav, currentUser, openCompose } = useApp();
  const pathname = usePathname();
  const navHidden = useScrollDirection();

  const getIsActive = (key: NavItem) => {
    if (key === 'home') return pathname === '/';
    if (key === 'profile') return pathname === '/profile';
    if (key === 'explore') return pathname === '/explore';
    if (key === 'calendar') return pathname === '/calendar';
    if (key === 'ledger') return pathname === '/ledger';
    return activeNav === key;
  };

  const mobileItems = navItems.filter((item) => item.mobileVisible);

  const renderTab = (item: (typeof navItems)[number]) => {
    const isActive = getIsActive(item.key);
    return (
      <Link
        key={item.key}
        href={item.href}
        onClick={() => setActiveNav(item.key)}
        aria-label={item.label}
        aria-current={isActive ? 'page' : undefined}
        style={isActive ? { background: 'var(--nav-chip)', color: 'var(--nav-fg-active)' } : undefined}
        className={cn(
          'flex items-center justify-center w-[56px] h-[38px] rounded-[13px] transition-colors',
          '[&_svg]:w-[23px] [&_svg]:h-[23px]',
          !isActive && 'text-x-gray'
        )}
      >
        {isActive ? item.icon : item.iconOutline}
      </Link>
    );
  };

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col items-end xl:items-start h-full sticky top-0 py-2 pl-2 xl:pl-6 w-[72px] xl:w-[275px]">
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

            {/* Nav Items — desktop shows all */}
            {navItems.map((item) => {
              const isActive = getIsActive(item.key);
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

      {/* Mobile Bottom Navigation — floating pill, only mobileVisible items */}
      <nav
        style={{
          bottom: 'var(--nav-gap)',
          background: 'var(--nav-bg)',
          borderColor: 'var(--nav-border)',
          boxShadow: 'var(--nav-shadow)',
          transform: navHidden ? 'translateY(calc(100% + 1.5rem))' : 'translateY(0)',
        }}
        className={cn(
          'md:hidden fixed left-3 right-3 z-50 h-[var(--nav-row-h)] rounded-full border',
          'flex justify-around items-center backdrop-blur-xl',
          'transition-[transform,opacity] duration-300 ease-out',
          navHidden && 'opacity-0 pointer-events-none'
        )}
      >
        {mobileItems.slice(0, 2).map(renderTab)}

        {/* Compose lives in the pill because the FAB only surfaces once the
            pill scrolls away — on a short page it would never be reachable. */}
        <button
          onClick={openCompose}
          aria-label="新建记录"
          style={{ background: 'var(--nav-chip)', color: 'var(--nav-fg-active)' }}
          className="flex items-center justify-center w-[56px] h-[38px] rounded-[13px]"
        >
          <svg viewBox="0 0 24 24" className="w-[23px] h-[23px]" {...strokeProps}>
            <path d="M12 5.2v13.6M5.2 12h13.6" />
          </svg>
        </button>

        {mobileItems.slice(2).map(renderTab)}
      </nav>
    </>
  );
}
