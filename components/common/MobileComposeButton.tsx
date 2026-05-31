'use client';

import { useApp } from '@/lib/context';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { cn } from '@/lib/utils';

export default function MobileComposeButton() {
  const { openCompose } = useApp();
  const hidden = useScrollDirection();

  return (
    <button
      onClick={openCompose}
      style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom) + 20px)' }}
      className={cn(
        'fixed right-4 md:hidden w-14 h-14 bg-x-blue rounded-full',
        'flex items-center justify-center shadow-2xl',
        'hover:bg-x-blue-hover transition-all duration-300 z-40',
        hidden
          ? 'opacity-0 pointer-events-none translate-y-3'
          : 'opacity-100 translate-y-0'
      )}
      aria-label="新建记录"
    >
      <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white">
        <path d="M11 11V3h2v8h8v2h-8v8h-2v-8H3v-2h8z" />
      </svg>
    </button>
  );
}
