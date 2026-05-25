import { NextResponse } from 'next/server';

export interface ArticleData {
  title: string;
  content: string;
  link: string;
  pubDate: string;
  category: string;
  level: number;
}

// Simple XML text extractor
function extractTag(xml: string, tag: string): string {
  // Handle CDATA
  const cdataRegex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i');
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

// Strip HTML tags, decode entities
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}\s*\n*/m, '') // Strip date prefix from content
    .trim();
}

// Parse level from title like "Some Title – level 1"
function parseLevel(title: string): number {
  const match = title.match(/level\s*(\d)/i);
  return match ? parseInt(match[1]) : 1;
}

// Clean title by removing "– level X" suffix
function cleanTitle(title: string): string {
  return title.replace(/\s*[–-]\s*level\s*\d/i, '').trim();
}

let cachedData: { date: string; articles: ArticleData[] } | null = null;

export async function GET() {
  const today = new Date().toISOString().slice(0, 10);

  // Return cached if same day
  if (cachedData && cachedData.date === today && cachedData.articles.length > 0) {
    return NextResponse.json({ articles: cachedData.articles, cached: true });
  }

  try {
    const res = await fetch('https://www.newsinlevels.com/feed/', {
      headers: { 'User-Agent': 'DiaryPWA/1.0' },
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!res.ok) {
      throw new Error(`RSS fetch failed: ${res.status}`);
    }

    const xml = await res.text();

    // Parse all <item> blocks
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    const items: ArticleData[] = [];
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1];
      const rawTitle = extractTag(itemXml, 'title');
      const level = parseLevel(rawTitle);
      const contentEncoded = extractTag(itemXml, 'content:encoded');
      const description = extractTag(itemXml, 'description');

      items.push({
        title: cleanTitle(rawTitle),
        content: stripHtml(contentEncoded || description),
        link: extractTag(itemXml, 'link'),
        pubDate: extractTag(itemXml, 'pubDate'),
        category: extractTag(itemXml, 'category'),
        level,
      });
    }

    // Group by title, pick unique articles
    const grouped = new Map<string, ArticleData[]>();
    for (const item of items) {
      const key = item.title.toLowerCase();
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(item);
    }

    // For each article group, include all levels (1,2,3)
    const articles: ArticleData[] = [];
    grouped.forEach((group) => {
      group.sort((a, b) => a.level - b.level);
      articles.push(...group);
    });

    cachedData = { date: today, articles };

    return NextResponse.json({ articles });
  } catch (error) {
    console.error('Failed to fetch articles:', error);

    // Return cached data even if stale
    if (cachedData && cachedData.articles.length > 0) {
      return NextResponse.json({ articles: cachedData.articles, cached: true, stale: true });
    }

    return NextResponse.json({ articles: [], error: 'Failed to fetch articles' }, { status: 500 });
  }
}
