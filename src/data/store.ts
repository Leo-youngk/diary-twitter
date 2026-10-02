import { createIndexes, createMergeableStore, type SortKey } from 'tinybase/with-schemas';
import { createIndexedDbPersister } from 'tinybase/persisters/persister-indexed-db/with-schemas';
import * as UiReact from 'tinybase/ui-react/with-schemas';
import { TABLES_SCHEMA, VALUES_SCHEMA } from '@/lib/schema';

type Schemas = [typeof TABLES_SCHEMA, typeof VALUES_SCHEMA];

/** The whole app state that syncs: posts, replies, X status, goals, profile. */
export const store = createMergeableStore().setSchema(TABLES_SCHEMA, VALUES_SCHEMA);
export type AppStore = typeof store;

const newestFirst = (a: SortKey, b: SortKey) => String(b ?? '').localeCompare(String(a ?? ''));

/**
 * Replies grouped by post and goals grouped by day, oldest first — a card or
 * a day's list re-renders only when its own slice changes. Bookmarked posts
 * sit in the one 'liked' slice and stand-alone 追加 in 'quote', newest first.
 */
export const indexes = createIndexes(store)
  .setIndexDefinition('repliesByPost', 'replies', 'postId', 'createdAt')
  .setIndexDefinition('goalsByDay', 'goals', 'day', 'createdAt')
  .setIndexDefinition('likedPosts', 'posts', (getCell) => (getCell('isLiked') ? 'liked' : []), 'createdAt', undefined, newestFirst)
  // 追加 that stand on their own in the timeline; parts of a thread stay with their post.
  .setIndexDefinition('quoteReplies', 'replies', (getCell) => (getCell('thread') ? [] : 'quote'), 'createdAt', undefined, newestFirst);

export const ui = UiReact as UiReact.WithSchemas<Schemas>;

// This device's copy of the one data space.
const persister = createIndexedDbPersister(store, 'diary', 5);

let loaded: Promise<void> | null = null;

/** Load this device's copy (works offline) and keep saving every change. */
export function loadLocal(): Promise<void> {
  loaded ??= persister.startAutoPersisting().then(() => undefined);
  return loaded;
}

/** Write this device's copy now, without waiting for the automatic save. */
export async function saveLocal(): Promise<void> {
  // Saving before the copy has loaded would overwrite it with an empty store.
  if (!loaded) return;
  await loaded;
  await persister.save();
}
