/// <reference types="node" />
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createMergeableStore } from 'tinybase';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordContent, splitContent, encodeJson, decodeJson } from '../src/lib/sync';
import { CHANNEL_LEDGERS, databasePaused, dirtyJobs, ensureSchema, execute, getMeta, ledgerSql, loadStore, pull, query, saveRecord, saveStore, setMeta } from './d1';
import { runJob } from './jobs';
import { runX, insertLedgerRow, publishedDuplicate } from './delivery/x';
import { runChannel, SUBSTACK, THREADS, type Channel } from './delivery/channel';
import type { Env } from './env';
import { migrateLegacy, type LegacySnapshot } from './migrate';
import { d1Login } from './d1-login';

interface Database {
  prepare(sql: string): { all(...bindings: unknown[]): Record<string, unknown>[]; run(...bindings: unknown[]): { changes: number } };
  exec(sql: string): void;
  close(): void;
}
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new(path: string) => Database };
let sqlite: Database;
let db: D1Database;
function changes(): number { return Number(sqlite.prepare('SELECT total_changes() AS n').all()[0].n); }
function mockD1(): D1Database {
  return {
    prepare: (sql: string) => {
      let bindings: unknown[] = [];
      const execute = () => {
        const before = changes();
        const results = sqlite.prepare(sql).all(...bindings);
        return { results, success: true, meta: { changes: changes() - before } };
      };
      const statement = {
        bind: (...values: unknown[]) => { bindings = values; return statement; },
        all: async () => execute(),
        run: async () => execute(),
        first: async (column?: string) => { const row = execute().results[0]; return column ? row?.[column] ?? null : row ?? null; },
      };
      return statement;
    },
    batch: async (statements: D1PreparedStatement[]) => {
      sqlite.exec('BEGIN');
      try { const results = []; for (const statement of statements) results.push(await statement.all()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  } as unknown as D1Database;
}
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../migrations/0001_diary.sql', import.meta.url), 'utf8'));
  db = mockD1();
});
afterEach(() => { sqlite.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function upload(store: ReturnType<typeof createMergeableStore>) {
  for (const record of splitContent(store.getMergeableContent())) await saveRecord(db, record);
}

function post() { return createMergeableStore().setRow('posts', 'p', { content: 'test', entryType: 'thought', xSync: true, createdAt: new Date().toISOString() }); }
const env = () => ({ DB: db, BUFFER_API_KEY: 'test', BUFFER_CHANNEL_ID: 'test', SPACE_ID: 'test', SESSION_SECRET:'test-session' }) as Env;

describe('D1 incremental CRDT persistence', () => {
  it('keeps a retired database frozen without writing on maintenance checks', async () => {
    expect(await databasePaused(db)).toBe(false);
    await setMeta(db, 'maintenance', '1');
    const before = changes();
    expect(await databasePaused(db)).toBe(true);
    expect(changes()).toBe(before);
    await setMeta(db, 'maintenance', '0');
    expect(await databasePaused(db)).toBe(false);
  });
  it('preserves per-address login limits and expires the lock', async () => {
    const now=Date.now();
    for(let i=0;i<4;i++) expect(await d1Login(db,'one',false,now)).toEqual({result:'wrong'});
    expect(await d1Login(db,'one',false,now)).toMatchObject({result:'locked'});
    expect(await d1Login(db,'one',true,now)).toMatchObject({result:'locked'});
    expect(await d1Login(db,'two',true,now)).toEqual({result:'ok'});
    expect(await d1Login(db,'one',true,now+16*60_000)).toEqual({result:'ok'});
  });
  it('preserves the global login limit across different addresses', async () => {
    const now=Date.now();
    for(let i=0;i<29;i++) expect(await d1Login(db,String(i),false,now)).toEqual({result:'wrong'});
    expect(await d1Login(db,'last',false,now)).toMatchObject({result:'locked'});
    expect(await d1Login(db,'new',true,now)).toMatchObject({result:'locked'});
    expect(await d1Login(db,'new',true,now+61*60_000)).toEqual({result:'ok'});
  });
  it('preserves merge metadata, profile values and deletion tombstones in JSON', async () => {
    const source = post().setValue('displayName', 'journal').setRow('replies', 'r', { content: 'reply' });
    source.delRow('replies', 'r');
    await upload(source);
    const { store } = await loadStore(db);
    expect(store.getContent()).toEqual(source.getContent());
    expect(store.getMergeableContent()).toEqual(source.getMergeableContent());
    const stale = createMergeableStore().setMergeableContent(source.getMergeableContent());
    // Reapplying the exact deleted version never resurrects it.
    stale.applyMergeableChanges(source.getMergeableContent());
    expect(stale.hasRow('replies', 'r')).toBe(false);
  });
  it('writes nothing on replay, reload, polling or empty background saves', async () => {
    const source = post(); await upload(source);
    const before = changes();
    await upload(source);
    const { store, baseline } = await loadStore(db);
    await saveStore(db, store, baseline);
    for (let i=0;i<20;i++) await pull(db, 0);
    expect(changes()).toBe(before);
  });
  it('merges simultaneous edits to different cells without lost updates', async () => {
    const original = post().setCell('posts', 'p', 'isLiked', false);
    await upload(original);
    const left = createMergeableStore('left').setMergeableContent(original.getMergeableContent());
    const right = createMergeableStore('right').setMergeableContent(original.getMergeableContent());
    left.setCell('posts','p','content','edited'); right.setCell('posts','p','isLiked',true);
    await Promise.all([upload(left),upload(right)]);
    const { store } = await loadStore(db);
    expect(store.getRow('posts','p')).toMatchObject({ content:'edited', isLiked:true });
  });
  it('retains tombstones when a previously offline device uploads an old copy', async () => {
    const original = post(); const stale = createMergeableStore().setMergeableContent(original.getMergeableContent());
    await upload(original); original.delRow('posts','p'); await upload(original); await upload(stale);
    expect((await loadStore(db)).store.hasRow('posts','p')).toBe(false);
  });
  it('gives updates a newer cursor even when the record already exists', async () => {
    const source = post(); await upload(source);
    const first = await pull(db,0);
    source.setCell('posts','p','content','updated'); await upload(source);
    const next = await pull(db,first.cursor);
    expect(next.records).toHaveLength(1); expect(next.cursor).toBeGreaterThan(first.cursor);
    expect(createMergeableStore().applyMergeableChanges(recordContent(next.records[0])).getCell('posts','p','content')).toBe('updated');
  });
});

describe('D1 X delivery safety and task leases', () => {
  it('holds an old thread until its explicit send, persists its outcome, and ignores a replay', async () => {
    const createdAt = new Date(Date.now() - 10 * 24 * 3600_000).toISOString();
    const text = '长文'.repeat(2000), part = '第二条'.repeat(500);
    const source = post().setPartialRow('posts', 'p', { content: text, xSync: false, createdAt })
      .setRow('replies', 'a', { postId: 'p', content: part, createdAt, xSync: false, thread: true });
    await upload(source);
    let loaded = await loadStore(db);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { createPost: {
      __typename: 'PostActionSuccess', post: { id: 'buffer', status: 'sent', externalLink: 'https://x.com/test/status/123' },
    } } })));
    await runX(db, loaded.store, env(), Date.now(), () => saveStore(db, loaded.store, loaded.baseline));
    expect(fetch).not.toHaveBeenCalled();
    expect(await query(db, 'SELECT id FROM diary3_x')).toEqual([]);

    source.setCell('replies', 'a', 'xSync', true).setCell('posts', 'p', 'xSync', true).setCell('xposts', 'p', 'command', 'send');
    await upload(source);
    loaded = await loadStore(db);
    await runX(db, loaded.store, env(), Date.now(), () => saveStore(db, loaded.store, loaded.baseline));
    expect(fetch).toHaveBeenCalledTimes(1);
    const input = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).variables.input;
    expect(input.text).toBe(text);
    expect(input.metadata.twitter.thread).toEqual([{ text, assets: [] }, { text: part, assets: [] }]);
    const saved = (await loadStore(db)).store;
    for (const id of ['p', 'a']) expect(saved.getRow('xposts', id)).toMatchObject({ state: 'sent', link: 'https://x.com/test/status/123' });
    expect(saved.getCell('posts', 'p', 'createdAt')).toBe(createdAt);

    loaded.store.setCell('xposts', 'p', 'command', 'send');
    await runX(db, loaded.store, env(), Date.now(), () => saveStore(db, loaded.store, loaded.baseline));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('honors a delayed manual command after a separate batch first hit the archive-age check', async () => {
    const source = post().setCell('posts', 'p', 'createdAt', new Date(Date.now() - 10 * 24 * 3600_000).toISOString());
    await upload(source);
    const loaded = await loadStore(db);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { createPost: {
      __typename: 'PostActionSuccess', post: { id: 'buffer', status: 'sent', externalLink: 'https://x.com/test/status/123' },
    } } })));
    const persist = () => saveStore(db, loaded.store, loaded.baseline);
    await runX(db, loaded.store, env(), Date.now(), persist);
    expect(fetch).not.toHaveBeenCalled();
    expect(loaded.store.getCell('xposts', 'p', 'error')).toContain('3 天');
    loaded.store.setCell('xposts', 'p', 'command', 'send');
    await runX(db, loaded.store, env(), Date.now(), persist);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(loaded.store.getCell('xposts', 'p', 'state')).toBe('sent');
  });

  it.each(['sending', 'publishing', 'sent', 'failed'] as const)('does not restart a known %s delivery for a replayed first-send command', async (state) => {
    await upload(post().setCell('xposts', 'p', 'command', 'send'));
    const now = Date.now();
    await insertLedgerRow(db, { id: 'p', kind: 'post', state, attempts: 1, buffer_id: 'known', next_at: now + 60_000, updated_at: now, error: state === 'failed' ? '结果未知' : '' });
    const loaded = await loadStore(db);
    vi.stubGlobal('fetch', vi.fn());
    await runX(db, loaded.store, env(), now, () => saveStore(db, loaded.store, loaded.baseline));
    expect(fetch).not.toHaveBeenCalled();
    expect(loaded.store.getCell('xposts', 'p', 'state')).toBe(state);
    expect(loaded.store.getCell('xposts', 'p', 'command')).toBe('');
  });

  it('keeps an unconfigured manual send failed without an external request', async () => {
    const source = post().setCell('xposts', 'p', 'command', 'send');
    await upload(source);
    const loaded = await loadStore(db);
    vi.stubGlobal('fetch', vi.fn());
    await runX(db, loaded.store, { ...env(), BUFFER_API_KEY: '' }, Date.now(), () => saveStore(db, loaded.store, loaded.baseline));
    expect(fetch).not.toHaveBeenCalled();
    expect(loaded.store.getCell('xposts', 'p', 'state')).toBe('failed');
    expect(loaded.store.getCell('xposts', 'p', 'error')).toContain('没有配置 Buffer');
  });

  it('submits a long post intact and exposes an actual Buffer rejection instead of falling back to app-only storage', async () => {
    const text = '字'.repeat(15000);
    await upload(post().setCell('posts', 'p', 'content', text));
    const loaded = await loadStore(db);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { createPost: { __typename: 'InvalidInputError', message: '频道验证失败' } } })));
    await runX(db, loaded.store, env(), Date.now(), () => saveStore(db, loaded.store, loaded.baseline));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).variables.input.text).toBe(text);
    expect(loaded.store.getCell('posts', 'p', 'xSync')).toBe(true);
    expect(loaded.store.getRow('xposts', 'p')).toMatchObject({ state: 'failed', error: expect.stringContaining('频道验证失败') });
  });

  it('sends a long quote reply intact through both text and retweet comment', async () => {
    const text = '追加'.repeat(1000);
    await upload(post().setRow('replies', 'q', { postId: 'p', content: text, createdAt: new Date().toISOString(), xSync: true, thread: false }));
    await insertLedgerRow(db, { id: 'p', kind: 'post', state: 'sent', buffer_id: 'known', link: 'https://x.com/test/status/123' });
    const loaded = await loadStore(db);
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { createPost: { __typename: 'PostActionSuccess', post: { id: 'buffer', status: 'sent', externalLink: 'https://x.com/test/status/456' } } } })));
    await runX(db, loaded.store, env(), Date.now(), () => saveStore(db, loaded.store, loaded.baseline));
    expect(fetch).toHaveBeenCalledTimes(1);
    const input = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).variables.input;
    expect(input.text).toBe(text);
    expect(input.metadata.twitter.retweet.comment).toBe(text);
    expect(loaded.store.getRow('xposts', 'q')).toMatchObject({ state: 'sent', link: 'https://x.com/test/status/456' });
  });

  it('reconciles an existing live publication after a duplicate refusal without publishing again', async () => {
    const now=Date.now(); const source=post().setRow('xtweets','123',{text:'test',createdAt:new Date(now).toISOString(),measuredAt:now});
    await upload(source);
    await insertLedgerRow(db,{id:'p',kind:'post',state:'failed',error:'already got this one scheduled; same thing twice'});
    const loaded=await loadStore(db); vi.stubGlobal('fetch',vi.fn());
    await runX(db,loaded.store,env(),now,()=>saveStore(db,loaded.store,loaded.baseline));
    expect(fetch).not.toHaveBeenCalled();
    expect(loaded.store.getRow('xposts','p')).toMatchObject({state:'sent',link:'https://x.com/i/status/123',error:''});
  });
  it('does not reconcile ambiguous, unmeasured or deleted duplicate candidates', () => {
    const now=Date.now(); const row={content:'test',createdAt:new Date(now).toISOString()};
    const tweet={text:'test',createdAt:row.createdAt,measuredAt:now}; const error='same thing twice';
    expect(publishedDuplicate(error,row,{'123':tweet,'456':tweet},now)).toBeNull();
    expect(publishedDuplicate(error,row,{'123':{...tweet,measuredAt:0}},now)).toBeNull();
    expect(publishedDuplicate(error,row,{'123':{...tweet,gone:true}},now)).toBeNull();
    expect(publishedDuplicate('network timeout',row,{'123':tweet},now)).toBeNull();
  });
  it('migrates the complete archive and deduplication ledger once before jobs are enabled', async () => {
    const source = post().setRow('replies','gone',{content:'deleted'}).setValue('displayName','my journal');
    source.delRow('replies','gone');
    const snapshot: LegacySnapshot = {
      content: source.getMergeableContent(),
      x: [{ id:'p',kind:'post',state:'sent',buffer_id:'existing-buffer',link:'https://x.com/test/status/123' }],
      obsidian:[{id:'p',entity:'thought',created_at:'2026-10-01',version:'known-version'}],
      login:[{key:'all',failures:2,window_start:Date.now(),locked_until:0}],
      meta:[{key:'backup_day',value:'2026-10-02'}],
    };
    const exportForMigration=vi.fn(async()=>encodeJson(snapshot));
    const put=vi.fn(async(_key: string, _value: string)=>{});
    const migrationEnv={...env(),SPACES:{idFromName:()=> 'space',get:()=>({exportForMigration})},DATA_KV:{put}} as unknown as Env;
    await migrateLegacy(migrationEnv); await migrateLegacy(migrationEnv);
    expect(exportForMigration).toHaveBeenCalledTimes(1);
    expect((await loadStore(db)).store.getMergeableContent()).toEqual(source.getMergeableContent());
    expect(await query(db,'SELECT buffer_id FROM diary3_x')).toEqual([{buffer_id:'existing-buffer'}]);
    expect(await query(db,'SELECT value FROM diary3_meta WHERE key=?','migration_complete')).toEqual([{value:'1'}]);
    expect(decodeJson<LegacySnapshot>(put.mock.calls[0][1]).content).toEqual(source.getMergeableContent());
    await expect(migrateLegacy({...migrationEnv,SESSION_SECRET:'other-site'})).rejects.toThrow('不匹配');
  });
  it('commits sending before the external request and commits its final link', async () => {
    const source = post(); await upload(source);
    const loaded = await loadStore(db);
    const persist = () => saveStore(db, loaded.store, loaded.baseline);
    vi.stubGlobal('fetch', vi.fn(async () => {
      expect((await query<{state:string}>(db,'SELECT state FROM diary3_x WHERE id=?','p'))[0].state).toBe('sending');
      expect((await loadStore(db)).store.getCell('xposts','p','state')).toBe('sending');
      return new Response(JSON.stringify({data:{createPost:{__typename:'PostActionSuccess',post:{id:'buffer',status:'sent',externalLink:'https://x.com/test/status/123'}}}}),{status:200});
    }));
    await runX(db,loaded.store,env(),Date.now(),persist);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await query<{state:string}>(db,'SELECT state FROM diary3_x WHERE id=?','p'))[0].state).toBe('sent');
  });
  it('does not resend an interrupted publication or a migrated sent post', async () => {
    const source = post().setRow('posts','old',{ content:'old', entryType:'thought', xSync:true, createdAt:new Date().toISOString() });
    await upload(source);
    await insertLedgerRow(db,{id:'p',kind:'post',state:'sending',updated_at:Date.now()-120_000});
    await insertLedgerRow(db,{id:'old',kind:'post',state:'sent',buffer_id:'known',link:'https://x.com/test/status/123'});
    vi.stubGlobal('fetch',vi.fn());
    const loaded=await loadStore(db); await runX(db,loaded.store,env(),Date.now(),()=>saveStore(db,loaded.store,loaded.baseline));
    expect(fetch).not.toHaveBeenCalled();
    expect(loaded.store.getCell('xposts','p','state')).toBe('failed');
    expect(loaded.store.getCell('xposts','old','state')).toBe('sent');
  });
  it('allows one concurrent job owner and preserves work arriving during a run', async () => {
    await upload(post());
    sqlite.exec("INSERT INTO diary3_jobs(name) VALUES('x'),('obsidian')");
    vi.stubGlobal('fetch',vi.fn(async()=> {
      await dirtyJobs(db);
      return new Response(JSON.stringify({data:{createPost:{__typename:'PostActionSuccess',post:{id:'buffer',status:'sent',externalLink:'https://x.com/test/status/123'}}}}));
    }));
    await Promise.all([runJob(env(),'x'),runJob(env(),'x')]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await query<{next_at:number}>(db,"SELECT next_at FROM diary3_jobs WHERE name='x'"))[0].next_at).toBe(0);
  });

  it('sends a post and the parts written with it as one X thread, and the parts share its outcome', async () => {
    const at = Date.now();
    const source = post()
      .setRow('replies', 'b', { postId: 'p', content: '第三条', createdAt: new Date(at + 2).toISOString(), xSync: true, thread: true })
      .setRow('replies', 'a', { postId: 'p', content: '第二条', createdAt: new Date(at + 1).toISOString(), xSync: true, thread: true });
    await upload(source);
    const loaded = await loadStore(db);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: { createPost: {
      __typename: 'PostActionSuccess', post: { id: 'buffer', status: 'sent', externalLink: 'https://x.com/test/status/123' },
    } } }))));
    await runX(db, loaded.store, env(), Date.now(), () => saveStore(db, loaded.store, loaded.baseline));
    expect(fetch).toHaveBeenCalledTimes(1);
    const input = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).variables.input;
    expect(input.metadata.twitter.thread).toEqual([{ text: 'test', assets: [] }, { text: '第二条', assets: [] }, { text: '第三条', assets: [] }]);
    for (const id of ['p', 'a', 'b']) expect(loaded.store.getRow('xposts', id)).toMatchObject({ state: 'sent', link: 'https://x.com/test/status/123' });
  });
  it('fails the parts of a thread with their post instead of sending them alone', async () => {
    const source = post().setRow('replies', 'a', { postId: 'p', content: '第二条', createdAt: new Date(Date.now() + 1).toISOString(), xSync: true, thread: true });
    await upload(source);
    const loaded = await loadStore(db);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: { createPost: { __typename: 'InvalidInputError', message: 'bad' } } }))));
    await runX(db, loaded.store, env(), Date.now(), () => saveStore(db, loaded.store, loaded.baseline));
    await runX(db, loaded.store, env(), Date.now(), () => saveStore(db, loaded.store, loaded.baseline));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(loaded.store.getCell('xposts', 'p', 'state')).toBe('failed');
    expect(loaded.store.getRow('xposts', 'a')).toMatchObject({ state: 'failed', error: '这条和原帖作为串推一起发布；原帖没有发出，请重试原帖' });
  });
  it.each(['p', 'a'])('retries the whole failed thread from %s and clears every part\'s failure', async (retryId) => {
    const source = post().setRow('replies', 'a', { postId: 'p', content: '第二条', createdAt: new Date(Date.now() + 1).toISOString(), xSync: true, thread: true });
    await upload(source);
    const loaded = await loadStore(db);
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json({ data: { createPost: { __typename: 'InvalidInputError', message: 'bad' } } }))
      .mockResolvedValueOnce(Response.json({ data: { createPost: { __typename: 'PostActionSuccess', post: { id: 'buffer', status: 'sent', externalLink: 'https://x.com/test/status/123' } } } }));
    vi.stubGlobal('fetch', request);
    const persist = () => saveStore(db, loaded.store, loaded.baseline);
    await runX(db, loaded.store, env(), Date.now(), persist);
    expect(loaded.store.getCell('xposts', 'a', 'state')).toBe('failed');
    loaded.store.setCell('xposts', retryId, 'command', 'retry');
    await runX(db, loaded.store, env(), Date.now(), persist);
    expect(request).toHaveBeenCalledTimes(2);
    for (const id of ['p', 'a']) expect(loaded.store.getRow('xposts', id)).toMatchObject({ state: 'sent', error: '', link: 'https://x.com/test/status/123' });
    expect(loaded.store.getCell('xposts', retryId, 'command')).toBe('');
    await runX(db, loaded.store, env(), Date.now(), persist);
    expect(request).toHaveBeenCalledTimes(2);
  });
});

const NOTE = 'https://substack.com/@me/note/c-1';
const THREAD = 'https://www.threads.net/@me/post/abc';
const CONNECTED = [
  { id: 'x-channel', service: 'twitter', isLocked: false, isDisconnected: false },
  { id: 'notes', service: 'substack', isLocked: false, isDisconnected: false },
  { id: 'threads-channel', service: 'threads', isLocked: false, isDisconnected: false },
];
/** A Buffer stand-in answering the organization, channel, publish and metrics queries. */
function buffer(options: {
  channels?: unknown[];
  createPost?: (input: { channelId: string }) => Response | Promise<Response> | undefined;
  metrics?: unknown[];
} = {}) {
  return vi.fn(async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const query = String(body.query);
    if (query.includes('organizations')) return Response.json({ data: { account: { organizations: [{ id: 'org' }] } } });
    if (query.includes('metricsUpdatedAt')) return Response.json({ data: { posts: { edges: options.metrics ?? [] } } });
    if (query.includes('channels')) return Response.json({ data: { channels: options.channels ?? CONNECTED } });
    if (query.includes('createPost')) {
      const input = body.variables.input;
      return await options.createPost?.(input) ?? Response.json({ data: { createPost: {
        __typename: 'PostActionSuccess', post: { id: `buffer-${input.channelId}`, status: 'sent', externalLink: input.channelId === 'threads-channel' ? THREAD : NOTE },
      } } });
    }
    throw new Error(`unexpected Buffer query: ${query}`);
  });
}
const published = (fetchMock: ReturnType<typeof buffer>) => fetchMock.mock.calls
  .map(([, init]) => JSON.parse(String(init?.body)))
  .filter((body) => String(body.query).includes('createPost'))
  .map((body) => body.variables.input);

describe('D1 Substack Notes delivery', () => {
  function notePost(createdAt = new Date().toISOString()) {
    return createMergeableStore().setRow('posts', 'p', { content: '第一段', entryType: 'thought', xSync: true, substackSync: true, createdAt });
  }
  async function pass(store = (async () => (await loadStore(db)))()) {
    const loaded = await store;
    const next = await runChannel(SUBSTACK, db, loaded.store, env(), Date.now(), () => saveStore(db, loaded.store, loaded.baseline));
    return { ...loaded, next };
  }

  it('publishes a post and the parts written with it as one Note to the connected channel, once', async () => {
    const at = Date.now();
    await upload(notePost(new Date(at).toISOString())
      .setRow('replies', 'b', { postId: 'p', content: '第三段', createdAt: new Date(at + 2).toISOString(), xSync: true, substackSync: true, thread: true })
      .setRow('replies', 'a', { postId: 'p', content: '第二段', createdAt: new Date(at + 1).toISOString(), xSync: true, substackSync: true, thread: true }));
    const fetchMock = buffer();
    vi.stubGlobal('fetch', fetchMock);
    const { store } = await pass();
    expect(published(fetchMock)).toEqual([{
      channelId: 'notes', text: '第一段\n\n第二段\n\n第三段', schedulingType: 'automatic', mode: 'shareNow', assets: [], needsApproval: false,
    }]);
    expect(store.getRow('substackposts', 'p')).toMatchObject({ state: 'sent', kind: 'post', link: NOTE, error: '' });
    expect(store.hasRow('substackposts', 'a')).toBe(false);
    expect(await getMeta(db, 'substack_channel')).toBe('notes');

    const calls = fetchMock.mock.calls.length;
    await pass();
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    expect((await loadStore(db)).store.getCell('substackposts', 'p', 'state')).toBe('sent');
  });

  it('asks nothing of Buffer when no post asked for Substack', async () => {
    await upload(post());
    vi.stubGlobal('fetch', vi.fn());
    const { next } = await pass();
    expect(fetch).not.toHaveBeenCalled();
    expect(next).toBe(Infinity);
    expect(await query(db, 'SELECT id FROM diary3_substack')).toEqual([]);
  });

  it('sends a 追加 after its post, as a Note with a link card to the post\'s Note', async () => {
    await upload(notePost().setRow('replies', 'q', { postId: 'p', content: '后来的追加', createdAt: new Date(Date.now() + 1).toISOString(), xSync: true, substackSync: true, thread: false }));
    const fetchMock = buffer();
    vi.stubGlobal('fetch', fetchMock);
    await pass();
    expect(published(fetchMock).map((input) => input.text)).toEqual(['第一段']);
    const { store } = await pass();
    const reply = published(fetchMock)[1];
    expect(reply.text).toBe('后来的追加');
    expect(reply.metadata).toEqual({ substack: { linkAttachment: { url: NOTE } } });
    expect(store.getRow('substackposts', 'q')).toMatchObject({ state: 'sent', kind: 'reply' });
  });

  it('fails a 追加 whose post did not go out, instead of sending it on its own', async () => {
    await upload(notePost().setRow('replies', 'q', { postId: 'p', content: '追加', createdAt: new Date(Date.now() + 1).toISOString(), xSync: true, substackSync: true, thread: false }));
    const fetchMock = buffer({ createPost: () => Response.json({ data: { createPost: { __typename: 'InvalidInputError', message: 'bad' } } }) });
    vi.stubGlobal('fetch', fetchMock);
    await pass();
    const { store } = await pass();
    expect(published(fetchMock)).toHaveLength(1);
    expect(store.getRow('substackposts', 'p')).toMatchObject({ state: 'failed', error: expect.stringContaining('bad') });
    expect(store.getRow('substackposts', 'q')).toMatchObject({ state: 'failed', error: expect.stringContaining('原帖还没有发到 Substack') });
  });

  it('explains a missing Substack channel, asks Buffer again only on retry, then publishes', async () => {
    await upload(notePost());
    const fetchMock = buffer({ channels: [CONNECTED[0], CONNECTED[2]] });
    vi.stubGlobal('fetch', fetchMock);
    let { store, baseline } = await pass();
    expect(published(fetchMock)).toEqual([]);
    expect(store.getRow('substackposts', 'p')).toMatchObject({ state: 'failed', error: expect.stringContaining('还没有连接可用的 Substack 频道') });
    const lookups = fetchMock.mock.calls.length;

    await upload(createMergeableStore().setRow('posts', 'second', { content: '第二条', entryType: 'thought', xSync: true, substackSync: true, createdAt: new Date().toISOString() }));
    ({ store } = await pass());
    expect(fetchMock).toHaveBeenCalledTimes(lookups);
    expect(store.getCell('substackposts', 'second', 'state')).toBe('failed');

    const connected = buffer();
    vi.stubGlobal('fetch', connected);
    ({ store, baseline } = await loadStore(db));
    store.setCell('substackposts', 'p', 'command', 'retry');
    await saveStore(db, store, baseline);
    ({ store } = await pass());
    expect(published(connected)).toHaveLength(1);
    expect(store.getRow('substackposts', 'p')).toMatchObject({ state: 'sent', link: NOTE, command: '' });
  });

  it('holds an old post until an explicit send and then publishes it once', async () => {
    await upload(notePost(new Date(Date.now() - 10 * 24 * 3600_000).toISOString()));
    const fetchMock = buffer();
    vi.stubGlobal('fetch', fetchMock);
    let { store, baseline } = await pass();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(store.getCell('substackposts', 'p', 'error')).toContain('3 天');
    store.setCell('substackposts', 'p', 'command', 'send');
    await saveStore(db, store, baseline);
    ({ store, baseline } = await pass());
    expect(published(fetchMock)).toHaveLength(1);
    expect(store.getCell('substackposts', 'p', 'state')).toBe('sent');
    store.setCell('substackposts', 'p', 'command', 'send');
    await saveStore(db, store, baseline);
    await pass();
    expect(published(fetchMock)).toHaveLength(1);
  });

  it('commits sending before the request and never resends an interrupted Note', async () => {
    await upload(notePost());
    let duringRequest: unknown[] = [];
    vi.stubGlobal('fetch', buffer({ createPost: async () => {
      duringRequest = [
        (await query<{ state: string }>(db, 'SELECT state FROM diary3_substack WHERE id=?', 'p'))[0].state,
        (await loadStore(db)).store.getCell('substackposts', 'p', 'state'),
      ];
      return new Response('upstream died', { status: 502 });
    } }));
    let { store } = await pass();
    expect(duringRequest).toEqual(['sending', 'sending']);
    expect(store.getRow('substackposts', 'p')).toMatchObject({ state: 'failed', error: expect.stringContaining('请先到 Substack 确认') });

    await execute(db, `UPDATE diary3_substack SET state='sending', updated_at=? WHERE id='p'`, Date.now() - 120_000);
    const fetchMock = buffer();
    vi.stubGlobal('fetch', fetchMock);
    ({ store } = await pass());
    expect(published(fetchMock)).toEqual([]);
    expect(store.getRow('substackposts', 'p')).toMatchObject({ state: 'failed', error: expect.stringContaining('中断') });
  });

  it('waits out a rate limit for every Buffer request before trying again', async () => {
    await upload(notePost());
    const fetchMock = buffer({ createPost: () => Response.json({}, { status: 429, headers: { 'retry-after': '900' } }) });
    vi.stubGlobal('fetch', fetchMock);
    const { store, next } = await pass();
    expect(store.getRow('substackposts', 'p')).toMatchObject({ state: 'queued', error: expect.stringContaining('过于频繁') });
    expect(Number(await getMeta(db, 'substack_retry_at'))).toBeGreaterThan(Date.now() + 800_000);
    expect(await getMeta(db, 'buffer_retry_at')).toBeNull();
    expect(next).toBeGreaterThan(Date.now() + 800_000);
    const calls = fetchMock.mock.calls.length;
    await execute(db, `UPDATE diary3_substack SET next_at=0 WHERE id='p'`);
    await pass();
    expect(fetchMock).toHaveBeenCalledTimes(calls);
  });

  it('adds its ledger and job to a database migrated before it, and runs as its own job', async () => {
    sqlite.exec('DROP TABLE diary3_substack; DROP TABLE diary3_threads');
    await ensureSchema(db);
    await ensureSchema(db);
    expect(await query(db, "SELECT name FROM diary3_jobs WHERE name IN ('substack','threads') ORDER BY name")).toEqual([{ name: 'substack' }, { name: 'threads' }]);
    const schema = readFileSync(new URL('../migrations/0001_diary.sql', import.meta.url), 'utf8');
    for (const [table] of CHANNEL_LEDGERS) expect(schema).toContain(`${ledgerSql(table)};`);
    expect(CHANNEL_LEDGERS.map(([table, job]) => [table, job])).toEqual([SUBSTACK, THREADS].map((c) => [c.ledger, c.job]));
    await upload(notePost().setValue('substackSyncEnabled', true));
    const fetchMock = buffer();
    vi.stubGlobal('fetch', fetchMock);
    await runJob(env(), 'substack');
    expect(published(fetchMock)).toHaveLength(1);
    expect((await loadStore(db)).store.getCell('substackposts', 'p', 'state')).toBe('sent');
  });

  it('does not read the diary for an edit while Substack was never switched on', async () => {
    await ensureSchema(db);
    await upload(post());
    let loads = 0;
    const counting = { ...db, prepare: (sql: string) => {
      if (sql.startsWith('SELECT key,data FROM diary3_records')) loads++;
      return db.prepare(sql);
    } } as D1Database;
    vi.stubGlobal('fetch', vi.fn());
    await runJob({ ...env(), DB: counting }, 'substack');
    expect(loads).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    expect((await query<{ next_at: number }>(db, "SELECT next_at FROM diary3_jobs WHERE name='substack'"))[0].next_at).toBeGreaterThan(Date.now() + 1e12);

    await upload(createMergeableStore().setValue('substackSyncEnabled', false));
    await dirtyJobs(db);
    await runJob({ ...env(), DB: counting }, 'substack');
    expect(loads).toBe(1);
  });
});

describe('D1 Threads delivery and independent platforms', () => {
  async function passFor(channel: Channel) {
    const loaded = await loadStore(db);
    const next = await runChannel(channel, db, loaded.store, env(), Date.now(), () => saveStore(db, loaded.store, loaded.baseline));
    return { ...loaded, next };
  }
  const at = (offset = 0) => new Date(Date.now() + offset).toISOString();
  const metricsCalls = (fetchMock: ReturnType<typeof buffer>) => fetchMock.mock.calls
    .filter(([, init]) => String(JSON.parse(String(init?.body)).query).includes('metricsUpdatedAt')).length;

  it('sends a post and the parts written with it as one Threads thread', async () => {
    await upload(createMergeableStore()
      .setRow('posts', 'p', { content: '第一条', entryType: 'thought', threadsSync: true, createdAt: at() })
      .setRow('replies', 'b', { postId: 'p', content: '第三条', createdAt: at(2), threadsSync: true, thread: true })
      .setRow('replies', 'a', { postId: 'p', content: '第二条', createdAt: at(1), threadsSync: true, thread: true }));
    const fetchMock = buffer();
    vi.stubGlobal('fetch', fetchMock);
    const { store } = await passFor(THREADS);
    expect(published(fetchMock)).toEqual([{
      channelId: 'threads-channel', text: '第一条', schedulingType: 'automatic', mode: 'shareNow', assets: [], needsApproval: false,
      metadata: { threads: { thread: [{ text: '第一条', assets: [] }, { text: '第二条', assets: [] }, { text: '第三条', assets: [] }] } },
    }]);
    expect(store.getRow('threadsposts', 'p')).toMatchObject({ state: 'sent', link: THREAD });
    expect(store.hasRow('threadsposts', 'a')).toBe(false);
    expect(await getMeta(db, 'threads_channel')).toBe('threads-channel');
  });

  it('sends a 追加 after its post with a link card to the post on Threads', async () => {
    await upload(createMergeableStore()
      .setRow('posts', 'p', { content: '原帖', entryType: 'thought', threadsSync: true, createdAt: at() })
      .setRow('replies', 'q', { postId: 'p', content: '追加', createdAt: at(1), threadsSync: true, thread: false }));
    const fetchMock = buffer();
    vi.stubGlobal('fetch', fetchMock);
    await passFor(THREADS);
    const { store } = await passFor(THREADS);
    expect(published(fetchMock)[1]).toMatchObject({ text: '追加', metadata: { threads: { linkAttachment: { url: THREAD } } } });
    expect(store.getRow('threadsposts', 'q')).toMatchObject({ state: 'sent', kind: 'reply' });
  });

  it('keeps each platform to the posts that chose it, and one platform\'s trouble away from the others', async () => {
    await upload(createMergeableStore()
      .setRow('posts', 's', { content: '只发 Substack', entryType: 'thought', substackSync: true, createdAt: at() })
      .setRow('posts', 't', { content: '只发 Threads', entryType: 'thought', threadsSync: true, createdAt: at() })
      .setRow('posts', 'x', { content: '只发 X', entryType: 'thought', xSync: true, createdAt: at() }));
    // Substack is not connected in Buffer; Threads is.
    const fetchMock = buffer({ channels: [CONNECTED[0], CONNECTED[2]] });
    vi.stubGlobal('fetch', fetchMock);
    let { store } = await passFor(SUBSTACK);
    expect(store.getRow('substackposts', 's')).toMatchObject({ state: 'failed', error: expect.stringContaining('Substack 频道') });
    expect(store.getRowIds('substackposts')).toEqual(['s']);
    ({ store } = await passFor(THREADS));
    expect(published(fetchMock).map((input) => input.text)).toEqual(['只发 Threads']);
    expect(store.getRowIds('threadsposts')).toEqual(['t']);
    expect(store.getCell('threadsposts', 't', 'state')).toBe('sent');
    expect(await query(db, 'SELECT id FROM diary3_x')).toEqual([]);
  });

  it('backs off one platform for a rate limit without holding up another', async () => {
    await upload(createMergeableStore()
      .setRow('posts', 's', { content: 'Substack', entryType: 'thought', substackSync: true, createdAt: at() })
      .setRow('posts', 't', { content: 'Threads', entryType: 'thought', threadsSync: true, createdAt: at() }));
    vi.stubGlobal('fetch', buffer({ createPost: (input) => input.channelId === 'notes' ? Response.json({}, { status: 429, headers: { 'retry-after': '900' } }) : undefined }));
    let { store } = await passFor(SUBSTACK);
    expect(store.getCell('substackposts', 's', 'state')).toBe('queued');
    expect(Number(await getMeta(db, 'substack_retry_at'))).toBeGreaterThan(Date.now());
    ({ store } = await passFor(THREADS));
    expect(store.getCell('threadsposts', 't', 'state')).toBe('sent');
    expect(await getMeta(db, 'threads_retry_at')).toBeNull();
  });

  it('copies Buffer\'s numbers for published posts into the platform\'s own table, at most every 6 hours', async () => {
    await upload(createMergeableStore().setRow('posts', 't', { content: 'Threads', entryType: 'thought', threadsSync: true, createdAt: at() }));
    const updated = '2026-10-06T08:00:00.000Z';
    const fetchMock = buffer({ metrics: [
      { node: { id: 'buffer-threads-channel', metrics: [{ type: 'views', value: 120 }, { type: 'reactions', value: 4 }, { type: 'quotes', value: 1 }], metricsUpdatedAt: updated } },
      { node: { id: 'someone-elses', metrics: [{ type: 'views', value: 9 }], metricsUpdatedAt: updated } },
    ] });
    vi.stubGlobal('fetch', fetchMock);
    const first = await passFor(THREADS);
    expect(first.store.getRow('threadsmetrics', 't')).toEqual({
      views: 120, impressions: -1, reactions: 4, comments: -1, reposts: -1, quotes: 1, shares: -1,
      freeSubscriptions: -1, paidSubscriptions: -1, measuredAt: Date.parse(updated),
    });
    expect(first.store.getRowIds('threadsmetrics')).toEqual(['t']);
    expect(first.store.hasTable('substackmetrics')).toBe(false);
    expect(first.next).toBeLessThanOrEqual(Date.now() + 6 * 3600_000);
    expect(metricsCalls(fetchMock)).toBe(1);

    await passFor(THREADS);
    expect(metricsCalls(fetchMock)).toBe(1);
    await setMeta(db, 'threads_metrics_at', String(Date.now() - 7 * 3600_000));
    await passFor(THREADS);
    expect(metricsCalls(fetchMock)).toBe(2);
  });

  it('lets an edit skip a platform never switched on while another is in use', async () => {
    await ensureSchema(db);
    await upload(post().setValue('substackSyncEnabled', true));
    let loads = 0;
    const counting = { ...db, prepare: (sql: string) => {
      if (sql.startsWith('SELECT key,data FROM diary3_records')) loads++;
      return db.prepare(sql);
    } } as D1Database;
    vi.stubGlobal('fetch', vi.fn());
    await runJob({ ...env(), DB: counting }, 'threads');
    expect(loads).toBe(0);
    await runJob({ ...env(), DB: counting }, 'substack');
    expect(loads).toBe(1);
  });
});
