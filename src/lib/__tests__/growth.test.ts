import { describe, expect, it } from 'vitest';
import {
  diagnose, followerTrend, myTweets, PRIOR_LIKE_RATE, scorePerThousand, todayPlan,
} from '../growth';
import type { XTweetRow } from '../schema';

const HOUR = 3600_000;
// Local times, so the day boundaries hold in any timezone the tests run in.
const local = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const now = local(4, 12);
const today = '2026-10-04';

const tweet = (at: number, extra: Partial<XTweetRow> = {}): Partial<XTweetRow> => ({
  text: 'x', createdAt: new Date(at).toISOString(), kind: 'post', inReplyTo: '',
  views: 0, likes: 0, replies: 0, reposts: 0, quotes: 0, bookmarks: 0, measuredAt: at + 1, gone: false, ...extra,
});

describe('myTweets', () => {
  it("tells originals from thread parts and replies, and leaves one's own answers out of the replies", () => {
    const tweets = myTweets({
      root: tweet(local(4, 9), { replies: 4 }),
      part: tweet(local(4, 9, 1), { inReplyTo: 'root' }),
      answer: tweet(local(4, 10), { kind: 'reply', inReplyTo: 'someone' }),
      gone: tweet(local(4, 8), { gone: true }),
    });
    expect(tweets.map((t) => [t.id, t.original, t.reply])).toEqual([
      ['root', true, false], ['part', false, false], ['answer', false, true],
    ]);
    expect(tweets[0].replies).toBe(3);
  });
});

describe('todayPlan', () => {
  it("counts today's originals and replies and follows the 2-hour window", () => {
    const plan = todayPlan(myTweets({
      yesterday: tweet(local(3, 23)),
      morning: tweet(local(4, 8), { views: 40, likes: 2, replies: 1 }),
      fresh: tweet(local(4, 11, 30), { views: 20, likes: 1 }),
      unread: tweet(local(4, 11, 50), { measuredAt: 0 }),
      reply: tweet(local(4, 9), { kind: 'reply', inReplyTo: 'other' }),
    }), today, now);
    expect(plan.originals).toBe(3);
    expect(plan.replies).toBe(1);
    expect(plan.inWindow.map((p) => [p.id, p.endsAt, p.likeRate])).toEqual([
      ['unread', local(4, 13, 50), null],
      ['fresh', local(4, 13, 30), 0.05],
    ]);
    expect(plan.answered).toEqual([{ id: 'morning', text: 'x', replies: 1 }]);
  });

  it('stops pointing at replies once the post has left For You', () => {
    const plan = todayPlan(myTweets({ old: tweet(now - 49 * HOUR, { replies: 9 }) }), today, now);
    expect(plan.answered).toEqual([]);
  });
});

describe('scorePerThousand', () => {
  it("weighs each action's rate as X weighs the predicted one", () => {
    // (0.5 × 4 + 5 × 1 + 1 × 2 + 5 × 1) / 200 views × 1000
    expect(scorePerThousand({ views: 200, likes: 4, replies: 1, reposts: 2, quotes: 1 })).toBe(70);
    expect(scorePerThousand({ views: 0, likes: 1, replies: 0, reposts: 0, quotes: 0 })).toBeNull();
  });
});

describe('diagnose', () => {
  const tweets = myTweets({
    a: tweet(local(1, 9), { views: 100, likes: 1 }),
    b: tweet(local(1, 10), { views: 300, likes: 9, replies: 2, bookmarks: 3 }),
    c: tweet(local(2, 21), { views: 50, likes: 2, quotes: 1 }),
    d: tweet(local(2, 22), { views: 10, likes: 1 }),
    young: tweet(local(4, 2), { views: 500, likes: 50 }),
    reply: tweet(local(2, 12), { kind: 'reply', inReplyTo: 'other', likes: 3 }),
  });

  it('compares only originals old enough to have settled', () => {
    const result = diagnose(tweets, local(1, 0), now);
    expect(result.originals).toBe(5);
    expect(result.settled).toBe(4);
    expect(result.views).toBe(460);
    expect(result.likeRate).toBeCloseTo(13 / 460);
    expect(result.replies).toBe(1);
    expect(result.replyLikes).toBe(3);
  });

  it('measures each post against the slot prior only with enough views', () => {
    const result = diagnose(tweets, local(1, 0), now);
    expect(PRIOR_LIKE_RATE).toBeCloseTo(0.015);
    // a (1%) misses the prior; b (3%) and c (4%) beat it; d has too few views to judge.
    expect(result.rated).toBe(3);
    expect(result.beatPrior).toBe(2);
  });

  it('splits the score by action and finds the posts the weights favour', () => {
    const result = diagnose(tweets, local(1, 0), now);
    // likes 13 × 0.5 = 6.5, replies 2 × 5 = 10, quotes 1 × 5 = 5
    expect(result.scorePerThousand).toBeCloseTo((21.5 / 460) * 1000);
    expect(result.mix.likes).toBeCloseTo(6.5 / 21.5);
    expect(result.mix.replies).toBeCloseTo(10 / 21.5);
    expect(result.mix.reposts).toBe(0);
    expect(result.talkPerThousand).toBeCloseTo((3 / 460) * 1000);
    expect(result.bookmarksPerThousand).toBeCloseTo((3 / 460) * 1000);
    expect(result.best.map((p) => p.id)).toEqual(['c', 'b', 'a']);
  });

  it('counts originals posted within 2 hours of the one before', () => {
    expect(diagnose(tweets, local(1, 0), now).crowded).toBe(2);
    // The original before the range still counts as the one before.
    expect(diagnose(tweets, local(1, 9, 30), now).crowded).toBe(2);
    expect(diagnose(tweets, local(2, 0), now).crowded).toBe(1);
  });

  it('groups posting hours with at least two settled originals', () => {
    expect(diagnose(tweets, local(1, 0), now).hours).toEqual([
      { from: 8, to: 12, posts: 2, medianViews: 200, likeRate: 10 / 400 },
      { from: 20, to: 24, posts: 2, medianViews: 30, likeRate: 3 / 60 },
    ]);
  });
});

describe('followerTrend', () => {
  it('turns daily readings into changes per local day', () => {
    const trend = followerTrend({
      '2026-10-01': { followers: 10, following: 5, at: local(1, 9) },
      '2026-10-02': { followers: 13, following: 5, at: local(2, 9) },
      '2026-10-03': { followers: 12, following: 5, at: local(3, 9) },
      '2026-10-04': { followers: 20, following: 5, at: local(4, 9) },
    }, today, now, 5);
    expect(trend.days).toEqual([
      { key: '2026-09-30', gain: null },
      { key: '2026-10-01', gain: null },
      { key: '2026-10-02', gain: 3 },
      { key: '2026-10-03', gain: -1 },
      { key: '2026-10-04', gain: 8 },
    ]);
    expect(trend.week).toEqual({ gain: 10, since: '2026-10-01' });
  });

  it('measures the week from its first day once the readings go back that far', () => {
    const trend = followerTrend({
      '2026-09-20': { followers: 3, following: 1, at: local(-10, 9) },
      '2026-09-27': { followers: 7, following: 1, at: local(-3, 9) },
      '2026-10-04': { followers: 9, following: 1, at: local(4, 9) },
    }, today, now);
    expect(trend.week).toEqual({ gain: 2, since: '2026-09-28' });
  });

  it('has nothing to say before the first reading', () => {
    expect(followerTrend({}, today, now)).toMatchObject({ week: null });
  });
});
