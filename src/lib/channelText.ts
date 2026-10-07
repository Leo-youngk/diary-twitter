// How much text each platform takes per post, measured the way it measures.
// Threads counts UTF-8 bytes, not characters: a Chinese character or
// punctuation mark is 3 and an emoji 4 or more, so a Chinese post holds about
// 166 characters. Buffer checks only characters, then Threads refuses the post.
// Substack counts characters, and a Note holds 10,000.

export const THREADS_MAX_BYTES = 500;
/** Buffer publishes a thread of at most 25 posts. */
export const THREADS_MAX_PARTS = 25;
export const SUBSTACK_MAX_LENGTH = 10_000;

function charBytes(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  // A lone surrogate is sent as U+FFFD, also 3 bytes.
  return code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
}

export function utf8Length(text: string): number {
  let bytes = 0;
  for (const char of text) bytes += charBytes(char);
  return bytes;
}

function overBytes(text: string, max: number): boolean {
  let bytes = 0;
  for (const char of text) {
    bytes += charBytes(char);
    if (bytes > max) return true;
  }
  return false;
}

const graphemes = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

/** The longest start of `text` within `max` bytes that ends between two characters as a reader sees them. */
function byteLimit(text: string, max: number): number {
  // Every UTF-16 unit takes at least a byte, so the limit lies within the first max + 1.
  const head = text.slice(0, max + 1);
  const pieces = graphemes ? Array.from(graphemes.segment(head), (piece) => piece.segment) : Array.from(head);
  let bytes = 0;
  let end = 0;
  for (const piece of pieces) {
    bytes += utf8Length(piece);
    if (bytes > max) break;
    end += piece.length;
  }
  // Only a single character longer than the limit gets here with nothing; send it alone.
  return end || pieces[0].length;
}

// Where a part may end, best first: a blank line, a line, a sentence, a
// clause, a space. Each is taken only past the middle of the room, so no part is tiny.
const BREAKS: Array<[RegExp, 'after' | 'before']> = [
  [/\n[^\S\n]*\n/g, 'after'],
  [/\n/g, 'after'],
  [/[。！？!?…]+[”’"'」』）)】\]]*|\.(?=\s)/g, 'after'],
  [/[，、；：]+|[,;:](?=\s)/g, 'after'],
  [/\s+/g, 'before'],
];

function cutAt(text: string, limit: number): number {
  const window = text.slice(0, limit + 1);
  const floor = Math.floor(limit / 2);
  for (const [pattern, side] of BREAKS) {
    let best = 0;
    for (const match of window.matchAll(pattern)) {
      const at = side === 'after' ? match.index + match[0].length : match.index;
      if (at >= floor && at <= limit) best = at;
    }
    if (best > 0) return best;
  }
  return limit;
}

/** One text as the Threads posts it needs, each within the byte limit, split where the text pauses. */
export function splitForThreads(text: string): string[] {
  const parts: string[] = [];
  let rest = text.trim();
  while (overBytes(rest, THREADS_MAX_BYTES)) {
    const cut = cutAt(rest, byteLimit(rest, THREADS_MAX_BYTES));
    parts.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}

/** A post and the parts written with it, as the posts of a Threads thread. */
export function threadsParts(texts: string[]): string[] {
  return texts.flatMap(splitForThreads);
}

/** A post and the parts written with it, as one Substack Note. */
export function substackNote(texts: string[]): string {
  return texts.join('\n\n');
}
