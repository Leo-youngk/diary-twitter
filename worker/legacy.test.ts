import { describe, expect, it } from 'vitest';
import { convertLegacy } from './legacy';

// A 1×1 PNG.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function sha256Hex(dataUrl: string): Promise<string> {
  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

describe('convertLegacy', () => {
  it('carries posts, replies, profile and images over as refs', async () => {
    const converted = await convertLegacy({
      user: { displayName: '我', username: 'me', avatar: PNG, banner: '' },
      posts: [
        {
          id: '1758000000000-abc', entryType: 'thought', content: '随想', createdAt: '2026-09-20T01:02:03.000Z',
          images: [PNG, PNG, 'https://example.com/not-kept.png'], isLiked: true, xSync: true,
          replies: [{ id: '1758000000009-r', content: '追加', createdAt: '2026-09-20T02:00:00.000Z', xSync: true }],
        },
        { id: '1758000000001-def', entryType: 'diary', title: ' 标题 ', content: '日记', createdAt: '2026-09-21T00:00:00.000Z', replies: [] },
        { id: 'bad id', entryType: 'thought', content: 'x', createdAt: '2026-09-21T00:00:00.000Z' },
        { id: '1758000000002-ghi', entryType: 'thought', content: 'x', createdAt: 'not a date' },
      ],
    });
    expect(converted).not.toBeNull();
    const hash = await sha256Hex(PNG);

    expect(Object.keys(converted!.posts)).toEqual(['1758000000000-abc', '1758000000001-def']);
    expect(converted!.posts['1758000000000-abc']).toMatchObject({ isLiked: true, xSync: true, images: JSON.stringify([`blob:${hash}`, `blob:${hash}`]) });
    expect(converted!.posts['1758000000001-def']).toMatchObject({ entryType: 'diary', title: '标题', xSync: false });
    expect(converted!.replies['1758000000009-r']).toMatchObject({ postId: '1758000000000-abc', xSync: true });
    expect(converted!.values).toMatchObject({ displayName: '我', avatar: `blob:${hash}`, banner: '' });
    // The same picture three times is stored once.
    expect(converted!.blobs.map((b) => [b.hash, b.type])).toEqual([[hash, 'image/png']]);
    expect([...converted!.xRequested]).toEqual([
      ['1758000000000-abc', { kind: 'post', parent: '' }],
      ['1758000000009-r', { kind: 'reply', parent: '1758000000000-abc' }],
    ]);
  });

  it('rejects anything that is not a snapshot', async () => {
    expect(await convertLegacy(null)).toBeNull();
    expect(await convertLegacy({ posts: 'nope' })).toBeNull();
  });
});
