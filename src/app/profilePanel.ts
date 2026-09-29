import { useSyncExternalStore } from 'react';

/** The profile page that slides in from the left when the avatar is tapped. */

let open = false;
const listeners = new Set<() => void>();

export function setProfileOpen(next: boolean): void {
  if (next === open) return;
  open = next;
  listeners.forEach((listener) => listener());
}

export function useProfileOpen(): boolean {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => open,
  );
}
