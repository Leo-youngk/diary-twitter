import { X_MAX_WEIGHT, xWeightedLength } from './xText';

/**
 * Publish 随想 to X through Buffer's free-plan GraphQL API (X's own API has no
 * free tier). The shape mirrors obsidianIntegration.ts: the snapshot diff
 * produces events, events land in a KV outbox before the snapshot is stored,
 * and a flush delivers them.
 *
 * A reply added in the PWA to a post that is on X goes out as a quote of that
 * post: Buffer cannot reply to an existing tweet, only quote one, so the reply
 * text is posted with the original attached. It waits until X has published
 * the original and Buffer knows its link.
 *
 * Unlike the Obsidian sync, a duplicate here is public and cannot be undone, so
 * delivery is deliberately at-most-once: only a definite "not posted" answer
 * may be retried, and only by the user. Anything with an unknown outcome
 * becomes a visible failure instead of an automatic retry.
 */

export interface BufferSyncEnv {
  DIARY_KV: KVNamespace;
  BUFFER_API_KEY?: string;
  BUFFER_CHANNEL_ID?: string;
}

export interface XPostEvent {
  /** Id of the thing being sent. For a reply this is the reply's own id. */
  postId: string;
  text: string;
  createdAt: string;
  /** Set for a reply: the id of the post it was added to. */
  replyTo?: string;
}

type OutboxState = 'queued' | 'sending' | 'failed';

interface OutboxRecord extends XPostEvent {
  state: OutboxState;
  sendingAt?: number;
  error?: string;
}

// Buffer's status after createPost. 'sending' and 'scheduled' are still in flight.
type BufferPostStatus = 'draft' | 'error' | 'needs_approval' | 'scheduled' | 'sending' | 'sent';

interface PostedMarker {
  bufferPostId: string;
  postedAt: string;
  link?: string;
  // Kept so a post X later rejects can be shown and retried.
  text?: string;
  replyTo?: string;
}

interface PostedMetadata {
  status: BufferPostStatus;
  at: string;
}

export interface XSyncFailure {
  postId: string;
  preview: string;
  message: string;
}

export interface XSyncStatus {
  enabled: boolean;
  /** Waiting for, or in the middle of, a delivery attempt. */
  inProgress: number;
  /** Delivered to Buffer, X has not confirmed publication yet. */
  publishing: number;
  failed: XSyncFailure[];
  lastSent?: { at: string; link?: string };
}

const BUFFER_ENDPOINT = 'https://api.buffer.com';
const OUTBOX_PREFIX = 'diary:x-outbox:';
const POSTED_PREFIX = 'diary:x-posted:';
const REQUEST_TIMEOUT_MS = 12_000;
// A record stuck in 'sending' means the worker died mid-request; the post may
// or may not have gone out, so it is never resent automatically.
const SENDING_STALE_MS = 60_000;
// Old posts only reach this queue by restore/import/offline replay. Refuse to
// publish them without the user's say-so.
const STALE_POST_MS = 72 * 60 * 60 * 1000;
const MAX_LIST = 1000;
const MAX_VERIFY = 10;
const PREVIEW_LENGTH = 40;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const TWEET_ID_PATTERN = /\/status\/(\d+)/;

// Serialises delivery of one post inside an isolate. KV is eventually
// consistent, so this backs up the 'sending' state written to KV.
const inFlight = new Set<string>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function bufferConfigured(env: BufferSyncEnv): boolean {
  return Boolean(env.BUFFER_API_KEY && env.BUFFER_CHANNEL_ID);
}

function outboxKey(syncId: string, postId: string): string {
  return `${OUTBOX_PREFIX}${syncId}:${postId}`;
}

function postedKey(syncId: string, postId: string): string {
  return `${POSTED_PREFIX}${syncId}:${postId}`;
}

function preview(text: string): string {
  const chars = Array.from(text);
  return chars.length > PREVIEW_LENGTH ? `${chars.slice(0, PREVIEW_LENGTH).join('')}…` : text;
}

// ── Snapshot diff ────────────────────────────────────────────────────────────

interface PreviousPost {
  xSync: boolean;
  replyIds: Set<string>;
}

function previousPosts(value: unknown): Map<string, PreviousPost> {
  const posts = isRecord(value) && Array.isArray(value.posts) ? value.posts : [];
  const map = new Map<string, PreviousPost>();
  for (const post of posts) {
    if (!isRecord(post) || typeof post.id !== 'string') continue;
    const replyIds = new Set<string>();
    if (Array.isArray(post.replies)) {
      for (const reply of post.replies) {
        if (isRecord(reply) && typeof reply.id === 'string') replyIds.add(reply.id);
      }
    }
    map.set(post.id, { xSync: post.xSync === true, replyIds });
  }
  return map;
}

function validIso(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

/**
 * A post is published when it appears with xSync on, or when xSync flips on.
 * A reply is published when it appears, flagged, under a post that is on X.
 * Edits and deletions never reach X.
 */
export function buildXPostEvents(previousValue: unknown, incomingValue: unknown): XPostEvent[] {
  const previous = previousPosts(previousValue);
  const posts = isRecord(incomingValue) && Array.isArray(incomingValue.posts) ? incomingValue.posts : [];
  const events: XPostEvent[] = [];
  for (const post of posts) {
    if (!isRecord(post) || post.entryType !== 'thought' || post.xSync !== true) continue;
    if (typeof post.id !== 'string' || !ID_PATTERN.test(post.id) || !validIso(post.createdAt)) continue;
    const before = previous.get(post.id);
    if (before?.xSync !== true && typeof post.content === 'string' && post.content.trim()) {
      events.push({ postId: post.id, text: post.content.trim(), createdAt: post.createdAt });
    }
    if (!Array.isArray(post.replies)) continue;
    for (const reply of post.replies) {
      if (!isRecord(reply) || reply.xSync !== true) continue;
      if (typeof reply.id !== 'string' || !ID_PATTERN.test(reply.id) || !validIso(reply.createdAt)) continue;
      if (before?.replyIds.has(reply.id)) continue;
      if (typeof reply.content !== 'string' || !reply.content.trim()) continue;
      events.push({ postId: reply.id, text: reply.content.trim(), createdAt: reply.createdAt, replyTo: post.id });
    }
  }
  return events;
}

// ── Outbox ───────────────────────────────────────────────────────────────────

async function readOutbox(env: BufferSyncEnv, key: string): Promise<OutboxRecord | null> {
  const raw = await env.DIARY_KV.get(key);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || typeof value.postId !== 'string' || typeof value.text !== 'string') return null;
    const state = value.state === 'sending' || value.state === 'failed' ? value.state : 'queued';
    return {
      postId: value.postId,
      text: value.text,
      createdAt: typeof value.createdAt === 'string' ? value.createdAt : new Date(0).toISOString(),
      state,
      replyTo: typeof value.replyTo === 'string' ? value.replyTo : undefined,
      sendingAt: typeof value.sendingAt === 'number' ? value.sendingAt : undefined,
      error: typeof value.error === 'string' ? value.error : undefined,
    };
  } catch {
    return null;
  }
}

async function writeOutbox(env: BufferSyncEnv, syncId: string, record: OutboxRecord): Promise<void> {
  await env.DIARY_KV.put(outboxKey(syncId, record.postId), JSON.stringify(record));
}

/**
 * Record events before the snapshot is stored. Problems that are known up front
 * (too long, too old, Buffer not configured) are stored as failures the user can
 * see, never dropped. Returns the number of records now waiting or failed.
 */
export async function enqueueXPosts(
  env: BufferSyncEnv,
  syncId: string,
  events: XPostEvent[],
  now = Date.now(),
): Promise<number> {
  let recorded = 0;
  for (const event of events) {
    const alreadyPosted = await env.DIARY_KV.get(postedKey(syncId, event.postId));
    if (alreadyPosted) continue;
    if (await readOutbox(env, outboxKey(syncId, event.postId))) continue;

    let record: OutboxRecord = { ...event, state: 'queued' };
    if (!bufferConfigured(env)) {
      record = { ...record, state: 'failed', error: '服务端还没有配置 Buffer（BUFFER_API_KEY / BUFFER_CHANNEL_ID）' };
    } else if (xWeightedLength(event.text) > X_MAX_WEIGHT) {
      record = { ...record, state: 'failed', error: '超过 X 的长度限制（中文每字算 2，上限 140 字）' };
    } else if (now - Date.parse(event.createdAt) > STALE_POST_MS) {
      record = { ...record, state: 'failed', error: '这条随想已超过 3 天，为避免误发已跳过；确认要发布请点重试' };
    }
    await writeOutbox(env, syncId, record);
    recorded += 1;
  }
  return recorded;
}

// ── Buffer client ────────────────────────────────────────────────────────────

const CREATE_POST = `mutation($input: CreatePostInput!) {
  createPost(input: $input) {
    __typename
    ... on PostActionSuccess { post { id status externalLink } }
    ... on InvalidInputError { message }
    ... on NotFoundError { message }
    ... on UnauthorizedError { message }
    ... on LimitReachedError { message }
    ... on UnexpectedError { message }
    ... on RestProxyError { message }
  }
}`;

const GET_POST = `query($id: PostId!) {
  post(input: { id: $id }) { id status externalLink error { message } }
}`;

type CreateResult =
  | { kind: 'ok'; bufferPostId: string; status: BufferPostStatus; link?: string }
  // Buffer answered and said nothing was posted, so the user may retry.
  | { kind: 'rejected'; message: string }
  // No usable answer. The post may have gone out.
  | { kind: 'unknown'; message: string };

async function bufferRequest(
  env: BufferSyncEnv,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(BUFFER_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.BUFFER_API_KEY}`,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    const body: unknown = await response.json().catch(() => null);
    return { status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

function isBufferStatus(value: unknown): value is BufferPostStatus {
  return value === 'draft' || value === 'error' || value === 'needs_approval'
    || value === 'scheduled' || value === 'sending' || value === 'sent';
}

async function createBufferPost(env: BufferSyncEnv, text: string, quoteTweetId?: string): Promise<CreateResult> {
  let status: number;
  let body: unknown;
  try {
    ({ status, body } = await bufferRequest(env, CREATE_POST, {
      input: {
        channelId: env.BUFFER_CHANNEL_ID,
        text,
        schedulingType: 'automatic',
        mode: 'shareNow',
        assets: [],
        needsApproval: false,
        // Without `comment` Buffer publishes a plain retweet and drops `text`.
        ...(quoteTweetId ? { metadata: { twitter: { retweet: { id: quoteTweetId, comment: text } } } } : {}),
      },
    }));
  } catch (error) {
    const reason = error instanceof Error && error.name === 'AbortError' ? '请求超时' : '网络错误';
    return { kind: 'unknown', message: `${reason}，可能已经发出；请先到 X 确认，没发出再点重试` };
  }

  if (status === 429) return { kind: 'rejected', message: 'Buffer 请求过于频繁，稍后点重试' };
  if (status === 401 || status === 403) {
    return { kind: 'rejected', message: 'Buffer API key 无效或已被撤销，请到 Buffer 重新生成并更新 BUFFER_API_KEY' };
  }
  const payload = isRecord(body) && isRecord(body.data) && isRecord(body.data.createPost)
    ? body.data.createPost
    : null;
  if (!payload) {
    return { kind: 'unknown', message: `Buffer 返回了无法识别的响应（HTTP ${status}），可能已经发出；请先到 X 确认` };
  }

  if (payload.__typename === 'PostActionSuccess' && isRecord(payload.post)) {
    const post = payload.post;
    if (typeof post.id === 'string' && isBufferStatus(post.status)) {
      return {
        kind: 'ok',
        bufferPostId: post.id,
        status: post.status,
        link: typeof post.externalLink === 'string' ? post.externalLink : undefined,
      };
    }
    return { kind: 'unknown', message: 'Buffer 返回的帖子信息不完整，可能已经发出；请先到 X 确认' };
  }

  const message = typeof payload.message === 'string' ? payload.message : String(payload.__typename ?? '未知错误');
  // Unauthorized / NotFound / InvalidInput / LimitReached are answers to a
  // request Buffer refused to act on. Unexpected / proxy errors are not.
  const refused = ['InvalidInputError', 'NotFoundError', 'UnauthorizedError', 'LimitReachedError'];
  if (typeof payload.__typename === 'string' && refused.includes(payload.__typename)) {
    return { kind: 'rejected', message: `Buffer 拒绝了这次发布：${message}` };
  }
  return { kind: 'unknown', message: `Buffer 内部错误：${message}，可能已经发出；请先到 X 确认` };
}

// ── Delivery ─────────────────────────────────────────────────────────────────

async function markPosted(
  env: BufferSyncEnv,
  syncId: string,
  record: OutboxRecord,
  result: Extract<CreateResult, { kind: 'ok' }>,
): Promise<void> {
  const now = new Date().toISOString();
  const marker: PostedMarker = {
    bufferPostId: result.bufferPostId,
    postedAt: now,
    link: result.link,
    text: record.text,
    replyTo: record.replyTo,
  };
  const metadata: PostedMetadata = { status: result.status, at: now };
  await env.DIARY_KV.put(postedKey(syncId, record.postId), JSON.stringify(marker), { metadata });
  await env.DIARY_KV.delete(outboxKey(syncId, record.postId));
}

async function fetchBufferPost(env: BufferSyncEnv, bufferPostId: string): Promise<Record<string, unknown> | null> {
  try {
    const { body } = await bufferRequest(env, GET_POST, { id: bufferPostId });
    return isRecord(body) && isRecord(body.data) && isRecord(body.data.post) ? body.data.post : null;
  } catch {
    return null;
  }
}

function tweetIdOf(link: string | undefined): string | undefined {
  return link ? TWEET_ID_PATTERN.exec(link)?.[1] : undefined;
}

type ParentState =
  | { kind: 'ready'; tweetId: string }
  // The original is still on its way to X; try again on the next flush.
  | { kind: 'wait' }
  | { kind: 'failed'; message: string };

/** Find the tweet a reply should quote. Buffer knows its link only once X has published it. */
async function resolveParent(env: BufferSyncEnv, syncId: string, parentId: string): Promise<ParentState> {
  const key = postedKey(syncId, parentId);
  const raw = await env.DIARY_KV.get(key);
  if (!raw) {
    const parent = await readOutbox(env, outboxKey(syncId, parentId));
    if (!parent) return { kind: 'failed', message: '原帖没有同步到 X，这条回复无法发出' };
    if (parent.state === 'failed') {
      return { kind: 'failed', message: '原帖还没有发到 X（见上面的失败记录），处理好后再重试这条回复' };
    }
    return { kind: 'wait' };
  }

  let marker: PostedMarker;
  try { marker = JSON.parse(raw) as PostedMarker; } catch {
    return { kind: 'failed', message: '原帖的发布记录已损坏，这条回复无法发出' };
  }
  let link = marker.link;
  if (!link || !TWEET_ID_PATTERN.test(link)) {
    const post = await fetchBufferPost(env, marker.bufferPostId);
    if (!post || post.status === 'sending' || post.status === 'scheduled') return { kind: 'wait' };
    if (post.status !== 'sent') {
      return { kind: 'failed', message: '原帖没有在 X 上发布成功，这条回复无法发出' };
    }
    link = typeof post.externalLink === 'string' ? post.externalLink : undefined;
    if (!link) return { kind: 'failed', message: 'Buffer 没有返回原帖在 X 上的链接，这条回复无法发出' };
    const metadata: PostedMetadata = { status: 'sent', at: marker.postedAt };
    await env.DIARY_KV.put(key, JSON.stringify({ ...marker, link }), { metadata });
  }
  const tweetId = tweetIdOf(link);
  return tweetId
    ? { kind: 'ready', tweetId }
    : { kind: 'failed', message: `无法从 Buffer 返回的链接里读出原帖 ID（${link}）` };
}

async function deliverOne(env: BufferSyncEnv, syncId: string, key: string): Promise<void> {
  const fresh = await readOutbox(env, key);
  if (!fresh) return;
  const now = Date.now();

  if (fresh.state === 'sending') {
    if (fresh.sendingAt !== undefined && now - fresh.sendingAt > SENDING_STALE_MS) {
      await writeOutbox(env, syncId, {
        ...fresh,
        state: 'failed',
        sendingAt: undefined,
        error: '发送过程被中断，可能已经发出；请先到 X 确认，没发出再点重试',
      });
    }
    return;
  }
  if (fresh.state !== 'queued') return;

  let quoteTweetId: string | undefined;
  if (fresh.replyTo) {
    const parent = await resolveParent(env, syncId, fresh.replyTo);
    if (parent.kind === 'wait') return;
    if (parent.kind === 'failed') {
      await writeOutbox(env, syncId, { ...fresh, state: 'failed', error: parent.message });
      return;
    }
    quoteTweetId = parent.tweetId;
  }

  await writeOutbox(env, syncId, { ...fresh, state: 'sending', sendingAt: now, error: undefined });
  const result = await createBufferPost(env, fresh.text, quoteTweetId);
  if (result.kind === 'ok') {
    await markPosted(env, syncId, fresh, result);
    return;
  }
  console.warn('[x-sync] delivery failed', { syncId, postId: fresh.postId, kind: result.kind, message: result.message });
  await writeOutbox(env, syncId, { ...fresh, state: 'failed', sendingAt: undefined, error: result.message });
}

/** Deliver every queued record, oldest first. Safe to call after each snapshot. */
export async function flushXOutbox(env: BufferSyncEnv, syncId: string): Promise<void> {
  if (!bufferConfigured(env)) return;
  const listed = await env.DIARY_KV.list({ prefix: `${OUTBOX_PREFIX}${syncId}:`, limit: MAX_LIST });
  const records: Array<{ key: string; record: OutboxRecord }> = [];
  for (const { name } of listed.keys) {
    const record = await readOutbox(env, name);
    if (record && (record.state === 'queued' || record.state === 'sending')) records.push({ key: name, record });
  }
  records.sort((a, b) => Date.parse(a.record.createdAt) - Date.parse(b.record.createdAt));
  for (const { key } of records) {
    if (inFlight.has(key)) continue;
    inFlight.add(key);
    try {
      await deliverOne(env, syncId, key);
    } finally {
      inFlight.delete(key);
    }
  }
}

// ── Status, retry, dismiss ───────────────────────────────────────────────────

/**
 * Ask Buffer how in-flight posts ended. A post Buffer failed to publish becomes
 * a visible failure; the dedupe marker is removed so that retry can create it again.
 */
async function refreshPublishing(env: BufferSyncEnv, syncId: string): Promise<void> {
  if (!bufferConfigured(env)) return;
  const listed = await env.DIARY_KV.list<PostedMetadata>({ prefix: `${POSTED_PREFIX}${syncId}:`, limit: MAX_LIST });
  const open = listed.keys
    .filter((key) => key.metadata?.status === 'sending' || key.metadata?.status === 'scheduled')
    .slice(0, MAX_VERIFY);
  for (const { name } of open) {
    const raw = await env.DIARY_KV.get(name);
    if (!raw) continue;
    let marker: PostedMarker;
    try { marker = JSON.parse(raw) as PostedMarker; } catch { continue; }
    const post = await fetchBufferPost(env, marker.bufferPostId);
    if (!post || !isBufferStatus(post.status)) continue;

    const postId = name.slice(`${POSTED_PREFIX}${syncId}:`.length);
    const link = typeof post.externalLink === 'string' ? post.externalLink : marker.link;
    if (post.status === 'sent' && marker.replyTo) {
      // A quote has a tweet of its own. If the link is the original's, X only got a retweet.
      const parentRaw = await env.DIARY_KV.get(postedKey(syncId, marker.replyTo));
      let parentLink: string | undefined;
      try { parentLink = parentRaw ? (JSON.parse(parentRaw) as PostedMarker).link : undefined; } catch { parentLink = undefined; }
      const sentId = tweetIdOf(link);
      if (sentId && sentId === tweetIdOf(parentLink)) {
        await writeOutbox(env, syncId, {
          postId,
          text: marker.text ?? '',
          createdAt: marker.postedAt,
          replyTo: marker.replyTo,
          state: 'failed',
          error: 'X 上只发出了纯转推，没有带上文字；请到 X 撤销这条转推，再决定是否重试',
        });
        await env.DIARY_KV.delete(name);
        continue;
      }
    }
    if (post.status === 'sent' || post.status === 'scheduled' || post.status === 'sending') {
      const metadata: PostedMetadata = { status: post.status, at: marker.postedAt };
      await env.DIARY_KV.put(name, JSON.stringify({ ...marker, link }), { metadata });
      continue;
    }
    const detail = isRecord(post.error) && typeof post.error.message === 'string' ? post.error.message : post.status;
    await writeOutbox(env, syncId, {
      postId,
      text: marker.text ?? '',
      createdAt: marker.postedAt,
      replyTo: marker.replyTo,
      state: 'failed',
      error: `X 没有发布成功：${detail}`,
    });
    await env.DIARY_KV.delete(name);
  }
}

export async function getXSyncStatus(env: BufferSyncEnv, syncId: string): Promise<XSyncStatus> {
  await refreshPublishing(env, syncId);
  // A reply may have been waiting for its original to reach X.
  await flushXOutbox(env, syncId);

  const outbox = await env.DIARY_KV.list({ prefix: `${OUTBOX_PREFIX}${syncId}:`, limit: MAX_LIST });
  let inProgress = 0;
  const failed: XSyncFailure[] = [];
  for (const { name } of outbox.keys) {
    const record = await readOutbox(env, name);
    if (!record) continue;
    if (record.state === 'failed') {
      failed.push({
        postId: record.postId,
        preview: (record.replyTo ? '回复：' : '') + preview(record.text),
        message: record.error ?? '发布失败',
      });
    } else {
      inProgress += 1;
    }
  }

  const posted = await env.DIARY_KV.list<PostedMetadata>({ prefix: `${POSTED_PREFIX}${syncId}:`, limit: MAX_LIST });
  let publishing = 0;
  let latest: { at: string; name: string } | null = null;
  for (const { name, metadata } of posted.keys) {
    if (metadata?.status === 'sending' || metadata?.status === 'scheduled') publishing += 1;
    if (metadata?.status === 'sent' && (!latest || metadata.at > latest.at)) latest = { at: metadata.at, name };
  }
  let lastSent: XSyncStatus['lastSent'];
  if (latest) {
    const raw = await env.DIARY_KV.get(latest.name);
    let link: string | undefined;
    try { link = raw ? (JSON.parse(raw) as PostedMarker).link : undefined; } catch { link = undefined; }
    lastSent = { at: latest.at, link };
  }

  return { enabled: bufferConfigured(env), inProgress, publishing, failed, lastSent };
}

/** Put failures back in the queue (one post, or all) and deliver them now. */
export async function retryXFailures(env: BufferSyncEnv, syncId: string, postId?: string): Promise<void> {
  // Without credentials a requeued record would sit unsent; keep it failed.
  if (!bufferConfigured(env)) return;
  const listed = await env.DIARY_KV.list({ prefix: `${OUTBOX_PREFIX}${syncId}:`, limit: MAX_LIST });
  for (const { name } of listed.keys) {
    const record = await readOutbox(env, name);
    if (!record || record.state !== 'failed' || (postId && record.postId !== postId)) continue;
    if (!record.text.trim()) continue;
    await writeOutbox(env, syncId, { ...record, state: 'queued', sendingAt: undefined, error: undefined });
  }
  await flushXOutbox(env, syncId);
}

/** Give up on a failed post without publishing it. */
export async function dismissXFailure(env: BufferSyncEnv, syncId: string, postId: string): Promise<void> {
  const key = outboxKey(syncId, postId);
  const record = await readOutbox(env, key);
  if (record?.state === 'failed') await env.DIARY_KV.delete(key);
}
