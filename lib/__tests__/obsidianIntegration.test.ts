import { describe, expect, it } from 'vitest';
import { buildIntegrationEvents } from '../obsidianIntegration';

const user = { id: 'user-1' };

function snapshot(posts: unknown[], dailyGoals?: unknown[]) {
  return {
    posts,
    user,
    ...(dailyGoals ? { dailyGoals } : {}),
    updatedAt: '2026-09-10T01:00:00.000Z',
  };
}

function thought(overrides: Record<string, unknown> = {}) {
  return {
    id: 'thought-1',
    entryType: 'thought',
    title: '一个想法',
    content: '正文',
    images: ['data:image/png;base64,should-not-sync'],
    createdAt: '2026-09-10T00:30:00.000Z',
    replies: [],
    isLiked: false,
    ...overrides,
  };
}

describe('buildIntegrationEvents', () => {
  it('creates a text-only upsert and ignores images and likes', async () => {
    const events = await buildIntegrationEvents(
      null,
      snapshot([thought()]),
      '2026-09-10T01:00:00.000Z',
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      op: 'upsert',
      entity: 'thought',
      id: 'thought-1',
      title: '一个想法',
      content: '正文',
      replies: [],
    });
    expect(events[0]).not.toHaveProperty('images');
  });

  it('emits an upsert when a reply is appended to the same post', async () => {
    const before = snapshot([thought()]);
    const after = snapshot([thought({
      replies: [{
        id: 'reply-1',
        postId: 'thought-1',
        content: '追加内容',
        createdAt: '2026-09-10T01:20:00.000Z',
      }],
    })]);

    const events = await buildIntegrationEvents(before, after, after.updatedAt);
    expect(events).toHaveLength(1);
    expect(events[0].replies).toEqual([{
      id: 'reply-1',
      content: '追加内容',
      createdAt: '2026-09-10T01:20:00.000Z',
    }]);
  });

  it('emits delete for a removed post and does not emit unchanged entries', async () => {
    const before = snapshot([thought(), {
      id: 'diary-1',
      entryType: 'diary',
      content: '保留的日记',
      createdAt: '2026-09-10T02:00:00.000Z',
      replies: [],
    }]);
    const after = snapshot([{
      id: 'diary-1',
      entryType: 'diary',
      content: '保留的日记',
      createdAt: '2026-09-10T02:00:00.000Z',
      replies: [],
    }]);

    const events = await buildIntegrationEvents(before, after, after.updatedAt);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ op: 'delete', entity: 'thought', id: 'thought-1' });
  });

  it('moves a record by deleting the old daily location before upserting the new one', async () => {
    const before = snapshot([thought({ createdAt: '2026-09-09T23:59:00.000Z' })]);
    const after = snapshot([thought({ createdAt: '2026-09-10T00:01:00.000Z' })]);
    const events = await buildIntegrationEvents(before, after, after.updatedAt);
    expect(events.map((event) => event.op)).toEqual(['delete', 'upsert']);
  });

  it('supports multiple daily goals and completion changes', async () => {
    const before = snapshot([], [{
      id: 'goal-1', date: '2026-09-10', content: '完成同步', completed: false,
      updatedAt: '2026-09-10T00:00:00.000Z',
    }]);
    const after = snapshot([], [
      {
        id: 'goal-1', date: '2026-09-10', content: '完成同步', completed: true,
        updatedAt: '2026-09-10T02:00:00.000Z',
      },
      {
        id: 'goal-2', date: '2026-09-10', title: '写测试', content: '', completed: false,
        updatedAt: '2026-09-10T02:01:00.000Z',
      },
    ]);

    const events = await buildIntegrationEvents(before, after, after.updatedAt);
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.id).sort()).toEqual(['goal-1', 'goal-2']);
    expect(events.find((event) => event.id === 'goal-1')).toMatchObject({ completed: true });
  });

  it('rejects oversized text instead of silently truncating it', async () => {
    await expect(buildIntegrationEvents(
      null,
      snapshot([thought({ content: 'x'.repeat(200_001) })]),
      '2026-09-10T01:00:00.000Z',
    )).rejects.toThrow(/exceeds/);
  });
});
