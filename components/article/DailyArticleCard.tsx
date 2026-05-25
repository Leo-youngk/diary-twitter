'use client';

import { useDailyArticle } from '@/hooks/useDailyArticle';
import ArticleReader from './ArticleReader';

export default function DailyArticleCard() {
  const {
    article, allLevels, currentLevel, setLevel,
    loading, dismissed, dismiss,
    readerOpen, openReader, closeReader,
  } = useDailyArticle();

  if (dismissed || (!loading && !article)) return null;

  return (
    <>
      {/* Preview Card */}
      <div className="border-b border-x-border">
        {loading ? (
          // Skeleton
          <div className="p-4 flex gap-3 items-center">
            <div className="w-10 h-10 rounded-xl bg-x-border skeleton-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-32 bg-x-border rounded skeleton-pulse" />
              <div className="h-3 w-48 bg-x-border rounded skeleton-pulse" />
            </div>
          </div>
        ) : article ? (
          <div
            onClick={openReader}
            className="flex items-stretch cursor-pointer hover:bg-white/[0.03] transition-colors"
          >
            {/* Accent bar */}
            <div className="w-1 bg-amber-500 shrink-0" />

            <div className="flex-1 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-500 text-sm font-bold">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                    <path d="M21 4H3a1 1 0 00-1 1v14a1 1 0 001 1h18a1 1 0 001-1V5a1 1 0 00-1-1zM4 18V6h16v12H4zm2-2h6v-2H6v2zm0-4h12V8H6v4z" />
                  </svg>
                  Today&apos;s English
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); dismiss(); }}
                  className="p-1 rounded-full hover:bg-x-hover text-x-gray transition-colors"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                    <path d="M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z" />
                  </svg>
                </button>
              </div>

              <h3 className="font-bold text-[15px] mt-1 line-clamp-1">{article.title}</h3>

              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs text-x-gray bg-x-darker px-2 py-0.5 rounded-full">
                  {article.category}
                </span>
                {/* Level dots */}
                <div className="flex gap-1">
                  {[1, 2, 3].map((lv) => {
                    const hasLevel = allLevels.some((a) => a.level === lv);
                    return (
                      <div
                        key={lv}
                        className={`w-2 h-2 rounded-full ${
                          hasLevel
                            ? lv <= currentLevel ? 'bg-amber-500' : 'bg-amber-500/30'
                            : 'bg-x-border'
                        }`}
                      />
                    );
                  })}
                </div>
                <span className="text-xs text-x-gray">Lv.{currentLevel}</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Reader Modal */}
      {readerOpen && article && (
        <ArticleReader
          article={article}
          allLevels={allLevels}
          currentLevel={currentLevel}
          onChangeLevel={setLevel}
          onClose={closeReader}
        />
      )}
    </>
  );
}
