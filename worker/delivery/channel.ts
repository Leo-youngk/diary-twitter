import type { MergeableStore, Row } from 'tinybase';
import { SUBSTACK_MAX_LENGTH, THREADS_MAX_PARTS, substackNote, threadsParts } from '../../src/lib/channelText';
import { ROW_ID_PATTERN, type XState } from '../../src/lib/schema';
import {
  BufferApiError, createChannelPost, fetchBufferPost, fetchChannelMetrics, fetchOrganizationId, findChannel,
  type BufferEnv, type ChannelRequest, type Network,
} from '../buffer';
import { execute, getMeta, query, setMeta } from '../d1';

/**
 * Publishing to a Buffer channel other than X — Substack Notes, Threads — from
 * its own independently leased D1 task. Each channel keeps its own ledger,
 * synced table, cooldown and numbers, so one channel never holds up another.
 *
 * The same contract as X (./x.ts): the ledger is the only source of truth,
 * committed before anything is sent. Delivery is at most once — a duplicate
 * is public — so only a definite, transient refusal is retried automatically,
 * and an unknown outcome becomes a visible failure the user resolves.
 */
export interface Channel {
  network: Exclude<Network, 'X'>;
  /** Buffer's name for the network. */
  service: string;
  /** Names the D1 job and prefixes the channel's meta keys. */
  job: 'substack' | 'threads';
  ledger: 'diary3_substack' | 'diary3_threads';
  /** The synced mirror of the ledger: devices only write its `command`. */
  table: 'substackposts' | 'threadsposts';
  /** The synced numbers Buffer reports for each published post. */
  metricsTable: 'substackmetrics' | 'threadsmetrics';
  /** The post / reply cell that asks for this channel. */
  flag: 'substackSync' | 'threadsSync';
  /** The setting that turns the channel on by default for new posts. */
  setting: 'substackSyncEnabled' | 'threadsSyncEnabled';
  /** Why a post (its text and the parts written with it) or a 追加 cannot go out there as it is; '' when it can. */
  refuse(texts: string[]): string;
  /** A post and the parts written with it (its +). */
  post(text: string, parts: string[]): ChannelRequest;
  /** A later 追加, linking its post's published URL when Buffer returned one. */
  followUp(text: string, parentLink: string): ChannelRequest;
}

export const SUBSTACK: Channel = {
  network: 'Substack', service: 'substack', job: 'substack', ledger: 'diary3_substack',
  table: 'substackposts', metricsTable: 'substackmetrics', flag: 'substackSync', setting: 'substackSyncEnabled',
  // A Note holds 10,000 characters: the parts are further paragraphs, not a thread.
  refuse: (texts) => (substackNote(texts).length > SUBSTACK_MAX_LENGTH
    ? '超过 Substack 一条 Note 最多 10,000 字的上限，没有发出；删减后点重试' : ''),
  post: (text, parts) => ({ text: substackNote([text, ...parts]) }),
  followUp: (text, link) => ({ text, metadata: link ? { substack: { linkAttachment: { url: link } } } : undefined }),
};

/** The posts of a Threads thread, the first one carrying the link card if there is one. */
const threadItems = (items: string[], link = '') => items.map((text, index) => ({
  text, assets: [], ...(index === 0 && link ? { metadata: { threads: { linkAttachment: { url: link } } } } : {}),
}));

export const THREADS: Channel = {
  network: 'Threads', service: 'threads', job: 'threads', ledger: 'diary3_threads',
  table: 'threadsposts', metricsTable: 'threadsmetrics', flag: 'threadsSync', setting: 'threadsSyncEnabled',
  // A Threads post holds 500 bytes: the parts, and whatever is longer than one
  // post, go out as a thread, each post replying to the one before.
  refuse: (texts) => {
    const count = threadsParts(texts).length;
    return count > THREADS_MAX_PARTS ? `拆成 Threads 的串有 ${count} 条，超过一串最多 ${THREADS_MAX_PARTS} 条的上限，没有发出；删减后点重试` : '';
  },
  post: (text, parts) => {
    const items = threadsParts([text, ...parts]);
    return { text: items[0], metadata: items.length > 1 ? { threads: { thread: threadItems(items) } } : undefined };
  },
  followUp: (text, link) => {
    const items = threadsParts([text]);
    if (items.length > 1) return { text: items[0], metadata: { threads: { thread: threadItems(items, link) } } };
    return { text, metadata: link ? { threads: { linkAttachment: { url: link } } } : undefined };
  },
};

export const CHANNELS = [SUBSTACK, THREADS];

interface LedgerRow {
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

export interface ChannelCandidate {
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
// Buffer's free plan allows 250 requests a day, shared with X. A missing channel
// is looked up again hourly, or at once when the user retries. A failed lookup
// waits 5 minutes, then twice as long each time up to 6 hours, so a long Buffer
// outage costs a few requests a day.
const NO_CHANNEL_RECHECK_MS = 3600_000;
const LOOKUP_RETRY_MS = 5 * 60_000;
const LOOKUP_RETRY_MAX_MS = 6 * 3600_000;
// Buffer reads the numbers from the network daily; one request covers the channel's latest 50 posts.
const METRICS_EVERY_MS = 6 * 3600_000;
const METRICS_WINDOW_MS = 30 * 24 * 3600_000;

const STALE = '这条已超过 3 天，为避免误发没有自动发布；确认要发请点重试';
const messages = (network: Channel['network']) => ({
  notConfigured: `当前环境没有配置 Buffer，不会发到 ${network}`,
  noChannel: `Buffer 里还没有连接可用的 ${network} 频道；连接后点重试`,
  lookup: `暂时无法从 Buffer 读取 ${network} 频道，稍后自动再试`,
  deleted: '已在 App 里删除',
  interrupted: `发送过程被中断，可能已经发出；请先到 ${network} 确认，没发出再点重试`,
  parentMissing: `原帖没有同步到 ${network}，这条追加无法发出`,
  parentFailed: `原帖还没有发到 ${network}（见它的失败记录），处理好后再重试这条追加`,
});

/** What Buffer reports, as the cells of the channel's metrics table; -1 is "not reported". */
const METRIC_CELLS = ['views', 'impressions', 'reactions', 'comments', 'reposts', 'quotes', 'shares', 'freeSubscriptions', 'paidSubscriptions'] as const;

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** A post's text and the parts written with it (its +), in order. */
function postParts(store: MergeableStore, postId: string): { text: string; parts: string[] } {
  const parts = Object.values(store.getTable('replies'))
    .filter((reply) => reply.postId === postId && reply.thread === true && str(reply.content).trim())
    .sort((a, b) => str(a.createdAt).localeCompare(str(b.createdAt)))
    .map((reply) => str(reply.content).trim());
  return { text: str(store.getCell('posts', postId, 'content')).trim(), parts };
}

/** New posts and 追加 that asked for this channel and have no ledger row yet. */
export function channelCandidates(
  c: Channel,
  posts: Record<string, Row>,
  replies: Record<string, Row>,
  known: ReadonlySet<string>,
): ChannelCandidate[] {
  const candidates: ChannelCandidate[] = [];
  for (const [id, post] of Object.entries(posts)) {
    if (known.has(id) || post[c.flag] !== true || post.entryType !== 'thought') continue;
    if (!ROW_ID_PATTERN.test(id) || !str(post.content).trim()) continue;
    candidates.push({ id, kind: 'post', parent: '', text: str(post.content).trim(), createdAt: str(post.createdAt) });
  }
  for (const [id, reply] of Object.entries(replies)) {
    // A part written with its post goes out with the post.
    if (known.has(id) || reply[c.flag] !== true || reply.thread === true) continue;
    const parent = str(reply.postId);
    if (!ROW_ID_PATTERN.test(id) || !str(reply.content).trim() || posts[parent]?.[c.flag] !== true) continue;
    candidates.push({ id, kind: 'reply', parent, text: str(reply.content).trim(), createdAt: str(reply.createdAt) });
  }
  // Oldest first, and a post before the 追加 that link to it.
  return candidates.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || (a.kind === 'post' ? -1 : 1));
}

function initialState(c: Channel, candidate: ChannelCandidate, now: number, configured: boolean, manual = false): { state: XState; error: string } {
  if (!configured) return { state: 'failed', error: messages(c.network).notConfigured };
  const created = Date.parse(candidate.createdAt);
  if (!manual && (!Number.isFinite(created) || now - created > STALE_MS)) return { state: 'failed', error: STALE };
  return { state: 'queued', error: '' };
}

async function readLedger(sql: D1Database, c: Channel): Promise<LedgerRow[]> {
  return query<LedgerRow>(sql, `SELECT * FROM ${c.ledger} ORDER BY rowid`);
}

async function insertRow(sql: D1Database, c: Channel, row: Pick<LedgerRow, 'id' | 'kind' | 'state'> & Partial<LedgerRow>): Promise<void> {
  const full: LedgerRow = { parent: '', attempts: 0, next_at: 0, buffer_id: '', link: '', error: '', text: '', updated_at: Date.now(), ...row };
  await execute(sql,
    `INSERT OR IGNORE INTO ${c.ledger} (id, kind, parent, state, attempts, next_at, buffer_id, link, error, text, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    full.id, full.kind, full.parent, full.state, full.attempts, full.next_at,
    full.buffer_id, full.link, full.error, full.text, full.updated_at,
  );
}

async function updateRow(sql: D1Database, c: Channel, id: string, fields: Partial<Omit<LedgerRow, 'id'>>): Promise<void> {
  const entries = Object.entries(fields);
  if (entries.length === 0) return;
  await execute(sql,
    `UPDATE ${c.ledger} SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`,
    ...entries.map(([, value]) => value as SqlStorageValue),
    id,
  );
}

async function applyCommands(sql: D1Database, c: Channel, store: MergeableStore, ledger: Map<string, LedgerRow>, now: number, configured: boolean): Promise<void> {
  let requeued = false;
  for (const [id, row] of Object.entries(store.getTable(c.table))) {
    const command = str(row.command);
    if (!command) continue;
    const entry = ledger.get(id);
    // Only an explicit first send may bypass archive age. A replay never
    // resets an attempted/published delivery; it stays owned by the ledger.
    if (command === 'send' && (!entry || (entry.state === 'failed' && entry.attempts === 0 && !entry.buffer_id && entry.error === STALE))) {
      const candidate = channelCandidates(c, { [id]: store.getRow('posts', id) }, {}, new Set())[0];
      if (candidate) {
        const { state, error } = initialState(c, candidate, now, configured, true);
        if (entry) await updateRow(sql, c, id, { state, error, text: candidate.text, updated_at: now });
        else await insertRow(sql, c, { id, kind: 'post', state, error, text: candidate.text, updated_at: now });
        requeued ||= state === 'queued';
      }
    } else if (command === 'retry' && entry && (entry.state === 'failed' || entry.state === 'dismissed')) {
      await updateRow(sql, c, id, configured
        ? { state: 'queued', attempts: 0, next_at: 0, error: '', updated_at: now }
        // Nothing here could ever send it; a queued row would wait forever.
        : { state: 'failed', error: messages(c.network).notConfigured, updated_at: now });
      requeued ||= configured;
    } else if (command === 'dismiss' && entry && (entry.state === 'failed' || entry.state === 'queued')) {
      await updateRow(sql, c, id, { state: 'dismissed', updated_at: now });
    }
    store.setCell(c.table, id, 'command', '');
  }
  // The user may just have connected the channel in Buffer: look it up again now.
  if (requeued) {
    await setMeta(sql, `${c.job}_channel_none_at`, '0');
    await setMeta(sql, `${c.job}_lookup_at`, '0');
  }
}

async function organization(sql: D1Database, env: BufferEnv): Promise<string | null> {
  let org = await getMeta(sql, 'buffer_org');
  if (!org) {
    org = await fetchOrganizationId(env);
    if (org) await setMeta(sql, 'buffer_org', org);
  }
  return org;
}

type ChannelLookup = { kind: 'found'; id: string } | { kind: 'none' } | { kind: 'later'; at: number };

/** The channel connected in Buffer; asked rarely, Buffer's daily quota is small. */
async function channelId(sql: D1Database, c: Channel, env: BufferEnv, now: number): Promise<ChannelLookup> {
  const known = await getMeta(sql, `${c.job}_channel`);
  if (known) return { kind: 'found', id: known };
  const metaNumber = async (key: string) => Number((await getMeta(sql, key)) ?? 0);
  if (now - await metaNumber(`${c.job}_channel_none_at`) < NO_CHANNEL_RECHECK_MS) return { kind: 'none' };
  const retryAt = await metaNumber(`${c.job}_lookup_at`);
  if (now < retryAt) return { kind: 'later', at: retryAt };

  const org = await organization(sql, env);
  const lookup = org ? await findChannel(env, org, c.service) : { kind: 'error' as const, retryAfterMs: undefined };
  if (lookup.kind === 'found') await setMeta(sql, `${c.job}_channel`, lookup.id);
  if (lookup.kind === 'none') await setMeta(sql, `${c.job}_channel_none_at`, String(now));
  if (lookup.kind !== 'error') {
    await setMeta(sql, `${c.job}_lookup_failures`, '0');
    return lookup;
  }
  const failures = await metaNumber(`${c.job}_lookup_failures`) + 1;
  const wait = Math.max(Math.min(LOOKUP_RETRY_MS * 2 ** (failures - 1), LOOKUP_RETRY_MAX_MS), lookup.retryAfterMs ?? 0);
  await setMeta(sql, `${c.job}_lookup_failures`, String(failures));
  await setMeta(sql, `${c.job}_lookup_at`, String(now + wait));
  if (lookup.retryAfterMs) await setMeta(sql, `${c.job}_retry_at`, String(now + lookup.retryAfterMs));
  return { kind: 'later', at: now + wait };
}

function retryDelay(attempts: number): number | null {
  return attempts <= RETRY_DELAYS_MS.length ? RETRY_DELAYS_MS[attempts - 1] : null;
}

async function refreshPublishing(sql: D1Database, c: Channel, env: BufferEnv, row: LedgerRow, now: number): Promise<void> {
  const attempts = row.attempts + 1;
  const delay = REFRESH_DELAYS_MS[Math.min(row.attempts, REFRESH_DELAYS_MS.length - 1)];
  await updateRow(sql, c, row.id, { attempts, next_at: now + delay });
  let state;
  try {
    state = await fetchBufferPost(env, row.buffer_id, c.network);
  } catch (error) {
    if (!(error instanceof BufferApiError)) throw error;
    if (error.terminal) {
      await updateRow(sql, c, row.id, { state: 'failed', error: error.message, updated_at: now });
    } else {
      const next = now + (error.retryAfterMs ?? delay);
      await setMeta(sql, `${c.job}_retry_at`, String(next));
      await updateRow(sql, c, row.id, { next_at: next, error: error.message, updated_at: now });
    }
    return;
  }
  if (!state) {
    await updateRow(sql, c, row.id, { error: '暂时无法查询 Buffer，稍后继续核对；不会重复发布', updated_at: now });
  } else if (state.status === 'sent') {
    await updateRow(sql, c, row.id, { state: 'sent', link: state.link ?? row.link, error: '', updated_at: now });
  } else if (state.status === 'error' || state.status === 'draft' || state.status === 'needs_approval') {
    await updateRow(sql, c, row.id, { state: 'failed', error: `${c.network} 没有发布成功：${state.error ?? state.status}`, updated_at: now });
  } else if (row.error) {
    await updateRow(sql, c, row.id, { error: '', updated_at: now });
  }
}

async function deliver(
  sql: D1Database,
  c: Channel,
  store: MergeableStore,
  env: BufferEnv,
  channel: string,
  row: LedgerRow,
  ledger: Map<string, LedgerRow>,
  now: number,
  persist: () => Promise<void>,
): Promise<void> {
  const msg = messages(c.network);
  const post = row.kind === 'post' ? postParts(store, row.id) : null;
  const text = post ? post.text : str(store.getCell('replies', row.id, 'content')).trim();
  if (!text) {
    await updateRow(sql, c, row.id, { state: 'dismissed', error: msg.deleted, updated_at: now });
    return;
  }

  let parentLink = '';
  if (row.kind === 'reply') {
    const parent = ledger.get(row.parent);
    if (!parent) {
      await updateRow(sql, c, row.id, { state: 'failed', error: msg.parentMissing, updated_at: now });
      return;
    }
    if (parent.state === 'publishing' && parent.next_at <= now) {
      await refreshPublishing(sql, c, env, parent, now);
      const refreshed = (await readLedger(sql, c)).find((r) => r.id === parent.id);
      if (refreshed) ledger.set(parent.id, refreshed);
    }
    const current = ledger.get(row.parent)!;
    if (current.state === 'queued' || current.state === 'sending' || current.state === 'publishing') {
      await updateRow(sql, c, row.id, { next_at: now + PARENT_WAIT_MS });
      return;
    }
    if (current.state !== 'sent') {
      await updateRow(sql, c, row.id, { state: 'failed', error: msg.parentFailed, updated_at: now });
      return;
    }
    // Without the post's link the 追加 still goes out, on its own.
    parentLink = current.link;
  }

  // A retry of a known Buffer post must first resolve its existing outcome.
  // Only a confirmed draft/error is safe to publish again.
  if (row.buffer_id) {
    let existing;
    try {
      existing = await fetchBufferPost(env, row.buffer_id, c.network);
    } catch (error) {
      if (!(error instanceof BufferApiError)) throw error;
      if (error.terminal) {
        await updateRow(sql, c, row.id, { state: 'failed', error: error.message, updated_at: now });
      } else {
        const next = now + (error.retryAfterMs ?? REFRESH_MS);
        await setMeta(sql, `${c.job}_retry_at`, String(next));
        await updateRow(sql, c, row.id, { state: 'publishing', next_at: next, error: error.message, updated_at: now });
      }
      return;
    }
    if (!existing || existing.status === 'scheduled' || existing.status === 'sending') {
      await updateRow(sql, c, row.id, { state: 'publishing', next_at: now + REFRESH_DELAYS_MS[0], updated_at: now });
      return;
    }
    if (existing.status === 'sent') {
      await updateRow(sql, c, row.id, { state: 'sent', link: existing.link ?? row.link, error: '', updated_at: now });
      return;
    }
  }

  // Too long for the platform: nothing is sent; an edit and a retry send the new text.
  const refusal = c.refuse(post ? [post.text, ...post.parts] : [text]);
  if (refusal) {
    await updateRow(sql, c, row.id, { state: 'failed', error: refusal, updated_at: now });
    return;
  }

  const request = post ? c.post(post.text, post.parts) : c.followUp(text, parentLink);
  // Committed before the request: if the object dies mid-send, the row stays
  // in `sending` and is failed (never resent) on the next run.
  await updateRow(sql, c, row.id, { state: 'sending', text: post ? [post.text, ...post.parts].join('\n\n') : text, updated_at: now });
  mirror(store, c, await readLedger(sql, c));
  await persist();
  const result = await createChannelPost(env, c.network, channel, request);
  const done = Date.now();

  if (result.kind === 'ok') {
    const link = result.link ?? '';
    if (result.status === 'sent') {
      await updateRow(sql, c, row.id, { state: 'sent', buffer_id: result.bufferPostId, link, error: '', updated_at: done });
    } else if (result.status === 'sending' || result.status === 'scheduled') {
      await updateRow(sql, c, row.id, { state: 'publishing', buffer_id: result.bufferPostId, link, error: '', attempts: 0, next_at: done + REFRESH_DELAYS_MS[0], updated_at: done });
    } else {
      await updateRow(sql, c, row.id, {
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
    if (result.retryAfterMs) await setMeta(sql, `${c.job}_retry_at`, String(next));
    await updateRow(sql, c, row.id, delay === null
      ? { state: 'failed', attempts, error: result.message, updated_at: done }
      : { state: 'queued', attempts, next_at: next, error: result.message, updated_at: done });
    return;
  }
  // A refusal can mean the channel was reconnected under a new id: look it up again next time.
  if (result.kind === 'rejected') await setMeta(sql, `${c.job}_channel`, '');
  console.warn(`[${c.job}] delivery failed`, { id: row.id, kind: result.kind, message: result.message });
  await updateRow(sql, c, row.id, { state: 'failed', error: result.message, updated_at: done });
}

function mirror(store: MergeableStore, c: Channel, rows: LedgerRow[]): void {
  store.transaction(() => {
    for (const row of rows) {
      const current = store.getRow(c.table, row.id);
      const next = { state: row.state, kind: row.kind, link: row.link, error: row.error, at: row.updated_at };
      const changed = (Object.keys(next) as Array<keyof typeof next>).some((key) => current[key] !== next[key]);
      if (changed) store.setPartialRow(c.table, row.id, next);
    }
  });
}

/** Recently published posts whose numbers Buffer can report. */
function measurable(rows: LedgerRow[], now: number): LedgerRow[] {
  return rows.filter((row) => row.state === 'sent' && row.buffer_id && now - row.updated_at < METRICS_WINDOW_MS);
}

/** Copy Buffer's numbers for the channel's recent posts into its metrics table. */
async function refreshMetrics(sql: D1Database, c: Channel, store: MergeableStore, env: BufferEnv, rows: LedgerRow[], now: number): Promise<void> {
  // Counted as a look even when the channel is unknown, so it waits its turn instead of retrying every minute.
  await setMeta(sql, `${c.job}_metrics_at`, String(now));
  // A refusal forgets the channel; find it again (as rarely as delivery does) rather than stop the numbers.
  const channel = await channelId(sql, c, env, now);
  const org = channel.kind === 'found' ? await organization(sql, env) : null;
  if (channel.kind !== 'found' || !org) return;
  const result = await fetchChannelMetrics(env, org, channel.id);
  if (result.kind === 'error') {
    if (result.retryAfterMs) await setMeta(sql, `${c.job}_retry_at`, String(now + result.retryAfterMs));
    return;
  }
  const ours = new Map(rows.map((row) => [row.buffer_id, row.id]));
  store.transaction(() => {
    for (const post of result.posts) {
      const id = ours.get(post.bufferPostId);
      if (!id) continue;
      const next: Record<string, number> = { measuredAt: post.updatedAt };
      for (const cell of METRIC_CELLS) next[cell] = post.metrics[cell] ?? -1;
      const current = store.getRow(c.metricsTable, id);
      if (Object.entries(next).some(([cell, value]) => current[cell] !== value)) store.setPartialRow(c.metricsTable, id, next);
    }
  });
}

/** One reconcile-and-deliver pass for a channel. Returns when it next needs to run. */
export async function runChannel(c: Channel, sql: D1Database, store: MergeableStore, env: BufferEnv, now: number, persist: () => Promise<void>): Promise<number> {
  const configured = Boolean(env.BUFFER_API_KEY);
  const msg = messages(c.network);
  let ledger = new Map((await readLedger(sql, c)).map((row) => [row.id, row]));

  await applyCommands(sql, c, store, ledger, now, configured);

  for (const candidate of channelCandidates(c, store.getTable('posts'), store.getTable('replies'), new Set(ledger.keys()))) {
    const { state, error } = initialState(c, candidate, now, configured);
    await insertRow(sql, c, { id: candidate.id, kind: candidate.kind, parent: candidate.parent, state, error, text: candidate.text, updated_at: now });
  }
  for (const row of await readLedger(sql, c)) {
    if (row.state === 'sending' && now - row.updated_at >= SENDING_STALE_MS) {
      await updateRow(sql, c, row.id, { state: 'failed', error: msg.interrupted, updated_at: now });
    }
  }
  // Acknowledge receipt before any external request can hold up this pass.
  mirror(store, c, await readLedger(sql, c));
  await persist();

  const cooldown = async () => Number(await getMeta(sql, `${c.job}_retry_at`) ?? 0);
  const metricsAt = async () => Number(await getMeta(sql, `${c.job}_metrics_at`) ?? 0);
  if (configured && (await cooldown()) <= now) {
    ledger = new Map((await readLedger(sql, c)).map((row) => [row.id, row]));
    const due = [...ledger.values()].filter((row) => row.state === 'queued' && row.next_at <= now);
    if (due.length > 0) {
      const channel = await channelId(sql, c, env, now);
      if (channel.kind === 'none') {
        for (const row of due) await updateRow(sql, c, row.id, { state: 'failed', error: msg.noChannel, updated_at: now });
      } else if (channel.kind === 'later') {
        for (const row of due) await updateRow(sql, c, row.id, { next_at: channel.at, error: msg.lookup, updated_at: now });
      } else {
        for (const row of due.slice(0, MAX_SEND_PER_RUN)) {
          if ((await cooldown()) > Date.now()) break;
          try {
            await deliver(sql, c, store, env, channel.id, row, ledger, Date.now(), persist);
          } finally {
            // One slow/interrupted later delivery must not hide earlier results.
            mirror(store, c, await readLedger(sql, c));
            await persist();
          }
          const updated = (await readLedger(sql, c)).find((r) => r.id === row.id);
          if (updated) ledger.set(row.id, updated);
        }
      }
    }

    const publishing = [...ledger.values()].filter((row) => row.state === 'publishing' && row.next_at <= now).slice(0, MAX_REFRESH_PER_RUN);
    for (const row of publishing) {
      if ((await cooldown()) > Date.now()) break;
      try {
        await refreshPublishing(sql, c, env, row, Date.now());
      } finally {
        mirror(store, c, await readLedger(sql, c));
        await persist();
      }
    }

    const recent = measurable(await readLedger(sql, c), now);
    if (recent.length > 0 && now - (await metricsAt()) >= METRICS_EVERY_MS && (await cooldown()) <= Date.now()) {
      await refreshMetrics(sql, c, store, env, recent, now);
    }
  }

  const rows = await readLedger(sql, c);
  mirror(store, c, rows);
  await persist();

  if (!configured) return Infinity;
  let next = Infinity;
  for (const row of rows) {
    if (row.state === 'queued' || row.state === 'publishing') next = Math.min(next, Math.max(row.next_at, (await cooldown()), now + 1000));
    if (row.state === 'sending') next = Math.min(next, Math.max(now + 1000, row.updated_at + SENDING_STALE_MS));
  }
  if (measurable(rows, now).length > 0) next = Math.min(next, Math.max((await metricsAt()) + METRICS_EVERY_MS, (await cooldown()), now + 1000));
  return next;
}
