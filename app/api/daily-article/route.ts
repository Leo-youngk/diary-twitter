import { NextResponse } from 'next/server';

// Strip HTML tags, decode entities, clean up
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n /g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Extract transcript from singjupost.com (TED talks)
function extractSingjupost(html: string): string {
  // singjupost stores transcript in .entry-content div
  let source = '';

  // Try to grab entry-content
  const entryMatch = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)(?:<div[^>]*class="[^"]*(?:sharedaddy|jp-relatedposts|entry-footer)|<footer|<\/article)/i);
  if (entryMatch) {
    source = entryMatch[1];
  }

  if (!source) {
    // Broader fallback
    const broader = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*)/i);
    if (broader) {
      source = broader[1];
    }
  }

  if (!source) return '';

  // Remove sharing buttons, related posts, navigation, ads, social share divs
  source = source
    .replace(/<div[^>]*class="[^"]*sharedaddy[\s\S]*$/gi, '')
    .replace(/<div[^>]*class="[^"]*jp-relatedposts[\s\S]*$/gi, '')
    .replace(/<div[^>]*class="[^"]*code-block[\s\S]*?<\/div>/gi, '')
    .replace(/<div[^>]*class="[^"]*ai-viewport[\s\S]*?<\/div>/gi, '')
    .replace(/<div[^>]*class="[^"]*ssba[\s\S]*?<\/div>/gi, '')
    .replace(/<div[^>]*class="[^"]*share[\s\S]*?<\/div>/gi, '')
    .replace(/<div[^>]*id="[^"]*pagination[\s\S]*?<\/div>/gi, '')
    .replace(/<h[23][^>]*>(?:ALSO READ|Related|Resources|Also Read)[\s\S]*$/gi, '')
    .replace(/<p[^>]*>\s*(?:ALSO READ|For further reference|Resources for self-study)[\s\S]*$/gi, '');

  // Extract paragraphs
  const paragraphs: string[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  let foundTranscriptStart = false;
  while ((match = pRegex.exec(source)) !== null) {
    const text = stripHtml(match[1]).trim();

    // Skip metadata/intro paragraphs before the actual transcript
    if (!foundTranscriptStart) {
      // Look for the first real speech paragraph (not intro/metadata)
      if (text.match(/^Here is the full transcript/i) ||
          text.match(/^Full Text/i) ||
          text.match(/^Transcript/i) ||
          text.match(/^Please scroll down/i)) {
        foundTranscriptStart = true;
        continue; // Skip this intro line itself
      }
      // Skip short share/meta text
      if (text.length < 60) continue;
      // Skip lines with share counts, social media text
      if (text.match(/^\d+\s*shares?$/i) ||
          text.match(/^Share\d*$/i) ||
          text.match(/^Tweet$/i) ||
          text.match(/^Pinterest$/i) ||
          text.match(/^Email$/i) ||
          text.match(/^Print$/i)) continue;
      // Skip lines that are clearly introductory metadata
      if (text.match(/^Here is the/i) ||
          text.match(/at TED Talks$/i) ||
          text.match(/full transcript/i)) continue;
      // If we get a substantial paragraph that looks like speech, start collecting
      foundTranscriptStart = true;
    }

    // Filter out junk paragraphs
    if (text.length > 30 &&
        !text.startsWith('ALSO READ') &&
        !text.startsWith('For further reference') &&
        !text.startsWith('Resources for') &&
        !text.match(/^Interactive exercise/i) &&
        !text.match(/^\d+\s*shares?$/i) &&
        !text.match(/^Share\d*$/i) &&
        !text.match(/^Tweet$/i) &&
        !text.match(/^(?:Pinterest|Email|Print)$/i)) {
      paragraphs.push(text);
    }
  }

  return paragraphs.join('\n\n');
}

// Extract speech from jamesclear.com
function extractJamesClear(html: string): string {
  // James Clear stores speech text in .entry-content or article body
  let source = '';

  // Try entry-content first
  const entryMatch = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<div[^>]*class="[^"]*(?:sharedaddy|entry-footer)|<footer)/i);
  if (entryMatch) {
    source = entryMatch[1];
  }

  if (!source) {
    // Try article tag
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
      source = articleMatch[1];
    }
  }

  if (!source) {
    // Broad fallback: look for the main content area
    const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (mainMatch) {
      source = mainMatch[1];
    }
  }

  if (!source) {
    // Last resort: get all substantial paragraphs from body
    source = html;
  }

  // Remove headers, nav, sharing buttons
  source = source
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<div[^>]*class="[^"]*share[\s\S]*?<\/div>/gi, '')
    .replace(/<div[^>]*class="[^"]*sidebar[\s\S]*?<\/div>/gi, '')
    .replace(/<div[^>]*class="[^"]*comment[\s\S]*?<\/div>/gi, '');

  // Extract paragraphs and blockquotes
  const paragraphs: string[] = [];
  const contentRegex = /<(?:p|blockquote)[^>]*>([\s\S]*?)<\/(?:p|blockquote)>/gi;
  let match;
  let skippedIntro = false;
  while ((match = contentRegex.exec(source)) !== null) {
    const text = stripHtml(match[1]).trim();

    // Skip the first 1-2 paragraphs if they're metadata (e.g., "This speech was delivered...")
    if (!skippedIntro && text.match(/^This (?:speech|address|talk) was (?:delivered|given)/i)) {
      continue;
    }
    skippedIntro = true;

    if (text.length > 20 &&
        !text.match(/^(?:Share|Tweet|Pin|Email|Print|Filed Under|Tagged|Subscribe|Comments)/i) &&
        !text.match(/^(?:Read Next|Related|Previous|Next Post)/i) &&
        !text.match(/jamesclear\.com/i) &&
        !text.match(/^Click here/i) &&
        !text.match(/^Source:/i) &&
        !text.match(/^Image (?:source|credit)/i)) {
      paragraphs.push(text);
    }
  }

  return paragraphs.join('\n\n');
}

// Generic fallback extractor
function extractGeneric(html: string): string {
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)
    || html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const source = mainMatch ? mainMatch[1] : html;

  const paragraphs: string[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = pRegex.exec(source)) !== null) {
    const text = stripHtml(match[1]).trim();
    if (text.length > 50) {
      paragraphs.push(text);
    }
  }
  return paragraphs.length > 2 ? paragraphs.join('\n\n') : '';
}

function extractArticleContent(html: string, url: string): string {
  let content = '';

  if (url.includes('singjupost.com')) {
    content = extractSingjupost(html);
  } else if (url.includes('jamesclear.com')) {
    content = extractJamesClear(html);
  } else {
    content = extractGeneric(html);
  }

  // LINE-LEVEL cleanup: split every line, filter junk, rejoin into paragraphs
  const allLines = content.split(/\n/).map(l => l.trim()).filter(Boolean);

  // Junk line patterns
  const junkLine = (line: string): boolean => {
    if (line.length < 15) return true; // Very short = UI element
    const patterns = [
      /^\d+\s*shares?$/i,
      /^Share\d*$/i,
      /^Tweet$/i,
      /^Pinterest$/i,
      /^Email$/i,
      /^Print$/i,
      /^Facebook$/i,
      /^LinkedIn$/i,
      /^WhatsApp$/i,
      /at TED Talks?$/i,
      /^Here is the (?:full )?transcript/i,
      /^Full Text/i,
      /^Transcript$/i,
      /^Please scroll down/i,
      /^Interactive exercise/i,
      /^ALSO READ/i,
      /^For further reference/i,
      /^Resources for/i,
      /^This (?:speech|address|talk) was (?:\w+ )?(?:delivered|given|originally)/i,
      /^Listen to the (?:MP3 )?Audio/i,
      /^Watch the (?:full )?video/i,
      /^The (?:price|power) of \w+ by .+ at TED/i,
      /^Source:/i,
      /^Image (?:source|credit)/i,
      /^Click here/i,
      /^Subscribe/i,
      /^Filed Under/i,
      /^Tagged/i,
      /^Read Next/i,
      /^Related Posts/i,
      /^Previous|^Next Post/i,
      /jamesclear\.com/i,
      /singjupost\.com/i,
      /^\d+$/,
      /^shares?$/i,
    ];
    return patterns.some(p => p.test(line));
  };

  // Filter junk lines
  const cleanLines = allLines.filter(line => !junkLine(line));

  // Rejoin into paragraphs (use double newline between substantial blocks)
  let result = '';
  for (let i = 0; i < cleanLines.length; i++) {
    if (i === 0) {
      result = cleanLines[i];
    } else {
      // If this line and previous line were originally separated by blank line, use \n\n
      result += '\n\n' + cleanLines[i];
    }
  }

  // Trim trailing junk sections
  result = result
    .replace(/\n\n(?:ALSO READ|For further reference|Resources for|Interactive exercise)[\s\S]*$/i, '')
    .trim();

  return result;
}

// Simple in-memory cache
const cache = new Map<number, { content: string; fetchedAt: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const idParam = searchParams.get('id');
  const urlParam = searchParams.get('url');

  if (!urlParam) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  const id = idParam ? parseInt(idParam) : 0;

  // Check cache
  if (id && cache.has(id)) {
    const cached = cache.get(id)!;
    if (Date.now() - cached.fetchedAt < CACHE_TTL) {
      return NextResponse.json({ content: cached.content, cached: true });
    }
  }

  try {
    const res = await fetch(urlParam, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Fetch failed: ${res.status}`, content: '' },
        { status: 502 }
      );
    }

    const html = await res.text();
    const content = extractArticleContent(html, urlParam);

    if (content && content.length > 200) {
      if (id) {
        cache.set(id, { content, fetchedAt: Date.now() });
      }
      return NextResponse.json({ content });
    }

    return NextResponse.json({
      content: '',
      error: 'Could not extract article content',
    });
  } catch (error) {
    console.error('Fetch error:', error);
    return NextResponse.json(
      { content: '', error: 'Failed to fetch' },
      { status: 500 }
    );
  }
}
