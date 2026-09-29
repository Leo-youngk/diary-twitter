import type { MergeableStore } from 'tinybase';
import { ROW_ID_PATTERN, type PostRow, type ProfileValues, type ReplyRow } from '../src/lib/schema';
import { currentVersions, seedLedger, type LegacyShapePost } from './obsidian';
import { insertLedgerRow } from './x';
import type { Env } from './env';

/**
 * One-time import of a pre-rebuild snapshot (`diary:{code}` in KV) into a new
 * Durable Object. Runs once per sync code, the first time a device connects.
 *
 * Besides the data it carries over what the old integrations already did, so
 * nothing is delivered twice: X markers become `sent` ledger rows (and give
 * later replies a tweet to quote), and the Obsidian ledger is seeded with the
 * versions the vault already has.
 */

export interface LegacyBlob {
  hash: string;
  type: string;
  bytes: Uint8Array;
}

export interface ConvertedLegacy {
  posts: Record<string, PostRow>;
  replies: Record<string, ReplyRow>;
  values: Partial<ProfileValues>;
  blobs: LegacyBlob[];
  /** Posts and replies that asked for X, keyed by id; value is the parent post id for replies. */
  xRequested: Map<string, { kind: 'post' | 'reply'; parent: string }>;
  legacyPosts: LegacyShapePost[];
}

const DATA_URL = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function validIso(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Turn a data URL into a blob ref; anything else is dropped (refs only from now on). */
async function toRef(value: unknown, blobs: Map<string, LegacyBlob>): Promise<string> {
  const match = DATA_URL.exec(str(value));
  if (!match) return '';
  const bytes = decodeBase64(match[2]);
  const hash = await sha256Hex(bytes);
  if (!blobs.has(hash)) blobs.set(hash, { hash, type: match[1].toLowerCase(), bytes });
  return `blob:${hash}`;
}

export async function convertLegacy(raw: unknown): Promise<ConvertedLegacy | null> {
  if (!isRecord(raw) || !Array.isArray(raw.posts)) return null;
  const blobs = new Map<string, LegacyBlob>();
  const posts: Record<string, PostRow> = {};
  const replies: Record<string, ReplyRow> = {};
  const xRequested = new Map<string, { kind: 'post' | 'reply'; parent: string }>();
  const legacyPosts: LegacyShapePost[] = [];

  for (const post of raw.posts) {
    if (!isRecord(post) || !ROW_ID_PATTERN.test(str(post.id)) || !validIso(post.createdAt)) continue;
    const entryType = post.entryType === 'diary' || post.entryType === 'article' ? post.entryType : 'thought';
    const id = str(post.id);
    const images: string[] = [];
    for (const image of Array.isArray(post.images) ? post.images : []) {
      const ref = await toRef(image, blobs);
      if (ref) images.push(ref);
    }
    posts[id] = {
      entryType,
      category: str(post.category).trim(),
      title: str(post.title).trim(),
      content: str(post.content),
      images: JSON.stringify(images),
      createdAt: post.createdAt,
      isLiked: post.isLiked === true,
      xSync: post.xSync === true,
    };
    if (post.xSync === true) xRequested.set(id, { kind: 'post', parent: '' });

    const postReplies: LegacyShapePost['replies'] = [];
    for (const reply of Array.isArray(post.replies) ? post.replies : []) {
      if (!isRecord(reply) || !ROW_ID_PATTERN.test(str(reply.id)) || !validIso(reply.createdAt)) continue;
      replies[str(reply.id)] = {
        postId: id,
        content: str(reply.content),
        createdAt: reply.createdAt,
        xSync: reply.xSync === true,
      };
      if (reply.xSync === true) xRequested.set(str(reply.id), { kind: 'reply', parent: id });
      postReplies.push({ id: str(reply.id), content: str(reply.content), createdAt: reply.createdAt });
    }
    legacyPosts.push({
      id,
      entryType,
      createdAt: post.createdAt,
      title: str(post.title),
      content: str(post.content),
      category: str(post.category),
      replies: postReplies,
    });
  }

  const user = isRecord(raw.user) ? raw.user : {};
  const values: Partial<ProfileValues> = {};
  for (const key of ['displayName', 'username', 'bio', 'joinedDate', 'birthDate'] as const) {
    if (typeof user[key] === 'string') values[key] = user[key] as string;
  }
  values.avatar = await toRef(user.avatar, blobs);
  values.banner = await toRef(user.banner, blobs);

  return { posts, replies, values, blobs: [...blobs.values()], xRequested, legacyPosts };
}

interface XMarker {
  bufferPostId?: string;
  link?: string;
  replyTo?: string;
}

/** Import the snapshot for `code` if there is one. Returns what was imported. */
export async function importLegacy(env: Env, store: MergeableStore, sql: SqlStorage, code: string) {
  const raw = await env.LEGACY_KV.get(`diary:${code}`, 'json');
  const converted = await convertLegacy(raw);
  if (!converted) return { imported: false as const };

  for (const blob of converted.blobs) {
    await env.DATA_KV.put(`blob:${code}:${blob.hash}`, blob.bytes, { metadata: { type: blob.type } });
  }

  // X: what the old integration already published or was still sending.
  const markerPrefix = `diary:x-posted:${code}:`;
  const listed = await env.LEGACY_KV.list<{ status?: string }>({ prefix: markerPrefix });
  const marked = new Set<string>();
  for (const key of listed.keys) {
    const id = key.name.slice(markerPrefix.length);
    const marker = await env.LEGACY_KV.get<XMarker>(key.name, 'json');
    const requested = converted.xRequested.get(id);
    const status = key.metadata?.status;
    insertLedgerRow(sql, {
      id,
      kind: marker?.replyTo || requested?.kind === 'reply' ? 'reply' : 'post',
      parent: marker?.replyTo ?? requested?.parent ?? '',
      state: status === 'sent' ? 'sent' : 'publishing',
      buffer_id: marker?.bufferPostId ?? '',
      link: marker?.link ?? '',
    });
    marked.add(id);
  }
  // Asked for X but without a marker: the outcome is unknown, so never send.
  for (const [id, { kind, parent }] of converted.xRequested) {
    if (marked.has(id)) continue;
    insertLedgerRow(sql, {
      id, kind, parent, state: 'failed',
      error: '迁移前没有确认这条是否已发出；请到 X 核对，没发出再点重试',
    });
  }

  seedLedger(sql, await currentVersions(converted.legacyPosts));

  store.transaction(() => {
    for (const [id, row] of Object.entries(converted.posts)) store.setRow('posts', id, { ...row });
    for (const [id, row] of Object.entries(converted.replies)) store.setRow('replies', id, { ...row });
    for (const [key, value] of Object.entries(converted.values)) {
      if (value !== undefined) store.setValue(key, value);
    }
  });

  return {
    imported: true as const,
    posts: Object.keys(converted.posts).length,
    replies: Object.keys(converted.replies).length,
    blobs: converted.blobs.length,
    xMarkers: marked.size,
  };
}
