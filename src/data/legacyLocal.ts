import { ROW_ID_PATTERN } from '@/lib/schema';
import { dataUrlToBlob, storeImage } from './blobs';
import { store } from './store';

/**
 * Leftovers from the pre-rebuild app on this device.
 *
 * The server imports the last snapshot that app uploaded. The only thing that
 * snapshot can miss is an edit this device made and never managed to upload
 * (the old app marked that with `diary-sync-pending`). Such edits are applied
 * on top once, after the first sync. Then the old local copy is removed.
 */

const DONE_KEY = 'diary-legacy-adopted';
const OLD_KEYS = [
  'diary-sync-pending',
  'diary-updated-at',
  'diary-obsidian-sync-pending',
  'ledger-v1-transactions',
  'diary-compose-x-sync',
  'diary-x-sync',
];

function readOldPosts(): Promise<unknown> {
  return new Promise((resolve) => {
    const request = indexedDB.open('diary-db');
    request.onerror = () => resolve(null);
    request.onupgradeneeded = () => {
      // The old database never existed on this device.
      request.transaction?.abort();
      resolve(null);
    };
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('kv')) { db.close(); resolve(null); return; }
      const get = db.transaction('kv', 'readonly').objectStore('kv').get('diary-posts');
      get.onsuccess = () => { db.close(); resolve(get.result ?? null); };
      get.onerror = () => { db.close(); resolve(null); };
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function applyPendingPosts(posts: unknown): Promise<number> {
  if (!Array.isArray(posts)) return 0;
  let applied = 0;
  for (const post of posts) {
    if (!isRecord(post) || typeof post.id !== 'string' || !ROW_ID_PATTERN.test(post.id)) continue;
    if (typeof post.createdAt !== 'string' || typeof post.content !== 'string') continue;
    const images: string[] = [];
    for (const image of Array.isArray(post.images) ? post.images : []) {
      if (typeof image === 'string' && image.startsWith('data:image/')) {
        images.push(await storeImage(await dataUrlToBlob(image)));
      }
    }
    const entryType = post.entryType === 'diary' || post.entryType === 'article' ? post.entryType : 'thought';
    store.transaction(() => {
      store.setPartialRow('posts', post.id as string, {
        entryType,
        category: typeof post.category === 'string' ? post.category.trim() : '',
        title: typeof post.title === 'string' ? post.title.trim() : '',
        content: post.content as string,
        images: JSON.stringify(images),
        createdAt: post.createdAt as string,
        isLiked: post.isLiked === true,
      });
      for (const reply of Array.isArray(post.replies) ? post.replies : []) {
        if (!isRecord(reply) || typeof reply.id !== 'string' || !ROW_ID_PATTERN.test(reply.id)) continue;
        if (typeof reply.content !== 'string' || typeof reply.createdAt !== 'string') continue;
        if (!store.hasRow('replies', reply.id)) {
          store.setRow('replies', reply.id, { postId: post.id as string, content: reply.content, createdAt: reply.createdAt, xSync: false });
        }
      }
    });
    applied += 1;
  }
  return applied;
}

/** Run once, after the first successful sync. */
export async function adoptLegacyLocalData(): Promise<void> {
  try {
    if (localStorage.getItem(DONE_KEY)) return;
    if (localStorage.getItem('diary-sync-pending') === '1') {
      const applied = await applyPendingPosts(await readOldPosts());
      console.info('[legacy] applied unsynced edits from the old app', applied);
    }
    indexedDB.deleteDatabase('diary-db');
    OLD_KEYS.forEach((key) => localStorage.removeItem(key));
    localStorage.setItem(DONE_KEY, new Date().toISOString());
  } catch (error) {
    console.warn('[legacy] could not adopt old local data', error);
  }
}
