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
  /** Engagement on X as last reported by Buffer; 0 until the first report. */
  impressions: number;
  likes: number;
  replies: number;
  reposts: number;
  clicks: number;
  /** When Buffer last measured these numbers (ms), 0 if never. */
  metricsAt: number;
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
  },
  xposts: {
    state: { type: 'string', default: 'queued' },
    kind: { type: 'string', default: 'post' },
    link: { type: 'string', default: '' },
    error: { type: 'string', default: '' },
    at: { type: 'number', default: 0 },
    command: { type: 'string', default: '' },
    impressions: { type: 'number', default: 0 },
    likes: { type: 'number', default: 0 },
    replies: { type: 'number', default: 0 },
    reposts: { type: 'number', default: 0 },
    clicks: { type: 'number', default: 0 },
    metricsAt: { type: 'number', default: 0 },
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
