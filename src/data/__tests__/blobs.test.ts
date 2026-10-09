import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('@/data/auth', () => ({ getToken: () => 'test-token', signOut: auth.signOut }));

const hash = 'a'.repeat(64);
const queueKey = 'diary-blob-queue';
let local: Map<string, string>;
let flushUploads: typeof import('../blobs').flushUploads;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  local = new Map();
  vi.stubGlobal('localStorage', { getItem: (key: string) => local.get(key) ?? null, setItem: (key: string, value: string) => local.set(key, value) });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('caches', { open: async () => ({ match: async () => new Response(new Blob(['image'], { type: 'image/png' })) }) });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
  ({ flushUploads } = await import('../blobs'));
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('image upload recovery', () => {
  it('uploads an image queued after the initial empty flush', async () => {
    await flushUploads();
    local.set(queueKey, JSON.stringify([hash]));
    await flushUploads();
    expect(fetch).toHaveBeenCalledWith(`/api/blob/${hash}`, expect.objectContaining({ method: 'PUT' }));
    expect(local.get(queueKey)).toBe('[]');
  });

  it('keeps failed uploads queued and retries on the next reconciliation', async () => {
    local.set(queueKey, JSON.stringify([hash]));
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('network unavailable'));
    await flushUploads();
    expect(local.get(queueKey)).toBe(JSON.stringify([hash]));
    await flushUploads();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(local.get(queueKey)).toBe('[]');
  });

  it('retains queued images while offline and uploads them when online', async () => {
    local.set(queueKey, JSON.stringify([hash]));
    Object.assign(navigator, { onLine: false });
    await flushUploads();
    expect(fetch).not.toHaveBeenCalled();
    Object.assign(navigator, { onLine: true });
    await flushUploads();
    expect(local.get(queueKey)).toBe('[]');
  });

  it('uploads images added while the current upload is still in progress', async () => {
    const second = 'b'.repeat(64);
    let finish!: (response: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    local.set(queueKey, JSON.stringify([hash]));
    const uploading = flushUploads();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    local.set(queueKey, JSON.stringify([hash, second]));
    expect(flushUploads()).toBe(uploading);
    finish(new Response('{}'));
    await uploading;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(local.get(queueKey)).toBe('[]');
  });
});
