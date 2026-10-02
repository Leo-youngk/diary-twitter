import { afterEach, describe, expect, it, vi } from 'vitest';
import { BufferApiError, createBufferPost, fetchBufferPost } from './buffer';

const env = { BUFFER_API_KEY: 'test-key', BUFFER_CHANNEL_ID: 'test-channel' };
afterEach(() => vi.unstubAllGlobals());

describe('Buffer publishing failures', () => {
  it('reports a GraphQL permission refusal rather than an ambiguous publication', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      data: null, errors: [{ message: 'Not authorized', extensions: { code: 'FORBIDDEN' } }],
    })));
    expect(await createBufferPost(env, '测试')).toMatchObject({ kind: 'rejected', retryable: false });
  });

  it('uses the actual rate-limit reset instead of retrying before the quota resets', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({}, {
      status: 429, headers: { 'retry-after': '900' },
    })));
    expect(await createBufferPost(env, '测试')).toMatchObject({
      kind: 'rejected', retryable: true, retryAfterMs: 900_000,
    });
  });

  it('keeps a network failure ambiguous so an already published post is not automatically duplicated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network failed')));
    expect(await createBufferPost(env, '测试')).toMatchObject({ kind: 'unknown' });
  });

  it('exposes a rate-limited status query so the whole delivery pass can wait for quota', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({}, {
      status: 429, headers: { 'retry-after': '1800' },
    })));
    await expect(fetchBufferPost(env, 'known-post')).rejects.toMatchObject({ retryAfterMs: 1_800_000 });
  });

  it('distinguishes a permission problem from a temporarily missing status response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      errors: [{ message: 'Not authorized', extensions: { code: 'FORBIDDEN' } }],
    })));
    const lookup = fetchBufferPost(env, 'known-post');
    await expect(lookup).rejects.toBeInstanceOf(BufferApiError);
    await expect(lookup).rejects.toMatchObject({ terminal: true });
  });

  it('preserves the text of a quote instead of producing a plain retweet', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { createPost: {
      __typename: 'PostActionSuccess', post: { id: 'b', status: 'sent', externalLink: 'https://x.com/me/status/456' },
    } } }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await createBufferPost(env, '追加文字', '123')).toMatchObject({ kind: 'ok', status: 'sent' });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.variables.input.metadata.twitter.retweet).toEqual({ id: '123', comment: '追加文字' });
  });

  it('sends a thread as every part in order, the first one included', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { createPost: {
      __typename: 'PostActionSuccess', post: { id: 'b', status: 'sent', externalLink: 'https://x.com/me/status/789' },
    } } }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await createBufferPost(env, '第一条', undefined, ['第二条', '第三条'])).toMatchObject({ kind: 'ok', status: 'sent' });
    const input = JSON.parse(fetchMock.mock.calls[0][1].body).variables.input;
    expect(input.text).toBe('第一条');
    expect(input.metadata.twitter.thread).toEqual([{ text: '第一条' }, { text: '第二条' }, { text: '第三条' }]);
  });
});
