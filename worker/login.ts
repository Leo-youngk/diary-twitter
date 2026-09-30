// Limits passphrase guesses. A short passphrase (e.g. six digits) is only
// safe if it cannot be tried at speed:
// - one address: 5 wrong tries lock it for 15 minutes;
// - everyone together: 30 wrong tries within an hour lock new sign-ins for
//   an hour, so many addresses cannot share the work.
// Devices already signed in are never affected. While locked, even the right
// passphrase is refused, so a lock gives nothing away.

export const IP_LIMIT = 5;
export const IP_LOCK_MS = 15 * 60_000;
export const ALL_LIMIT = 30;
export const ALL_WINDOW_MS = 60 * 60_000;
export const ALL_LOCK_MS = 60 * 60_000;

export type LoginOutcome = { result: 'ok' } | { result: 'wrong' } | { result: 'locked'; retryAfterMs: number };

interface Counter {
  failures: number;
  window_start: number;
  locked_until: number;
}

export function migrateLoginTable(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE IF NOT EXISTS app_login (
    key TEXT PRIMARY KEY,
    failures INTEGER NOT NULL DEFAULT 0,
    window_start INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER NOT NULL DEFAULT 0
  )`);
}

function read(sql: SqlStorage, key: string): Counter {
  const row = sql.exec<Counter & Record<string, SqlStorageValue>>('SELECT failures, window_start, locked_until FROM app_login WHERE key = ?', key).toArray()[0];
  return row ?? { failures: 0, window_start: 0, locked_until: 0 };
}

function write(sql: SqlStorage, key: string, counter: Counter): void {
  sql.exec(
    `INSERT INTO app_login (key, failures, window_start, locked_until) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET failures = excluded.failures, window_start = excluded.window_start, locked_until = excluded.locked_until`,
    key, counter.failures, counter.window_start, counter.locked_until,
  );
}

/** Record one sign-in attempt whose passphrase was `correct`, and decide it. */
export function loginAttempt(sql: SqlStorage, ip: string, correct: boolean, now: number): LoginOutcome {
  const ipKey = `ip:${ip}`;
  const mine = read(sql, ipKey);
  const all = read(sql, 'all');
  const lockedUntil = Math.max(mine.locked_until, all.locked_until);
  if (lockedUntil > now) return { result: 'locked', retryAfterMs: lockedUntil - now };

  if (correct) {
    sql.exec('DELETE FROM app_login WHERE key = ?', ipKey);
    return { result: 'ok' };
  }

  const ipFailures = mine.window_start + IP_LOCK_MS > now ? mine.failures + 1 : 1;
  const ipCounter = { failures: ipFailures, window_start: ipFailures === 1 ? now : mine.window_start, locked_until: 0 };
  if (ipFailures >= IP_LIMIT) Object.assign(ipCounter, { failures: 0, locked_until: now + IP_LOCK_MS });
  write(sql, ipKey, ipCounter);

  const allFailures = all.window_start + ALL_WINDOW_MS > now ? all.failures + 1 : 1;
  const allCounter = { failures: allFailures, window_start: allFailures === 1 ? now : all.window_start, locked_until: 0 };
  if (allFailures >= ALL_LIMIT) Object.assign(allCounter, { failures: 0, locked_until: now + ALL_LOCK_MS });
  write(sql, 'all', allCounter);

  if (ipCounter.locked_until || allCounter.locked_until) {
    return { result: 'locked', retryAfterMs: Math.max(ipCounter.locked_until, allCounter.locked_until) - now };
  }
  return { result: 'wrong' };
}
