import type { MergeableStore, Row } from 'tinybase';
import { ROW_ID_PATTERN, type XState } from '../../src/lib/schema';
import {
  BufferApiError, createSubstackNote, fetchBufferPost, fetchOrganizationId, findSubstackChannel, type BufferEnv,
} from '../buffer';
import { execute, getMeta, query, setMeta } from '../d1';

/**
 * Publishing Substack Notes through Buffer from an independently leased D1 task.
 *
 * The same contract as X (./x.ts): diary3_substack is the ledger and the only
 * source of truth, committed before anything is sent. Delivery is at most once
 * — a duplicate Note is public — so only a definite, transient refusal is
 * retried automatically, and an unknown outcome becomes a visible failure the
 * user resolves. The ledger is mirrored into the synced `substackposts` table.
 *
 * A post goes out as one Note, the parts written with it (its +) as further
 * paragraphs: a Note holds 10,000 characters, so there is no thread to build.
 * A later 追加 is a Note of its own with a link card to its post's Note.
 */

interface SubstackRow {
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

export interface SubstackCandidate {
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
// Buffer's free plan allows 250 requests a day. A missing channel is looked up
// again hourly, or at once when the user retries; a failed lookup after 5 minutes.
const NO_CHANNEL_RECHECK_MS = 3600_000;
const LOOKUP_RETRY_MS = 5 * 60_000;

const MSG = {
  notConfigured: '当前环境没有配置 Buffer，不会发到 Substack',
  noChannel: 'Buffer 里还没有连接可用的 Substack 频道；连接后点重试',
  lookup: '暂时无法从 Buffer 读取 Substack 频道，稍后自动再试',
  stale: '这条已超过 3 天，为避免误发没有自动发布；确认要发请点重试',
  deleted: '已在 App 里删除',
  interrupted: '发送过程被中断，可能已经发出；请先到 Substack 确认，没发出再点重试',
  parentMissing: '原帖没有同步到 Substack，这条追加无法发出',
  parentFailed: '原帖还没有发到 Substack（见它的失败记录），处理好后再重试这条追加',
};

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** A post's text and then the parts written with it (its +), in order, as one Note. */
export function noteText(store: MergeableStore, postId: string): string {
  const content = str(store.getCell('posts', postId, 'content')).trim();
  if (!content) return '';
  const parts = Object.values(store.getTable('replies'))
    .filter((reply) => reply.postId === postId && reply.thread === true && str(reply.content).trim())
    .sort((a, b) => str(a.createdAt).localeCompare(str(b.createdAt)))
    .map((reply) => str(reply.content).trim());
  return [content, ...parts].join('\n\n');
}

/** New posts and 追加 that asked to go to Substack and have no ledger row yet. */
export function findSubstackCandidates(
  posts: Record<string, Row>,
  replies: Record<string, Row>,
  known: ReadonlySet<string>,
): SubstackCandidate[] {
  const candidates: SubstackCandidate[] = [];
  for (const [id, post] of Object.entries(posts)) {
    if (known.has(id) || post.substackSync !== true || post.entryType !== 'thought') continue;
    if (!ROW_ID_PATTERN.test(id) || !str(post.content).trim()) continue;
    candidates.push({ id, kind: 'post', parent: '', text: str(post.content).trim(), createdAt: str(post.createdAt) });
  }
  for (const [id, reply] of Object.entries(replies)) {
    // A part written with its post goes out inside the post's Note.
    if (known.has(id) || reply.substackSync !== true || reply.thread === true) continue;
    const parent = str(reply.postId);
    if (!ROW_ID_PATTERN.test(id) || !str(reply.content).trim() || posts[parent]?.substackSync !== true) continue;
    candidates.push({ id, kind: 'reply', parent, text: str(reply.content).trim(), createdAt: str(reply.createdAt) });
  }
  // Oldest first, and a post before the 追加 that link to it.
  return candidates.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || (a.kind === 'post' ? -1 : 1));
}

function initialState(candidate: SubstackCandidate, now: number, configured: boolean, manual = false): { state: XState; error: string } {
  if (!configured) return { state: 'failed', error: MSG.notConfigured };
  const created = Date.parse(candidate.createdAt);
  if (!manual && (!Number.isFinite(created) || now - created > STALE_MS)) return { state: 'failed', error: MSG.stale };
  return { state: 'queued', error: '' };
}

async function readLedger(sql: D1Database): Promise<SubstackRow[]> {
  return query<SubstackRow>(sql, 'SELECT * FROM diary3_substack ORDER BY rowid');
}

async function insertRow(sql: D1Database, row: Pick<SubstackRow, 'id' | 'kind' | 'state'> & Partial<SubstackRow>): Promise<void> {
  const full: SubstackRow = { parent: '', attempts: 0, next_at: 0, buffer_id: '', link: '', error: '', text: '', updated_at: Date.now(), ...row };
  await execute(sql,
    `INSERT OR IGNORE INTO diary3_substack (id, kind, parent, state, attempts, next_at, buffer_id, link, error, text, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    full.id, full.kind, full.parent, full.state, full.attempts, full.next_at,
    full.buffer_id, full.link, full.error, full.text, full.updated_at,
  );
}

async function updateRow(sql: D1Database, id: string, fields: Partial<Omit<SubstackRow, 'id'>>): Promise<void> {
  const entries = Object.entries(fields);
  if (entries.length === 0) return;
  await execute(sql,
    `UPDATE diary3_substack SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`,
    ...entries.map(([, value]) => value as SqlStorageValue),
    id,
  );
}

async function applyCommands(sql: D1Database, store: MergeableStore, ledger: Map<string, SubstackRow>, now: number, configured: boolean): Promise<void> {
  let requeued = false;
  for (const [id, row] of Object.entries(store.getTable('substackposts'))) {
    const command = str(row.command);
    if (!command) continue;
    const entry = ledger.get(id);
    // Only an explicit first send may bypass archive age. A replay never
    // resets an attempted/published delivery; it stays owned by the ledger.
    if (command === 'send' && (!entry || (entry.state === 'failed' && entry.attempts === 0 && !entry.buffer_id && entry.error === MSG.stale))) {
      const candidate = findSubstackCandidates({ [id]: store.getRow('posts', id) }, {}, new Set())[0];
      if (candidate) {
        const { state, error } = initialState(candidate, now, configured, true);
        if (entry) await updateRow(sql, id, { state, error, text: candidate.text, updated_at: now });
        else await insertRow(sql, { id, kind: 'post', state, error, text: candidate.text, updated_at: now });
        requeued ||= state === 'queued';
      }
    } else if (command === 'retry' && entry && (entry.state === 'failed' || entry.state === 'dismissed')) {
      await updateRow(sql, id, configured
        ? { state: 'queued', attempts: 0, next_at: 0, error: '', updated_at: now }
        // Nothing here could ever send it; a queued row would wait forever.
        : { state: 'failed', error: MSG.notConfigured, updated_at: now });
      requeued ||= configured;
    } else if (command === 'dismiss' && entry && (entry.state === 'failed' || entry.state === 'queued')) {
      await updateRow(sql, id, { state: 'dismissed', updated_at: now });
    }
    store.setCell('substackposts', id, 'command', '');
  }
  // The user may just have connected Substack in Buffer: look it up again now.
  if (requeued) await setMeta(sql, 'substack_channel_none_at', '0');
}

type ChannelLookup = { kind: 'found'; id: string } | { kind: 'none' } | { kind: 'later'; at: number };

/** The Substack channel connected in Buffer; asked rarely, Buffer's daily quota is small. */
async function substackChannel(sql: D1Database, env: BufferEnv, now: number): Promise<ChannelLookup> {
  const known = await getMeta(sql, 'substack_channel');
  if (known) return { kind: 'found', id: known };
  const metaTime = async (key: string) => Number((await getMeta(sql, key)) ?? 0);
  if (now - await metaTime('substack_channel_none_at') < NO_CHANNEL_RECHECK_MS) return { kind: 'none' };
  const failedAt = await metaTime('substack_channel_failed_at');
  if (now - failedAt < LOOKUP_RETRY_MS) return { kind: 'later', at: failedAt + LOOKUP_RETRY_MS };

  let org = await getMeta(sql, 'buffer_org');
  if (!org) {
    org = await fetchOrganizationId(env);
    if (org) await setMeta(sql, 'buffer_org', org);
  }
  const lookup = org ? await findSubstackChannel(env, org) : { kind: 'error' as const, retryAfterMs: undefined };
  if (lookup.kind === 'found') {
    await setMeta(sql, 'substack_channel', lookup.id);
    return lookup;
  }
  if (lookup.kind === 'none') {
    await setMeta(sql, 'substack_channel_none_at', String(now));
    return lookup;
  }
  await setMeta(sql, 'substack_channel_failed_at', String(now));
  if (lookup.retryAfterMs) await setMeta(sql, 'buffer_retry_at', String(now + lookup.retryAfterMs));
  return { kind: 'later', at: now + Math.max(LOOKUP_RETRY_MS, lookup.retryAfterMs ?? 0) };
}

function retryDelay(attempts: number): number | null {
  return attempts <= RETRY_DELAYS_MS.length ? RETRY_DELAYS_MS[attempts - 1] : null;
}

async function refreshPublishing(sql: D1Database, env: BufferEnv, row: SubstackRow, now: number): Promise<void> {
  const attempts = row.attempts + 1;
  const delay = REFRESH_DELAYS_MS[Math.min(row.attempts, REFRESH_DELAYS_MS.length - 1)];
  await updateRow(sql, row.id, { attempts, next_at: now + delay });
  let state;
  try {
    state = await fetchBufferPost(env, row.buffer_id, 'Substack');
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
  } else if (state.status === 'sent') {
    await updateRow(sql, row.id, { state: 'sent', link: state.link ?? row.link, error: '', updated_at: now });
  } else if (state.status === 'error' || state.status === 'draft' || state.status === 'needs_approval') {
    await updateRow(sql, row.id, { state: 'failed', error: `Substack 没有发布成功：${state.error ?? state.status}`, updated_at: now });
  } else if (row.error) {
    await updateRow(sql, row.id, { error: '', updated_at: now });
  }
}

async function deliver(
  sql: D1Database,
  store: MergeableStore,
  env: BufferEnv,
  channelId: string,
  row: SubstackRow,
  ledger: Map<string, SubstackRow>,
  now: number,
  persist: () => Promise<void>,
): Promise<void> {
  const text = row.kind === 'post' ? noteText(store, row.id) : str(store.getCell('replies', row.id, 'content')).trim();
  if (!text) {
    await updateRow(sql, row.id, { state: 'dismissed', error: MSG.deleted, updated_at: now });
    return;
  }

  let linkUrl: string | undefined;
  if (row.kind === 'reply') {
    const parent = ledger.get(row.parent);
    if (!parent) {
      await updateRow(sql, row.id, { state: 'failed', error: MSG.parentMissing, updated_at: now });
      return;
    }
    if (parent.state === 'publishing' && parent.next_at <= now) {
      await refreshPublishing(sql, env, parent, now);
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
    // Without the post's link the 追加 still goes out, as a Note on its own.
    linkUrl = current.link || undefined;
  }

  // A retry of a known Buffer post must first resolve its existing outcome.
  // Only a confirmed draft/error is safe to publish again.
  if (row.buffer_id) {
    let existing;
    try {
      existing = await fetchBufferPost(env, row.buffer_id, 'Substack');
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
      await updateRow(sql, row.id, { state: 'sent', link: existing.link ?? row.link, error: '', updated_at: now });
      return;
    }
  }

  // Committed before the request: if the object dies mid-send, the row stays
  // in `sending` and is failed (never resent) on the next run.
  await updateRow(sql, row.id, { state: 'sending', text, updated_at: now });
  mirror(store, await readLedger(sql));
  await persist();
  const result = await createSubstackNote(env, channelId, text, linkUrl);
  const done = Date.now();

  if (result.kind === 'ok') {
    const link = result.link ?? '';
    if (result.status === 'sent') {
      await updateRow(sql, row.id, { state: 'sent', buffer_id: result.bufferPostId, link, error: '', updated_at: done });
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
  // A refusal can mean the channel was reconnected under a new id: look it up again next time.
  if (result.kind === 'rejected') await setMeta(sql, 'substack_channel', '');
  console.warn('[substack] delivery failed', { id: row.id, kind: result.kind, message: result.message });
  await updateRow(sql, row.id, { state: 'failed', error: result.message, updated_at: done });
}

function mirror(store: MergeableStore, rows: SubstackRow[]): void {
  store.transaction(() => {
    for (const row of rows) {
      const current = store.getRow('substackposts', row.id);
      const next = { state: row.state, kind: row.kind, link: row.link, error: row.error, at: row.updated_at };
      const changed = (Object.keys(next) as Array<keyof typeof next>).some((key) => current[key] !== next[key]);
      if (changed) store.setPartialRow('substackposts', row.id, next);
    }
  });
}

/** One reconcile-and-deliver pass. Returns when it next needs to run. */
export async function runSubstack(sql: D1Database, store: MergeableStore, env: BufferEnv, now: number, persist: () => Promise<void>): Promise<number> {
  const configured = Boolean(env.BUFFER_API_KEY);
  let ledger = new Map((await readLedger(sql)).map((row) => [row.id, row]));

  await applyCommands(sql, store, ledger, now, configured);

  for (const candidate of findSubstackCandidates(store.getTable('posts'), store.getTable('replies'), new Set(ledger.keys()))) {
    const { state, error } = initialState(candidate, now, configured);
    await insertRow(sql, { id: candidate.id, kind: candidate.kind, parent: candidate.parent, state, error, text: candidate.text, updated_at: now });
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
    const due = [...ledger.values()].filter((row) => row.state === 'queued' && row.next_at <= now);
    if (due.length > 0) {
      const channel = await substackChannel(sql, env, now);
      if (channel.kind === 'none') {
        for (const row of due) await updateRow(sql, row.id, { state: 'failed', error: MSG.noChannel, updated_at: now });
      } else if (channel.kind === 'later') {
        for (const row of due) await updateRow(sql, row.id, { next_at: channel.at, error: MSG.lookup, updated_at: now });
      } else {
        for (const row of due.slice(0, MAX_SEND_PER_RUN)) {
          if ((await cooldown()) > Date.now()) break;
          try {
            await deliver(sql, store, env, channel.id, row, ledger, Date.now(), persist);
          } finally {
            // One slow/interrupted later delivery must not hide earlier results.
            mirror(store, await readLedger(sql));
            await persist();
          }
          const updated = (await readLedger(sql)).find((r) => r.id === row.id);
          if (updated) ledger.set(row.id, updated);
        }
      }
    }

    const publishing = [...ledger.values()].filter((row) => row.state === 'publishing' && row.next_at <= now).slice(0, MAX_REFRESH_PER_RUN);
    for (const row of publishing) {
      if ((await cooldown()) > Date.now()) break;
      try {
        await refreshPublishing(sql, env, row, Date.now());
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
  let next = Infinity;
  for (const row of rows) {
    if (row.state === 'queued' || row.state === 'publishing') next = Math.min(next, Math.max(row.next_at, (await cooldown()), now + 1000));
    if (row.state === 'sending') next = Math.min(next, Math.max(now + 1000, row.updated_at + SENDING_STALE_MS));
  }
  return next;
}
