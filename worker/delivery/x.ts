import type { MergeableStore, Row } from 'tinybase';
import { X_MAX_WEIGHT, xWeightedLength } from '../../src/lib/xText';
import { ROW_ID_PATTERN, type XState } from '../../src/lib/schema';
import {
  BufferApiError, bufferConfigured, createBufferPost, fetchBufferPost, tweetIdOf, type BufferEnv,
} from '../buffer';
import { getMeta, setMeta, query, execute } from '../d1';

/**
 * Publishing to X from an independently leased D1 task.
 *
 * diary3_x is the ledger and the only source of truth: a row is written (and
 * committed, every D1 write is awaited) before anything is sent. Delivery is
 * at most once — a duplicate on X is public and cannot be undone — so only a
 * definite, transient refusal is retried automatically. An unknown outcome
 * becomes a visible failure the user resolves. The ledger is mirrored into the
 * synced `xposts` table so every device shows the state on the post itself.
 */

interface XRow {
  id: string;
  kind: 'post' | 'reply';
  parent: string;
  state: XState;
  attempts: number;
  next_at: number;
  buffer_id: string;
  link: string;
  error: string;
  text: string;
  updated_at: number;
}

export interface XCandidate {
  id: string;
  kind: 'post' | 'reply';
  parent: string;
  text: string;
  createdAt: string;
}

const STALE_MS = 72 * 60 * 60 * 1000;
const SENDING_STALE_MS = 60_000;
const REFRESH_MS = 60_000;
const REFRESH_DELAYS_MS = [5000, 15_000, REFRESH_MS, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 6 * 3600_000];
const PARENT_WAIT_MS = 30_000;
const MAX_SEND_PER_RUN = 1;
const MAX_REFRESH_PER_RUN = 2;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 6 * 3600_000, 12 * 3600_000];

const MSG = {
  notConfigured: '当前环境没有配置 Buffer，不会发到 X',
  tooLong: '超过 X 的长度限制（中文每字算 2，上限 140 字）',
  stale: '这条已超过 3 天，为避免误发没有自动发布；确认要发请点重试',
  deleted: '已在 App 里删除',
  interrupted: '发送过程被中断，可能已经发出；请先到 X 确认，没发出再点重试',
  parentMissing: '原帖没有同步到 X，这条回复无法发出',
  parentFailed: '原帖还没有发到 X（见它的失败记录），处理好后再重试这条回复',
  plainRetweet: 'X 上只发出了纯转推，没有带上文字；请到 X 撤销这条转推，再决定是否重试',
  noLink: 'Buffer 没有返回原帖在 X 上的链接，这条回复无法发出',
};

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** New posts and replies that asked to go to X and have no ledger row yet. */
export function findCandidates(
  posts: Record<string, Row>,
  replies: Record<string, Row>,
  known: ReadonlySet<string>,
): XCandidate[] {
  const candidates: XCandidate[] = [];
  for (const [id, post] of Object.entries(posts)) {
    if (known.has(id) || post.xSync !== true || post.entryType !== 'thought') continue;
    if (!ROW_ID_PATTERN.test(id) || !str(post.content).trim()) continue;
    candidates.push({ id, kind: 'post', parent: '', text: str(post.content).trim(), createdAt: str(post.createdAt) });
  }
  for (const [id, reply] of Object.entries(replies)) {
    if (known.has(id) || reply.xSync !== true) continue;
    const parent = str(reply.postId);
    if (!ROW_ID_PATTERN.test(id) || !str(reply.content).trim() || posts[parent]?.xSync !== true) continue;
    candidates.push({ id, kind: 'reply', parent, text: str(reply.content).trim(), createdAt: str(reply.createdAt) });
  }
  // Oldest first, and a post before the replies that quote it.
  return candidates.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || (a.kind === 'post' ? -1 : 1));
}

export function initialState(candidate: XCandidate, now: number, configured: boolean): { state: XState; error: string } {
  if (!configured) return { state: 'failed', error: MSG.notConfigured };
  if (xWeightedLength(candidate.text) > X_MAX_WEIGHT) return { state: 'failed', error: MSG.tooLong };
  const created = Date.parse(candidate.createdAt);
  if (!Number.isFinite(created) || now - created > STALE_MS) return { state: 'failed', error: MSG.stale };
  return { state: 'queued', error: '' };
}

async function readLedger(sql: D1Database): Promise<XRow[]> {
  return query<XRow>(sql, 'SELECT * FROM diary3_x ORDER BY rowid');
}

async function insertRow(sql: D1Database, row: XRow): Promise<void> {
  await execute(sql,
    `INSERT OR IGNORE INTO diary3_x (id, kind, parent, state, attempts, next_at, buffer_id, link, error, text, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id, row.kind, row.parent, row.state, row.attempts, row.next_at,
    row.buffer_id, row.link, row.error, row.text, row.updated_at,
  );
}

async function updateRow(sql: D1Database, id: string, fields: Partial<Omit<XRow, 'id'>>): Promise<void> {
  const entries = Object.entries(fields);
  if (entries.length === 0) return;
  await execute(sql,
    `UPDATE diary3_x SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`,
    ...entries.map(([, value]) => value as SqlStorageValue),
    id,
  );
}

export async function insertLedgerRow(sql: D1Database, row: Partial<XRow> & Pick<XRow, 'id' | 'kind' | 'state'>): Promise<void> {
  await insertRow(sql, {
    parent: '', attempts: 0, next_at: 0, buffer_id: '', link: '', error: '', text: '', updated_at: Date.now(),
    ...row,
  });
}

async function applyCommands(sql: D1Database, store: MergeableStore, ledger: Map<string, XRow>, now: number, configured: boolean): Promise<void> {
  const xposts = store.getTable('xposts');
  for (const [id, row] of Object.entries(xposts)) {
    const command = str(row.command);
    if (!command) continue;
    const entry = ledger.get(id);
    if (command === 'retry' && entry && (entry.state === 'failed' || entry.state === 'dismissed') && !configured) {
      // Nothing here could ever send it; a queued row would wait forever.
      await updateRow(sql, id, { state: 'failed', error: MSG.notConfigured, updated_at: now });
    } else if (command === 'retry' && entry && (entry.state === 'failed' || entry.state === 'dismissed')) {
      await updateRow(sql, id, {
        state: 'queued', attempts: 0, next_at: 0, error: '', updated_at: now,
        // Only this explicit retry acknowledges that the user undid the plain retweet.
        ...(entry.error === MSG.plainRetweet ? { buffer_id: '' } : {}),
      });
    } else if (command === 'dismiss' && entry && (entry.state === 'failed' || entry.state === 'queued')) {
      await updateRow(sql, id, { state: 'dismissed', updated_at: now });
    }
    store.setCell('xposts', id, 'command', '');
  }
}

function retryDelay(attempts: number): number | null {
  return attempts <= RETRY_DELAYS_MS.length ? RETRY_DELAYS_MS[attempts - 1] : null;
}

async function refreshPublishing(sql: D1Database, env: BufferEnv, row: XRow, parentTweetId: string | undefined, now: number): Promise<void> {
  const attempts = row.attempts + 1;
  const delay = REFRESH_DELAYS_MS[Math.min(row.attempts, REFRESH_DELAYS_MS.length - 1)];
  await updateRow(sql, row.id, { attempts, next_at: now + delay });
  let state;
  try {
    state = await fetchBufferPost(env, row.buffer_id);
  } catch (error) {
    if (!(error instanceof BufferApiError)) throw error;
    if (error.terminal) {
      await updateRow(sql, row.id, { state: 'failed', error: error.message, updated_at: now });
    } else {
      const next = now + (error.retryAfterMs ?? delay);
      await setMeta(sql, 'buffer_retry_at', String(next));
      await updateRow(sql, row.id, { next_at: next, error: error.message, updated_at: now });
    }
    return;
  }
  if (!state) {
    await updateRow(sql, row.id, { error: '暂时无法查询 Buffer，稍后继续核对；不会重复发布', updated_at: now });
    return;
  }
  if (state.status === 'sent') {
    if (row.kind === 'reply' && parentTweetId && tweetIdOf(state.link) === parentTweetId) {
      await updateRow(sql, row.id, { state: 'failed', error: MSG.plainRetweet, link: state.link ?? '', updated_at: now });
    } else {
      await updateRow(sql, row.id, { state: 'sent', link: state.link ?? row.link, error: '', updated_at: now });
    }
  } else if (state.status === 'error' || state.status === 'draft' || state.status === 'needs_approval') {
    await updateRow(sql, row.id, { state: 'failed', error: `X 没有发布成功：${state.error ?? state.status}`, updated_at: now });
  } else if (row.error) {
    await updateRow(sql, row.id, { error: '', updated_at: now });
  }
}

async function deliver(
  sql: D1Database,
  store: MergeableStore,
  env: BufferEnv,
  row: XRow,
  ledger: Map<string, XRow>,
  now: number,
  persist: () => Promise<void>,
): Promise<void> {
  const source = row.kind === 'post' ? store.getRow('posts', row.id) : store.getRow('replies', row.id);
  const text = str(source.content).trim();
  if (!text) {
    await updateRow(sql, row.id, { state: 'dismissed', error: MSG.deleted, updated_at: now });
    return;
  }
  if (xWeightedLength(text) > X_MAX_WEIGHT) {
    await updateRow(sql, row.id, { state: 'failed', error: MSG.tooLong, updated_at: now });
    return;
  }

  let quoteId: string | undefined;
  if (row.kind === 'reply') {
    const parent = ledger.get(row.parent);
    if (!parent) {
      await updateRow(sql, row.id, { state: 'failed', error: MSG.parentMissing, updated_at: now });
      return;
    }
    if (parent.state === 'publishing' && parent.next_at <= now) {
      await refreshPublishing(sql, env, parent, undefined, now);
      const refreshed = (await readLedger(sql)).find((r) => r.id === parent.id);
      if (refreshed) ledger.set(parent.id, refreshed);
    }
    const current = ledger.get(row.parent)!;
    if (current.state === 'queued' || current.state === 'sending' || current.state === 'publishing') {
      await updateRow(sql, row.id, { next_at: now + PARENT_WAIT_MS });
      return;
    }
    if (current.state !== 'sent') {
      await updateRow(sql, row.id, { state: 'failed', error: MSG.parentFailed, updated_at: now });
      return;
    }
    quoteId = tweetIdOf(current.link);
    if (!quoteId) {
      await updateRow(sql, row.id, { state: 'failed', error: MSG.noLink, updated_at: now });
      return;
    }
  }

  // A retry of a known Buffer post must first resolve its existing outcome.
  // Only a confirmed draft/error is safe to publish again.
  if (row.buffer_id) {
    let existing;
    try {
      existing = await fetchBufferPost(env, row.buffer_id);
    } catch (error) {
      if (!(error instanceof BufferApiError)) throw error;
      if (error.terminal) {
        await updateRow(sql, row.id, { state: 'failed', error: error.message, updated_at: now });
      } else {
        const next = now + (error.retryAfterMs ?? REFRESH_MS);
        await setMeta(sql, 'buffer_retry_at', String(next));
        await updateRow(sql, row.id, { state: 'publishing', next_at: next, error: error.message, updated_at: now });
      }
      return;
    }
    if (!existing || existing.status === 'scheduled' || existing.status === 'sending') {
      await updateRow(sql, row.id, { state: 'publishing', next_at: now + REFRESH_DELAYS_MS[0], updated_at: now });
      return;
    }
    if (existing.status === 'sent') {
      await updateRow(sql, row.id, {
        state: quoteId && tweetIdOf(existing.link) === quoteId ? 'failed' : 'sent',
        link: existing.link ?? row.link,
        error: quoteId && tweetIdOf(existing.link) === quoteId ? MSG.plainRetweet : '', updated_at: now,
      });
      return;
    }
  }

  // Committed before the request: if the object dies mid-send, the row stays
  // in `sending` and is failed (never resent) on the next run.
  await updateRow(sql, row.id, { state: 'sending', text, updated_at: now });
  mirror(store, await readLedger(sql));
  await persist();
  const result = await createBufferPost(env, text, quoteId);
  const done = Date.now();

  if (result.kind === 'ok') {
    const link = result.link ?? '';
    if (result.status === 'sent') {
      if (quoteId && tweetIdOf(link) === quoteId) {
        await updateRow(sql, row.id, { state: 'failed', error: MSG.plainRetweet, buffer_id: result.bufferPostId, link, updated_at: done });
      } else {
        await updateRow(sql, row.id, { state: 'sent', buffer_id: result.bufferPostId, link, error: '', updated_at: done });
      }
    } else if (result.status === 'sending' || result.status === 'scheduled') {
      await updateRow(sql, row.id, { state: 'publishing', buffer_id: result.bufferPostId, link, error: '', attempts: 0, next_at: done + REFRESH_DELAYS_MS[0], updated_at: done });
    } else {
      await updateRow(sql, row.id, {
        state: 'failed', buffer_id: result.bufferPostId,
        error: `Buffer 没有立即发布（${result.status}），请到 Buffer 查看`, updated_at: done,
      });
    }
    return;
  }
  if (result.kind === 'rejected' && result.retryable) {
    const attempts = row.attempts + 1;
    const delay = retryDelay(attempts);
    const next = done + Math.max(delay ?? 0, result.retryAfterMs ?? 0);
    if (result.retryAfterMs) await setMeta(sql, 'buffer_retry_at', String(next));
    await updateRow(sql, row.id, delay === null
      ? { state: 'failed', attempts, error: result.message, updated_at: done }
      : { state: 'queued', attempts, next_at: next, error: result.message, updated_at: done });
    return;
  }
  console.warn('[x] delivery failed', { id: row.id, kind: result.kind, message: result.message });
  await updateRow(sql, row.id, { state: 'failed', error: result.message, updated_at: done });
}

function mirror(store: MergeableStore, rows: XRow[]): void {
  store.transaction(() => {
    for (const row of rows) {
      const current = store.getRow('xposts', row.id);
      const next = { state: row.state, kind: row.kind, link: row.link, error: row.error, at: row.updated_at };
      const changed = (Object.keys(next) as Array<keyof typeof next>).some((key) => current[key] !== next[key]);
      if (changed) store.setPartialRow('xposts', row.id, next);
    }
  });
}

/** One reconcile-and-deliver pass. Returns when it next needs to run. */
export async function runX(sql: D1Database, store: MergeableStore, env: BufferEnv, now: number, persist: () => Promise<void>): Promise<number> {
  const configured = bufferConfigured(env);
  let ledger = new Map((await readLedger(sql)).map((row) => [row.id, row]));

  await applyCommands(sql, store, ledger, now, configured);

  for (const candidate of findCandidates(store.getTable('posts'), store.getTable('replies'), new Set(ledger.keys()))) {
    const { state, error } = initialState(candidate, now, configured);
    await insertLedgerRow(sql, {
      id: candidate.id, kind: candidate.kind, parent: candidate.parent, state, error, text: candidate.text, updated_at: now,
    });
  }

  for (const row of await readLedger(sql)) {
    if (row.state === 'sending' && now - row.updated_at >= SENDING_STALE_MS) {
      await updateRow(sql, row.id, { state: 'failed', error: MSG.interrupted, updated_at: now });
    }
  }

  // Acknowledge receipt before any external request can hold up this pass.
  mirror(store, await readLedger(sql));
  await persist();

  const cooldown = async () => Number(await getMeta(sql, 'buffer_retry_at') ?? 0);
  if (configured && (await cooldown()) <= now) {
    ledger = new Map((await readLedger(sql)).map((row) => [row.id, row]));
    const due = [...ledger.values()].filter((row) => row.state === 'queued' && row.next_at <= now).slice(0, MAX_SEND_PER_RUN);
    for (const row of due) {
      if ((await cooldown()) > Date.now()) break;
      try {
        await deliver(sql, store, env, row, ledger, Date.now(), persist);
      } finally {
        // One slow/interrupted later delivery must not hide earlier results.
        mirror(store, await readLedger(sql));
        await persist();
      }
      const updated = (await readLedger(sql)).find((r) => r.id === row.id);
      if (updated) ledger.set(row.id, updated);
    }

    const publishing = [...ledger.values()].filter((row) => row.state === 'publishing' && row.next_at <= now).slice(0, MAX_REFRESH_PER_RUN);
    for (const row of publishing) {
      if ((await cooldown()) > Date.now()) break;
      const parentTweetId = row.kind === 'reply' ? tweetIdOf(ledger.get(row.parent)?.link) : undefined;
      try {
        await refreshPublishing(sql, env, row, parentTweetId, Date.now());
      } finally {
        mirror(store, await readLedger(sql));
        await persist();
      }
    }
  }

  const rows = await readLedger(sql);
  mirror(store, rows);
  await persist();

  if (!configured) return Infinity;
  let next = (await cooldown()) > now ? (await cooldown()) : Infinity;
  for (const row of rows) {
    if (row.state === 'queued' || row.state === 'publishing') next = Math.min(next, Math.max(row.next_at, (await cooldown()), now + 1000));
    if (row.state === 'sending') next = Math.min(next, Math.max(now + 1000, row.updated_at + SENDING_STALE_MS));
  }
  return next;
}
