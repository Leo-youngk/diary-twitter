import {
  ROW_ID_PATTERN, blobHashOf, parseImages, type GoalRow, type PostRow, type ProfileValues, type ReplyRow,
} from '@/lib/schema';
import { dataUrlToBlob, imageAsDataUrl, storeImage } from './blobs';
import { store } from './store';

/**
 * Full backup to a single JSON file, images included, so it restores on any
 * device without the server. Also reads the pre-rebuild backup format.
 */

interface BackupV2 {
  version: 2;
  exportedAt: string;
  posts: Record<string, PostRow>;
  replies: Record<string, ReplyRow>;
  /** Absent in backups made before 每日目标 existed. */
  goals?: Record<string, GoalRow>;
  profile: Partial<ProfileValues>;
  /** blob hash → data URL */
  images: Record<string, string>;
}

export interface ParsedBackup {
  posts: Record<string, PostRow>;
  replies: Record<string, ReplyRow>;
  /** null when the backup has no goals section; the current goals are then kept. */
  goals: Record<string, GoalRow> | null;
  profile: Partial<ProfileValues>;
  /** ref or data URL → data URL, resolved to refs on restore */
  images: Map<string, string>;
  counts: { posts: number; replies: number; goals: number };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export async function buildBackup(): Promise<BackupV2> {
  const posts = store.getTable('posts') as Record<string, PostRow>;
  const replies = store.getTable('replies') as Record<string, ReplyRow>;
  const goals = store.getTable('goals') as Record<string, GoalRow>;
  const profile = store.getValues() as Partial<ProfileValues>;
  const refs = new Set<string>();
  Object.values(posts).forEach((post) => parseImages(post.images).forEach((ref) => refs.add(ref)));
  if (profile.avatar) refs.add(profile.avatar);
  if (profile.banner) refs.add(profile.banner);
  const images: Record<string, string> = {};
  for (const ref of refs) {
    const hash = blobHashOf(ref);
    const dataUrl = hash ? await imageAsDataUrl(ref) : null;
    if (hash && dataUrl) images[hash] = dataUrl;
  }
  return { version: 2, exportedAt: new Date().toISOString(), posts, replies, goals, profile, images };
}

export async function downloadBackup(): Promise<void> {
  const backup = await buildBackup();
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `日记本完整备份_${backup.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function parseV1(value: Record<string, unknown>): ParsedBackup | null {
  if (!Array.isArray(value.posts) || !isRecord(value.user)) return null;
  const posts: Record<string, PostRow> = {};
  const replies: Record<string, ReplyRow> = {};
  const images = new Map<string, string>();
  for (const post of value.posts) {
    if (!isRecord(post) || !ROW_ID_PATTERN.test(str(post.id)) || !str(post.createdAt)) continue;
    const refs: string[] = [];
    for (const image of Array.isArray(post.images) ? post.images : []) {
      if (typeof image === 'string' && image.startsWith('data:image/')) { images.set(image, image); refs.push(image); }
    }
    posts[str(post.id)] = {
      entryType: post.entryType === 'diary' || post.entryType === 'article' ? post.entryType : 'thought',
      category: str(post.category).trim(),
      title: str(post.title).trim(),
      content: str(post.content),
      images: JSON.stringify(refs),
      createdAt: str(post.createdAt),
      isLiked: post.isLiked === true,
      xSync: post.xSync === true,
    };
    for (const reply of Array.isArray(post.replies) ? post.replies : []) {
      if (!isRecord(reply) || !ROW_ID_PATTERN.test(str(reply.id))) continue;
      replies[str(reply.id)] = { postId: str(post.id), content: str(reply.content), createdAt: str(reply.createdAt), xSync: reply.xSync === true, thread: false };
    }
  }
  const user = value.user;
  const profile: Partial<ProfileValues> = {};
  for (const key of ['displayName', 'username', 'bio', 'joinedDate', 'birthDate'] as const) {
    if (typeof user[key] === 'string') profile[key] = user[key] as string;
  }
  for (const key of ['avatar', 'banner'] as const) {
    const image = str(user[key]);
    if (image.startsWith('data:image/')) { images.set(image, image); profile[key] = image; } else { profile[key] = ''; }
  }
  return {
    posts, replies, goals: null, profile, images,
    counts: { posts: Object.keys(posts).length, replies: Object.keys(replies).length, goals: 0 },
  };
}

function parseGoals(value: unknown): Record<string, GoalRow> | null {
  if (!isRecord(value)) return null;
  const goals: Record<string, GoalRow> = {};
  for (const [id, row] of Object.entries(value)) {
    if (!ROW_ID_PATTERN.test(id) || !isRecord(row) || !str(row.day) || !str(row.createdAt)) continue;
    goals[id] = { day: str(row.day), text: str(row.text), done: row.done === true, createdAt: str(row.createdAt) };
  }
  return goals;
}

function parseV2(value: Record<string, unknown>): ParsedBackup | null {
  if (!isRecord(value.posts) || !isRecord(value.replies) || !isRecord(value.images)) return null;
  const images = new Map<string, string>();
  for (const [hash, dataUrl] of Object.entries(value.images)) {
    if (typeof dataUrl === 'string') images.set(`blob:${hash}`, dataUrl);
  }
  const posts = value.posts as Record<string, PostRow>;
  const replies = value.replies as Record<string, ReplyRow>;
  const goals = parseGoals(value.goals);
  return {
    posts,
    replies,
    goals,
    profile: isRecord(value.profile) ? (value.profile as Partial<ProfileValues>) : {},
    images,
    counts: { posts: Object.keys(posts).length, replies: Object.keys(replies).length, goals: goals ? Object.keys(goals).length : 0 },
  };
}

export function parseBackup(value: unknown): ParsedBackup | null {
  if (!isRecord(value)) return null;
  if (value.version === 2) return parseV2(value);
  if (value.version === 1 || Array.isArray(value.posts)) return parseV1(value);
  return null;
}

/** Replace everything on this account with the backup's contents. */
export async function restoreBackup(backup: ParsedBackup): Promise<void> {
  const refFor = new Map<string, string>();
  for (const [key, dataUrl] of backup.images) {
    refFor.set(key, await storeImage(await dataUrlToBlob(dataUrl)));
  }
  const mapRef = (ref: string) => refFor.get(ref) ?? (blobHashOf(ref) ? ref : '');

  // A restore must never publish to X: keep the flag only where this account
  // already had it (so replies can still quote those posts), clear it elsewhere.
  const keepXSync = (table: 'posts' | 'replies', id: string) => store.getCell(table, id, 'xSync') === true;

  store.transaction(() => {
    for (const id of store.getRowIds('replies')) if (!backup.replies[id]) store.delRow('replies', id);
    for (const id of store.getRowIds('posts')) if (!backup.posts[id]) store.delRow('posts', id);
    for (const [id, post] of Object.entries(backup.posts)) {
      const images = parseImages(post.images).map(mapRef).filter(Boolean);
      store.setRow('posts', id, { ...post, images: JSON.stringify(images), xSync: keepXSync('posts', id) });
    }
    for (const [id, reply] of Object.entries(backup.replies)) {
      store.setRow('replies', id, { ...reply, xSync: keepXSync('replies', id) });
    }
    if (backup.goals) {
      for (const id of store.getRowIds('goals')) if (!backup.goals[id]) store.delRow('goals', id);
      for (const [id, goal] of Object.entries(backup.goals)) store.setRow('goals', id, { ...goal });
    }
    const profile = { ...backup.profile };
    if (profile.avatar !== undefined) profile.avatar = mapRef(profile.avatar);
    if (profile.banner !== undefined) profile.banner = mapRef(profile.banner);
    store.setPartialValues(profile);
  });
}
