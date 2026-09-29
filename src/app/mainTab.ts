import { useSyncExternalStore } from 'react';

/** Which pane of the main screen is showing; kept across reloads within a session. */
export type MainTab = 'home' | 'goals' | 'calendar' | 'stats';

const KEY = 'diary-main-tab';
const TABS: MainTab[] = ['home', 'goals', 'calendar', 'stats'];

function initial(): MainTab {
  try {
    const saved = sessionStorage.getItem(KEY) as MainTab | null;
    return saved && TABS.includes(saved) ? saved : 'home';
  } catch {
    return 'home';
  }
}

let tab: MainTab = initial();
const listeners = new Set<() => void>();

export function setMainTab(next: MainTab): void {
  if (next === tab) return;
  tab = next;
  try { sessionStorage.setItem(KEY, next); } catch { /* per session only */ }
  listeners.forEach((listener) => listener());
}

/** Tapping the tab that is already showing scrolls it back to the top, as on X. */
export function scrollPaneToTop(target: MainTab): void {
  document.querySelector(`[data-pane="${target}"] [data-scroll-root]`)?.scrollTo({ top: 0, behavior: 'smooth' });
}

export function useMainTab(): MainTab {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => tab,
  );
}
