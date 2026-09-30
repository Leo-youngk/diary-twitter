import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client/with-schemas';
import { useSyncExternalStore } from 'react';
import { SYNC_PROTOCOL } from '@/lib/schema';
import { checkSession, deviceName, getToken, onTokenChange, signOut } from './auth';
import { store } from './store';

/**
 * Keeps this device connected to the data space's Durable Object.
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
  checkTimer?: ReturnType<typeof setTimeout>;
  checking?: Promise<void>;
}

const REQUEST_TIMEOUT_SECONDS = 15;
const BACKOFF_MS = [1000, 2000, 5000, 10_000, 30_000];
const STALE_AFTER_HIDDEN_MS = 20_000;
const CHECK_EVERY_MS = 30_000;

let status: Status = { state: 'connecting', syncedAt: null };
const listeners = new Set<() => void>();
let current: Connection | null = null;
let failures = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let hiddenAt: number | null = null;
let started = false;
let connecting = false;
const firstSync: Array<() => void> = [];

function setStatus(next: Partial<Status>): void {
  status = { ...status, ...next };
  listeners.forEach((listener) => listener());
}

function socketUrl(): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  const device = new URLSearchParams({ name: deviceName(), build: __BUILD_ID__ });
  return `${scheme}://${location.host}/api/sync?${device.toString()}`;
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
  clearTimeout(target.checkTimer);
  if (current === target) current = null;
  void target.synchronizer?.destroy();
  try { target.socket.close(); } catch { /* already closed */ }
}

function connectionFailed(connection: Connection, error: unknown): void {
  if (current !== connection) return;
  const reason = error instanceof Error ? error.message : '同步连接异常';
  console.warn('[sync] connection failed', reason);
  drop(connection);
  setStatus({ state: 'offline' });
  scheduleRetry();
}

function scheduleCheck(connection: Connection): void {
  clearTimeout(connection.checkTimer);
  if (current !== connection || document.visibilityState !== 'visible') return;
  connection.checkTimer = setTimeout(() => { void verifyConnection(connection); }, CHECK_EVERY_MS);
}

/** An open socket alone cannot prove that the server is still responding. */
function verifyConnection(connection: Connection): Promise<void> {
  if (current !== connection || !connection.synchronizer) return Promise.resolve();
  if (connection.checking) return connection.checking;
  connection.checking = (async () => {
    try {
      await connection.synchronizer!.load();
      if (current === connection) setStatus({ state: 'online', syncedAt: Date.now() });
    } catch (error) {
      connectionFailed(connection, error);
    } finally {
      connection.checking = undefined;
      scheduleCheck(connection);
    }
  })();
  return connection.checking;
}

async function connect(): Promise<void> {
  if (current || !navigator.onLine || connecting) {
    if (!navigator.onLine) setStatus({ state: 'offline' });
    return;
  }
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  const token = getToken();
  if (!token) return;
  setStatus({ state: 'connecting' });
  // A refused WebSocket cannot say why, so ask whether the token still counts.
  connecting = true;
  const session = await checkSession().finally(() => { connecting = false; });
  if (session === 'rejected') { signOut(); return; }
  if (session === 'unreachable') {
    setStatus({ state: 'offline' });
    scheduleRetry();
    return;
  }
  if (current || getToken() !== token) return;
  const socket = new WebSocket(socketUrl(), [SYNC_PROTOCOL, token]);
  const connection: Connection = { socket, synchronizer: null };
  current = connection;

  socket.addEventListener('close', () => {
    if (current !== connection) return;
    drop(connection);
    setStatus({ state: 'offline' });
    scheduleRetry();
  });

  try {
    // TinyBase reports some request failures through this callback while load()
    // itself resolves. Treat those failures as a broken connection as well.
    const synchronizer = await createWsSynchronizer(store, socket, REQUEST_TIMEOUT_SECONDS, undefined, undefined,
      (error) => connectionFailed(connection, error));
    if (current !== connection) { void synchronizer.destroy(); return; }
    connection.synchronizer = synchronizer;
    // startSync already performs the initial load and starts automatic saving.
    await synchronizer.startSync();
    if (current !== connection) return;
    failures = 0;
    setStatus({ state: 'online', syncedAt: Date.now() });
    scheduleCheck(connection);
    firstSync.splice(0).forEach((resolve) => resolve());
  } catch (error) {
    connectionFailed(connection, error);
  }
}

function reconnectNow(): void {
  failures = 0;
  drop(current);
  void connect();
}

/** Start syncing. Safe to call more than once; waits for a token if there is none yet. */
export function startConnection(): void {
  if (started) return;
  started = true;
  onTokenChange(() => { if (getToken()) reconnectNow(); else drop(current); });
  window.addEventListener('online', reconnectNow);
  window.addEventListener('offline', () => { drop(current); setStatus({ state: 'offline' }); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      clearTimeout(current?.checkTimer);
      return;
    }
    const wasAwayLong = hiddenAt !== null && Date.now() - hiddenAt > STALE_AFTER_HIDDEN_MS;
    hiddenAt = null;
    if (wasAwayLong || !current) reconnectNow();
    else void verifyConnection(current);
  });
  window.addEventListener('focus', () => { if (current) void verifyConnection(current); else reconnectNow(); });
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
