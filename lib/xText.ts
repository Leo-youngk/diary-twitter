// X counts characters by "weight", not by length: most CJK characters and emoji
// weigh 2, so a Chinese post tops out at 140 characters. The ranges below are
// the ones from X's published twitter-text v3 config (weight 1 = Latin-ish
// text and common punctuation, everything else weighs 2; a URL is always 23).
// Grapheme clusters are not merged, so emoji sequences are over-counted, which
// only ever errs on the side of rejecting a post that X might have accepted.

export const X_MAX_WEIGHT = 280;

const URL_WEIGHT = 23;
const URL_PATTERN = /https?:\/\/\S+/g;

function charWeight(codePoint: number): number {
  if (
    codePoint <= 4351
    || (codePoint >= 8192 && codePoint <= 8205)
    || (codePoint >= 8208 && codePoint <= 8223)
    || (codePoint >= 8242 && codePoint <= 8247)
  ) return 1;
  return 2;
}

export function xWeightedLength(text: string): number {
  let total = 0;
  const withoutUrls = text.replace(URL_PATTERN, () => {
    total += URL_WEIGHT;
    return '';
  });
  for (const char of Array.from(withoutUrls)) {
    total += charWeight(char.codePointAt(0) ?? 0);
  }
  return total;
}
