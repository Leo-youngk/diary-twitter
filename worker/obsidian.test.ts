import { describe, expect, it } from 'vitest';
import { currentVersions, diffEvents, normalizePost, postVersion, type LegacyShapePost } from './obsidian';

/**
 * Reference: the hash the pre-rebuild integration (lib/obsidianIntegration.ts
 * at tag legacy-final) sent for a post. Copied verbatim for this comparison
 * only — if the new code hashed differently, the migration would re-send
 * every post to the vault.
 */
async function legacyVersion(value: Record<string, unknown>): Promise<string> {
  const optionalText = (v: unknown) => (typeof v !== 'string' || !v.trim() ? undefined : v.trim());
  const normalizeTags = (v: unknown) => {
    if (!Array.isArray(v)) return undefined;
    const tags = v.filter((t): t is string => typeof t === 'string').map((t) => t.trim().slice(0, 80)).filter(Boolean).slice(0, 30);
    return tags.length > 0 ? tags : undefined;
  };
  const id = value.id as string;
  const replies = (value.replies as Array<Record<string, unknown>>)
    .map((reply) => ({
      id: typeof reply.id === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(reply.id) ? reply.id : `${id}-reply-${String(reply.createdAt ?? '')}`,
      content: reply.content as string,
      createdAt: typeof reply.createdAt === 'string' && Number.isFinite(Date.parse(reply.createdAt)) ? reply.createdAt : new Date(0).toISOString(),
    }))
    .filter((reply) => reply.content.length > 0)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const payload = {
    id,
    entity: value.entryType,
    createdAt: value.createdAt,
    title: optionalText(value.title) ?? null,
    content: value.content,
    category: optionalText(value.category) ?? null,
    mood: optionalText(value.mood) ?? null,
    tags: normalizeTags(value.tags) ?? [],
    replies,
  };
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const samples: LegacyShapePost[] = [
  { id: '1758000000000-abc', entryType: 'thought', createdAt: '2026-09-20T01:02:03.000Z', content: '一条随想', replies: [] },
  {
    id: '1758000000001-def', entryType: 'diary', createdAt: '2026-09-21T23:59:00.000Z',
    title: '  周日  ', content: '长长的日记\n第二段', category: ' 读书 ',
    replies: [
      { id: 'r2', content: '后来', createdAt: '2026-09-22T10:00:00.000Z' },
      { id: 'r1', content: '先前', createdAt: '2026-09-22T09:00:00.000Z' },
      { id: 'r3', content: '', createdAt: '2026-09-22T11:00:00.000Z' },
    ],
  },
  { id: '1758000000002-ghi', entryType: 'thought', createdAt: '2026-09-23T08:00:00.000Z', title: '', content: 'x', category: '', replies: [{ content: '没有 id', createdAt: '2026-09-23T09:00:00.000Z' }] },
];

describe('Obsidian versions', () => {
  it('match the pre-rebuild hash exactly', async () => {
    for (const post of samples) {
      const normalized = normalizePost(post)!;
      expect(await postVersion(normalized)).toBe(await legacyVersion(post as unknown as Record<string, unknown>));
    }
  });

  it('never sends 英文 posts or broken rows', () => {
    expect(normalizePost({ ...samples[0], entryType: 'article' })).toBeNull();
    expect(normalizePost({ ...samples[0], id: 'bad id' })).toBeNull();
    expect(normalizePost({ ...samples[0], createdAt: 'yesterday' })).toBeNull();
  });
});

describe('diffEvents', () => {
  const snapshot = '2026-09-30T00:00:00.000Z';

  it('sends nothing when the vault already has these versions', async () => {
    const current = await currentVersions(samples);
    const ledger = [...current.values()].map(({ post, version }) => ({ id: post.id, entity: post.entity, created_at: post.createdAt, version }));
    expect(await diffEvents(ledger, current, snapshot)).toEqual([]);
  });

  it('upserts an edit and deletes a removed post, deletions first', async () => {
    const before = await currentVersions(samples);
    const ledger = [...before.values()].map(({ post, version }) => ({ id: post.id, entity: post.entity, created_at: post.createdAt, version }));
    const after = await currentVersions([{ ...samples[0], content: '改过' }, samples[1]]);
    const events = await diffEvents(ledger, after, snapshot);
    expect(events.map((e) => [e.op, e.id])).toEqual([['delete', samples[2].id], ['upsert', samples[0].id]]);
  });

  it('moves a post whose type changed: delete the old file, then upsert', async () => {
    const before = await currentVersions([samples[0]]);
    const ledger = [...before.values()].map(({ post, version }) => ({ id: post.id, entity: post.entity, created_at: post.createdAt, version }));
    const events = await diffEvents(ledger, await currentVersions([{ ...samples[0], entryType: 'diary' }]), snapshot);
    expect(events.map((e) => [e.op, e.entity])).toEqual([['delete', 'thought'], ['upsert', 'diary']]);
  });
});
