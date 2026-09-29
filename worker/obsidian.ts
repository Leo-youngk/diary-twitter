import type { MergeableStore } from 'tinybase';
import { getMeta, setMeta } from './sql';

/**
 * Delivery of 随想 and 日记 to the Obsidian vault endpoint.
 *
 * The event format, normalisation and version hash are unchanged from the
 * pre-rebuild integration, so the receiver sees the same versions for the same
 * content and the migration re-sends nothing. Instead of a queue, app_obsidian
 * records the version last delivered for each post; every run diffs the store
 * against it, which also repairs anything a failed run left behind.
 */

type IntegrationEntity = 'thought' | 'diary';
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
  title?: string;
  content?: string;
  category?: string;
  mood?: string;
  tags?: string[];
  replies?: IntegrationReply[];
}

export interface IntegrationEnvelope {
  source: 'twitter-pwa';
  syncId: string;
  snapshotUpdatedAt: string;
  events: IntegrationEvent[];
}

export interface ObsidianEnv {
  OBSIDIAN_SYNC_URL?: string;
  OBSIDIAN_SYNC_SECRET?: string;
}

/** A post in the shape the pre-rebuild snapshots used. */
export interface LegacyShapePost {
  id: string;
  entryType: string;
  createdAt: string;
  title?: string;
  content: string;
  category?: string;
  mood?: string;
  tags?: string[];
  replies: Array<{ id?: string; content: string; createdAt: string }>;
}

export interface NormalizedPost {
  id: string;
  entity: IntegrationEntity;
  createdAt: string;
  title?: string;
  content: string;
  category?: string;
  mood?: string;
  tags?: string[];
  replies: IntegrationReply[];
}

interface LedgerRow {
  id: string;
  entity: string;
  created_at: string;
  version: string;
}

const MAX_BATCH_SIZE = 20;
const MAX_EVENTS_PER_RUN = 100;
const REQUEST_TIMEOUT_MS = 12_000;
const RETRY_BASE_MS = 5_000;
const MAX_RETRY_DELAY_MS = 30 * 60_000;
const MAX_TEXT_LENGTH = 200_000;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function validIso(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.trim();
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

/** Same rules as the pre-rebuild integration; the hash depends on them. */
export function normalizePost(post: LegacyShapePost): NormalizedPost | null {
  if (!ID_PATTERN.test(post.id) || !validIso(post.createdAt)) return null;
  if (post.entryType !== 'thought' && post.entryType !== 'diary') return null;
  if (typeof post.content !== 'string' || post.content.length > MAX_TEXT_LENGTH) return null;
  const replies = post.replies
    .map((reply) => ({
      id: typeof reply.id === 'string' && ID_PATTERN.test(reply.id)
        ? reply.id
        : `${post.id}-reply-${String(reply.createdAt ?? '')}`,
      content: typeof reply.content === 'string' ? reply.content : '',
      createdAt: validIso(reply.createdAt) ? reply.createdAt : new Date(0).toISOString(),
    }))
    .filter((reply) => reply.content.length > 0)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return {
    id: post.id,
    entity: post.entryType,
    createdAt: post.createdAt,
    title: optionalText(post.title),
    content: post.content,
    category: optionalText(post.category),
    mood: optionalText(post.mood),
    tags: normalizeTags(post.tags),
    replies,
  };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function postVersion(post: NormalizedPost): Promise<string> {
  return sha256(JSON.stringify({
    id: post.id,
    entity: post.entity,
    createdAt: post.createdAt,
    title: post.title ?? null,
    content: post.content,
    category: post.category ?? null,
    mood: post.mood ?? null,
    tags: post.tags ?? [],
    replies: post.replies,
  }));
}

/** The store's posts and replies, joined back into the legacy post shape. */
export function postsFromStore(store: MergeableStore): LegacyShapePost[] {
  const repliesByPost = new Map<string, LegacyShapePost['replies']>();
  for (const [id, reply] of Object.entries(store.getTable('replies'))) {
    const postId = String(reply.postId ?? '');
    const list = repliesByPost.get(postId) ?? [];
    list.push({ id, content: String(reply.content ?? ''), createdAt: String(reply.createdAt ?? '') });
    repliesByPost.set(postId, list);
  }
  return Object.entries(store.getTable('posts')).map(([id, post]) => ({
    id,
    entryType: String(post.entryType ?? ''),
    createdAt: String(post.createdAt ?? ''),
    title: String(post.title ?? ''),
    content: String(post.content ?? ''),
    category: String(post.category ?? ''),
    replies: repliesByPost.get(id) ?? [],
  }));
}

export async function currentVersions(posts: LegacyShapePost[]): Promise<Map<string, { post: NormalizedPost; version: string }>> {
  const map = new Map<string, { post: NormalizedPost; version: string }>();
  for (const raw of posts) {
    const post = normalizePost(raw);
    if (post) map.set(post.id, { post, version: await postVersion(post) });
  }
  return map;
}

export function seedLedger(sql: SqlStorage, versions: Map<string, { post: NormalizedPost; version: string }>): void {
  for (const { post, version } of versions.values()) {
    sql.exec(
      'INSERT OR REPLACE INTO app_obsidian (id, entity, created_at, version) VALUES (?, ?, ?, ?)',
      post.id, post.entity, post.createdAt, version,
    );
  }
}

/** Deletions first, so a changed type or date never leaves the old file behind. */
export async function diffEvents(
  ledger: LedgerRow[],
  current: Map<string, { post: NormalizedPost; version: string }>,
  snapshotUpdatedAt: string,
): Promise<IntegrationEvent[]> {
  const events: IntegrationEvent[] = [];
  for (const row of ledger) {
    const now = current.get(row.id);
    if (now && now.post.entity === row.entity && now.post.createdAt === row.created_at) continue;
    events.push({
      op: 'delete',
      entity: row.entity as IntegrationEntity,
      id: row.id,
      version: await sha256(JSON.stringify({
        op: 'delete', id: row.id, entity: row.entity, createdAt: row.created_at, snapshotUpdatedAt,
      })),
      createdAt: row.created_at,
    });
  }
  const delivered = new Map(ledger.map((row) => [row.id, row]));
  for (const { post, version } of current.values()) {
    const row = delivered.get(post.id);
    const sameLocation = row && row.entity === post.entity && row.created_at === post.createdAt;
    if (sameLocation && row.version === version) continue;
    events.push({
      op: 'upsert',
      entity: post.entity,
      id: post.id,
      version,
      createdAt: post.createdAt,
      title: post.title,
      content: post.content,
      category: post.category,
      mood: post.mood,
      tags: post.tags,
      replies: post.replies,
    });
  }
  return events;
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function signRequest(secret: string, path: string, timestamp: string, nonce: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const canonical = `POST\n${path}\n${timestamp}\n${nonce}\n${body}`;
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical)));
}

async function sendBatch(env: ObsidianEnv, envelope: IntegrationEnvelope): Promise<number> {
  const url = new URL(env.OBSIDIAN_SYNC_URL!);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomUUID();
  const body = JSON.stringify(envelope);
  const signature = await signRequest(env.OBSIDIAN_SYNC_SECRET!, url.pathname, timestamp, nonce, body);
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
    return response.status;
  } catch {
    return 0;
  } finally {
    clearTimeout(timeout);
  }
}

function applyDelivered(sql: SqlStorage, events: IntegrationEvent[]): void {
  for (const event of events) {
    if (event.op === 'delete') {
      sql.exec('DELETE FROM app_obsidian WHERE id = ? AND entity = ? AND created_at = ?', event.id, event.entity, event.createdAt ?? '');
    } else {
      sql.exec(
        'INSERT OR REPLACE INTO app_obsidian (id, entity, created_at, version) VALUES (?, ?, ?, ?)',
        event.id, event.entity, event.createdAt ?? '', event.version,
      );
    }
  }
}

export function obsidianConfigured(env: ObsidianEnv): boolean {
  return Boolean(env.OBSIDIAN_SYNC_URL && env.OBSIDIAN_SYNC_SECRET);
}

/** One diff-and-deliver pass. Returns when it next needs to run. */
export async function runObsidian(
  sql: SqlStorage,
  store: MergeableStore,
  env: ObsidianEnv,
  code: string,
  now: number,
): Promise<number> {
  if (!obsidianConfigured(env)) return Infinity;
  const retryAt = Number(getMeta(sql, 'obsidian_next_at') ?? 0);
  if (retryAt > now) return retryAt;

  const ledger = sql.exec<LedgerRow & Record<string, SqlStorageValue>>(
    'SELECT id, entity, created_at, version FROM app_obsidian',
  ).toArray();
  const snapshotUpdatedAt = new Date(now).toISOString();
  const events = (await diffEvents(ledger, await currentVersions(postsFromStore(store)), snapshotUpdatedAt))
    .slice(0, MAX_EVENTS_PER_RUN);
  if (events.length === 0) return Infinity;

  for (let i = 0; i < events.length; i += MAX_BATCH_SIZE) {
    const chunk = events.slice(i, i + MAX_BATCH_SIZE);
    const status = await sendBatch(env, { source: 'twitter-pwa', syncId: code, snapshotUpdatedAt, events: chunk });
    if (status < 200 || status >= 300) {
      const attempts = Number(getMeta(sql, 'obsidian_attempts') ?? 0) + 1;
      const next = Date.now() + Math.min(MAX_RETRY_DELAY_MS, RETRY_BASE_MS * 2 ** Math.min(attempts, 9));
      setMeta(sql, 'obsidian_attempts', String(attempts));
      setMeta(sql, 'obsidian_next_at', String(next));
      console.warn('[obsidian] delivery failed', { status, attempts, count: chunk.length });
      return next;
    }
    applyDelivered(sql, chunk);
  }
  setMeta(sql, 'obsidian_attempts', '0');
  setMeta(sql, 'obsidian_next_at', '0');
  // More may remain beyond this run's cap.
  return events.length === MAX_EVENTS_PER_RUN ? Date.now() + 1000 : Infinity;
}
