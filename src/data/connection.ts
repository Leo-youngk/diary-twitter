import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client/with-schemas';
import { useSyncExternalStore } from 'react';
import { SYNC_PROTOCOL } from '@/lib/schema';
import { checkSession, deviceName, getToken, onTokenChange, signOut } from './auth';
import { flushUploads } from './blobs';
import { store } from './store';

/**
 * Keeps this device connected to the data space's Durable Object.
 *
 * A TinyBase WsSynchronizer is bound to one socket and stops receiving once
 * that socket closes, so every connection gets a fresh socket and a fresh
 * synchronizer, which runs a full two-way reconciliation when it starts.
 * Drops reconnect with backoff; returning to the foreground or coming back
 * online reconnects at once. iOS can leave a socket that looks open but is
 * dead after even a short suspension, so returning always uses a fresh one.
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
  openTimer?: ReturnType<typeof setTimeout>;
  checking?: Promise<void>;
}

const REQUEST_TIMEOUT_SECONDS = 15;
const CONNECT_TIMEOUT_MS = 10_000;
const BACKOFF_MS = [1000, 2000, 5000, 10_000, 30_000];
const CHECK_EVERY_MS = 10_000;

let status: Status = { state: 'connecting', syncedAt: null };
const listeners = new Set<() => void>();
let current: Connection | null = null;
let failures = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;
let preflight: { controller: AbortController; timer: ReturnType<typeof setTimeout> } | null = null;
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
  if (retryTimer || !navigator.onLine || document.visibilityState !== 'visible' || !getToken()) return;
  const delay = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)];
  failures += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void connect();
  }, delay);
}

function cancelPreflight(): void {
  if (!preflight) return;
  clearTimeout(preflight.timer);
  preflight.controller.abort();
  preflight = null;
}

function drop(target: Connection | null): void {
  if (!target) return;
  clearTimeout(target.checkTimer);
  clearTimeout(target.openTimer);
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
      // load() only pulls. Re-advertise our hashes so a lost outgoing delta is
      // recovered even when the local store has not changed again.
      await connection.synchronizer!.save();
      if (current !== connection) return;
      await connection.synchronizer!.load();
      if (current !== connection) return;
      setStatus({ state: 'online', syncedAt: Date.now() });
      void flushUploads().catch((error) => console.warn('[sync] image upload failed', error));
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
  if (current || !navigator.onLine || preflight) {
    if (!navigator.onLine) setStatus({ state: 'offline' });
    return;
  }
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  const token = getToken();
  if (!token) return;
  setStatus({ state: 'connecting' });
  // A refused WebSocket cannot say why, so ask whether the token still counts.
  const controller = new AbortController();
  const attempt = { controller, timer: setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS) };
  preflight = attempt;
  const session = await checkSession(controller.signal).catch(() => 'unreachable' as const);
  clearTimeout(attempt.timer);
  // An earlier session request must not replace a newer connection or sign
  // out a token that changed while that request was in flight.
  if (preflight !== attempt) return;
  preflight = null;
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
  // TinyBase waits for the socket's open event without its own timeout.
  connection.openTimer = setTimeout(() => connectionFailed(connection, new Error('连接服务器超时')), CONNECT_TIMEOUT_MS);
  socket.addEventListener('open', () => { clearTimeout(connection.openTimer); }, { once: true });

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
    clearTimeout(connection.openTimer);
    connection.synchronizer = synchronizer;
    // startSync already performs the initial load and starts automatic saving.
    await synchronizer.startSync();
    if (current !== connection) return;
    failures = 0;
    setStatus({ state: 'online', syncedAt: Date.now() });
    scheduleCheck(connection);
    void flushUploads().catch((error) => console.warn('[sync] image upload failed', error));
    firstSync.splice(0).forEach((resolve) => resolve());
  } catch (error) {
    connectionFailed(connection, error);
  }
}

function reconnectNow(): Promise<void> {
  failures = 0;
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
  cancelPreflight();
  drop(current);
  return connect();
}

/** Reconcile both ways over a fresh connection, including a stuck socket. */
export async function syncNow(): Promise<boolean> {
  await reconnectNow();
  return status.state === 'online';
}

/** Start syncing. Safe to call more than once; waits for a token if there is none yet. */
export function startConnection(): void {
  if (started) return;
  started = true;
  onTokenChange(() => {
    if (getToken()) void reconnectNow();
    else { cancelPreflight(); drop(current); setStatus({ state: 'offline' }); }
  });
  window.addEventListener('online', () => { void reconnectNow(); });
  window.addEventListener('offline', () => { cancelPreflight(); drop(current); setStatus({ state: 'offline' }); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      clearTimeout(current?.checkTimer);
      return;
    }
    void reconnectNow();
  });
  window.addEventListener('pageshow', (event) => { if (event.persisted) void reconnectNow(); });
  window.addEventListener('focus', () => {
    if (document.visibilityState !== 'visible') return;
    if (current) void verifyConnection(current);
    else if (!preflight) void reconnectNow();
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
