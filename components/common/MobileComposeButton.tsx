'use client';

import { usePathname } from 'next/navigation';
import { useApp } from '@/lib/context';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { cn } from '@/lib/utils';

export default function MobileComposeButton() {
  const { openCompose } = useApp();
  // Mirrors the nav pill: the FAB takes over as the compose entry point exactly
  // while the pill is scrolled away, so one of the two is always reachable.
  const navHidden = useScrollDirection();
  const pathname = usePathname();

  // Ledger page has its own FAB; post detail page has its own primary action
  // (the reply "追加" button) that this FAB otherwise overlaps on short posts.
  if (pathname === '/ledger' || pathname?.startsWith('/post/')) return null;

  return (
    <button
      onClick={openCompose}
      style={{ bottom: 'calc(var(--nav-gap) + 6px)' }}
      className={cn(
        'fixed right-4 md:hidden w-14 h-14 bg-x-blue rounded-full',
        'flex items-center justify-center shadow-2xl',
        'hover:bg-x-blue-hover transition-all duration-300 z-40',
        navHidden
          ? 'opacity-100 scale-100'
          : 'opacity-0 pointer-events-none scale-90'
      )}
      aria-label="新建记录"
    >
      <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white">
        <path d="M11 11V3h2v8h8v2h-8v8h-2v-8H3v-2h8z" />
      </svg>
    </button>
  );
}
