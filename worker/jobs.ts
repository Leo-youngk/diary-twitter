import type { Env } from './env';
import { execute, loadStore, query, saveStore } from './d1';
import { runX } from './delivery/x';
import { CHANNELS, runChannel, type Channel } from './delivery/channel';
import { runObsidian } from './delivery/obsidian';
import { runXStats } from './delivery/xstats';
import { runBackup } from './delivery/backup';

const NEVER = 8_000_000_000_000_000;
interface Job { name: string; generation: number }

/** Never switched on and nothing in its ledger: no post can be waiting for the channel. */
async function channelIdle(db: D1Database, channel: Channel): Promise<boolean> {
  return !await db.prepare(`SELECT 1 FROM diary3_records WHERE key=? UNION ALL SELECT 1 FROM ${channel.ledger} LIMIT 1`).bind(`v:${channel.setting}`).first();
}

export async function runJob(env: Env, name: string): Promise<void> {
  const now = Date.now();
  const lease = now + 5 * 60_000;
  // One owner per task, across Cron, devices and Worker instances. Lease expiry
  // recovers an interrupted invocation; the X sending ledger prevents resend.
  const claimed = await query<Job>(env.DB, `UPDATE diary3_jobs SET lease_until=? WHERE name=? AND next_at<=? AND lease_until<=? RETURNING name,generation`, lease, name, now, now);
  if (!claimed.length) return;
  let next = now + 60_000;
  const channel = CHANNELS.find((c) => c.job === name);
  try {
    // Every edit wakes the channel jobs; until a channel is used, it skips reading the whole diary.
    if (channel && await channelIdle(env.DB, channel)) { next = Infinity; return; }
    const { store, baseline } = await loadStore(env.DB);
    const persist = () => saveStore(env.DB, store, baseline);
    if (name === 'x') next = await runX(env.DB, store, env, now, persist);
    else if (channel) next = await runChannel(channel, env.DB, store, env, now, persist);
    else if (name === 'obsidian') next = await runObsidian(env.DB, store, env, env.SPACE_ID!, now);
    else if (name === 'xstats') next = await runXStats(env.DB, store, env, now);
    else next = await runBackup(env.DB, store, env.DATA_KV, env.SPACE_ID!, now);
    await persist();
    console.info('[d1] task complete', { name, nextAt: Number.isFinite(next) ? next : null });
  } catch (error) {
    console.error('[d1] task failed', { name, error: String(error) });
  } finally {
    // An edit arriving during execution must survive the old job's completion.
    await execute(env.DB, 'UPDATE diary3_jobs SET next_at=CASE WHEN generation=? THEN ? ELSE 0 END,lease_until=0 WHERE name=? AND lease_until=?', claimed[0].generation, Number.isFinite(next) ? next : NEVER, name, lease);
  }
}

export async function runJobs(env: Env, immediate = false): Promise<void> {
  const channels = CHANNELS.map((c) => c.job);
  const names = immediate ? ['x', ...channels] : ['x', ...channels, 'obsidian', 'xstats', 'backup'];
  await Promise.allSettled(names.map(name => runJob(env, name)));
}
