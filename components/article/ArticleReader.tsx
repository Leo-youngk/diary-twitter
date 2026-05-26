'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { useApp } from '@/lib/context';
import { useSpeechContent } from '@/hooks/useDailyArticle';
import type { SpeechMeta } from '@/data/speeches';

interface ArticleReaderProps {
  speech: SpeechMeta;
  onClose: () => void;
}

// Save / restore scroll position per speech
function getScrollKey(id: number) {
  return `speech-scroll-${id}`;
}
function getSavedScroll(id: number): number {
  try {
    return Number(localStorage.getItem(getScrollKey(id))) || 0;
  } catch {
    return 0;
  }
}
function saveScroll(id: number, pos: number) {
  try {
    localStorage.setItem(getScrollKey(id), String(Math.round(pos)));
  } catch {}
}

export default function ArticleReader({ speech, onClose }: ArticleReaderProps) {
  const { addPost, posts, addToast } = useApp();
  const { content, loading, error } = useSpeechContent(speech);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [restoredScroll, setRestoredScroll] = useState(false);

  // Restore scroll position once content loads
  useEffect(() => {
    if (!content || restoredScroll) return;
    const el = scrollRef.current;
    if (!el) return;

    // Wait a tick for content to render
    requestAnimationFrame(() => {
      const saved = getSavedScroll(speech.id);
      if (saved > 0) {
        el.scrollTop = saved;
      }
      setRestoredScroll(true);
    });
  }, [content, speech.id, restoredScroll]);

  // Track scroll for progress bar + save position
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const max = scrollHeight - clientHeight;
    setProgress(max > 0 ? Math.min(scrollTop / max, 1) : 0);

    // Debounce save — save on every scroll is fine for localStorage
    saveScroll(speech.id, scrollTop);
  }, [speech.id]);

  // Save scroll on close
  const handleClose = () => {
    const el = scrollRef.current;
    if (el) saveScroll(speech.id, el.scrollTop);
    onClose();
  };

  // Lock body scroll while reader is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleSaveToDiary = () => {
    if (!content) return;
    const exists = posts.some(
      (p) => p.entryType === 'article' && p.title === speech.title + ' — ' + speech.speaker
    );
    if (exists) {
      addToast('这篇演讲已经保存过了', 'info');
      return;
    }

    const excerpt = content.split('\n\n').slice(0, 3).join('\n\n');
    const postContent = `📖 ${speech.title}\n🎤 ${speech.speaker} (${speech.year})\n\n${excerpt}\n\n---\n🔗 ${speech.transcriptUrl}`;
    addPost(postContent, [], 'article', speech.title + ' — ' + speech.speaker);
    addToast('已保存到日记！');
    handleClose();
  };

  // Parse paragraphs — detect "quoted" lines, speaker labels, etc.
  const renderContent = () => {
    if (!content) return null;

    const paragraphs = content.split(/\n\n+/).filter(Boolean);

    return paragraphs.map((para, i) => {
      const trimmed = para.trim();

      // Detect applause / stage directions like (Applause) (Laughter)
      if (/^\(.*\)$/.test(trimmed)) {
        return (
          <p key={i} className="text-center text-sm text-x-gray italic my-6">
            {trimmed}
          </p>
        );
      }

      // Detect very short "dramatic" lines (≤ 60 chars, likely a punchy quote)
      if (trimmed.length <= 60 && !trimmed.endsWith('.') && i > 0) {
        return (
          <p key={i} className="article-para text-[17px] leading-[1.9] font-medium my-5">
            {trimmed}
          </p>
        );
      }

      // Normal paragraph
      return (
        <p key={i} className="article-para text-[17px] leading-[1.9] my-4">
          {trimmed}
        </p>
      );
    });
  };

  const progressPct = Math.round(progress * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center"
         style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Reading progress bar — just below safe area */}
      <div className="absolute left-0 right-0 z-30 h-[3px] bg-transparent"
           style={{ top: 'env(safe-area-inset-top)' }}>
        <div
          className="h-full bg-amber-500 transition-[width] duration-150"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Reader card */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative bg-x-dark w-full max-w-[640px] md:h-[90vh] md:my-[5vh] md:rounded-2xl shadow-2xl border-0 md:border border-x-border overflow-y-auto"
        style={{ height: 'calc(100% - env(safe-area-inset-top))' }}
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-x-dark/90 backdrop-blur-md border-b border-x-border">
          <div className="flex items-center justify-between px-4 py-2.5">
            <button onClick={handleClose} className="p-2 -ml-2 rounded-full hover:bg-x-hover transition-colors">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                <path d="M7.414 13l5.043 5.04-1.414 1.42L3.586 12l7.457-7.46 1.414 1.42L7.414 11H21v2H7.414z" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              {progressPct > 0 && (
                <span className="text-xs text-x-gray tabular-nums">{progressPct}%</span>
              )}
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                speech.category === 'TED'
                  ? 'bg-red-500/20 text-red-400'
                  : speech.category === 'Commencement'
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'bg-amber-500/20 text-amber-400'
              }`}>
                {speech.category}
              </span>
            </div>
          </div>
        </div>

        {/* Title hero */}
        <div className="px-5 pt-6 pb-5">
          <h1 className="text-2xl font-bold leading-snug tracking-tight">{speech.title}</h1>
          <div className="flex items-center gap-2 mt-3">
            <div className="w-8 h-8 rounded-full bg-x-darker flex items-center justify-center text-sm">
              🎤
            </div>
            <div>
              <p className="text-sm font-medium">{speech.speaker}</p>
              <p className="text-xs text-x-gray">{speech.year} · {speech.description}</p>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="mx-5 border-t border-x-border" />

        {/* Article body */}
        <div className="px-5 py-6 article-body">
          {loading && (
            <div className="space-y-5">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="space-y-2.5">
                  <div className="h-4 bg-x-border rounded skeleton-pulse" style={{ width: `${85 + Math.random() * 15}%` }} />
                  <div className="h-4 bg-x-border rounded skeleton-pulse" style={{ width: `${70 + Math.random() * 25}%` }} />
                  {i % 2 === 0 && (
                    <div className="h-4 bg-x-border rounded skeleton-pulse" style={{ width: `${50 + Math.random() * 30}%` }} />
                  )}
                </div>
              ))}
            </div>
          )}

          {error && !content && (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">📄</div>
              <p className="text-x-gray mb-4">无法加载原文内容</p>
              <a
                href={speech.transcriptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-full px-5 py-2.5 text-sm transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                  <path d="M15.36 4.96c1.48-1.48 3.89-1.48 5.37 0s1.48 3.89 0 5.37l-4.24 4.24a3.8 3.8 0 01-5.37 0 .75.75 0 011.06-1.06 2.3 2.3 0 003.24 0l4.24-4.24a2.3 2.3 0 000-3.24 2.3 2.3 0 00-3.24 0l-1.77 1.77a.75.75 0 01-1.06-1.06l1.77-1.78zm-6.72 6.72a3.8 3.8 0 015.37 0 .75.75 0 01-1.06 1.06 2.3 2.3 0 00-3.24 0l-4.24 4.24a2.3 2.3 0 000 3.24 2.3 2.3 0 003.24 0l1.77-1.77a.75.75 0 011.06 1.06l-1.77 1.78c-1.48 1.48-3.89 1.48-5.37 0s-1.48-3.89 0-5.37l4.24-4.24z" />
                </svg>
                在浏览器中阅读原文
              </a>
            </div>
          )}

          {content && renderContent()}

          {/* End-of-article spacer */}
          {content && (
            <div className="mt-10 mb-4 text-center">
              <div className="inline-flex items-center gap-2 text-x-gray text-xs">
                <span className="w-8 h-px bg-x-border" />
                END
                <span className="w-8 h-px bg-x-border" />
              </div>
            </div>
          )}
        </div>

        {/* Bottom Action Bar */}
        <div className="sticky bottom-0 bg-x-dark/90 backdrop-blur-md border-t border-x-border px-4 py-3">
          <div className="flex items-center justify-between">
            <a
              href={speech.transcriptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-x-gray hover:text-x-blue transition-colors text-sm flex items-center gap-1"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M15.36 4.96c1.48-1.48 3.89-1.48 5.37 0s1.48 3.89 0 5.37l-4.24 4.24a3.8 3.8 0 01-5.37 0 .75.75 0 011.06-1.06 2.3 2.3 0 003.24 0l4.24-4.24a2.3 2.3 0 000-3.24 2.3 2.3 0 00-3.24 0l-1.77 1.77a.75.75 0 01-1.06-1.06l1.77-1.78zm-6.72 6.72a3.8 3.8 0 015.37 0 .75.75 0 01-1.06 1.06 2.3 2.3 0 00-3.24 0l-4.24 4.24a2.3 2.3 0 000 3.24 2.3 2.3 0 003.24 0l1.77-1.77a.75.75 0 011.06 1.06l-1.77 1.78c-1.48 1.48-3.89 1.48-5.37 0s-1.48-3.89 0-5.37l4.24-4.24z" />
              </svg>
              原文链接
            </a>

            <button
              onClick={handleSaveToDiary}
              disabled={!content}
              className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold rounded-full px-5 py-2 text-sm transition-colors flex items-center gap-1.5"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5z" />
              </svg>
              收藏到日记
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
