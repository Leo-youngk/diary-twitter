import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMergeableStore, type MergeableStore } from 'tinybase';
import { mergeRecord, recordContent, splitContent, type SyncRecord } from '@/lib/sync';

const auth = vi.hoisted(() => ({ signOut: vi.fn(), token: 'test-token' }));
const data = vi.hoisted(() => ({ store: null as MergeableStore | null }));
vi.mock('@/data/store', () => ({ get store() { return data.store; } }));
vi.mock('@/data/auth', () => ({ getToken: () => auth.token, deviceName: () => 'test device', onTokenChange: () => () => {}, signOut: auth.signOut }));
vi.mock('react', () => ({ useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot() }));
let page: EventTarget & { visibilityState: string };
let connection: typeof import('../connection');
let local: MergeableStore;
let remote: Map<string, Required<SyncRecord>>;
let revision: number;
let fetchMock: ReturnType<typeof vi.fn>;
function respond(options: RequestInit) {
  const body = JSON.parse(String(options.body)) as { records: SyncRecord[]; cursor: number };
  for (const record of body.records) {
    const data = mergeRecord(remote.get(record.key)?.data ?? null, record.data);
    if (remote.get(record.key)?.data !== data) remote.set(record.key, { key: record.key, data, revision: ++revision });
  }
  const records = [...remote.values()].filter(record => record.revision > body.cursor).sort((a,b)=>a.revision-b.revision);
  return Response.json({ records, cursor: records.at(-1)?.revision ?? body.cursor, more:false });
}
async function remoteStore() {
  const store = createMergeableStore(); for (const record of remote.values()) store.applyMergeableChanges(recordContent(record)); return store;
}
beforeEach(async () => {
  vi.resetModules(); vi.useFakeTimers(); vi.clearAllMocks();
  page = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('document',page); vi.stubGlobal('window',new EventTarget());
  vi.stubGlobal('navigator',{onLine:true}); vi.stubGlobal('__BUILD_ID__','test build');
  auth.token='test-token'; remote=new Map(); revision=0;
  fetchMock=vi.fn(async (_url:unknown, options:RequestInit)=>respond(options)); vi.stubGlobal('fetch',fetchMock);
  local=createMergeableStore(); data.store=local;
  connection=await import('../connection');
});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();});

describe('HTTP offline synchronization',()=>{
  it('retains offline edits and retries an unavailable server without reporting success',async()=>{
    local.setRow('posts','p',{content:'offline draft'});
    fetchMock.mockResolvedValueOnce(Response.json({error:'unavailable'},{status:503}));
    connection.startConnection(); await vi.advanceTimersByTimeAsync(0);
    expect(connection.useConnection()).toMatchObject({state:'offline',syncedAt:null});
    expect(local.getCell('posts','p','content')).toBe('offline draft');
    await vi.advanceTimersByTimeAsync(1000);
    expect(connection.useConnection().state).toBe('online');
    expect((await remoteStore()).getCell('posts','p','content')).toBe('offline draft');
  });
  it('keeps edits made while a request is in flight in the outbox',async()=>{
    local.setRow('posts','p',{content:'first'});
    fetchMock.mockImplementationOnce(async (_url:unknown, options:RequestInit)=>{
      const response=respond(options); local.setCell('posts','p','content','second'); return response;
    });
    connection.startConnection(); await vi.advanceTimersByTimeAsync(0);
    expect((await remoteStore()).getCell('posts','p','content')).toBe('second');
    expect(connection.useConnection().state).toBe('online');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('does not reupload unchanged records during idle polling',async()=>{
    local.setRow('posts','p',{content:'saved'});
    connection.startConnection(); await vi.advanceTimersByTimeAsync(0); await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).records).toEqual([]);
  });
  it('polls promptly while a new X post is still awaiting its server delivery row',async()=>{
    local.setRow('posts','p',{content:'new',entryType:'thought',xSync:true,createdAt:new Date().toISOString()});
    connection.startConnection(); await vi.advanceTimersByTimeAsync(0); await vi.advanceTimersByTimeAsync(3000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
    connection.startConnection(); await vi.advanceTimersByTimeAsync(0);
    const row=(await remoteStore()).getRow('xposts','p');
    expect(row).toEqual({command:'retry'});
  });
});
