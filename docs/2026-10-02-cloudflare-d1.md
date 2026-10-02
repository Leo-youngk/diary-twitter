# Cloudflare D1 migration

The production diary previously persisted its TinyBase store to Durable Object SQLite on every wake. Empty background transactions and initial auto-save repeatedly consumed the DO write quota. The current backend keeps diary data, merge clocks, delivery ledgers, login counters and task leases in D1. Phones synchronize over authenticated HTTP; IndexedDB remains the offline copy and outbox.

## Resources

- Production: https://diary-app.yk2958374240.workers.dev/
- D1 binding `DB`: existing `diary-pwa-db`, UUID `709caf1f-c209-4d1a-a123-272b7860c543`. The account already has its maximum 10 free D1 databases. New tables exclusively use the `diary3_` prefix. Existing notes/categories/mornings/etc. tables are preserved.
- `DIARY` / `D1Diary`: compute coordinator for synchronization and tasks; uses no Durable Object storage writes. This also keeps merge/backup computation in the DO runtime rather than the tighter free Worker CPU budget.
- `SPACES` / `DiarySpace`: retained legacy archive, read-only when D1 is bound. Its initial auto-save and alarm delivery are disabled.
- `DATA_KV`: existing images, daily backups and a private full migration checkpoint. Blob hashes, space ID, session signing secret and integration credentials are unchanged.

D1 free writes also have a 100,000-row daily limit. This migration reduces writes rather than increasing that limit. Replayed edits, loading the store, polling and unchanged background saves write zero rows. An actual changed record updates one record, its revision index and the revision clock. A revision cursor returns only newer records. Compare-and-swap retries merge concurrent device edits using TinyBase's cell clocks. JSON explicitly preserves deletion tombstones.

## Migration and delivery

The first private `D1Diary` call exports the frozen legacy store, waits for any in-progress legacy delivery, closes old sync sockets, saves a full KV checkpoint, copies X/Obsidian/login ledgers, and copies all stamped diary/profile records. It verifies content before marking migration complete or allowing new tasks to execute. Interrupted imports are repeatable; they never reset existing delivery IDs. The original DO data is retained.

X delivery commits and awaits the D1 `sending` state before contacting Buffer. Ambiguous outcomes require user review and are never automatically resent. Migrated Buffer IDs and sent links are retained. Devices can submit retry/dismiss commands, while delivery outcomes and metrics remain server-owned.

X, Obsidian, statistics and backup have separate D1 leases. A minute Cron trigger recovers delayed work and expired leases without requiring an open phone connection. Newly received posts also start an immediate X pass. A generation counter preserves edits arriving during a running job. Idle jobs do not acquire leases or write. Retry status queries can therefore wait until the next minute after their due time.

## Operations

1. Apply the additive schema using the project's account/token wrapper: `wrangler d1 execute diary-pwa-db --file migrations/0001_diary.sql --remote --yes`.
2. Deploy using `npm run deploy`; check the production Worker, not the separate GitHub build target.
3. Check `[d1] migration complete` and `[d1] task complete` logs, D1 record counts and existing X ledger links.
4. Reopen/update older PWA tabs. HTTP sync uses Authorization headers; credentials never enter URLs.

Do not roll production back to the old WebSocket writer after D1 accepts new edits. Recovery should deploy a D1-compatible version or reconcile the D1 checkpoint into an isolated copy first. The archived DO is not the live database after migration.

Validation: real SQLite/D1 adapter tests cover zero-write replay/polling, cursor updates, simultaneous cell edits, deletions and offline stale copies, read-only legacy initialization/export, complete migration, sending-before-request, historical sent/ambiguous delivery deduplication, concurrent job leases and edits during execution. Client tests cover unavailable servers, offline retry, edits during requests, empty idle polling, foreground catch-up, authentication refusal and command-only uploads.
