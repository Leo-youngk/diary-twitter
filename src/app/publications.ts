import { useSyncExternalStore } from 'react';

export interface Publication {
  id: string;
  table: 'posts' | 'replies';
  requestedX: boolean;
  skippedX: boolean;
}
const KEY = 'diary-publishing';
function read(): Publication[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is Publication => item && typeof item.id === 'string'
      && ['posts', 'replies'].includes(item.table) && typeof item.requestedX === 'boolean' && typeof item.skippedX === 'boolean').slice(-5) : [];
  } catch { return []; }
}
let publications = read();
const listeners = new Set<() => void>();
function update(next: Publication[]): void {
  publications = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* progress still works in memory */ }
  listeners.forEach(listener => listener());
}
export function trackPublication(publication: Publication): void {
  update([...publications.filter(item => item.id !== publication.id), publication].slice(-5));
}
export function dismissPublication(id: string): void { update(publications.filter(item => item.id !== id)); }
export function usePublications(): Publication[] {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => publications);
}
