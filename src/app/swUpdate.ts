import { useSyncExternalStore } from 'react';
import { Workbox } from 'workbox-window';

/**
 * Service worker registration and updates.
 *
 * A new version is installed in the background. Found right at launch, before
 * the first touch, it takes over at once; otherwise the main screen shows
 * 「有新版本」 and it takes over when that is tapped, or when the app comes
 * back after being away for a while — never in the middle of writing. The
 * reload restores the same screen (the URL carries it) and the local data is
 * already on disk.
 */

const MIN_AWAY_MS = 60_000;
const LAUNCH_WINDOW_MS = 5_000;
const CHECK_EVERY_MS = 15 * 60_000;

let wb: Workbox | null = null;
let ready = false;
const listeners = new Set<() => void>();

function setReady(next: boolean): void {
  ready = next;
  listeners.forEach((listener) => listener());
}

/** True once a new version is installed and waiting to take over. */
export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => ready,
  );
}

/** Switch to the waiting version; the page reloads when it takes over. */
export function applyUpdate(): void {
  wb?.messageSkipWaiting();
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const workbox = new Workbox('/sw.js');
  wb = workbox;
  let hiddenAt: number | null = null;
  const bootAt = Date.now();
  let touched = false;
  window.addEventListener('pointerdown', () => { touched = true; }, { once: true, capture: true });

  workbox.addEventListener('waiting', () => {
    if (!touched && Date.now() - bootAt < LAUNCH_WINDOW_MS) workbox.messageSkipWaiting();
    else setReady(true);
  });
  // Only a new version taking over reloads. The very first install also
  // "takes control" (clients.claim), and reloading then would just flash the page.
  workbox.addEventListener('controlling', (event) => { if (event.isUpdate) window.location.reload(); });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
    hiddenAt = null;
    if (ready && away >= MIN_AWAY_MS) {
      workbox.messageSkipWaiting();
      return;
    }
    // A resumed PWA does not navigate, so look for a new version now.
    void workbox.update();
  });
  // An app left open for a long time still hears about new versions.
  setInterval(() => { if (document.visibilityState === 'visible' && !ready) void workbox.update(); }, CHECK_EVERY_MS);

  void workbox.register();
}
