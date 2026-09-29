import { useSyncExternalStore } from 'react';

/**
 * Display preferences belong to the device, not the account: they live in
 * localStorage and index.html applies them before the first paint.
 */

export type Theme = 'dark' | 'light' | 'zen';
export type FontSize = 'small' | 'medium' | 'large' | 'xlarge';
export type FontFamily = 'system' | 'noto' | 'song';

interface Preferences {
  theme: Theme;
  fontSize: FontSize;
  font: FontFamily;
}

const SCALE: Record<FontSize, number> = { small: 0.9, medium: 1, large: 1.15, xlarge: 1.3 };
const THEME_COLOR: Record<Theme, string> = { dark: '#000000', light: '#ffffff', zen: '#f5f0e8' };

function read<T extends string>(key: string, allowed: readonly T[], fallback: T, json: boolean): T {
  try {
    const raw = localStorage.getItem(key);
    const value = raw === null ? fallback : json ? JSON.parse(raw) : raw;
    return allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

let prefs: Preferences = {
  theme: read('diary-theme', ['dark', 'light', 'zen'] as const, 'zen', true),
  fontSize: read('diary-font-size', ['small', 'medium', 'large', 'xlarge'] as const, 'medium', true),
  font: read('diary-font', ['system', 'noto', 'song'] as const, 'system', false),
};
const listeners = new Set<() => void>();

let notoLoaded = false;
function ensureNoto(): void {
  if (notoLoaded) return;
  notoLoaded = true;
  // Only fetched when chosen; each weight is split by unicode range, so a
  // page downloads just the characters it shows.
  void import('@fontsource/noto-sans-sc/400.css');
  void import('@fontsource/noto-sans-sc/700.css');
}

function apply(): void {
  const html = document.documentElement;
  html.classList.remove('dark', 'light', 'zen', 'font-noto', 'font-song');
  html.classList.add(prefs.theme);
  if (prefs.font === 'noto') { html.classList.add('font-noto'); ensureNoto(); }
  if (prefs.font === 'song') html.classList.add('font-song');
  html.style.setProperty('--font-scale', String(SCALE[prefs.fontSize]));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[prefs.theme]);
}

export function initPreferences(): void {
  if (prefs.font === 'noto') ensureNoto();
}

export function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
  prefs = { ...prefs, [key]: value };
  try {
    if (key === 'theme') localStorage.setItem('diary-theme', JSON.stringify(value));
    if (key === 'fontSize') localStorage.setItem('diary-font-size', JSON.stringify(value));
    if (key === 'font') localStorage.setItem('diary-font', String(value));
  } catch { /* applies for this session */ }
  apply();
  listeners.forEach((listener) => listener());
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => prefs,
  );
}
