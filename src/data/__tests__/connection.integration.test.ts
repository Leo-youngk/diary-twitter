import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMergeableStore, type MergeableStore } from 'tinybase';
import { createWsSynchronizer } from 'tinybase/synchronizers/synchronizer-ws-client';

const state = vi.hoisted(() => ({ client: undefined as MergeableStore | undefined }));
vi.mock('@/data/store', async () => {
  const { createMergeableStore } = await import('tinybase');
  state.client = createMergeableStore();
  return { store: state.client };
});
vi.mock('@/data/auth', () => ({ getToken: () => 'test-token', checkSession: async () => 'ok', deviceName: () => 'test', onTokenChange: () => () => {}, signOut: () => {} }));
vi.mock('@/data/blobs', () => ({ flushUploads: async () => {} }));
vi.mock('react', () => ({ useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot() }));

let server: MergeableStore;
let dropNextDelta: boolean;
let connection: typeof import('../connection');
let stopPeers: Array<() => Promise<unknown>>;

/** Real TinyBase messages over an in-memory WebSocket pair, with packet loss. */
class Socket extends EventTarget {
  readonly OPEN = 1;
  readyState = 1;
  peer: Socket | null = null;
  constructor(isServer: unknown = false) {
    super();
    if (isServer !== true) {
      const peer = new Socket(true);
      this.peer = peer;
      peer.peer = this;
      void createWsSynchronizer(server, peer).then((sync) => {
        stopPeers.push(() => sync.destroy());
        return sync.startSync();
      });
    }
  }
  send(data: string): void {
    if (dropNextDelta && JSON.parse(data.split('\n')[1])[1] === 3) {
      dropNextDelta = false;
      return;
    }
    queueMicrotask(() => { if (this.peer?.readyState === 1) this.peer.dispatchEvent(new MessageEvent('message', { data })); });
  }
  close(): void {
    if (this.readyState !== 1) return;
    this.readyState = 3;
    this.dispatchEvent(new Event('close'));
    this.peer?.close();
  }
}

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  server = createMergeableStore();
  stopPeers = [];
  dropNextDelta = false;
  vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'visible' }));
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('location', { protocol: 'https:', host: 'test.invalid' });
  vi.stubGlobal('__BUILD_ID__', 'test');
  vi.stubGlobal('WebSocket', Socket);
  connection = await import('../connection');
  connection.startConnection();
  await vi.advanceTimersByTimeAsync(100);
  expect(connection.useConnection().state).toBe('online');
});

afterEach(async () => {
  await Promise.all(stopPeers.map((stop) => stop()));
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('real TinyBase reconciliation', () => {
  it('repairs a lost local edit on focus without requiring another edit', async () => {
    state.client!.setRow('posts', 'one', { content: 'before' });
    await vi.advanceTimersByTimeAsync(100);
    expect(server.getCell('posts', 'one', 'content')).toBe('before');

    dropNextDelta = true;
    state.client!.setCell('posts', 'one', 'content', 'after');
    await vi.advanceTimersByTimeAsync(100);
    expect(dropNextDelta).toBe(false);
    expect(server.getCell('posts', 'one', 'content')).toBe('before');

    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(100);
    expect(server.getCell('posts', 'one', 'content')).toBe('after');
    expect(state.client!.getCell('posts', 'one', 'content')).toBe('after');
  });

  it('repairs a lost deletion during the periodic check', async () => {
    state.client!.setRow('goals', 'one', { text: 'remove me' });
    await vi.advanceTimersByTimeAsync(100);
    expect(server.hasRow('goals', 'one')).toBe(true);
    dropNextDelta = true;
    state.client!.delRow('goals', 'one');
    await vi.advanceTimersByTimeAsync(100);
    expect(server.hasRow('goals', 'one')).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(server.hasRow('goals', 'one')).toBe(false);
  });
});
