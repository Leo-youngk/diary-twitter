import { execute, query } from './d1';
import { ALL_LIMIT, ALL_LOCK_MS, ALL_WINDOW_MS, IP_LIMIT, IP_LOCK_MS, type LoginOutcome } from './login';

export async function d1Login(db: D1Database, ip: string, correct: boolean, now = Date.now()): Promise<LoginOutcome> {
    const keys = [`ip:${ip}`, 'all'];
    const locked = await query<{ locked_until: number }>(db, 'SELECT locked_until FROM diary3_login WHERE key IN (?,?) AND locked_until>?', ...keys, now);
    if (locked.length) return { result: 'locked', retryAfterMs: Math.max(...locked.map(row => row.locked_until)) - now };
    if (correct) {
      await execute(db, 'DELETE FROM diary3_login WHERE key=?', keys[0]);
      return { result: 'ok' };
    }
    await db.batch(keys.map((key, index) => {
      const window = index === 0 ? IP_LOCK_MS : ALL_WINDOW_MS;
      const limit = index === 0 ? IP_LIMIT : ALL_LIMIT;
      const lock = index === 0 ? IP_LOCK_MS : ALL_LOCK_MS;
      return db.prepare(`INSERT INTO diary3_login(key,failures,window_start,locked_until) VALUES(?,1,?,0)
        ON CONFLICT(key) DO UPDATE SET
        locked_until=CASE WHEN diary3_login.window_start+?>? AND diary3_login.failures+1>=? THEN ? ELSE diary3_login.locked_until END,
        failures=CASE WHEN diary3_login.window_start+?>? THEN diary3_login.failures+1 ELSE 1 END,
        window_start=CASE WHEN diary3_login.window_start+?>? THEN diary3_login.window_start ELSE ? END
        WHERE diary3_login.locked_until<=?`).bind(key, now, window, now, limit, now+lock, window, now, window, now, now, now);
    }));
    const after = await query<{ locked_until: number }>(db, 'SELECT locked_until FROM diary3_login WHERE key IN (?,?) AND locked_until>?', ...keys, now);
    return after.length ? { result: 'locked', retryAfterMs: Math.max(...after.map(row => row.locked_until)) - now } : { result: 'wrong' };
}
