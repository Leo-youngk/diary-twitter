import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMergeableStore, type MergeableStore } from 'tinybase';
import { mergeRecord, recordContent, splitContent, type SyncRecord } from '@/lib/sync';

const auth = vi.hoisted(() => ({ signOut: vi.fn(), token: 'test-token' }));
const data = vi.hoisted(() => ({ store: null as MergeableStore | null }));
const images = vi.hoisted(() => ({ flush: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/data/store', () => ({ get store() { return data.store; } }));
vi.mock('@/data/auth', () => ({ getToken: () => auth.token, deviceName: () => 'test device', onTokenChange: () => () => {}, signOut: auth.signOut }));
vi.mock('@/data/blobs', () => ({ flushUploads: images.flush }));
vi.mock('react', () => ({ useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot() }));
let page: EventTarget & { visibilityState: string };
let connection: typeof import('../connection');
let local: MergeableStore;
let remote: Map<string, Required<SyncRecord>>;
let revision: number;
let fetchMock: ReturnType<typeof vi.fn>;
// Unanswered by default, so the sync after a look at X stays out of the other tests.
let xCheckStatus = 503;
function respond(options: RequestInit) {
  const body = JSON.parse(String(options.body)) as { records: SyncRecord[]; cursor: number };
  for (const record of body.records) {
    const data = mergeRecord(remote.get(record.key)?.data ?? null, record.data);
    if (remote.get(record.key)?.data !== data) remote.set(record.key, { key: record.key, data, revision: ++revision });
  }
  const records = [...remote.values()].filter(record => record.revision > body.cursor).sort((a,b)=>a.revision-b.revision);
  return Response.json({ records, cursor: records.at(-1)?.revision ?? body.cursor, more:false });
}
const syncCalls = () => fetchMock.mock.calls.filter(([url]) => url === '/api/sync');
async function remoteStore() {
  const store = createMergeableStore(); for (const record of remote.values()) store.applyMergeableChanges(recordContent(record)); return store;
}
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); vi.clearAllMocks();
  page = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('document',page); vi.stubGlobal('window',new EventTarget());
  vi.stubGlobal('navigator',{onLine:true}); vi.stubGlobal('__BUILD_ID__','test build');
  auth.token='test-token'; remote=new Map(); revision=0; xCheckStatus=503;
  fetchMock=vi.fn(async (url:unknown, options:RequestInit)=>url==='/api/x/check'?new Response(null,{status:xCheckStatus}):respond(options)); vi.stubGlobal('fetch',fetchMock);
  local=createMergeableStore(); data.store=local;
  connection=await import('../connection');
});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();});

describe('HTTP offline synchronization',()=>{
  it('receives another device edit within two seconds while idle', async () => {
    connection.startConnection(); await vi.advanceTimersByTimeAsync(0);
    const source = createMergeableStore().setRow('posts', 'other', { content: 'updated on mobile' });
    for (const record of splitContent(source.getMergeableContent())) remote.set(record.key, { ...record, revision: ++revision });
    await vi.advanceTimersByTimeAsync(2000);
    expect(local.getCell('posts', 'other', 'content')).toBe('updated on mobile');
  });

  it('does not reserialize the whole outbox during unchanged idle polls', async () => {
    local.setRow('posts', 'p', { content: 'saved' });
    const format = await import('@/lib/sync');
    const split = vi.spyOn(format, 'splitContent');
    connection.startConnection(); await vi.advanceTimersByTimeAsync(0);
    split.mockClear();
    await vi.advanceTimersByTimeAsync(6000);
    expect(split).not.toHaveBeenCalled();
    expect(syncCalls().slice(1).every(([, options]) => JSON.parse(options.body).records.length === 0)).toBe(true);
    split.mockRestore();
  });

  it('acknowledges newer remote clocks even when visible text did not change', async () => {
    local.setRow('posts', 'p', { content: 'same text' });
    connection.startConnection(); await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1);
    const source = createMergeableStore().setRow('posts', 'p', { content: 'same text' });
    for (const record of splitContent(source.getMergeableContent())) remote.set(record.key, { ...record, revision: ++revision });
    await vi.advanceTimersByTimeAsync(1999);
    expect(connection.rowIsSynced('posts', 'p')).toBe(true);
  });

  it('times out a stalled response body and retries the unacknowledged edit', async () => {
    local.setRow('posts', 'p', { content: 'still in the outbox' });
    fetchMock.mockImplementationOnce(async (_url: unknown, options: RequestInit) => ({
      ok: true, status: 200,
      json: () => new Promise((_resolve, reject) => options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))),
    }));
    connection.startConnection(); await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(connection.useConnection().state).toBe('offline');
    expect(connection.rowIsSynced('posts', 'p')).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect((await remoteStore()).getCell('posts', 'p', 'content')).toBe('still in the outbox');
  });

  it('abandons a suspended request on returning instead of waiting for its timeout', async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce((_url: unknown, options: RequestInit) => {
      signal = options.signal as AbortSignal;
      return new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
    });
    connection.startConnection(); await vi.advanceTimersByTimeAsync(0);
    page.visibilityState = 'hidden'; page.dispatchEvent(new Event('visibilitychange'));
    const source = createMergeableStore().setRow('posts', 'other', { content: 'while phone slept' });
    for (const record of splitContent(source.getMergeableContent())) remote.set(record.key, { ...record, revision: ++revision });
    page.visibilityState = 'visible'; page.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(signal?.aborted).toBe(true);
    expect(local.getCell('posts', 'other', 'content')).toBe('while phone slept');
    expect(connection.useConnection().state).toBe('online');
  });

  it('retains offline edits and retries an unavailable server without reporting success',async()=>{
    local.setRow('posts','p',{content:'offline draft'});
    fetchMock.mockResolvedValueOnce(Response.json({error:'unavailable'},{status:503}));
    connection.startConnection(); await vi.advanceTimersByTimeAsync(0);
    expect(connection.useConnection()).toMatchObject({state:'offline',syncedAt:null});
    expect(local.getCell('posts','p','content')).toBe('offline draft');
    expect(connection.rowIsSynced('posts','p')).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(connection.useConnection().state).toBe('online');
    expect((await remoteStore()).getCell('posts','p','content')).toBe('offline draft');
    expect(connection.rowIsSynced('posts','p')).toBe(true);
  });
  it('acknowledges each exact row version rather than the last successful connection',async()=>{
    connection.startConnection(); await vi.advanceTimersByTimeAsync(0);
    expect(connection.useConnection().state).toBe('online');
    local.setRow('posts','new',{content:'new post'});
    expect(connection.rowIsSynced('posts','new')).toBe(false);
    await vi.advanceTimersByTimeAsync(150);
    expect(connection.rowIsSynced('posts','new')).toBe(true);
    local.setCell('posts','new','content','edited');
    expect(connection.rowIsSynced('posts','new')).toBe(false);
    await vi.advanceTimersByTimeAsync(150);
    expect(connection.rowIsSynced('posts','new')).toBe(true);
  });
  it('keeps edits made while a request is in flight in the outbox',async()=>{
    local.setRow('posts','p',{content:'first'});
    fetchMock.mockImplementationOnce(async (_url:unknown, options:RequestInit)=>{
      const response=respond(options); local.setCell('posts','p','content','second'); return response;
    });
    connection.startConnection(); await vi.advanceTimersByTimeAsync(0);
    expect((await remoteStore()).getCell('posts','p','content')).toBe('second');
    expect(connection.useConnection().state).toBe('online');
    expect(syncCalls()).toHaveLength(2);
  });
  it('does not reupload unchanged records during idle polling',async()=>{
    local.setRow('posts','p',{content:'saved'});
    connection.startConnection(); await vi.advanceTimersByTimeAsync(0); await vi.advanceTimersByTimeAsync(2000);
    expect(syncCalls()).toHaveLength(2);
    expect(JSON.parse(syncCalls()[1][1].body).records).toEqual([]);
  });
  it('polls promptly while a new X post is still awaiting its server delivery row',async()=>{
    local.setRow('posts','p',{content:'new',entryType:'thought',xSync:true,createdAt:new Date().toISOString()});
    connection.startConnection(); await vi.advanceTimersByTimeAsync(0); await vi.advanceTimersByTimeAsync(2000);
    expect(syncCalls()).toHaveLength(2);
  });
  it('catches up remote edits when returning from the background',async()=>{
    connection.startConnection(); await vi.advanceTimersByTimeAsync(0);
    page.visibilityState='hidden'; page.dispatchEvent(new Event('visibilitychange'));
    const source=createMergeableStore().setRow('posts','new',{content:'other device'});
    for(const record of splitContent(source.getMergeableContent())) remote.set(record.key,{...record,revision:++revision});
    await vi.advanceTimersByTimeAsync(1000);
    page.visibilityState='visible';page.dispatchEvent(new Event('visibilitychange'));await vi.advanceTimersByTimeAsync(0);
    expect(local.getCell('posts','new','content')).toBe('other device');
  });
  it('only signs out when the server explicitly rejects authentication',async()=>{
    fetchMock.mockResolvedValueOnce(Response.json({}, {status:401}));
    connection.startConnection(); await vi.advanceTimersByTimeAsync(0);
    expect(auth.signOut).toHaveBeenCalledOnce(); expect(connection.useConnection().state).toBe('offline');
  });
  it('uploads commands without granting devices control of delivery status',async()=>{
    local.setRow('xposts','p',{state:'sent',link:'https://x.com/test/status/123',command:'retry'});
    local.setRow('substackposts','p',{state:'failed',error:'没有频道',command:'retry'});
    local.setRow('substackposts','idle',{state:'sent',link:'https://substack.com/@me/note/c-1'});
    local.setRow('threadsposts','p',{state:'failed',error:'没有频道',command:'dismiss'});
    local.setRow('threadsmetrics','p',{views:99999});
    connection.startConnection(); await vi.advanceTimersByTimeAsync(0);
    const server=await remoteStore();
    expect(server.getRow('xposts','p')).toEqual({command:'retry'});
    expect(server.getRow('substackposts','p')).toEqual({command:'retry'});
    expect(server.hasRow('substackposts','idle')).toBe(false);
    expect(server.getRow('threadsposts','p')).toEqual({command:'dismiss'});
    expect(server.hasTable('threadsmetrics')).toBe(false);
  });
  it('syncs classifications, reviewed replies and experiments while keeping observations server-owned', async () => {
    local.setRow('xlabels', '123', { topic: 'AI / 产品实践', reviewedReplies: 2, reviewedAt: Date.now() });
    local.setRow('xexperiments', 'experiment', { dimension: 'topic', a: 'AI / 产品实践', b: '读书 / 思考', startedAt: Date.now(), endedAt: 0 });
    local.setRow('xmetrics', '123-h24', { tweetId: '123', stage: 'h24', views: 99999 });
    local.setRow('xtweets', '123', { views: 99999 });
    connection.startConnection(); await vi.advanceTimersByTimeAsync(0);
    const server = await remoteStore();
    expect(server.getRow('xlabels', '123')).toEqual(local.getRow('xlabels', '123'));
    expect(server.getRow('xexperiments', 'experiment')).toEqual(local.getRow('xexperiments', 'experiment'));
    expect(server.hasTable('xmetrics')).toBe(false);
    expect(server.hasTable('xtweets')).toBe(false);
    // The same record arrives on another device, including a later close of the experiment.
    local.setCell('xexperiments', 'experiment', 'endedAt', Date.now() + 1);
    await vi.advanceTimersByTimeAsync(150);
    const otherDevice = createMergeableStore();
    for (const record of remote.values()) otherDevice.applyMergeableChanges(recordContent(record));
    expect(otherDevice.getCell('xlabels', '123', 'reviewedReplies')).toBe(2);
    expect(otherDevice.getCell('xexperiments', 'experiment', 'endedAt')).toBe(local.getCell('xexperiments', 'experiment', 'endedAt'));
  });
  it('uploads all thread parts before their root can trigger publishing, even across batches', async () => {
    local.setRow('posts', 'p', { content: 'root', entryType: 'thought', xSync: true });
    for (let i = 0; i < 60; i++) local.setRow('replies', `part${i}`, { postId: 'p', content: `part ${i}`, thread: true, xSync: true });
    local.setCell('xposts', 'p', 'command', 'send');
    fetchMock.mockImplementation(async (url: unknown, options: RequestInit) => {
      if (url === '/api/x/check') return new Response(null, { status: 503 });
      const response = respond(options);
      const snapshot = await remoteStore();
      if (snapshot.hasRow('posts', 'p')) expect(snapshot.getRowIds('replies')).toHaveLength(60);
      if (snapshot.hasRow('xposts', 'p')) expect(snapshot.hasRow('posts', 'p')).toBe(true);
      return response;
    });
    connection.startConnection(); await vi.advanceTimersByTimeAsync(0);
    expect(connection.useConnection().state).toBe('online');
    expect(connection.rowIsSynced('posts', 'p')).toBe(true);
    expect(syncCalls()).toHaveLength(2);
    const lastBatch = JSON.parse(syncCalls()[1][1].body).records as SyncRecord[];
    expect(lastBatch.at(-1)?.key).toBe('r:xposts:p');
  });
  it('asks the server to look at X when opened, at most every 30 seconds, then pulls what it found',async()=>{
    xCheckStatus=204;
    connection.startConnection(); await vi.advanceTimersByTimeAsync(0);
    const checks = () => fetchMock.mock.calls.filter(([url]) => url === '/api/x/check');
    expect(checks()).toHaveLength(1);
    expect(checks()[0][1].headers).toEqual({ authorization: 'Bearer test-token' });
    expect(syncCalls()).toHaveLength(2);
    connection.checkX(); await vi.advanceTimersByTimeAsync(0);
    expect(checks()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(30_000);
    connection.checkX(); await vi.advanceTimersByTimeAsync(0);
    expect(checks()).toHaveLength(2);
  });
});
