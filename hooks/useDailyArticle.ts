'use client';

import { useState, useEffect, useCallback } from 'react';
import { speeches, getTodaySpeech } from '@/data/speeches';
import type { SpeechMeta } from '@/data/speeches';

interface ArticleContent {
  speechId: number;
  content: string;
}

export function useSpeechList() {
  return { speeches, todaySpeech: getTodaySpeech() };
}

export function useSpeechContent(speech: SpeechMeta | null) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContent = useCallback(async (s: SpeechMeta) => {
    setLoading(true);
    setError(null);

    // Check localStorage cache
    const cacheKey = `speech-content-${s.id}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed: ArticleContent = JSON.parse(cached);
        if (parsed.content && parsed.content.length > 100) {
          setContent(parsed.content);
          setLoading(false);
          return;
        }
      } catch {}
    }

    try {
      const res = await fetch(
        `/api/daily-article?id=${s.id}&url=${encodeURIComponent(s.sourceUrl)}`
      );
      const data: { content?: string; error?: string } = await res.json();

      if (data.content && data.content.length > 100) {
        setContent(data.content);
        localStorage.setItem(cacheKey, JSON.stringify({
          speechId: s.id,
          content: data.content,
        }));
      } else {
        setError(data.error || 'Could not load article');
        setContent(null);
      }
    } catch (err) {
      setError('Network error');
      setContent(null);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (speech) {
      fetchContent(speech);
    } else {
      setContent(null);
    }
  }, [speech?.id, fetchContent]);

  return { content, loading, error };
}
