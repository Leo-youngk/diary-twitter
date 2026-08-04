'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // Once the new worker takes control, the page is holding stale JS/CSS
    // references — a one-time reload is the only way to pick up the update.
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });

    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // An update finished installing while this tab was closed — activate it now.
      if (reg.waiting) reg.waiting.postMessage('skip-waiting');

      reg.addEventListener('updatefound', () => {
        const next = reg.installing;
        if (!next) return;
        next.addEventListener('statechange', () => {
          // A controller already exists, so this is an update rather than the
          // first install — tell it to activate immediately instead of waiting
          // for every tab to close.
          if (next.state === 'installed' && navigator.serviceWorker.controller) {
            next.postMessage('skip-waiting');
          }
        });
      });
    }).catch(() => {});
  }, []);

  return null;
}
