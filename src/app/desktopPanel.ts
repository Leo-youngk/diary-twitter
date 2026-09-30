import { useSyncExternalStore } from 'react';
import type { InferActivityParams } from '@stackflow/config';

export type DesktopPanel =
  | { kind: 'compose'; params: InferActivityParams<'Compose'>; focus: number }
  | { kind: 'post'; params: InferActivityParams<'Post'> };

let panel: DesktopPanel = { kind: 'compose', params: {}, focus: 0 };
let leaveGuard: (() => boolean) | undefined;
let returnToMain: (() => void) | undefined;
const listeners = new Set<() => void>();

export function isWideDesktop(): boolean {
  return window.matchMedia('(min-width: 1280px)').matches;
}

export function showDesktopPanel(next: DesktopPanel, confirmed = false): boolean {
  if (!confirmed && leaveGuard && !leaveGuard()) return false;
  panel = next;
  listeners.forEach((listener) => listener());
  return true;
}

export function writeOnDesktop(focus = true): boolean {
  return showDesktopPanel({ kind: 'compose', params: {}, focus: focus ? Date.now() : 0 });
}

/** Reuse the mounted timeline when returning from settings/profile. */
export function registerDesktopMainReturn(callback: () => void): () => void {
  returnToMain = callback;
  return () => { if (returnToMain === callback) returnToMain = undefined; };
}

export function returnToDesktopMain(): boolean {
  if (!returnToMain) return false;
  returnToMain();
  return true;
}

/** An unfinished edit/append asks before another item replaces its form. */
export function guardDesktopPanel(guard: () => boolean): () => void {
  leaveGuard = guard;
  return () => { if (leaveGuard === guard) leaveGuard = undefined; };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useDesktopPanel(): DesktopPanel {
  return useSyncExternalStore(subscribe, () => panel);
}

export function useDesktopSelection(id: string): boolean {
  return useSyncExternalStore(subscribe, () => panel.kind === 'post' && panel.params.postId === id);
}

function subscribeWidth(listener: () => void): () => void {
  const media = window.matchMedia('(min-width: 1280px)');
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}

export function useWideDesktop(): boolean {
  return useSyncExternalStore(subscribeWidth, isWideDesktop);
}
