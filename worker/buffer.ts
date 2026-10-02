// Minimal client for Buffer's GraphQL API, the free route to publishing on X
// (X's own API has no free tier).

export interface BufferEnv {
  BUFFER_API_KEY?: string;
  BUFFER_CHANNEL_ID?: string;
}

export type BufferPostStatus = 'draft' | 'error' | 'needs_approval' | 'scheduled' | 'sending' | 'sent';

export type CreateResult =
  | { kind: 'ok'; bufferPostId: string; status: BufferPostStatus; link?: string }
  // Buffer answered that nothing was posted. `retryable` marks refusals that
  // clear up on their own (rate limit, daily posting limit).
  | { kind: 'rejected'; message: string; retryable: boolean; retryAfterMs?: number }
  // No usable answer: the post may or may not be on X.
  | { kind: 'unknown'; message: string };

export interface BufferPostState {
  status: BufferPostStatus;
  link?: string;
  error?: string;
}

const BUFFER_ENDPOINT = 'https://api.buffer.com';
const REQUEST_TIMEOUT_MS = 12_000;
const TWEET_ID_PATTERN = /\/status\/(\d+)/;

const CREATE_POST = `mutation($input: CreatePostInput!) {
  createPost(input: $input) {
    __typename
    ... on PostActionSuccess { post { id status externalLink } }
    ... on MutationError { message }
  }
}`;

const GET_POST = `query($id: PostId!) {
  post(input: { id: $id }) { id status externalLink error { message } }
}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBufferStatus(value: unknown): value is BufferPostStatus {
  return value === 'draft' || value === 'error' || value === 'needs_approval'
    || value === 'scheduled' || value === 'sending' || value === 'sent';
}

function graphQLError(body: unknown): { code: string; message: string } | null {
  const first = isRecord(body) && Array.isArray(body.errors) ? body.errors.find(isRecord) : undefined;
  if (!first) return null;
  return {
    code: isRecord(first.extensions) && typeof first.extensions.code === 'string' ? first.extensions.code : '',
    message: typeof first.message === 'string' ? first.message : 'Buffer 查询失败',
  };
}

export class BufferApiError extends Error {
  constructor(message: string, readonly retryAfterMs?: number, readonly terminal = false) { super(message); }
}

function retryAfter(response: Response): number | undefined {
  const header = response.headers.get('retry-after');
  if (!header) return undefined;
  const seconds = Number(header);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(ms) && ms > 0 ? ms : undefined;
}

export function bufferConfigured(env: BufferEnv): boolean {
  return Boolean(env.BUFFER_API_KEY && env.BUFFER_CHANNEL_ID);
}

export function tweetIdOf(link: string | undefined): string | undefined {
  return link ? TWEET_ID_PATTERN.exec(link)?.[1] : undefined;
}

async function bufferRequest(
  env: BufferEnv,
  query: string,
  variables: Record<string, unknown>,
): Promise<{ status: number; body: unknown; retryAfterMs?: number }> {
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
    return { status: response.status, body, retryAfterMs: retryAfter(response) };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Publish now. A quote needs the text both as the post and as the comment; a
 * thread lists every part, the first one included, each replying to the one before.
 */
export async function createBufferPost(env: BufferEnv, text: string, quoteTweetId?: string, thread: string[] = []): Promise<CreateResult> {
  let status: number;
  let body: unknown;
  let retryAfterMs: number | undefined;
  try {
    ({ status, body, retryAfterMs } = await bufferRequest(env, CREATE_POST, {
      input: {
        channelId: env.BUFFER_CHANNEL_ID,
        text,
        schedulingType: 'automatic',
        mode: 'shareNow',
        assets: [],
        needsApproval: false,
        // Without `comment` Buffer publishes a plain retweet and drops `text`.
        ...(quoteTweetId ? { metadata: { twitter: { retweet: { id: quoteTweetId, comment: text } } } } : {}),
        ...(!quoteTweetId && thread.length > 0 ? { metadata: { twitter: { thread: [text, ...thread].map((part) => ({ text: part, assets: [] })) } } } : {}),
      },
    }));
  } catch (error) {
    const reason = error instanceof Error && error.name === 'AbortError' ? '请求超时' : '网络错误';
    return { kind: 'unknown', message: `${reason}，可能已经发出；请先到 X 确认，没发出再点重试` };
  }

  if (status === 429) return { kind: 'rejected', message: 'Buffer 请求过于频繁，配额恢复后会自动重试', retryable: true, retryAfterMs };
  if (status === 401 || status === 403) {
    return { kind: 'rejected', message: 'Buffer API key 无效或已被撤销，请重新生成并更新 BUFFER_API_KEY', retryable: false };
  }
  const payload = isRecord(body) && isRecord(body.data) && isRecord(body.data.createPost)
    ? body.data.createPost
    : null;
  if (!payload) {
    const error = graphQLError(body);
    if (error?.code === 'RATE_LIMIT_EXCEEDED') {
      return { kind: 'rejected', message: 'Buffer 请求过于频繁，配额恢复后会自动重试', retryable: true, retryAfterMs };
    }
    if (error && ['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'GRAPHQL_VALIDATION_FAILED', 'BAD_USER_INPUT'].includes(error.code)) {
      return { kind: 'rejected', message: `Buffer 拒绝了这次发布（${error.code}）：${error.message}`, retryable: false };
    }
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
  switch (payload.__typename) {
    case 'LimitReachedError':
    case 'PostLimitReachedError':
      return { kind: 'rejected', message: `已达到发帖上限：${message}，稍后会自动重试`, retryable: true };
    case 'InvalidInputError':
    case 'NotFoundError':
    case 'UnauthorizedError':
      return { kind: 'rejected', message: `Buffer 拒绝了这次发布：${message}`, retryable: false };
    default:
      return { kind: 'unknown', message: `Buffer 内部错误：${message}，可能已经发出；请先到 X 确认` };
  }
}

const ORGANIZATIONS = `query { account { organizations { id } } }`;

const CHANNELS = `query($org: OrganizationId!) {
  channels(input: { organizationId: $org }) { id name }
}`;

export async function fetchOrganizationId(env: BufferEnv): Promise<string | null> {
  try {
    const { body } = await bufferRequest(env, ORGANIZATIONS, {});
    const orgs = isRecord(body) && isRecord(body.data) && isRecord(body.data.account) && Array.isArray(body.data.account.organizations)
      ? body.data.account.organizations
      : [];
    const first = orgs.find((org) => isRecord(org) && typeof org.id === 'string');
    return isRecord(first) ? String(first.id) : null;
  } catch {
    return null;
  }
}

/** The X handle of the connected channel. */
export async function fetchChannelHandle(env: BufferEnv, organizationId: string): Promise<string | null> {
  try {
    const { body } = await bufferRequest(env, CHANNELS, { org: organizationId });
    const channels = isRecord(body) && isRecord(body.data) && Array.isArray(body.data.channels) ? body.data.channels : [];
    const channel = channels.find((item) => isRecord(item) && item.id === env.BUFFER_CHANNEL_ID);
    return isRecord(channel) && typeof channel.name === 'string' && channel.name ? channel.name : null;
  } catch {
    return null;
  }
}

export async function fetchBufferPost(env: BufferEnv, bufferPostId: string): Promise<BufferPostState | null> {
  try {
    const { status, body, retryAfterMs } = await bufferRequest(env, GET_POST, { id: bufferPostId });
    const error = graphQLError(body);
    if (status === 429 || error?.code === 'RATE_LIMIT_EXCEEDED') {
      throw new BufferApiError('Buffer 查询限流，配额恢复后继续核对发布状态', retryAfterMs ?? 60_000);
    }
    if ([401, 403, 404].includes(status) || (error && ['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND'].includes(error.code))) {
      throw new BufferApiError(`无法核对 Buffer 发布状态：${error?.message ?? `HTTP ${status}`}；请到 Buffer / X 确认后处理`, undefined, true);
    }
    const post = isRecord(body) && isRecord(body.data) && isRecord(body.data.post) ? body.data.post : null;
    if (!post || !isBufferStatus(post.status)) return null;
    return {
      status: post.status,
      link: typeof post.externalLink === 'string' ? post.externalLink : undefined,
      error: isRecord(post.error) && typeof post.error.message === 'string' ? post.error.message : undefined,
    };
  } catch (error) {
    if (error instanceof BufferApiError) throw error;
    return null;
  }
}
