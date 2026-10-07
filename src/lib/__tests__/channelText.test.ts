import { describe, expect, it } from 'vitest';
import { SUBSTACK_MAX_LENGTH, THREADS_MAX_BYTES, splitForThreads, substackNote, threadsParts, utf8Length } from '../channelText';

const bytes = (text: string) => new TextEncoder().encode(text).length;
const unspaced = (text: string) => text.replace(/\s/g, '');

describe('utf8Length', () => {
  it('counts the bytes Threads counts', () => {
    expect(utf8Length('a'.repeat(500))).toBe(500);
    expect(utf8Length('字')).toBe(3);
    expect(utf8Length('，。“”')).toBe(12);
    expect(utf8Length('é')).toBe(2);
    expect(utf8Length('😀')).toBe(4);
    expect(utf8Length('👨‍👩‍👧‍👦')).toBe(25);
  });

  it('agrees with the encoder, lone surrogates included', () => {
    const text = '今天 walked 3 km 🚶‍♀️，“很累”。\n\uD800 end';
    expect(utf8Length(text)).toBe(bytes(text));
  });
});

describe('splitForThreads', () => {
  it('keeps a post that fits as it is', () => {
    expect(splitForThreads('  一句话。 ')).toEqual(['一句话。']);
    expect(splitForThreads('a'.repeat(THREADS_MAX_BYTES))).toHaveLength(1);
    expect(splitForThreads('字'.repeat(166))).toHaveLength(1);
    expect(splitForThreads('字'.repeat(167))).toHaveLength(2);
  });

  it('splits Chinese at the end of a sentence, every part within 500 bytes', () => {
    const sentence = '今天早上去河边跑了五公里，风很大，但是跑完以后心情很好。';
    const text = sentence.repeat(12);
    const parts = splitForThreads(text);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(bytes(part)).toBeLessThanOrEqual(THREADS_MAX_BYTES);
      expect(part.endsWith('。') || part === parts[parts.length - 1]).toBe(true);
    }
    expect(parts.join('')).toBe(text);
  });

  it('prefers a blank line, then a line break, over a sentence end', () => {
    const first = '第一段。'.repeat(30);
    const second = '第二段。'.repeat(30);
    expect(splitForThreads(`${first}\n\n${second}`)).toEqual([first, second]);
    expect(splitForThreads(`${first}\n${second}`)).toEqual([first, second]);
  });

  it('keeps a closing quote with its sentence', () => {
    const text = `${'她说：“今天真好。”'.repeat(14)}${'然后我们回家了。'.repeat(10)}`;
    for (const part of splitForThreads(text)) expect(part.startsWith('”')).toBe(false);
  });

  it('splits English at sentences, then spaces, never inside a word', () => {
    const text = 'I walked along the river this morning and the wind was strong. '.repeat(12).trim();
    const parts = splitForThreads(text);
    for (const part of parts) {
      expect(bytes(part)).toBeLessThanOrEqual(THREADS_MAX_BYTES);
      expect(part.endsWith('.')).toBe(true);
    }
    const words = 'word '.repeat(150).trim();
    for (const part of splitForThreads(words)) expect(part.split(' ').every((word) => word === 'word')).toBe(true);
  });

  it('falls back to a hard cut when the text never pauses, without breaking an emoji', () => {
    const plain = splitForThreads('字'.repeat(400));
    expect(plain.map((part) => part.length)).toEqual([166, 166, 68]);
    const family = '👨‍👩‍👧‍👦';
    const parts = splitForThreads(family.repeat(50));
    for (const part of parts) {
      expect(bytes(part)).toBeLessThanOrEqual(THREADS_MAX_BYTES);
      expect(part.replaceAll(family, '')).toBe('');
    }
    expect(parts.join('')).toBe(family.repeat(50));
  });

  it('loses nothing but the spaces where it cuts', () => {
    const text = `开头。\n\n${'很长的一段话，没有句号但有逗号'.repeat(40)}\n结尾 with some English words and more words.`;
    expect(unspaced(splitForThreads(text).join(''))).toBe(unspaced(text));
  });
});

describe('threadsParts and substackNote', () => {
  it('splits each part of a post on its own, in order', () => {
    expect(threadsParts(['短的一条', '字'.repeat(200), '最后'])).toEqual(['短的一条', '字'.repeat(166), '字'.repeat(34), '最后']);
  });

  it('joins a post and its parts into one Note', () => {
    expect(substackNote(['第一段', '第二段'])).toBe('第一段\n\n第二段');
    expect(SUBSTACK_MAX_LENGTH).toBe(10_000);
  });
});
