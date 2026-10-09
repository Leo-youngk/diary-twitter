import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(), start: vi.fn(), load: vi.fn(), save: vi.fn(), destroy: vi.fn(),
  session: vi.fn(), signOut: vi.fn(), uploads: vi.fn(), token: 'test-token', changed: () => {},
}));
vi.mock('tinybase/synchronizers/synchronizer-ws-client/with-schemas', () => ({ createWsSynchronizer: mocks.create }));
vi.mock('@/data/store', () => ({ store: {} }));
vi.mock('@/data/blobs', () => ({ flushUploads: mocks.uploads }));
vi.mock('@/data/auth', () => ({
  getToken: () => mocks.token,
  checkSession: mocks.session,
  deviceName: () => 'test device',
  onTokenChange: (listener: () => void) => { mocks.changed = listener; return () => {}; },
  signOut: mocks.signOut,
}));
vi.mock('react', () => ({ useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot() }));

let ignoredError: (error: unknown) => void;
let page: EventTarget & { visibilityState: string };
let connection: typeof import('../connection');

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.token = 'test-token';
  mocks.session.mockResolvedValue('ok');
  mocks.uploads.mockResolvedValue(undefined);
  mocks.start.mockResolvedValue(undefined);
  mocks.load.mockResolvedValue(undefined);
  mocks.save.mockResolvedValue(undefined);
  mocks.destroy.mockResolvedValue(undefined);
  page = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('document', page);
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('location', { protocol: 'https:', host: 'test.invalid' });
  vi.stubGlobal('__BUILD_ID__', 'test build');
  vi.stubGlobal('WebSocket', class extends EventTarget { close() { this.dispatchEvent(new Event('close')); } });
  mocks.create.mockImplementation(async (...args: unknown[]) => {
    ignoredError = args[5] as typeof ignoredError;
    return { startSync: mocks.start, load: mocks.load, save: mocks.save, destroy: mocks.destroy };
  });
  connection = await import('../connection');
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('sync connection recovery', () => {
  it('does not report synchronization success when TinyBase returns after a request error', async () => {
    mocks.start.mockImplementation(async () => { ignoredError(new Error('tinybase:3')); });
    connection.startConnection();
    await vi.advanceTimersByTimeAsync(0);
    expect(connection.useConnection()).toMatchObject({ state: 'offline', syncedAt: null });
  });

  it('uses a fresh socket even after a short suspension', async () => {
    connection.startConnection();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.load).not.toHaveBeenCalled();
    page.visibilityState = 'hidden';
    page.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(1000);
    page.visibilityState = 'visible';
    page.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.start).toHaveBeenCalledTimes(2);
    expect(mocks.destroy).toHaveBeenCalledTimes(1);
  });

  it('detects a half-open socket, leaves the online state, and reconnects', async () => {
    connection.startConnection();
    await vi.advanceTimersByTimeAsync(0);
    mocks.load.mockImplementation(async () => { ignoredError(new Error('tinybase:3')); });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(connection.useConnection().state).toBe('offline');
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(connection.useConnection().state).toBe('online');
  });

  it('resends local hashes as well as pulling, then retries queued images', async () => {
    connection.startConnection();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.uploads).toHaveBeenCalledTimes(2);
  });

  it('does not report success after an ignored upload error', async () => {
    connection.startConnection();
    await vi.advanceTimersByTimeAsync(0);
    mocks.save.mockImplementationOnce(async () => { ignoredError(new Error('tinybase:3')); });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(connection.useConnection().state).toBe('offline');
  });

  it('times out a socket that never opens and retries', async () => {
    mocks.create.mockImplementationOnce(() => new Promise(() => {}));
    connection.startConnection();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(connection.useConnection().state).toBe('offline');
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(connection.useConnection().state).toBe('online');
  });

  it('aborts a stalled session request instead of staying connecting forever', async () => {
    let signal: AbortSignal | undefined;
    mocks.session.mockImplementationOnce((next: AbortSignal) => {
      signal = next;
      return new Promise((resolve) => next.addEventListener('abort', () => resolve('unreachable')));
    });
    connection.startConnection();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(signal?.aborted).toBe(true);
    expect(connection.useConnection().state).toBe('offline');
    await vi.advanceTimersByTimeAsync(1000);
    expect(connection.useConnection().state).toBe('online');
  });

  it('ignores a rejection from a superseded session request', async () => {
    let finish!: (result: string) => void;
    mocks.session.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    connection.startConnection();
    mocks.token = 'replacement-token';
    mocks.changed();
    await vi.advanceTimersByTimeAsync(0);
    finish('rejected');
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(connection.useConnection().state).toBe('online');
  });

  it('restarts on returning while an older health check is still stuck', async () => {
    connection.startConnection();
    await vi.advanceTimersByTimeAsync(0);
    mocks.load.mockImplementationOnce(() => new Promise(() => {}));
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);
    page.visibilityState = 'hidden';
    page.dispatchEvent(new Event('visibilitychange'));
    page.visibilityState = 'visible';
    page.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(connection.useConnection().state).toBe('online');
  });

  it('restores a connection when a page returns from the back-forward cache', async () => {
    connection.startConnection();
    await vi.advanceTimersByTimeAsync(0);
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });

  it('does not run health checks while in the background', async () => {
    connection.startConnection();
    await vi.advanceTimersByTimeAsync(0);
    page.visibilityState = 'hidden';
    page.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('manual synchronization replaces the connection and reports the result', async () => {
    connection.startConnection();
    await vi.advanceTimersByTimeAsync(0);
    expect(await connection.syncNow()).toBe(true);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    Object.assign(navigator, { onLine: false });
    expect(await connection.syncNow()).toBe(false);
    expect(connection.useConnection().state).toBe('offline');
  });
});
