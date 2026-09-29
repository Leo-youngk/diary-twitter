// Tables this app keeps next to TinyBase's own in the Durable Object. They are
// written synchronously, so a state recorded here survives a crash that
// happens a moment later (TinyBase's own saves are asynchronous).

export function migrateAppTables(sql: SqlStorage): void {
  sql.exec(`CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);
  // One row per post or reply ever considered for X.
  sql.exec(`CREATE TABLE IF NOT EXISTS app_x (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    parent TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_at INTEGER NOT NULL DEFAULT 0,
    buffer_id TEXT NOT NULL DEFAULT '',
    link TEXT NOT NULL DEFAULT '',
    error TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL DEFAULT 0
  )`);
  // The version of each post last delivered to Obsidian.
  sql.exec(`CREATE TABLE IF NOT EXISTS app_obsidian (
    id TEXT PRIMARY KEY,
    entity TEXT NOT NULL,
    created_at TEXT NOT NULL,
    version TEXT NOT NULL
  )`);
}

export function getMeta(sql: SqlStorage, key: string): string | null {
  const rows = sql.exec<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', key).toArray();
  return rows[0]?.value ?? null;
}

export function setMeta(sql: SqlStorage, key: string, value: string): void {
  sql.exec(
    'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}
