'use client';

import { useEffect } from 'react';
import { useApp } from '@/lib/context';

export default function ServiceWorkerRegistrar() {
  const { addToast } = useApp();

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let cancelled = false;
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const next = reg.installing;
        if (!next) return;
        next.addEventListener('statechange', () => {
          // A controller already exists, so this is an update rather than the
          // first install — the running page is now serving stale code.
          if (next.state === 'installed' && navigator.serviceWorker.controller && !cancelled) {
            addToast('已有新版本，刷新页面即可更新', 'info');
          }
        });
      });
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [addToast]);

  return null;
}
