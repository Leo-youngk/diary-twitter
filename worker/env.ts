import type { DiarySpace } from './space';

export interface Env {
  SPACES: DurableObjectNamespace<DiarySpace>;
  /** Images and daily backups. */
  DATA_KV: KVNamespace;
  /** The one data space of this deployment (its Durable Object name and KV prefix). */
  SPACE_ID?: string;
  /** Typed once on each new device; exchanged for a device token. */
  APP_PASSPHRASE?: string;
  /** Signs device tokens. Changing it signs every device out. */
  SESSION_SECRET?: string;
  OBSIDIAN_SYNC_URL?: string;
  OBSIDIAN_SYNC_SECRET?: string;
  BUFFER_API_KEY?: string;
  BUFFER_CHANNEL_ID?: string;
}
