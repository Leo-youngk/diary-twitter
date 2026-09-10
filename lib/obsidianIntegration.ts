type IntegrationEntity = 'thought' | 'diary' | 'daily_goal';
type IntegrationOperation = 'upsert' | 'delete';

export interface IntegrationReply {
  id: string;
  content: string;
  createdAt: string;
}

export interface IntegrationEvent {
  op: IntegrationOperation;
  entity: IntegrationEntity;
  id: string;
  version: string;
  createdAt?: string;
  date?: string;
  title?: string;
  content?: string;
  category?: string;
  mood?: string;
  tags?: string[];
  replies?: IntegrationReply[];
  completed?: boolean;
}

export interface IntegrationEnvelope {
  source: 'twitter-pwa';
  syncId: string;
  snapshotUpdatedAt: string;
  events: IntegrationEvent[];
}

interface OutboxRecord {
  envelope: IntegrationEnvelope;
  event: IntegrationEvent;
  attempts: number;
  nextAttemptAt: number;
  lastStatus?: number;
}

export interface ObsidianSyncEnv {
  DIARY_KV: KVNamespace;
  OBSIDIAN_SYNC_URL?: string;
  OBSIDIAN_SYNC_SECRET?: string;
}

const OUTBOX_PREFIX = 'diary:obsidian-outbox:';
const MAX_BATCH_SIZE = 20;
const MAX_FLUSH_RECORDS = 100;
const REQUEST_TIMEOUT_MS = 12_000;
const RETRY_BASE_MS = 1_000;
const MAX_RETRY_DELAY_MS = 60_000;
const MAX_TEXT_LENGTH = 200_000;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SYNC_ENTITIES = new Set<IntegrationEntity>(['thought', 'diary', 'daily_goal']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function validIso(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && DATE_PATTERN.test(value);
}

function boundedText(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  // Never cut a note in the middle. A too-large record is rejected loudly so
  // the normal sync path keeps the complete source data and can report the
  // failure to the user for correction.
  if (value.length > MAX_TEXT_LENGTH) {
    throw new Error(`Obsidian sync text exceeds ${MAX_TEXT_LENGTH} characters`);
  }
  return value;
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return boundedText(value).trim();
}

function normalizeTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tags = value
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 30);
  return tags.length > 0 ? tags : undefined;
}

function normalizeReplies(value: unknown, postId: string): IntegrationReply[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((reply) => ({
      id: typeof reply.id === 'string' && ID_PATTERN.test(reply.id)
        ? reply.id
        : `${postId}-reply-${String(reply.createdAt ?? '')}`,
      content: boundedText(reply.content),
      createdAt: validIso(reply.createdAt) ? reply.createdAt : new Date(0).toISOString(),
    }))
    .filter((reply) => reply.content.length > 0)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

interface NormalizedPost {
  id: string;
  entity: IntegrationEntity | 'article';
  createdAt: string;
  title?: string;
  content: string;
  category?: string;
  mood?: string;
  tags?: string[];
  replies: IntegrationReply[];
}

function normalizePost(value: unknown): NormalizedPost | null {
  if (!isRecord(value) || !validId(value.id) || !validIso(value.createdAt)) return null;
  const rawType = value.entryType;
  if (rawType !== 'thought' && rawType !== 'diary' && rawType !== 'article') return null;
  return {
    id: value.id,
    entity: rawType,
    createdAt: value.createdAt,
    title: optionalText(value.title),
    content: boundedText(value.content),
    category: optionalText(value.category),
    mood: optionalText(value.mood),
    tags: normalizeTags(value.tags),
    replies: normalizeReplies(value.replies, value.id),
  };
}

interface NormalizedGoal {
  id: string;
  date: string;
  content: string;
  title?: string;
  completed: boolean;
  updatedAt: string;
}

function normalizeGoal(value: unknown): NormalizedGoal | null {
  if (!isRecord(value) || !validId(value.id) || !validDate(value.date)) return null;
  const updatedAt = validIso(value.updatedAt) ? value.updatedAt : `${value.date}T00:00:00.000Z`;
  const rawContent = typeof value.content === 'string' && value.content.trim()
    ? value.content
    : value.title;
  const content = boundedText(rawContent);
  if (!content) return null;
  return {
    id: value.id,
    date: value.date,
    content,
    title: optionalText(value.title),
    completed: value.completed === true,
    updatedAt,
  };
}

function postsById(value: unknown): Map<string, NormalizedPost> {
  const posts = isRecord(value) && Array.isArray(value.posts) ? value.posts : [];
  const map = new Map<string, NormalizedPost>();
  for (const post of posts) {
    const normalized = normalizePost(post);
    if (normalized) map.set(normalized.id, normalized);
  }
  return map;
}

function goalsById(value: unknown): Map<string, NormalizedGoal> {
  const goals = isRecord(value) && Array.isArray(value.dailyGoals) ? value.dailyGoals : [];
  const map = new Map<string, NormalizedGoal>();
  for (const goal of goals) {
    const normalized = normalizeGoal(goal);
    if (normalized) map.set(normalized.id, normalized);
  }
  return map;
}

function postHashPayload(post: NormalizedPost): Record<string, unknown> {
  return {
    id: post.id,
    entity: post.entity,
    createdAt: post.createdAt,
    title: post.title ?? null,
    content: post.content,
    category: post.category ?? null,
    mood: post.mood ?? null,
    tags: post.tags ?? [],
    replies: post.replies,
  };
}

function goalHashPayload(goal: NormalizedGoal): Record<string, unknown> {
  return {
    id: goal.id,
    date: goal.date,
    content: goal.content,
    title: goal.title ?? null,
    completed: goal.completed,
    updatedAt: goal.updatedAt,
  };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function objectHash(value: Record<string, unknown>): Promise<string> {
  return sha256(JSON.stringify(value));
}

function postEvent(op: IntegrationOperation, post: NormalizedPost, version: string): IntegrationEvent {
  return {
    op,
    entity: post.entity as IntegrationEntity,
    id: post.id,
    version,
    createdAt: post.createdAt,
    title: post.title,
    content: op === 'upsert' ? post.content : undefined,
    category: post.category,
    mood: post.mood,
    tags: post.tags,
    replies: op === 'upsert' ? post.replies : undefined,
  };
}

function goalEvent(op: IntegrationOperation, goal: NormalizedGoal, version: string): IntegrationEvent {
  return {
    op,
    entity: 'daily_goal',
    id: goal.id,
    version,
    date: goal.date,
    createdAt: goal.updatedAt,
    title: goal.title,
    content: op === 'upsert' ? goal.content : undefined,
    completed: op === 'upsert' ? goal.completed : undefined,
  };
}

/**
 * Compare two whole snapshots and produce only the text-bearing changes that
 * belong in the Obsidian vault. Images and like state are intentionally ignored.
 */
export async function buildIntegrationEvents(
  previousValue: unknown,
  incomingValue: unknown,
  snapshotUpdatedAt: string,
): Promise<IntegrationEvent[]> {
  const previousPosts = postsById(previousValue);
  const incomingPosts = postsById(incomingValue);
  const events: IntegrationEvent[] = [];

  // Deletions come first so an entryType change cannot leave the old daily file.
  for (const previous of Array.from(previousPosts.values())) {
    if (!SYNC_ENTITIES.has(previous.entity as IntegrationEntity)) continue;
    const incoming = incomingPosts.get(previous.id);
    const moved = incoming && incoming.entity === previous.entity
      && incoming.createdAt !== previous.createdAt;
    if (!incoming || incoming.entity !== previous.entity || moved) {
      const version = await sha256(JSON.stringify({
        op: 'delete',
        id: previous.id,
        entity: previous.entity,
        createdAt: previous.createdAt,
        snapshotUpdatedAt,
      }));
      events.push(postEvent('delete', previous, version));
    }
  }

  for (const incoming of Array.from(incomingPosts.values())) {
    if (!SYNC_ENTITIES.has(incoming.entity as IntegrationEntity)) continue;
    const previous = previousPosts.get(incoming.id);
    const nextHash = await objectHash(postHashPayload(incoming));
    const previousHash = previous && previous.entity === incoming.entity
      ? await objectHash(postHashPayload(previous))
      : null;
    if (nextHash !== previousHash) {
      events.push(postEvent('upsert', incoming, nextHash));
    }
  }

  const previousGoals = goalsById(previousValue);
  const incomingGoals = goalsById(incomingValue);
  for (const previous of Array.from(previousGoals.values())) {
    const incoming = incomingGoals.get(previous.id);
    if (!incoming || incoming.date !== previous.date) {
      const version = await sha256(JSON.stringify({
        op: 'delete',
        id: previous.id,
        date: previous.date,
        snapshotUpdatedAt,
      }));
      events.push(goalEvent('delete', previous, version));
    }
  }
  for (const incoming of Array.from(incomingGoals.values())) {
    const previous = previousGoals.get(incoming.id);
    const nextHash = await objectHash(goalHashPayload(incoming));
    const previousHash = previous ? await objectHash(goalHashPayload(previous)) : null;
    if (nextHash !== previousHash) {
      events.push(goalEvent('upsert', incoming, nextHash));
    }
  }

  return events;
}

function outboxKey(syncId: string, event: IntegrationEvent): string {
  return `${OUTBOX_PREFIX}${syncId}:${event.entity}:${event.id}:${event.version}`;
}

function hasIntegrationConfig(env: ObsidianSyncEnv): boolean {
  return Boolean(env.OBSIDIAN_SYNC_URL && env.OBSIDIAN_SYNC_SECRET);
}

export async function enqueueIntegrationEvents(
  env: ObsidianSyncEnv,
  syncId: string,
  snapshotUpdatedAt: string,
  events: IntegrationEvent[],
): Promise<void> {
  if (!hasIntegrationConfig(env) || events.length === 0) return;
  const envelopeBase = { source: 'twitter-pwa' as const, syncId, snapshotUpdatedAt };
  for (let i = 0; i < events.length; i += MAX_BATCH_SIZE) {
    const chunk = events.slice(i, i + MAX_BATCH_SIZE);
    await Promise.all(chunk.map((event) => {
      const record: OutboxRecord = {
        envelope: { ...envelopeBase, events: [event] },
        event,
        attempts: 0,
        nextAttemptAt: 0,
      };
      return env.DIARY_KV.put(outboxKey(syncId, event), JSON.stringify(record));
    }));
  }
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function signRequest(secret: string, path: string, timestamp: string, nonce: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const canonical = `POST\n${path}\n${timestamp}\n${nonce}\n${body}`;
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical)));
}

async function sendBatch(
  env: ObsidianSyncEnv,
  syncId: string,
  records: OutboxRecord[],
): Promise<{ ok: boolean; status: number }> {
  const endpoint = env.OBSIDIAN_SYNC_URL;
  const secret = env.OBSIDIAN_SYNC_SECRET;
  if (!endpoint || !secret || records.length === 0) return { ok: true, status: 204 };
  const url = new URL(endpoint);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const events = records.map((record) => record.event);
  const body = JSON.stringify({
    source: 'twitter-pwa',
    syncId,
    snapshotUpdatedAt: records[0].envelope.snapshotUpdatedAt,
    events,
  } satisfies IntegrationEnvelope);
  const signature = await signRequest(secret, url.pathname, timestamp, nonce, body);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-integration-timestamp': timestamp,
        'x-integration-nonce': nonce,
        'x-integration-signature': signature,
      },
      body,
      signal: controller.signal,
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

function recordFrom(value: unknown): OutboxRecord | null {
  if (!isRecord(value) || !isRecord(value.event) || !isRecord(value.envelope)) return null;
  const event = value.event as Partial<IntegrationEvent>;
  if (!validId(event.id) || !SYNC_ENTITIES.has(event.entity as IntegrationEntity)) return null;
  if (event.op !== 'upsert' && event.op !== 'delete') return null;
  if (typeof event.version !== 'string' || !event.version) return null;
  const envelope = value.envelope as Partial<IntegrationEnvelope>;
  if (envelope.source !== 'twitter-pwa' || typeof envelope.syncId !== 'string') return null;
  if (typeof envelope.snapshotUpdatedAt !== 'string') return null;
  return {
    envelope: {
      source: 'twitter-pwa',
      syncId: envelope.syncId,
      snapshotUpdatedAt: envelope.snapshotUpdatedAt,
      events: [event as IntegrationEvent],
    },
    event: event as IntegrationEvent,
    attempts: typeof value.attempts === 'number' ? value.attempts : 0,
    nextAttemptAt: typeof value.nextAttemptAt === 'number' ? value.nextAttemptAt : 0,
    lastStatus: typeof value.lastStatus === 'number' ? value.lastStatus : undefined,
  };
}

function eventTime(event: IntegrationEvent): number {
  return Date.parse(event.createdAt ?? event.date ?? '') || 0;
}

/** Flush a bounded batch. It is safe to call after every accepted snapshot. */
export async function flushIntegrationOutbox(env: ObsidianSyncEnv, syncId: string): Promise<void> {
  if (!hasIntegrationConfig(env)) return;
  const prefix = `${OUTBOX_PREFIX}${syncId}:`;
  const listed = await env.DIARY_KV.list({ prefix, limit: MAX_FLUSH_RECORDS });
  const records: Array<{ key: string; record: OutboxRecord }> = [];
  const now = Date.now();
  for (const key of listed.keys) {
    const raw = await env.DIARY_KV.get(key.name);
    let record: OutboxRecord | null = null;
    if (raw) {
      try { record = recordFrom(JSON.parse(raw)); } catch { record = null; }
    }
    if (record && record.nextAttemptAt <= now) records.push({ key: key.name, record });
  }
  records.sort((a, b) => {
    const timeDiff = eventTime(a.record.event) - eventTime(b.record.event);
    return timeDiff || a.key.localeCompare(b.key);
  });

  for (let i = 0; i < records.length; i += MAX_BATCH_SIZE) {
    const chunk = records.slice(i, i + MAX_BATCH_SIZE);
    const result = await sendBatch(env, syncId, chunk.map((item) => item.record));
    if (result.ok) {
      await Promise.all(chunk.map((item) => env.DIARY_KV.delete(item.key)));
      continue;
    }
    const nowMs = Date.now();
    await Promise.all(chunk.map(({ key, record }) => {
      const attempts = record.attempts + 1;
      const delay = Math.min(MAX_RETRY_DELAY_MS, RETRY_BASE_MS * (2 ** Math.min(attempts, 6)));
      return env.DIARY_KV.put(key, JSON.stringify({
        ...record,
        attempts,
        nextAttemptAt: nowMs + delay,
        lastStatus: result.status,
      }));
    }));
    console.warn('[obsidian-sync] delivery failed', { syncId, status: result.status, count: chunk.length });
    // Preserve ordering and avoid hammering a down target in this invocation.
    break;
  }
}

export function integrationEnabled(env: ObsidianSyncEnv): boolean {
  return hasIntegrationConfig(env);
}
