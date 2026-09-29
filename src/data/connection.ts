import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client/with-schemas';
import { useSyncExternalStore } from 'react';
import { store } from './store';
import { getSyncCode } from './syncCode';

/**
 * Keeps this device connected to its Durable Object.
 *
 * A TinyBase WsSynchronizer is bound to one socket and stops receiving once
 * that socket closes, so every connection gets a fresh socket and a fresh
 * synchronizer, which runs a full two-way reconciliation when it starts.
 * Drops reconnect with backoff; returning to the foreground or coming back
 * online reconnects at once. iOS can leave a socket that looks open but is
 * dead after the app was suspended, so a long enough absence also forces a
 * fresh connection.
 */

export type ConnectionState = 'connecting' | 'online' | 'offline';

interface Status {
  state: ConnectionState;
  /** Last time a full reconciliation with the server finished. */
  syncedAt: number | null;
}

/** The parts of a WsSynchronizer this module uses. */
interface Synchronizer {
  startSync(): Promise<unknown>;
  load(): Promise<unknown>;
  save(): Promise<unknown>;
  destroy(): Promise<unknown> | unknown;
}
interface Connection {
  socket: WebSocket;
  synchronizer: Synchronizer | null;
}

const REQUEST_TIMEOUT_SECONDS = 15;
const BACKOFF_MS = [1000, 2000, 5000, 10_000, 30_000];
const STALE_AFTER_HIDDEN_MS = 20_000;

let status: Status = { state: 'connecting', syncedAt: null };
const listeners = new Set<() => void>();
let current: Connection | null = null;
let failures = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let hiddenAt: number | null = null;
let started = false;
const firstSync: Array<() => void> = [];

function setStatus(next: Partial<Status>): void {
  status = { ...status, ...next };
  listeners.forEach((listener) => listener());
}

function socketUrl(): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/api/sync/${getSyncCode()}`;
}

function scheduleRetry(): void {
  if (retryTimer || !navigator.onLine) return;
  const delay = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)];
  failures += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void connect();
  }, delay);
}

function drop(target: Connection | null): void {
  if (!target) return;
  if (current === target) current = null;
  void target.synchronizer?.destroy();
  try { target.socket.close(); } catch { /* already closed */ }
}

async function connect(): Promise<void> {
  if (current || !navigator.onLine) {
    if (!navigator.onLine) setStatus({ state: 'offline' });
    return;
  }
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  setStatus({ state: 'connecting' });
  const socket = new WebSocket(socketUrl());
  const connection: Connection = { socket, synchronizer: null };
  current = connection;

  socket.addEventListener('close', () => {
    if (current !== connection) return;
    drop(connection);
    setStatus({ state: 'offline' });
    scheduleRetry();
  });

  try {
    const synchronizer = await createWsSynchronizer(store, socket, REQUEST_TIMEOUT_SECONDS, undefined, undefined, (error) => {
      console.warn('[sync] ignored error', error);
    });
    if (current !== connection) { void synchronizer.destroy(); return; }
    connection.synchronizer = synchronizer;
    await synchronizer.startSync();
    // Pull what the server has, then offer what this device has.
    await synchronizer.load();
    await synchronizer.save();
    if (current !== connection) return;
    failures = 0;
    setStatus({ state: 'online', syncedAt: Date.now() });
    firstSync.splice(0).forEach((resolve) => resolve());
  } catch (error) {
    console.warn('[sync] connection failed', error);
    if (current === connection) {
      drop(connection);
      setStatus({ state: 'offline' });
      scheduleRetry();
    }
  }
}

function reconnectNow(): void {
  failures = 0;
  drop(current);
  void connect();
}

/** Start syncing. Safe to call more than once. */
export function startConnection(): void {
  if (started) return;
  started = true;
  window.addEventListener('online', reconnectNow);
  window.addEventListener('offline', () => { drop(current); setStatus({ state: 'offline' }); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    const wasAwayLong = hiddenAt !== null && Date.now() - hiddenAt > STALE_AFTER_HIDDEN_MS;
    hiddenAt = null;
    if (wasAwayLong || !current) reconnectNow();
  });
  void connect();
}

/** Resolves after the first full reconciliation with the server. */
export function whenSynced(): Promise<void> {
  if (status.syncedAt !== null) return Promise.resolve();
  return new Promise((resolve) => firstSync.push(resolve));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useConnection(): Status {
  return useSyncExternalStore(subscribe, () => status);
}

/** Just the state, so a badge re-renders only when it changes, not on every sync. */
export function useConnectionState(): ConnectionState {
  return useSyncExternalStore(subscribe, () => status.state);
}

/** True until this device has finished its first sync (and is not known to be offline). */
export function useAwaitingFirstSync(): boolean {
  return useSyncExternalStore(subscribe, () => status.syncedAt === null && status.state !== 'offline');
}
