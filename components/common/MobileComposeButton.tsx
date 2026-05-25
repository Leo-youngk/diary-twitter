'use client';

import { useApp } from '@/lib/context';

export default function MobileComposeButton() {
  const { openCompose } = useApp();

  return (
    <button
      onClick={openCompose}
      className="fixed bottom-20 right-4 md:hidden w-14 h-14 bg-x-blue rounded-full flex items-center justify-center shadow-2xl hover:bg-x-blue-hover transition-colors z-40"
      aria-label="新建记录"
    >
      <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white">
        <path d="M11 11V3h2v8h8v2h-8v8h-2v-8H3v-2h8z" />
      </svg>
    </button>
  );
}
