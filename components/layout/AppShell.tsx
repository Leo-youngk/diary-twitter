'use client';

import { useApp } from '@/lib/context';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { dbLoading } = useApp();

  // Loading local/synced data — show blank (prevents flash of empty state)
  if (dbLoading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <svg className="animate-spin w-7 h-7 text-x-blue" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>
    );
  }

  return <>{children}</>;
}
