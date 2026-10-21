import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMergeableStore } from 'tinybase';
import { splitContent } from '../src/lib/sync';
import type { Env } from './env';
import { D1Diary } from './d1-space';

const jobs = vi.hoisted(() => ({ at: null as number | null, run: vi.fn(), saved: vi.fn() }));
vi.mock('cloudflare:workers', () => ({ DurableObject: class {
  constructor(public ctx: DurableObjectState, public env: Env) {}
} }));
vi.mock('./migrate', () => ({ migrateLegacy: async () => {} }));
vi.mock('./d1', () => ({
  databasePaused: async () => false, ensureSchema: async () => {}, execute: async () => {},
  pull: async () => ({ records: [], cursor: 1, more: false }), saveRecord: async () => true,
  saveRecords: (...args: unknown[]) => jobs.saved(...args),
}));
vi.mock('./jobs', () => ({
  concernedJobs: () => ['x', 'obsidian'], nextDeliveryAt: async () => jobs.at,
  runJobs: (...args: unknown[]) => jobs.run(...args), runJob: async () => {},
}));

const now = Date.parse('2026-10-21T00:00:00Z');
let space: D1Diary;
let alarmAt: number | null;
let ctx: DurableObjectState;
const device = { id: 'device', name: 'phone', build: 'test' };
const records = () => splitContent(createMergeableStore().setRow('posts', 'p', { content: 'new' }).getMergeableContent());

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now); vi.clearAllMocks();
  jobs.at = null;
  jobs.saved.mockImplementation(async () => { jobs.at = 0; return new Set(['r:posts:p']); });
  jobs.run.mockResolvedValue(undefined);
  alarmAt = null;
  ctx = { storage: {
    getAlarm: vi.fn(async () => alarmAt),
    setAlarm: vi.fn(async (at: number) => { alarmAt = at; }),
  }, waitUntil: vi.fn() } as unknown as DurableObjectState;
  space = new D1Diary(ctx, {} as Env);
});
afterEach(() => { vi.useRealTimers(); });

describe('D1 delivery alarms', () => {
  it('persists a near-term wake-up before acknowledging an upload', async () => {
    await space.sync(records(), 1, device);
    expect(jobs.saved.mock.calls[0][2]).toEqual(['x', 'obsidian']);
    expect(alarmAt).toBe(now + 250);
    expect(ctx.waitUntil).not.toHaveBeenCalled();
  });
  it('checks a pending publication on its exact deadline instead of the next Cron minute', async () => {
    jobs.run.mockImplementation(async () => { jobs.at = now + 5000; });
    await space.alarm();
    expect(jobs.run).toHaveBeenCalledWith(expect.anything(), true);
    expect(alarmAt).toBe(now + 5000);
  });
  it('immediately continues work left due by an edit arriving during a run', async () => {
    jobs.run.mockImplementation(async () => { jobs.at = 0; });
    await space.alarm();
    expect(alarmAt).toBe(now + 250);
  });
  it('keeps an earlier wake-up when a later edit requests another', async () => {
    alarmAt = now + 100;
    await space.sync(records(), 1, device);
    expect(ctx.storage.setAlarm).not.toHaveBeenCalled();
    expect(alarmAt).toBe(now + 100);
  });
  it('recovers a failed alarm write when the device replays an already committed upload', async () => {
    vi.mocked(ctx.storage.setAlarm).mockRejectedValueOnce(new Error('temporary storage failure'));
    await expect(space.sync(records(), 1, device)).rejects.toThrow('temporary storage failure');
    jobs.saved.mockResolvedValueOnce(new Set());
    await space.sync(records(), 1, device);
    expect(alarmAt).toBe(now + 250);
  });
  it('re-arms pending delivery after a failed run and leaves an empty queue asleep', async () => {
    jobs.at = now + 5000;
    jobs.run.mockRejectedValueOnce(new Error('interrupted'));
    await expect(space.alarm()).rejects.toThrow('interrupted');
    expect(alarmAt).toBe(now + 5000);
    alarmAt = null; jobs.at = null;
    await space.alarm();
    expect(alarmAt).toBeNull();
  });
});
