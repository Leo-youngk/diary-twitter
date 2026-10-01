import { useSyncExternalStore } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
  action?: { label: string; run: () => void };
}

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(next: Toast[]): void {
  toasts = next;
  listeners.forEach((listener) => listener());
}

export function dismissToast(id: number): void {
  emit(toasts.filter((toast) => toast.id !== id));
}

/** Show a message; an action (e.g. 撤销) keeps it up longer. */
export function toast(message: string, type: ToastType = 'success', action?: Toast['action']): void {
  if (toasts.some((t) => t.message === message && t.type === type)) return;
  const id = nextId++;
  emit([...toasts, { id, message, type, action }]);
  setTimeout(() => dismissToast(id), action ? 10_000 : type === 'error' ? 8000 : type === 'info' ? 6000 : 4000);
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => toasts,
  );
}
