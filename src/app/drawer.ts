import { useSyncExternalStore } from 'react';

/** The left drawer (opened from the avatar), as on X. */

let open = false;
const listeners = new Set<() => void>();

export function setDrawerOpen(next: boolean): void {
  if (next === open) return;
  open = next;
  listeners.forEach((listener) => listener());
}

export function useDrawerOpen(): boolean {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => open,
  );
}
