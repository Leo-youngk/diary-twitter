import { afterEach, describe, expect, it, vi } from 'vitest';
import { BufferApiError, createBufferPost, createChannelPost, fetchBufferPost, fetchChannelMetrics, findChannel } from './buffer';

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
    expect(input.metadata.twitter.thread).toEqual([{ text: '第一条', assets: [] }, { text: '第二条', assets: [] }, { text: '第三条', assets: [] }]);
  });
});

describe('Buffer Substack and Threads channels', () => {
  const sent = () => vi.fn().mockResolvedValue(Response.json({ data: { createPost: {
    __typename: 'PostActionSuccess', post: { id: 'n', status: 'sent', externalLink: 'https://substack.com/@me/note/c-1' },
  } } }));

  it('publishes now to the given channel, with only that network\'s metadata', async () => {
    const fetchMock = sent();
    vi.stubGlobal('fetch', fetchMock);
    expect(await createChannelPost(env, 'Substack', 'substack-channel', { text: '一条 Note' })).toMatchObject({ kind: 'ok', status: 'sent', link: 'https://substack.com/@me/note/c-1' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).variables.input)
      .toEqual({ channelId: 'substack-channel', text: '一条 Note', schedulingType: 'automatic', mode: 'shareNow', assets: [], needsApproval: false });

    const thread = { threads: { thread: [{ text: '一', assets: [] }, { text: '二', assets: [] }] } };
    await createChannelPost(env, 'Threads', 'threads-channel', { text: '一', metadata: thread });
    const input = JSON.parse(fetchMock.mock.calls[1][1].body).variables.input;
    expect(input).toMatchObject({ channelId: 'threads-channel', text: '一', metadata: thread, assets: [] });
  });

  it('tells the user to check the network it went to, not X, when the outcome is unknown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network failed')));
    expect(await createChannelPost(env, 'Substack', 'c', { text: '测试' })).toMatchObject({ kind: 'unknown', message: expect.stringContaining('请先到 Substack 确认') });
    expect(await createChannelPost(env, 'Threads', 'c', { text: '测试' })).toMatchObject({ kind: 'unknown', message: expect.stringContaining('请先到 Threads 确认') });
  });

  it('finds the usable channel of the asked network among the connected ones', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { channels: [
      { id: 'x', service: 'twitter', isLocked: false, isDisconnected: false },
      { id: 'locked', service: 'substack', isLocked: true, isDisconnected: false },
      { id: 'gone', service: 'substack', isLocked: false, isDisconnected: true },
      { id: 'notes', service: 'substack', isLocked: false, isDisconnected: false },
      { id: 'threads', service: 'threads', isLocked: false, isDisconnected: false },
    ] } })));
    expect(await findChannel(env, 'org', 'substack')).toEqual({ kind: 'found', id: 'notes' });
    expect(await findChannel(env, 'org', 'threads')).toEqual({ kind: 'found', id: 'threads' });
  });

  it('distinguishes no such channel from a failed or rate-limited lookup', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: { channels: [{ id: 'x', service: 'twitter' }] } })));
    expect(await findChannel(env, 'org', 'substack')).toEqual({ kind: 'none' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({}, { status: 429, headers: { 'retry-after': '600' } })));
    expect(await findChannel(env, 'org', 'substack')).toEqual({ kind: 'error', retryAfterMs: 600_000 });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network failed')));
    expect(await findChannel(env, 'org', 'substack')).toEqual({ kind: 'error' });
  });

  it('reads the reported numbers of the channel\'s sent posts, keeping unreported ones absent', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { posts: { edges: [
      { node: { id: 'b1', metrics: [{ type: 'views', value: 120 }, { type: 'reactions', value: 4 }], metricsUpdatedAt: '2026-10-06T08:00:00.000Z' } },
      { node: { id: 'b2', metrics: [], metricsUpdatedAt: null } },
    ] } } }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchChannelMetrics(env, 'org', 'threads-channel')).toEqual({ kind: 'ok', posts: [
      { bufferPostId: 'b1', metrics: { views: 120, reactions: 4 }, updatedAt: Date.parse('2026-10-06T08:00:00.000Z') },
      { bufferPostId: 'b2', metrics: {}, updatedAt: 0 },
    ] });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).variables).toEqual({ org: 'org', channel: 'threads-channel' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ errors: [{ message: 'bad', extensions: { code: 'GRAPHQL_VALIDATION_FAILED' } }] })));
    expect(await fetchChannelMetrics(env, 'org', 'threads-channel')).toEqual({ kind: 'error' });
  });
});
