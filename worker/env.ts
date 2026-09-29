import type { DiarySpace } from './space';

export interface Env {
  SPACES: DurableObjectNamespace<DiarySpace>;
  /** Images and daily backups. */
  DATA_KV: KVNamespace;
  /** Pre-rebuild snapshots (`diary:{code}`) and X markers; read only. */
  LEGACY_KV: KVNamespace;
  OBSIDIAN_SYNC_URL?: string;
  OBSIDIAN_SYNC_SECRET?: string;
  BUFFER_API_KEY?: string;
  BUFFER_CHANNEL_ID?: string;
}
