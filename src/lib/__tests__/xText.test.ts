import { describe, expect, it } from 'vitest';
import { X_MAX_WEIGHT, xWeightedLength } from '../xText';

describe('xWeightedLength', () => {
  it('counts Latin text as 1 per character', () => {
    expect(xWeightedLength('a'.repeat(280))).toBe(280);
    expect(xWeightedLength('hello, world\n')).toBe(13);
  });

  it('counts Chinese characters as 2, so 140 of them fill a post', () => {
    expect(xWeightedLength('字'.repeat(140))).toBe(X_MAX_WEIGHT);
    expect(xWeightedLength('字'.repeat(141))).toBeGreaterThan(X_MAX_WEIGHT);
  });

  it('counts fullwidth punctuation and emoji as 2', () => {
    expect(xWeightedLength('，。！')).toBe(6);
    expect(xWeightedLength('🙂')).toBe(2);
  });

  it('counts every URL as 23 regardless of its length', () => {
    expect(xWeightedLength('https://example.com/a/very/long/path?with=query&and=more')).toBe(23);
    expect(xWeightedLength('看 https://example.com/x')).toBe(2 + 1 + 23);
  });
});
