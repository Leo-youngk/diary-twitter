import type { GoalRow, PostRow, ProfileValues, ReplyRow, XCommand } from '@/lib/schema';
import { X_MAX_WEIGHT, xWeightedLength } from '@/lib/xText';
import { indexes, store } from './store';

/** Every write the app makes goes through here. */

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function fitsOnX(text: string): boolean {
  return xWeightedLength(text) <= X_MAX_WEIGHT;
}

/** A new post goes to X when its switch is on and it, and every part of its thread, fits. */
export function postWillSyncToX(toX: boolean, content: string, thread: string[] = []): boolean {
  return toX && fitsOnX(content.trim()) && thread.every((part) => fitsOnX(part.trim()));
}

/** A reply goes to X when its post went there, the setting is on and it fits. */
export function replyWillSyncToX(postId: string, content: string): boolean {
  return store.getValue('xSyncEnabled') && store.getCell('posts', postId, 'xSync') === true && fitsOnX(content.trim());
}

export interface NewPost {
  content: string;
  images: string[];
  /** The compose screen's X switch. */
  toX: boolean;
  /** Further parts written with +, saved as its 追加 and sent to X with it as one thread. */
  thread?: string[];
}

export function addPost(input: NewPost): string {
  const id = generateId();
  const content = input.content.trim();
  const thread = (input.thread ?? []).map((part) => part.trim()).filter(Boolean);
  const xSync = postWillSyncToX(input.toX, content, thread);
  const now = Date.now();
  store.transaction(() => {
    store.setRow('posts', id, {
      entryType: 'thought',
      category: '',
      title: '',
      content,
      images: JSON.stringify(input.images),
      createdAt: new Date(now).toISOString(),
      isLiked: false,
      xSync,
    });
    // A millisecond apart, so the parts keep their order.
    thread.forEach((part, i) => store.setRow('replies', generateId(), {
      postId: id, content: part, createdAt: new Date(now + i + 1).toISOString(), xSync, thread: true,
    }));
  });
  return id;
}

export interface PostEdit {
  content: string;
  images: string[];
  /** Only for an older post that has a title. */
  title?: string;
}

/**
 * Edits never change whether a post goes to X, nor an older post's type.
 * Returns false when the post is gone (deleted on another device meanwhile).
 */
export function updatePost(id: string, edit: PostEdit): boolean {
  if (!store.hasRow('posts', id)) return false;
  store.setPartialRow('posts', id, {
    content: edit.content.trim(),
    images: JSON.stringify(edit.images),
    ...(edit.title !== undefined ? { title: edit.title.trim() } : {}),
  });
  return true;
}

export interface DeletedPost {
  id: string;
  post: PostRow;
  replies: Array<[string, ReplyRow]>;
}

export function deletePost(id: string): DeletedPost | null {
  const post = store.getRow('posts', id) as PostRow;
  if (!post.createdAt) return null;
  const replies = indexes.getSliceRowIds('repliesByPost', id)
    .map((replyId) => [replyId, store.getRow('replies', replyId) as ReplyRow] as [string, ReplyRow]);
  store.transaction(() => {
    replies.forEach(([replyId]) => store.delRow('replies', replyId));
    store.delRow('posts', id);
  });
  return { id, post, replies };
}

export function restorePost(deleted: DeletedPost): void {
  store.transaction(() => {
    store.setRow('posts', deleted.id, { ...deleted.post });
    deleted.replies.forEach(([replyId, reply]) => store.setRow('replies', replyId, { ...reply }));
  });
}

export function toggleLike(id: string): void {
  if (!store.hasRow('posts', id)) return;
  store.setCell('posts', id, 'isLiked', (liked) => !liked);
}

/** Returns null when the post is gone. */
export function addReply(postId: string, content: string): string | null {
  if (!store.hasRow('posts', postId)) return null;
  const id = generateId();
  const text = content.trim();
  store.setRow('replies', id, {
    postId,
    content: text,
    createdAt: new Date().toISOString(),
    xSync: replyWillSyncToX(postId, text),
  });
  return id;
}

export function updateProfile(values: Partial<ProfileValues>): void {
  store.setPartialValues(values);
}

export function sendXCommand(id: string, command: Exclude<XCommand, ''>): void {
  store.setCell('xposts', id, 'command', command);
}

// ── 每日目标 ────────────────────────────────────────────────────────────────

export const MAX_GOAL_LENGTH = 200;

export function addGoal(day: string, text: string): string | null {
  const value = text.trim().slice(0, MAX_GOAL_LENGTH);
  if (!value) return null;
  const id = generateId();
  store.setRow('goals', id, { day, text: value, done: false, createdAt: new Date().toISOString() });
  return id;
}

/** Add several goals to a day, listed in the order given. */
export function addGoals(day: string, texts: string[]): number {
  const values = texts.map((text) => text.trim().slice(0, MAX_GOAL_LENGTH)).filter(Boolean);
  const base = Date.now();
  store.transaction(() => {
    values.forEach((text, i) => {
      store.setRow('goals', generateId(), { day, text, done: false, createdAt: new Date(base + i).toISOString() });
    });
  });
  return values.length;
}

export function renameGoal(id: string, text: string): void {
  const value = text.trim().slice(0, MAX_GOAL_LENGTH);
  if (!value || !store.hasRow('goals', id) || store.getCell('goals', id, 'text') === value) return;
  store.setCell('goals', id, 'text', value);
}

export function toggleGoal(id: string): void {
  if (!store.hasRow('goals', id)) return;
  store.setCell('goals', id, 'done', (done) => !done);
}

export function deleteGoal(id: string): GoalRow | null {
  const row = store.getRow('goals', id) as GoalRow;
  if (!row.createdAt) return null;
  store.delRow('goals', id);
  return row;
}

export function restoreGoal(id: string, row: GoalRow): void {
  store.setRow('goals', id, { ...row });
}

/** Copy a day's unfinished goals onto another day, in their order. The original day keeps its record. */
export function carryOverGoals(fromDay: string, toDay: string): number {
  const ids = indexes.getSliceRowIds('goalsByDay', fromDay).filter((id) => store.getCell('goals', id, 'done') !== true);
  const base = Date.now();
  store.transaction(() => {
    ids.forEach((id, i) => {
      store.setRow('goals', generateId(), {
        day: toDay,
        text: String(store.getCell('goals', id, 'text') ?? ''),
        done: false,
        createdAt: new Date(base + i).toISOString(),
      });
    });
  });
  return ids.length;
}
