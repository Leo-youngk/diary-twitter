import { describe, expect, it } from 'vitest';
import { discoveryTakeaway, discussionSearch, followerChange, writingPrompt, xInsights } from '../xInsights';
import type { XMetricRow, XTweetRow } from '../schema';

const HOUR = 3600_000;
const now = Date.parse('2026-10-04T20:32:00Z');
const text = '我用手机的 Claude Code 连接 GitHub 项目，实际跑通了修改和提交。遇到的问题也值得记录。';
const tweet = (extra: Partial<XTweetRow> = {}): Partial<XTweetRow> => ({ text, createdAt: new Date(now - 48 * HOUR).toISOString(),
  measuredAt: now - 60_000, views: 11, likes: 0, replies: 0, reposts: 0, quotes: 0, bookmarks: 0,
  metricMask: 63, kind: 'post', inReplyTo: '', gone: false, ...extra });
const checkpoint = (id: string, extra: Partial<XMetricRow> = {}): Partial<XMetricRow> => ({ tweetId: id, stage: 'h24',
  at: now - 24 * HOUR, views: 20, likes: 0, replies: 0, reposts: 0, quotes: 0, bookmarks: 0, ownReplies: 0, metricMask: 63, ...extra });

describe('account discovery evidence', () => {
  it('includes external replies and excludes self-continuations, even when they continue an external conversation', () => {
    const result = xInsights({ original: tweet({ replies: 1 }), reply: tweet({ kind: 'reply', inReplyTo: 'other', views: 103 }),
      part: tweet({ inReplyTo: 'original', views: 10000 }), replyPart: tweet({ kind: 'reply', inReplyTo: 'reply', views: 9000 }) }, {}, 7, now);
    expect(result.comparison.original).toMatchObject({ count: 1, medianViews: 11, responded: 0 });
    expect(result.comparison.reply).toMatchObject({ count: 1, medianViews: 103 });
    expect(result.posts.find((post) => post.id === 'replyPart')?.entry).toBe('thread');
    expect(result.seeds).toEqual([]); // An own thread part is not a reader's reply.
  });

  it('does not compare new posts or old posts whose only measurement was early', () => {
    const result = xInsights({ mature: tweet(), new: tweet({ createdAt: new Date(now - 2 * HOUR).toISOString(), views: 900 }),
      stale: tweet({ measuredAt: now - 47 * HOUR, views: 1000 }), gone: tweet({ gone: true }),
      future: tweet({ createdAt: new Date(now + HOUR).toISOString() }), old: tweet({ createdAt: new Date(now - 8 * 24 * HOUR).toISOString() }) }, {}, 7, now);
    expect(result.comparison.original).toMatchObject({ count: 1, medianViews: 11 });
    expect(result.posts.map((post) => post.id)).toEqual(['new', 'mature', 'stale']);
  });

  it('prioritizes actual feedback over a high-view reply and keeps zero-feedback evidence separate', () => {
    const result = xInsights({ useful: tweet({ kind: 'reply', views: 518, likes: 2 }),
      emptyReach: tweet({ kind: 'reply', views: 1666 }), short: tweet({ kind: 'reply', text: '😂天才！', likes: 3 }) }, {}, 7, now);
    expect(result.seeds.map((post) => post.id)).toEqual(['useful']);
    expect(result.noFeedback?.id).toBe('emptyReach');
    expect(result.comparison.reply.responded).toBe(2);
  });

  it('preserves missing counts and never turns incomplete zero-like data into no interest', () => {
    const result = xInsights({ zero: tweet({ metricMask: 1 }), positive: tweet({ metricMask: 3, likes: 1 }),
      unknownViews: tweet({ metricMask: 62, views: 999, likes: 10 }) }, {}, 7, now);
    expect(result.comparison.original).toMatchObject({ count: 2, responded: 1, feedbackKnown: 1 });
    expect(result.seeds.map((post) => post.id)).toEqual(['positive']);
    expect(result.noFeedback).toBeNull();
    expect(xInsights({}, {}, 7, now).comparison.original.medianViews).toBeNull();
  });

  it('uses 24h snapshots once both groups have coverage and keeps historical self-replies out', () => {
    const result = xInsights({ p: tweet({ views: 3000 }), r: tweet({ kind: 'reply', views: 9000 }),
      part: tweet({ inReplyTo: 'p' }) }, { p: checkpoint('p', { views: 50, replies: 1, ownReplies: 1 }),
      r: checkpoint('r', { views: 100, likes: 1 }) }, 7, now);
    expect(result.comparison).toMatchObject({ basis: 'h24', original: { medianViews: 50, responded: 0 }, reply: { medianViews: 100, responded: 1 } });
  });

  it('does not erase usable history for a few new checkpoints or use out-of-age points', () => {
    const rows = { p: tweet(), p2: tweet(), p3: tweet(), r: tweet({ kind: 'reply', views: 100 }) };
    const result = xInsights(rows, { p: checkpoint('p', { views: 900 }), r: checkpoint('r') }, 7, now);
    expect(result.comparison).toMatchObject({ basis: 'cumulative', original: { count: 3, medianViews: 11 } });
    expect(xInsights({ p: rows.p, r: rows.r }, { p: checkpoint('p', { at: now - 20 * HOUR }), r: checkpoint('r') }, 7, now).comparison.basis).toBe('cumulative');
  });

  it('uses only observed zeros and positive public metrics, without an invented algorithm score', () => {
    const result = xInsights({ one: tweet({ kind: 'reply', metricMask: 3 }), two: tweet({ kind: 'reply', views: 500, metricMask: 63 }) }, {}, 7, now);
    expect(result.noFeedback?.id).toBe('two');
    expect(result.comparison.reply.feedbackKnown).toBe(1);
  });

  it('distinguishes being seen from getting feedback, without recommending only the largest reach', () => {
    const result = xInsights({ original: tweet({ likes: 1 }), reply: tweet({ kind: 'reply', views: 1666 }) }, {}, 7, now);
    expect(discoveryTakeaway(result.comparison)).toContain('原创留下互动的比例更高');
    expect(result.seeds[0].id).toBe('original');
    expect(discoveryTakeaway(xInsights({}, {}, 7, now).comparison)).toBeNull();
  });
});

describe('honest follower intervals and writing handoff', () => {
  it('reports the exact short observed interval and has no fabricated change from one point', () => {
    const rows = { first: { at: now - HOUR, followers: 25 }, latest: { at: now - 60_000, followers: 28 } };
    expect(followerChange(rows, 7, now)).toEqual({ gain: 3, from: now - HOUR, to: now - 60_000 });
    expect(followerChange({ first: rows.first }, 7, now)).toBeNull();
    expect(followerChange({ future: { at: now + HOUR, followers: 99 } }, 7, now)).toBeNull();
  });

  it('uses a real boundary observation and supports a net loss', () => {
    const rows = { base: { at: now - 8 * 24 * HOUR, followers: 30 }, inside: { at: now - HOUR, followers: 28 } };
    expect(followerChange(rows, 7, now)).toEqual({ gain: -2, from: rows.base.at, to: rows.inside.at });
  });

  it('hands source text to a writing reference rather than fabricating a finished post', () => {
    const source = xInsights({ r: tweet({ kind: 'reply', text: '@person ' + text, likes: 2 }) }, {}, 7, now).seeds[0];
    expect(writingPrompt(source)).toContain(text);
    expect(writingPrompt(source)).not.toContain('@person');
    expect(writingPrompt(source)).toContain('只写你亲自验证过的部分');
    const search = new URL(discussionSearch(source, 'my_account')!);
    expect(search.searchParams.get('q')).toBe('Claude lang:zh -filter:retweets -from:my_account');
    expect(search.searchParams.get('f')).toBe('live');
    expect(discussionSearch(undefined, 'me')).toBeNull();
  });
});
