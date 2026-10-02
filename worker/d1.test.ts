/// <reference types="node" />
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createMergeableStore } from 'tinybase';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordContent, splitContent, encodeJson, decodeJson } from '../src/lib/sync';
import { databasePaused, dirtyJobs, loadStore, pull, query, saveRecord, saveStore, setMeta } from './d1';
import { runJob } from './jobs';
import { runX, insertLedgerRow, publishedDuplicate } from './delivery/x';
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
    expect(input.metadata.twitter.thread).toEqual([{ text: 'test' }, { text: '第二条' }, { text: '第三条' }]);
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
});
