import { useMemo, useSyncExternalStore } from 'react';
import type { DayProgress } from '@/lib/goals';
import {
  parseImages, tweetIdOfLink, type PostRow, type ProfileValues, type SubstackPostRow, type XAccountRow, type XFollowersRow, type XPostRow,
  type XTweetRow, type XMetricRow, type XLabelRow, type XExperimentRow,
} from '@/lib/schema';
import { toLocalDateKey } from '@/lib/utils';
import { indexes, store, ui } from './store';

export interface Post extends Omit<PostRow, 'images'> {
  id: string;
  images: string[];
}

export interface Reply {
  id: string;
  postId: string;
  content: string;
  createdAt: string;
  xSync: boolean;
  thread: boolean;
}

export interface Goal {
  id: string;
  day: string;
  text: string;
  done: boolean;
  createdAt: string;
}

type LoosePostRow = { [K in keyof PostRow]?: K extends 'entryType' ? string : PostRow[K] };

const ENTRY_TYPES = new Set(['thought', 'diary', 'article']);

export function toPost(id: string, row: LoosePostRow): Post | null {
  if (!row.createdAt) return null;
  return {
    id,
    entryType: (ENTRY_TYPES.has(row.entryType ?? '') ? row.entryType : 'thought') as PostRow['entryType'],
    category: row.category ?? '',
    title: row.title ?? '',
    content: row.content ?? '',
    images: parseImages(row.images ?? '[]'),
    createdAt: row.createdAt,
    isLiked: row.isLiked ?? false,
    xSync: row.xSync ?? false,
    substackSync: row.substackSync ?? false,
  };
}

/** One post, re-rendering only when that post changes. */
export function usePost(id: string): Post | null {
  const row = ui.useRow('posts', id, store);
  return useMemo(() => toPost(id, row), [id, row]);
}

/**
 * Post ids, newest first. Re-renders only when the list itself changes — an
 * edit or a bookmark re-renders that one card, not the list.
 */
export function usePostIds(): string[] {
  return ui.useSortedRowIds('posts', 'createdAt', true, 0, undefined, store);
}

/** Bookmarked post ids, newest first. */
export function useLikedPostIds(): string[] {
  return ui.useSliceRowIds('likedPosts', 'liked', indexes);
}

/** All posts, newest first, for screens that aggregate (calendar, analysis). */
export function usePosts(): Post[] {
  const table = ui.useTable('posts', store);
  return useMemo(
    () => Object.entries(table)
      .map(([id, row]) => toPost(id, row))
      .filter((post): post is Post => post !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [table],
  );
}

/**
 * The home timeline, newest first, as on X: posts ('p:<id>') and each 追加
 * on its own ('r:<id>'), quoting its post. Parts of a post's thread stay with the post.
 */
export function useFeedIds(): string[] {
  const postIds = usePostIds();
  const replyIds = ui.useSliceRowIds('quoteReplies', 'quote', indexes);
  // createdAt is set once, so the ids alone say when the order can change.
  return useMemo(() => [
    ...postIds.map((id) => ({ key: `p:${id}`, at: String(store.getCell('posts', id, 'createdAt') ?? '') })),
    ...replyIds.map((id) => ({ key: `r:${id}`, at: String(store.getCell('replies', id, 'createdAt') ?? '') })),
  ].filter(({ at }) => at).sort((a, b) => b.at.localeCompare(a.at)).map(({ key }) => key), [postIds, replyIds]);
}

export function useReplyIds(postId: string): string[] {
  return ui.useSliceRowIds('repliesByPost', postId, indexes);
}

/** The parts written with a post (its +), oldest first. The flag is set once, at creation. */
export function useThreadIds(postId: string): string[] {
  const ids = useReplyIds(postId);
  return useMemo(() => ids.filter((id) => store.getCell('replies', id, 'thread') === true), [ids]);
}

/** Every reply, newest first. */
export function useAllReplyIds(): string[] {
  return ui.useSortedRowIds('replies', 'createdAt', true, 0, undefined, store);
}

export function useReply(id: string): Reply | null {
  const row = ui.useRow('replies', id, store);
  return useMemo(() => (row.createdAt
    ? { id, postId: row.postId ?? '', content: row.content ?? '', createdAt: row.createdAt, xSync: row.xSync ?? false, thread: row.thread ?? false }
    : null), [id, row]);
}

export function useProfile(): ProfileValues {
  const values = ui.useValues(store);
  return useMemo(() => ({
    displayName: values.displayName ?? '我的日记本',
    username: values.username ?? 'myjournal',
    bio: values.bio ?? '',
    avatar: values.avatar ?? '',
    banner: values.banner ?? '',
    joinedDate: values.joinedDate ?? '',
    birthDate: values.birthDate ?? '',
    xSyncEnabled: values.xSyncEnabled ?? true,
    substackSyncEnabled: values.substackSyncEnabled ?? false,
  }), [values]);
}

export function useXSyncEnabled(): boolean {
  return ui.useValue('xSyncEnabled', store) ?? true;
}

export function useSubstackSyncEnabled(): boolean {
  return ui.useValue('substackSyncEnabled', store) ?? false;
}

export function useXPost(id: string): XPostRow | null {
  const row = ui.useRow('xposts', id, store);
  return row.state ? (row as XPostRow) : null;
}

export function useXPosts(): Record<string, XPostRow> {
  return ui.useTable('xposts', store) as Record<string, XPostRow>;
}

export function useSubstackPost(id: string): SubstackPostRow | null {
  const row = ui.useRow('substackposts', id, store);
  return row.state ? (row as SubstackPostRow) : null;
}

export function useSubstackPosts(): Record<string, SubstackPostRow> {
  return ui.useTable('substackposts', store) as Record<string, SubstackPostRow>;
}

/** X's numbers for a sent post or reply (from its link), once they have been read. */
export function useTweetStats(link: string | undefined): XTweetRow | null {
  const row = ui.useRow('xtweets', tweetIdOfLink(link) ?? '', store);
  return row.measuredAt ? (row as XTweetRow) : null;
}

export function useXTweets(): Record<string, XTweetRow> {
  return ui.useTable('xtweets', store) as Record<string, XTweetRow>;
}

export function useXAccount(): XAccountRow | null {
  const row = ui.useRow('xaccount', 'me', store);
  return row.handle || row.error ? (row as XAccountRow) : null;
}

/** Timestamped follower observations, including the legacy daily rows. */
export function useXFollowers(): Record<string, XFollowersRow> {
  return ui.useTable('xfollowers', store) as Record<string, XFollowersRow>;
}

export function useXMetrics(): Record<string, XMetricRow> {
  return ui.useTable('xmetrics', store) as Record<string, XMetricRow>;
}

export function useXLabels(): Record<string, XLabelRow> {
  return ui.useTable('xlabels', store) as Record<string, XLabelRow>;
}

export function useXExperiments(): Record<string, XExperimentRow> {
  return ui.useTable('xexperiments', store) as Record<string, XExperimentRow>;
}

export interface Device {
  id: string;
  name: string;
  build: string;
  seenAt: number;
}

/** Devices that have connected, most recently seen first. */
export function useDevices(): Device[] {
  const table = ui.useTable('devices', store);
  return useMemo(() => Object.entries(table)
    .map(([id, row]) => ({ id, name: row.name ?? '', build: row.build ?? '', seenAt: row.seenAt ?? 0 }))
    .sort((a, b) => b.seenAt - a.seenAt), [table]);
}

// ── 每日目标 ────────────────────────────────────────────────────────────────

/** One day's goals, in the order they were written. */
export function useGoalIds(day: string): string[] {
  return ui.useSliceRowIds('goalsByDay', day, indexes);
}

export function useGoal(id: string): Goal | null {
  const row = ui.useRow('goals', id, store);
  return useMemo(() => (row.createdAt && row.day
    ? { id, day: row.day, text: row.text ?? '', done: row.done ?? false, createdAt: row.createdAt }
    : null), [id, row]);
}

/** Goals counted per day. */
export function useGoalProgress(): Map<string, DayProgress> {
  const table = ui.useTable('goals', store);
  return useMemo(() => {
    const map = new Map<string, DayProgress>();
    for (const row of Object.values(table)) {
      if (!row.day || !row.createdAt) continue;
      const entry = map.get(row.day) ?? { total: 0, done: 0 };
      entry.total += 1;
      if (row.done) entry.done += 1;
      map.set(row.day, entry);
    }
    return map;
  }, [table]);
}

// A shared minute tick, so relative times ("3分钟前") stay current without
// every card running its own timer. Timers stop while iOS has the app
// suspended, so coming back to the foreground ticks at once.
let minute = Math.floor(Date.now() / 60_000);
const minuteListeners = new Set<() => void>();
function tick(): void {
  const next = Math.floor(Date.now() / 60_000);
  if (next !== minute) { minute = next; minuteListeners.forEach((listener) => listener()); }
}
if (typeof window !== 'undefined') {
  setInterval(tick, 10_000);
  document.addEventListener('visibilitychange', tick);
}
function subscribeMinute(listener: () => void): () => void {
  minuteListeners.add(listener);
  return () => minuteListeners.delete(listener);
}

export function useMinute(): number {
  return useSyncExternalStore(subscribeMinute, () => minute);
}

/** Today's local date key; re-renders only when the day changes. */
export function useToday(): string {
  return useSyncExternalStore(subscribeMinute, () => toLocalDateKey(new Date(minute * 60_000)));
}
