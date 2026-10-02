import type { Env } from './env';
import { execute, loadStore, query, saveStore } from './d1';
import { runX } from './delivery/x';
import { runObsidian } from './delivery/obsidian';
import { runXStats } from './delivery/xstats';
import { runBackup } from './delivery/backup';

const NEVER = 8_000_000_000_000_000;
interface Job { name: string; generation: number }

export async function runJob(env: Env, name: string): Promise<void> {
  const now = Date.now();
  const lease = now + 5 * 60_000;
  // One owner per task, across Cron, devices and Worker instances. Lease expiry
  // recovers an interrupted invocation; the X sending ledger prevents resend.
  const claimed = await query<Job>(env.DB, `UPDATE diary3_jobs SET lease_until=? WHERE name=? AND next_at<=? AND lease_until<=? RETURNING name,generation`, lease, name, now, now);
  if (!claimed.length) return;
  let next = now + 60_000;
  try {
    const { store, baseline } = await loadStore(env.DB);
    const persist = () => saveStore(env.DB, store, baseline);
    if (name === 'x') next = await runX(env.DB, store, env, now, persist);
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
  const names = immediate ? ['x'] : ['x', 'obsidian', 'xstats', 'backup'];
  await Promise.allSettled(names.map(name => runJob(env, name)));
}
