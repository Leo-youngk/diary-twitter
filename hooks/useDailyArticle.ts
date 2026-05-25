'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ArticleData } from '@/app/api/daily-article/route';

interface DailyArticleState {
  articles: ArticleData[];     // All levels for today's article
  currentLevel: number;        // 1, 2, or 3
  loading: boolean;
  dismissed: boolean;
  readerOpen: boolean;
  error: string | null;
}

export function useDailyArticle() {
  const [state, setState] = useState<DailyArticleState>({
    articles: [],
    currentLevel: 1,
    loading: true,
    dismissed: false,
    readerOpen: false,
    error: null,
  });

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const dismissedDate = localStorage.getItem('article-dismissed-date');
    if (dismissedDate === today) {
      setState((s) => ({ ...s, dismissed: true, loading: false }));
      return;
    }

    // Check localStorage cache first
    const cached = localStorage.getItem('article-cache');
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed.date === today && parsed.articles?.length > 0) {
          setState((s) => ({ ...s, articles: parsed.articles, loading: false }));
          return;
        }
      } catch {}
    }

    // Fetch from API
    fetch('/api/daily-article')
      .then((res) => res.json())
      .then((data) => {
        if (data.articles && data.articles.length > 0) {
          // Pick today's article group by date-based index
          const titles = new Set<string>();
          const groups: ArticleData[][] = [];
          for (const a of data.articles) {
            const key = a.title.toLowerCase();
            if (!titles.has(key)) {
              titles.add(key);
              groups.push(data.articles.filter(
                (x: ArticleData) => x.title.toLowerCase() === key
              ));
            }
          }

          // Pick one group based on day of year
          const dayOfYear = Math.floor(
            (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
          );
          const group = groups[dayOfYear % groups.length] || groups[0];

          localStorage.setItem('article-cache', JSON.stringify({
            date: today,
            articles: group,
          }));

          setState((s) => ({ ...s, articles: group, loading: false }));
        } else {
          setState((s) => ({ ...s, loading: false, error: data.error || 'No articles' }));
        }
      })
      .catch((err) => {
        setState((s) => ({ ...s, loading: false, error: err.message }));
      });
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem('article-dismissed-date', new Date().toISOString().slice(0, 10));
    setState((s) => ({ ...s, dismissed: true }));
  }, []);

  const openReader = useCallback(() => {
    setState((s) => ({ ...s, readerOpen: true }));
  }, []);

  const closeReader = useCallback(() => {
    setState((s) => ({ ...s, readerOpen: false }));
  }, []);

  const setLevel = useCallback((level: number) => {
    setState((s) => ({ ...s, currentLevel: level }));
  }, []);

  const currentArticle = state.articles.find((a) => a.level === state.currentLevel)
    || state.articles[0] || null;

  return {
    article: currentArticle,
    allLevels: state.articles,
    currentLevel: state.currentLevel,
    setLevel,
    loading: state.loading,
    dismissed: state.dismissed,
    dismiss,
    readerOpen: state.readerOpen,
    openReader,
    closeReader,
    error: state.error,
  };
}
