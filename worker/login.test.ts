/// <reference types="node" />
import { createRequire } from 'node:module';
import { beforeEach, describe, expect, it } from 'vitest';
import { ALL_LIMIT, IP_LIMIT, IP_LOCK_MS, loginAttempt, migrateLoginTable } from './login';

interface Database { prepare(query: string): { all(...bindings: SqlStorageValue[]): Record<string, SqlStorageValue>[] } }
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (path: string) => Database };

let sql: SqlStorage;
const now = Date.parse('2026-09-30T08:00:00Z');

beforeEach(() => {
  const db = new DatabaseSync(':memory:');
  sql = { exec: (query: string, ...bindings: SqlStorageValue[]) => {
    const rows = db.prepare(query).all(...bindings);
    return { toArray: () => rows };
  } } as unknown as SqlStorage;
  migrateLoginTable(sql);
});

describe('passphrase attempts', () => {
  it('locks an address after five wrong tries and refuses even the right passphrase meanwhile', () => {
    for (let i = 1; i < IP_LIMIT; i++) expect(loginAttempt(sql, '1.1.1.1', false, now).result).toBe('wrong');
    expect(loginAttempt(sql, '1.1.1.1', false, now)).toMatchObject({ result: 'locked', retryAfterMs: IP_LOCK_MS });
    expect(loginAttempt(sql, '1.1.1.1', true, now + 60_000).result).toBe('locked');
    expect(loginAttempt(sql, '2.2.2.2', true, now + 60_000).result).toBe('ok');
    expect(loginAttempt(sql, '1.1.1.1', true, now + IP_LOCK_MS + 1).result).toBe('ok');
  });

  it('forgets an address\'s mistakes after a right passphrase', () => {
    for (let i = 1; i < IP_LIMIT; i++) loginAttempt(sql, '1.1.1.1', false, now);
    expect(loginAttempt(sql, '1.1.1.1', true, now).result).toBe('ok');
    expect(loginAttempt(sql, '1.1.1.1', false, now).result).toBe('wrong');
  });

  it('locks new sign-ins for everyone when many addresses guess within an hour', () => {
    for (let i = 0; i < ALL_LIMIT - 1; i++) expect(loginAttempt(sql, `10.0.0.${i}`, false, now + i).result).toBe('wrong');
    expect(loginAttempt(sql, '10.0.1.1', false, now + 100).result).toBe('locked');
    expect(loginAttempt(sql, '9.9.9.9', true, now + 200).result).toBe('locked');
  });
});
