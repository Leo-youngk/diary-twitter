import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn(), start: vi.fn(), load: vi.fn(), destroy: vi.fn() }));
vi.mock('tinybase/synchronizers/synchronizer-ws-client/with-schemas', () => ({ createWsSynchronizer: mocks.create }));
vi.mock('@/data/store', () => ({ store: {} }));
vi.mock('@/data/auth', () => ({
  getToken: () => 'test-token',
  checkSession: async () => 'ok',
  deviceName: () => 'test device',
  onTokenChange: () => () => {},
  signOut: () => {},
}));
vi.mock('react', () => ({ useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot() }));

let ignoredError: (error: unknown) => void;
let page: EventTarget & { visibilityState: string };
let connection: typeof import('../connection');

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.start.mockResolvedValue(undefined);
  mocks.load.mockResolvedValue(undefined);
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
    return { startSync: mocks.start, load: mocks.load, save: vi.fn(), destroy: mocks.destroy };
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

  it('checks the existing socket after a short switch to the background', async () => {
    connection.startConnection();
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.load).not.toHaveBeenCalled();
    page.visibilityState = 'hidden';
    page.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(1000);
    page.visibilityState = 'visible';
    page.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });

  it('detects a half-open socket, leaves the online state, and reconnects', async () => {
    connection.startConnection();
    await vi.advanceTimersByTimeAsync(0);
    mocks.load.mockImplementation(async () => { ignoredError(new Error('tinybase:3')); });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(connection.useConnection().state).toBe('offline');
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(connection.useConnection().state).toBe('online');
  });
});
