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
  | { kind: 'rejected'; message: string; retryable: boolean }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBufferStatus(value: unknown): value is BufferPostStatus {
  return value === 'draft' || value === 'error' || value === 'needs_approval'
    || value === 'scheduled' || value === 'sending' || value === 'sent';
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

/** Publish now. A quote needs the text both as the post and as the comment. */
export async function createBufferPost(env: BufferEnv, text: string, quoteTweetId?: string): Promise<CreateResult> {
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

  if (status === 429) return { kind: 'rejected', message: 'Buffer 请求过于频繁，稍后会自动重试', retryable: true };
  if (status === 401 || status === 403) {
    return { kind: 'rejected', message: 'Buffer API key 无效或已被撤销，请重新生成并更新 BUFFER_API_KEY', retryable: false };
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
  switch (payload.__typename) {
    case 'LimitReachedError':
      return { kind: 'rejected', message: `已达到发帖上限：${message}，稍后会自动重试`, retryable: true };
    case 'InvalidInputError':
    case 'NotFoundError':
    case 'UnauthorizedError':
      return { kind: 'rejected', message: `Buffer 拒绝了这次发布：${message}`, retryable: false };
    default:
      return { kind: 'unknown', message: `Buffer 内部错误：${message}，可能已经发出；请先到 X 确认` };
  }
}

export interface BufferPostMetrics {
  bufferPostId: string;
  impressions: number;
  likes: number;
  replies: number;
  reposts: number;
  clicks: number;
  metricsAt: number;
}

const ORGANIZATIONS = `query { account { organizations { id } } }`;

const POSTS_WITH_METRICS = `query($org: OrganizationId!, $channel: ChannelId!, $after: String) {
  posts(first: 100, after: $after, input: { organizationId: $org, filter: { channelIds: [$channel] } }) {
    edges { node { id metricsUpdatedAt metrics { type value } } }
    pageInfo { hasNextPage endCursor }
  }
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

/** Engagement for the channel's recent posts, as Buffer last measured it. */
export async function fetchChannelMetrics(env: BufferEnv, organizationId: string, maxPages = 3): Promise<BufferPostMetrics[] | null> {
  const results: BufferPostMetrics[] = [];
  let after: string | null = null;
  try {
    for (let page = 0; page < maxPages; page++) {
      const { body } = await bufferRequest(env, POSTS_WITH_METRICS, { org: organizationId, channel: env.BUFFER_CHANNEL_ID, after });
      const posts = isRecord(body) && isRecord(body.data) && isRecord(body.data.posts) ? body.data.posts : null;
      if (!posts || !Array.isArray(posts.edges)) return page === 0 ? null : results;
      for (const edge of posts.edges) {
        const node = isRecord(edge) && isRecord(edge.node) ? edge.node : null;
        if (!node || typeof node.id !== 'string' || !Array.isArray(node.metrics)) continue;
        const value = (type: string) => {
          const metric = (node.metrics as unknown[]).find((m) => isRecord(m) && m.type === type);
          return isRecord(metric) && typeof metric.value === 'number' ? Math.round(metric.value) : 0;
        };
        const measured = typeof node.metricsUpdatedAt === 'string' ? Date.parse(node.metricsUpdatedAt) : NaN;
        results.push({
          bufferPostId: node.id,
          impressions: value('impressions'),
          likes: value('reactions') || value('likes'),
          replies: value('comments'),
          reposts: value('reposts'),
          clicks: value('clicks'),
          metricsAt: Number.isFinite(measured) ? measured : 0,
        });
      }
      const info = isRecord(posts.pageInfo) ? posts.pageInfo : null;
      if (!info?.hasNextPage || typeof info.endCursor !== 'string') break;
      after = info.endCursor;
    }
    return results;
  } catch {
    return results.length > 0 ? results : null;
  }
}

export async function fetchBufferPost(env: BufferEnv, bufferPostId: string): Promise<BufferPostState | null> {
  try {
    const { body } = await bufferRequest(env, GET_POST, { id: bufferPostId });
    const post = isRecord(body) && isRecord(body.data) && isRecord(body.data.post) ? body.data.post : null;
    if (!post || !isBufferStatus(post.status)) return null;
    return {
      status: post.status,
      link: typeof post.externalLink === 'string' ? post.externalLink : undefined,
      error: isRecord(post.error) && typeof post.error.message === 'string' ? post.error.message : undefined,
    };
  } catch {
    return null;
  }
}
