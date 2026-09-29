import { Workbox } from 'workbox-window';

/**
 * Service worker registration and updates.
 *
 * A new version is installed in the background and takes over only when the
 * app comes back after being away for a while — never while someone is
 * writing, and not on every quick app switch. The reload then restores the
 * same screen (the URL carries it) and the local data is already on disk.
 */

const MIN_AWAY_MS = 60_000;

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const wb = new Workbox('/sw.js');
  let waiting = false;
  let hiddenAt: number | null = null;

  wb.addEventListener('waiting', () => { waiting = true; });
  // Only a new version taking over reloads. The very first install also
  // "takes control" (clients.claim), and reloading then would just flash the page.
  wb.addEventListener('controlling', (event) => { if (event.isUpdate) window.location.reload(); });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
    hiddenAt = null;
    if (waiting && away >= MIN_AWAY_MS) {
      wb.messageSkipWaiting();
      return;
    }
    // A resumed PWA does not navigate, so look for a new version now.
    void wb.update();
  });

  void wb.register();
}
