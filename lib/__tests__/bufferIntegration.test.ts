import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildXPostEvents,
  dismissXFailure,
  enqueueXPosts,
  flushXOutbox,
  getXSyncStatus,
  retryXFailures,
  type BufferSyncEnv,
} from '../bufferIntegration';

const SYNC_ID = 'sync1234567890abcdef';
const NOW = Date.parse('2026-09-30T10:00:00.000Z');
const FRESH = '2026-09-30T09:59:00.000Z';

class FakeKV {
  store = new Map<string, { value: string; metadata?: unknown }>();
  async get(key: string) { return this.store.get(key)?.value ?? null; }
  async put(key: string, value: string, options?: { metadata?: unknown }) {
    this.store.set(key, { value, metadata: options?.metadata });
  }
  async delete(key: string) { this.store.delete(key); }
  async list(options: { prefix?: string; limit?: number }) {
    const keys = Array.from(this.store.entries())
      .filter(([name]) => name.startsWith(options.prefix ?? ''))
      .map(([name, entry]) => ({ name, metadata: entry.metadata }));
    return { keys, list_complete: true };
  }
}

function makeEnv(overrides: Partial<BufferSyncEnv> = {}) {
  const kv = new FakeKV();
  const env = {
    DIARY_KV: kv as unknown as KVNamespace,
    BUFFER_API_KEY: 'test-key',
    BUFFER_CHANNEL_ID: 'channel-1',
    ...overrides,
  } satisfies BufferSyncEnv;
  return { kv, env };
}

function thought(overrides: Record<string, unknown> = {}) {
  return {
    id: 'thought-1',
    entryType: 'thought',
    content: '今天的一个想法',
    images: [],
    createdAt: FRESH,
    replies: [],
    isLiked: false,
    xSync: true,
    ...overrides,
  };
}

const snapshot = (posts: unknown[]) => ({ posts, user: {}, updatedAt: FRESH });

function bufferResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status });
}

const success = (status = 'sending') => bufferResponse({
  data: { createPost: { __typename: 'PostActionSuccess', post: { id: 'buf-1', status, externalLink: null } } },
});

const outboxOf = (kv: FakeKV, postId = 'thought-1') => {
  const raw = kv.store.get(`diary:x-outbox:${SYNC_ID}:${postId}`)?.value;
  return raw ? JSON.parse(raw) as Record<string, unknown> : null;
};

describe('buildXPostEvents', () => {
  it('emits a new xSync thought with trimmed text and ignores everything else', () => {
    const events = buildXPostEvents(null, snapshot([
      thought({ content: '  内容  ' }),
      thought({ id: 'thought-2', xSync: false }),
      thought({ id: 'thought-3', xSync: undefined }),
      thought({ id: 'diary-1', entryType: 'diary' }),
      thought({ id: 'thought-4', content: '   ' }),
    ]));
    expect(events).toEqual([{ postId: 'thought-1', text: '内容', createdAt: FRESH }]);
  });

  it('does not emit again for edits, or for a post that was already flagged', () => {
    const before = snapshot([thought()]);
    const after = snapshot([thought({ content: '改过的内容' })]);
    expect(buildXPostEvents(before, after)).toEqual([]);
  });

  it('emits when xSync flips on for an existing post', () => {
    const before = snapshot([thought({ xSync: false })]);
    const after = snapshot([thought()]);
    expect(buildXPostEvents(before, after)).toHaveLength(1);
  });
});

describe('enqueueXPosts', () => {
  it('queues a normal post', async () => {
    const { kv, env } = makeEnv();
    const events = buildXPostEvents(null, snapshot([thought()]));
    await expect(enqueueXPosts(env, SYNC_ID, events, NOW)).resolves.toBe(1);
    expect(outboxOf(kv)).toMatchObject({ state: 'queued', text: '今天的一个想法' });
  });

  it('records a visible failure instead of dropping problem posts', async () => {
    const { kv, env } = makeEnv();
    await enqueueXPosts(env, SYNC_ID, [
      { postId: 'long', text: '字'.repeat(141), createdAt: FRESH },
      { postId: 'old', text: '旧的', createdAt: '2026-09-01T00:00:00.000Z' },
    ], NOW);
    expect(outboxOf(kv, 'long')).toMatchObject({ state: 'failed', error: expect.stringContaining('长度') });
    expect(outboxOf(kv, 'old')).toMatchObject({ state: 'failed', error: expect.stringContaining('3 天') });
  });

  it('records a failure when Buffer is not configured', async () => {
    const { kv, env } = makeEnv({ BUFFER_API_KEY: undefined });
    await enqueueXPosts(env, SYNC_ID, [{ postId: 'thought-1', text: '想法', createdAt: FRESH }], NOW);
    expect(outboxOf(kv)).toMatchObject({ state: 'failed', error: expect.stringContaining('BUFFER_API_KEY') });
  });

  it('never queues a post twice', async () => {
    const { kv, env } = makeEnv();
    const events = buildXPostEvents(null, snapshot([thought()]));
    await enqueueXPosts(env, SYNC_ID, events, NOW);
    await expect(enqueueXPosts(env, SYNC_ID, events, NOW)).resolves.toBe(0);

    await kv.delete(`diary:x-outbox:${SYNC_ID}:thought-1`);
    await kv.put(`diary:x-posted:${SYNC_ID}:thought-1`, '{}');
    await expect(enqueueXPosts(env, SYNC_ID, events, NOW)).resolves.toBe(0);
  });
});

describe('flushXOutbox', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function queued(env: BufferSyncEnv) {
    await enqueueXPosts(env, SYNC_ID, buildXPostEvents(null, snapshot([thought()])), NOW);
  }

  it('publishes with shareNow, remembers the post and clears the outbox', async () => {
    const { kv, env } = makeEnv();
    await queued(env);
    fetchMock.mockResolvedValue(success());

    await flushXOutbox(env, SYNC_ID);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.buffer.com');
    expect(init.headers.authorization).toBe('Bearer test-key');
    expect(JSON.parse(init.body).variables.input).toEqual({
      channelId: 'channel-1',
      text: '今天的一个想法',
      schedulingType: 'automatic',
      mode: 'shareNow',
      assets: [],
      needsApproval: false,
    });
    expect(outboxOf(kv)).toBeNull();
    expect(kv.store.get(`diary:x-posted:${SYNC_ID}:thought-1`)?.metadata).toMatchObject({ status: 'sending' });
  });

  it('turns a Buffer refusal into a visible failure that is not retried on its own', async () => {
    const { kv, env } = makeEnv();
    await queued(env);
    fetchMock.mockResolvedValue(bufferResponse({
      data: { createPost: { __typename: 'InvalidInputError', message: 'Text too long' } },
    }));

    await flushXOutbox(env, SYNC_ID);
    expect(outboxOf(kv)).toMatchObject({ state: 'failed', error: expect.stringContaining('Text too long') });

    await flushXOutbox(env, SYNC_ID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not resend after an unknown outcome, and says the post may already be out', async () => {
    const { kv, env } = makeEnv();
    await queued(env);
    fetchMock.mockRejectedValue(new Error('socket hang up'));

    await flushXOutbox(env, SYNC_ID);
    expect(outboxOf(kv)).toMatchObject({ state: 'failed', error: expect.stringContaining('可能已经发出') });

    await flushXOutbox(env, SYNC_ID);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports a revoked key precisely', async () => {
    const { kv, env } = makeEnv();
    await queued(env);
    fetchMock.mockResolvedValue(bufferResponse({}, 401));
    await flushXOutbox(env, SYNC_ID);
    expect(outboxOf(kv)).toMatchObject({ state: 'failed', error: expect.stringContaining('API key') });
  });

  it('leaves a fresh in-flight attempt alone and fails a stale one without resending', async () => {
    const { kv, env } = makeEnv();
    await queued(env);
    const record = outboxOf(kv)!;
    await kv.put(`diary:x-outbox:${SYNC_ID}:thought-1`, JSON.stringify({ ...record, state: 'sending', sendingAt: Date.now() }));
    await flushXOutbox(env, SYNC_ID);
    expect(outboxOf(kv)).toMatchObject({ state: 'sending' });

    await kv.put(`diary:x-outbox:${SYNC_ID}:thought-1`, JSON.stringify({ ...record, state: 'sending', sendingAt: Date.now() - 120_000 }));
    await flushXOutbox(env, SYNC_ID);
    expect(outboxOf(kv)).toMatchObject({ state: 'failed', error: expect.stringContaining('中断') });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retry puts a failure back in the queue and delivers it; dismiss drops it', async () => {
    const { kv, env } = makeEnv();
    await queued(env);
    fetchMock.mockResolvedValueOnce(bufferResponse({}, 429));
    await flushXOutbox(env, SYNC_ID);
    expect(outboxOf(kv)).toMatchObject({ state: 'failed', error: expect.stringContaining('频繁') });

    fetchMock.mockResolvedValueOnce(success());
    await retryXFailures(env, SYNC_ID, 'thought-1');
    expect(outboxOf(kv)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await enqueueXPosts(env, SYNC_ID, [{ postId: 'other', text: '另一条', createdAt: FRESH }], NOW);
    await kv.put(`diary:x-outbox:${SYNC_ID}:other`, JSON.stringify({ ...outboxOf(kv, 'other'), state: 'failed', error: 'x' }));
    await dismissXFailure(env, SYNC_ID, 'other');
    expect(outboxOf(kv, 'other')).toBeNull();
  });

  it('does nothing when Buffer is not configured', async () => {
    const { env } = makeEnv({ BUFFER_CHANNEL_ID: undefined });
    await flushXOutbox(env, SYNC_ID);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('getXSyncStatus', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const markPublishing = (kv: FakeKV) => kv.put(
    `diary:x-posted:${SYNC_ID}:thought-1`,
    JSON.stringify({ bufferPostId: 'buf-1', postedAt: FRESH }),
    { metadata: { status: 'sending', at: FRESH } },
  );

  it('confirms publication and exposes the link to the post on X', async () => {
    const { kv, env } = makeEnv();
    await markPublishing(kv);
    fetchMock.mockResolvedValue(bufferResponse({
      data: { post: { id: 'buf-1', status: 'sent', externalLink: 'https://x.com/u/status/1', error: null } },
    }));

    const status = await getXSyncStatus(env, SYNC_ID);
    expect(status).toMatchObject({
      enabled: true, inProgress: 0, publishing: 0, failed: [],
      lastSent: { at: FRESH, link: 'https://x.com/u/status/1' },
    });
  });

  it('surfaces a post X rejected after Buffer accepted it', async () => {
    const { kv, env } = makeEnv();
    await markPublishing(kv);
    fetchMock.mockResolvedValue(bufferResponse({
      data: { post: { id: 'buf-1', status: 'error', externalLink: null, error: { message: 'Duplicate content' } } },
    }));

    const status = await getXSyncStatus(env, SYNC_ID);
    expect(status.failed).toEqual([
      { postId: 'thought-1', preview: '', message: 'X 没有发布成功：Duplicate content' },
    ]);
    expect(kv.store.has(`diary:x-posted:${SYNC_ID}:thought-1`)).toBe(false);
  });

  it('keeps a post in "publishing" while Buffer is still sending it', async () => {
    const { kv, env } = makeEnv();
    await markPublishing(kv);
    fetchMock.mockResolvedValue(bufferResponse({
      data: { post: { id: 'buf-1', status: 'sending', externalLink: null, error: null } },
    }));
    await expect(getXSyncStatus(env, SYNC_ID)).resolves.toMatchObject({ publishing: 1, failed: [] });
  });
});

describe('replies', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const reply = (overrides: Record<string, unknown> = {}) => ({
    id: 'reply-1',
    postId: 'thought-1',
    content: '追加的想法',
    createdAt: FRESH,
    xSync: true,
    ...overrides,
  });

  const LINK = 'https://x.com/someone/status/1234567890';

  const postedParent = (kv: FakeKV, link: string | null = LINK, status = 'sent') => kv.put(
    `diary:x-posted:${SYNC_ID}:thought-1`,
    JSON.stringify({ bufferPostId: 'buf-parent', postedAt: FRESH, link: link ?? undefined, text: '原帖' }),
    { metadata: { status, at: FRESH } },
  );

  const enqueueReply = (env: BufferSyncEnv) => enqueueXPosts(env, SYNC_ID, [
    { postId: 'reply-1', replyTo: 'thought-1', text: '追加的想法', createdAt: FRESH },
  ], NOW);

  describe('buildXPostEvents', () => {
    it('emits a flagged new reply under a post that is on X', () => {
      const before = snapshot([thought()]);
      const after = snapshot([thought({ replies: [reply()] })]);
      expect(buildXPostEvents(before, after)).toEqual([
        { postId: 'reply-1', replyTo: 'thought-1', text: '追加的想法', createdAt: FRESH },
      ]);
    });

    it('ignores unflagged replies, replies already seen, and replies under posts not on X', () => {
      const withReply = snapshot([thought({ replies: [reply()] })]);
      expect(buildXPostEvents(withReply, withReply)).toEqual([]);
      expect(buildXPostEvents(snapshot([thought()]), snapshot([thought({ replies: [reply({ xSync: undefined })] })]))).toEqual([]);
      expect(buildXPostEvents(
        snapshot([thought({ xSync: false })]),
        snapshot([thought({ xSync: false, replies: [reply()] })]),
      )).toEqual([]);
    });

    it('does not resend earlier replies when a post is first flagged', () => {
      const before = snapshot([thought({ xSync: false, replies: [reply({ id: 'old' })] })]);
      const after = snapshot([thought({ replies: [reply({ id: 'old' })] })]);
      expect(buildXPostEvents(before, after).map((event) => event.postId)).toEqual(['thought-1']);
    });
  });

  it('quotes the original tweet once its link is known', async () => {
    const { kv, env } = makeEnv();
    await postedParent(kv);
    await enqueueReply(env);
    fetchMock.mockResolvedValue(success());

    await flushXOutbox(env, SYNC_ID);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).variables.input).toMatchObject({
      text: '追加的想法',
      mode: 'shareNow',
      metadata: { twitter: { retweet: { id: '1234567890', comment: '追加的想法' } } },
    });
    expect(outboxOf(kv, 'reply-1')).toBeNull();
    expect(JSON.parse(kv.store.get(`diary:x-posted:${SYNC_ID}:reply-1`)!.value))
      .toMatchObject({ replyTo: 'thought-1', text: '追加的想法' });
  });

  it('waits, without failing, while the original is still being delivered', async () => {
    const { kv, env } = makeEnv();
    await enqueueXPosts(env, SYNC_ID, [{ postId: 'thought-1', text: '原帖', createdAt: FRESH }], NOW);
    await enqueueReply(env);
    // Original still queued: neither is sent by a flush that cannot deliver the original.
    const record = outboxOf(kv, 'thought-1')!;
    await kv.put(`diary:x-outbox:${SYNC_ID}:thought-1`, JSON.stringify({ ...record, state: 'sending', sendingAt: Date.now() }));

    await flushXOutbox(env, SYNC_ID);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(outboxOf(kv, 'reply-1')).toMatchObject({ state: 'queued' });
  });

  it('waits while Buffer has not published the original, then sends when it has', async () => {
    const { kv, env } = makeEnv();
    await postedParent(kv, null, 'sending');
    await enqueueReply(env);

    fetchMock.mockResolvedValueOnce(bufferResponse({
      data: { post: { id: 'buf-parent', status: 'sending', externalLink: null, error: null } },
    }));
    await flushXOutbox(env, SYNC_ID);
    expect(outboxOf(kv, 'reply-1')).toMatchObject({ state: 'queued' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockResolvedValueOnce(bufferResponse({
      data: { post: { id: 'buf-parent', status: 'sent', externalLink: LINK, error: null } },
    }));
    fetchMock.mockResolvedValueOnce(success());
    await flushXOutbox(env, SYNC_ID);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).variables.input.metadata)
      .toEqual({ twitter: { retweet: { id: '1234567890', comment: '追加的想法' } } });
    expect(outboxOf(kv, 'reply-1')).toBeNull();
  });

  it('flags a reply that X received as a plain retweet of the original', async () => {
    const { kv, env } = makeEnv();
    await postedParent(kv);
    await kv.put(
      `diary:x-posted:${SYNC_ID}:reply-1`,
      JSON.stringify({ bufferPostId: 'buf-reply', postedAt: FRESH, text: '追加的想法', replyTo: 'thought-1' }),
      { metadata: { status: 'sending', at: FRESH } },
    );
    fetchMock.mockResolvedValue(bufferResponse({
      data: { post: { id: 'buf-reply', status: 'sent', externalLink: LINK, error: null } },
    }));

    const status = await getXSyncStatus(env, SYNC_ID);
    expect(status.failed).toEqual([
      { postId: 'reply-1', preview: '回复：追加的想法', message: expect.stringContaining('纯转推') },
    ]);
    expect(kv.store.has(`diary:x-posted:${SYNC_ID}:reply-1`)).toBe(false);
  });

  it('accepts a reply whose tweet is its own', async () => {
    const { kv, env } = makeEnv();
    await postedParent(kv);
    await kv.put(
      `diary:x-posted:${SYNC_ID}:reply-1`,
      JSON.stringify({ bufferPostId: 'buf-reply', postedAt: FRESH, text: '追加的想法', replyTo: 'thought-1' }),
      { metadata: { status: 'sending', at: FRESH } },
    );
    fetchMock.mockResolvedValue(bufferResponse({
      data: { post: { id: 'buf-reply', status: 'sent', externalLink: 'https://x.com/someone/status/999', error: null } },
    }));
    await expect(getXSyncStatus(env, SYNC_ID)).resolves.toMatchObject({ failed: [] });
    expect(JSON.parse(kv.store.get(`diary:x-posted:${SYNC_ID}:reply-1`)!.value).link)
      .toBe('https://x.com/someone/status/999');
    expect(kv.store.get(`diary:x-posted:${SYNC_ID}:reply-1`)!.metadata).toMatchObject({ status: 'sent' });
  });

  it('fails loudly when the original never reached X', async () => {
    const { kv, env } = makeEnv();
    await enqueueReply(env);
    await flushXOutbox(env, SYNC_ID);
    expect(outboxOf(kv, 'reply-1')).toMatchObject({ state: 'failed', error: expect.stringContaining('没有同步到 X') });

    await enqueueXPosts(env, SYNC_ID, [{ postId: 'thought-1', text: '原帖', createdAt: '2026-09-01T00:00:00.000Z' }], NOW);
    expect(outboxOf(kv, 'thought-1')).toMatchObject({ state: 'failed' });
    await retryXFailures(env, SYNC_ID, 'reply-1');
    expect(outboxOf(kv, 'reply-1')).toMatchObject({ state: 'failed', error: expect.stringContaining('原帖还没有发到 X') });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the text of a reply X rejected so it can be shown and retried', async () => {
    const { kv, env } = makeEnv();
    await postedParent(kv);
    await enqueueReply(env);
    fetchMock.mockResolvedValueOnce(success());
    await flushXOutbox(env, SYNC_ID);

    fetchMock.mockResolvedValueOnce(bufferResponse({
      data: { post: { id: 'buf-1', status: 'error', externalLink: null, error: { message: 'Duplicate content' } } },
    }));
    const status = await getXSyncStatus(env, SYNC_ID);
    expect(status.failed).toEqual([
      { postId: 'reply-1', preview: '回复：追加的想法', message: 'X 没有发布成功：Duplicate content' },
    ]);
    expect(outboxOf(kv, 'reply-1')).toMatchObject({ replyTo: 'thought-1', text: '追加的想法', state: 'failed' });
  });
});
