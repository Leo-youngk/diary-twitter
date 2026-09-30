import { useSyncExternalStore } from 'react';

/**
 * This device's token. It is obtained once, by typing the passphrase, and
 * kept in localStorage — which a Home Screen app on iOS keeps for good — so
 * the device stays connected to the one data space without asking again.
 */

const KEY = 'diary-device-token';
// The per-device sync code of earlier versions; it no longer means anything.
const RETIRED_KEYS = ['diary-sync-id'];

function read(): string | null {
  try {
    RETIRED_KEYS.forEach((key) => localStorage.removeItem(key));
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

let token = read();
const listeners = new Set<() => void>();

function setToken(next: string | null): void {
  token = next;
  try {
    if (next) localStorage.setItem(KEY, next);
    else localStorage.removeItem(KEY);
  } catch { /* stays signed in for this session only */ }
  listeners.forEach((listener) => listener());
}

export function getToken(): string | null {
  return token;
}

/** The server's name for this device (a row in the `devices` table). */
export function getDeviceId(): string | null {
  return token?.split('.')[0] ?? null;
}

export function onTokenChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSignedIn(): boolean {
  return useSyncExternalStore(onTokenChange, () => token !== null);
}

export type SignInResult = 'ok' | 'wrong' | 'locked' | 'unreachable' | 'unavailable';

/** `minutes` is how long sign-ins are locked after too many wrong tries. */
export async function signIn(passphrase: string): Promise<{ result: SignInResult; minutes?: number }> {
  let response: Response;
  try {
    response = await fetch('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passphrase }),
    });
  } catch {
    return { result: 'unreachable' };
  }
  const body = await response.json().catch(() => null) as { token?: unknown; retryAfterMinutes?: unknown } | null;
  if (response.status === 401) return { result: 'wrong' };
  if (response.status === 429) return { result: 'locked', minutes: typeof body?.retryAfterMinutes === 'number' ? body.retryAfterMinutes : undefined };
  if (!response.ok || typeof body?.token !== 'string') {
    console.error('[auth] sign-in failed', response.status);
    return { result: 'unavailable' };
  }
  setToken(body.token);
  return { result: 'ok' };
}

/** The server no longer accepts this device's token: ask for the passphrase again. */
export function signOut(): void {
  setToken(null);
}

/** 'rejected' only when the server positively refused the token. */
export async function checkSession(): Promise<'ok' | 'rejected' | 'unreachable'> {
  if (!token) return 'rejected';
  try {
    const response = await fetch('/api/session', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (response.status === 401) return 'rejected';
    if (!response.ok) console.error('[auth] session check failed', response.status);
    return response.ok ? 'ok' : 'unreachable';
  } catch {
    return 'unreachable';
  }
}

/** "iPhone · 主屏 App", "Windows · Chrome": how this device appears in 设置 → 设备. */
export function deviceName(): string {
  const ua = navigator.userAgent;
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const os = /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iPad'
      : /Android/.test(ua) ? 'Android'
        : /Windows/.test(ua) ? 'Windows'
          : /Mac OS X/.test(ua) ? 'Mac' : '其他设备';
  const app = standalone ? '主屏 App'
    : /Edg\//.test(ua) ? 'Edge'
      : /Chrome\//.test(ua) ? 'Chrome'
        : /Firefox\//.test(ua) ? 'Firefox'
          : /Safari\//.test(ua) ? 'Safari' : '浏览器';
  return `${os} · ${app}`;
}
