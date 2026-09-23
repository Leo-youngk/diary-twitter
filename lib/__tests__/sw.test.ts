import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');

afterEach(() => vi.useRealTimers());

it('opens the cached page when a navigation request hangs', async () => {
  vi.useFakeTimers();
  const cached = new Response('cached page');
  let onFetch: ((event: {
    request: { method: string; mode: string; url: string };
    respondWith: (response: Promise<Response>) => void;
    waitUntil: (work: Promise<unknown>) => void;
  }) => void) | undefined;
  const fetchRequest = vi.fn((_request: unknown, options?: { signal?: AbortSignal }) =>
    new Promise<Response>((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }),
  );

  runInNewContext(source, {
    self: {
      location: { origin: 'https://diary.test' },
      addEventListener: (type: string, listener: typeof onFetch) => {
        if (type === 'fetch') onFetch = listener;
      },
    },
    caches: {
      match: async () => cached,
      open: async () => ({ put: async () => undefined }),
    },
    fetch: fetchRequest,
    URL,
    AbortController,
    Response,
    setTimeout,
    clearTimeout,
  });

  let response: Promise<Response> | undefined;
  const background: Promise<unknown>[] = [];
  onFetch?.({
    request: { method: 'GET', mode: 'navigate', url: 'https://diary.test/' },
    respondWith: (value) => { response = value; },
    waitUntil: (work) => { background.push(work); },
  });

  expect(response).toBeDefined();
  await vi.advanceTimersByTimeAsync(1200);
  expect(await response?.then((value) => value.text())).toBe('cached page');
  expect(fetchRequest).toHaveBeenCalledOnce();

  await vi.advanceTimersByTimeAsync(8800);
  await Promise.all(background);
});
