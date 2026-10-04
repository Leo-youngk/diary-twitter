// The synced data model, shared by the client and the Worker.
//
// TinyBase cells are strings, numbers or booleans, so lists (post images) are
// stored as JSON strings. Timestamps are ISO strings: they sort as text and
// match what the Obsidian integration has always hashed.

/**
 * New posts are always 'thought'. 'diary' and 'article' (and category/title)
 * only exist on posts written before the app became 随想-only; they are kept
 * as they are, because the Obsidian integration hashes them.
 */
export type EntryType = 'thought' | 'diary' | 'article';

export interface PostRow {
  entryType: EntryType;
  /** Category of an older post, '' otherwise. */
  category: string;
  /** Title of an older 日记/英文 post, '' otherwise. */
  title: string;
  content: string;
  /** JSON array of image refs (`blob:<sha256>`). */
  images: string;
  createdAt: string;
  isLiked: boolean;
  /** Set once at creation: also publish this 随想 to X. */
  xSync: boolean;
}

export interface ReplyRow {
  postId: string;
  content: string;
  createdAt: string;
  /** Set once at creation: also publish to X as a quote of the post. */
  xSync: boolean;
  /** Written with the post (the compose screen's +): goes to X with it as one thread, not as a quote. */
  thread: boolean;
}

export type XState = 'queued' | 'sending' | 'publishing' | 'sent' | 'failed' | 'dismissed';
export type XCommand = '' | 'retry' | 'dismiss';

/** Written by the server; the client only ever writes `command`. */
export interface XPostRow {
  state: XState;
  kind: 'post' | 'reply';
  link: string;
  error: string;
  at: number;
  command: XCommand;
}

/**
 * One tweet on the X account (row id = tweet id), written by the server from
 * X's public numbers: sent from the app or posted on X directly.
 */
export interface XTweetRow {
  text: string;
  /** ISO time it was posted. */
  createdAt: string;
  /** 'reply' answers someone else's conversation; a thread of one's own is 'post'. */
  kind: 'post' | 'reply';
  /** The tweet it answers, '' when it starts a conversation: a thread's later parts are posts that have one. */
  inReplyTo: string;
  views: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  bookmarks: number;
  /** When these numbers were read (ms), 0 if not yet. */
  measuredAt: number;
  /** Deleted on X (or no longer public); left out of the numbers. */
  gone: boolean;
}

/** The X account (row 'me'), written by the server. */
export interface XAccountRow {
  handle: string;
  followers: number;
  following: number;
  tweets: number;
  measuredAt: number;
  /** Why the last refresh failed ('' when it did not); the numbers are then older. */
  error: string;
  errorAt: number;
}

/**
 * The account's follower count over time, written by the server: one row per
 * UTC day (row id 'YYYY-MM-DD'), holding the last count read that day.
 */
export interface XFollowersRow {
  followers: number;
  following: number;
  /** When this count was first read (ms); it changes only with the count. */
  at: number;
}

/** One goal on one day's list (每日目标). */
export interface GoalRow {
  /** The local day it belongs to, 'YYYY-MM-DD'. */
  day: string;
  text: string;
  done: boolean;
  /** ISO; orders the day's list. */
  createdAt: string;
}

export interface ProfileValues {
  displayName: string;
  username: string;
  bio: string;
  /** Image ref or ''. */
  avatar: string;
  banner: string;
  joinedDate: string;
  /** 'YYYY-MM-DD' or ''. */
  birthDate: string;
  /** The default of the X switch on the compose screen (replies follow their post). */
  xSyncEnabled: boolean;
}

export const TABLES_SCHEMA = {
  posts: {
    entryType: { type: 'string', default: 'thought' },
    category: { type: 'string', default: '' },
    title: { type: 'string', default: '' },
    content: { type: 'string', default: '' },
    images: { type: 'string', default: '[]' },
    createdAt: { type: 'string', default: '' },
    isLiked: { type: 'boolean', default: false },
    xSync: { type: 'boolean', default: false },
  },
  replies: {
    postId: { type: 'string', default: '' },
    content: { type: 'string', default: '' },
    createdAt: { type: 'string', default: '' },
    xSync: { type: 'boolean', default: false },
    thread: { type: 'boolean', default: false },
  },
  xposts: {
    state: { type: 'string', default: 'queued' },
    kind: { type: 'string', default: 'post' },
    link: { type: 'string', default: '' },
    error: { type: 'string', default: '' },
    at: { type: 'number', default: 0 },
    command: { type: 'string', default: '' },
  },
  xtweets: {
    text: { type: 'string', default: '' },
    createdAt: { type: 'string', default: '' },
    kind: { type: 'string', default: 'post' },
    inReplyTo: { type: 'string', default: '' },
    views: { type: 'number', default: 0 },
    likes: { type: 'number', default: 0 },
    replies: { type: 'number', default: 0 },
    reposts: { type: 'number', default: 0 },
    quotes: { type: 'number', default: 0 },
    bookmarks: { type: 'number', default: 0 },
    measuredAt: { type: 'number', default: 0 },
    gone: { type: 'boolean', default: false },
  },
  xaccount: {
    handle: { type: 'string', default: '' },
    followers: { type: 'number', default: 0 },
    following: { type: 'number', default: 0 },
    tweets: { type: 'number', default: 0 },
    measuredAt: { type: 'number', default: 0 },
    error: { type: 'string', default: '' },
    errorAt: { type: 'number', default: 0 },
  },
  xfollowers: {
    followers: { type: 'number', default: 0 },
    following: { type: 'number', default: 0 },
    at: { type: 'number', default: 0 },
  },
  goals: {
    day: { type: 'string', default: '' },
    text: { type: 'string', default: '' },
    done: { type: 'boolean', default: false },
    createdAt: { type: 'string', default: '' },
  },
  // Written by the server on each connection: which version every device last ran.
  devices: {
    name: { type: 'string', default: '' },
    build: { type: 'string', default: '' },
    seenAt: { type: 'number', default: 0 },
  },
} as const;

export const VALUES_SCHEMA = {
  displayName: { type: 'string', default: '我的日记本' },
  username: { type: 'string', default: 'myjournal' },
  bio: { type: 'string', default: '' },
  avatar: { type: 'string', default: '' },
  banner: { type: 'string', default: '' },
  joinedDate: { type: 'string', default: '' },
  birthDate: { type: 'string', default: '' },
  xSyncEnabled: { type: 'boolean', default: true },
} as const;

export const ROW_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
/** WebSocket subprotocol of the sync connection; the device token is offered next to it. */
export const SYNC_PROTOCOL = 'diary-sync';
export const BLOB_HASH_PATTERN = /^[0-9a-f]{64}$/;
const BLOB_REF_PATTERN = /^blob:([0-9a-f]{64})$/;

/** The tweet id in an x.com / twitter.com status link. */
export function tweetIdOfLink(link: string | undefined): string | null {
  return link ? /\/status\/(\d+)/.exec(link)?.[1] ?? null : null;
}

export function blobHashOf(ref: string): string | null {
  return BLOB_REF_PATTERN.exec(ref)?.[1] ?? null;
}

export function parseImages(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}
