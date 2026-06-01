'use client';

import { useState, useEffect } from 'react';
import { useSpeechList } from '@/hooks/useDailyArticle';
import type { SpeechMeta } from '@/data/speeches';
import ArticleReader from './ArticleReader';

// Check if a speech has been started (has saved scroll position > 0)
function getReadingStatus(id: number): 'unread' | 'reading' {
  try {
    const scroll = Number(localStorage.getItem(`speech-scroll-${id}`)) || 0;
    return scroll > 50 ? 'reading' : 'unread';
  } catch {
    return 'unread';
  }
}

export default function SpeechList() {
  const { speeches, todaySpeech } = useSpeechList();
  const [selectedSpeech, setSelectedSpeech] = useState<SpeechMeta | null>(null);
  const [filter, setFilter] = useState<'all' | 'TED' | 'Commencement' | 'Famous Talk'>('all');
  const [readStatus, setReadStatus] = useState<Record<number, string>>({});

  // Load reading status from localStorage
  useEffect(() => {
    const status: Record<number, string> = {};
    speeches.forEach((s) => {
      status[s.id] = getReadingStatus(s.id);
    });
    setReadStatus(status);
  }, [speeches, selectedSpeech]); // Re-check when returning from reader

  const filtered = filter === 'all' ? speeches : speeches.filter((s) => s.category === filter);

  const filterLabels: Record<string, string> = {
    all: '全部',
    TED: 'TED',
    Commencement: '毕业演讲',
    'Famous Talk': '经典演讲',
  };

  // Chinese labels for in-list category badges
  const categoryLabels: Record<string, string> = {
    TED: 'TED',
    Commencement: '毕业演讲',
    'Famous Talk': '经典演讲',
  };

  return (
    <div>
      {/* Filter chips */}
      {/* touch-auto re-enables horizontal swipe for this container only */}
      <div className="flex gap-2 px-4 py-3 border-b border-x-border overflow-x-auto scrollbar-hide touch-auto">
        {(['all', 'TED', 'Commencement', 'Famous Talk'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
              filter === f
                ? 'bg-amber-500 text-white'
                : 'bg-x-darker text-x-gray hover:text-white'
            }`}
          >
            {filterLabels[f]}
          </button>
        ))}
      </div>

      {/* Today's highlight — only show when filter matches or is 'all' */}
      {(filter === 'all' || filter === todaySpeech.category) && (
      <div
        onClick={() => setSelectedSpeech(todaySpeech)}
        className="mx-4 mt-3 mb-2 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 cursor-pointer hover:bg-amber-500/10 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-amber-500 text-xs font-bold">
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
            </svg>
            今日推荐
          </div>
          {readStatus[todaySpeech.id] === 'reading' && (
            <span className="text-[11px] text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">继续阅读</span>
          )}
        </div>
        <p className="font-bold text-[15px] mt-2">{todaySpeech.title}</p>
        <p className="text-sm text-x-gray mt-1">{todaySpeech.speaker} · {todaySpeech.year}</p>
      </div>
      )}

      {/* Speech list */}
      {filtered.map((speech) => {
        const status = readStatus[speech.id];
        return (
          <div
            key={speech.id}
            onClick={() => setSelectedSpeech(speech)}
            className="flex gap-3 px-4 py-3 border-b border-x-border cursor-pointer hover:bg-white/[0.03] transition-colors"
          >
            {/* Number badge with reading indicator */}
            <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
              status === 'reading'
                ? 'bg-amber-500/15 text-amber-500 ring-2 ring-amber-500/30'
                : 'bg-x-darker text-x-gray'
            }`}>
              {speech.id}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                  speech.category === 'TED'
                    ? 'bg-red-500/20 text-red-400'
                    : speech.category === 'Commencement'
                    ? 'bg-purple-500/20 text-purple-400'
                    : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {categoryLabels[speech.category] ?? speech.category}
                </span>
                <span className="text-xs text-x-gray">{speech.year}</span>
                {status === 'reading' && (
                  <span className="text-[11px] text-amber-500">· 阅读中</span>
                )}
              </div>
              <h3 className="font-bold text-[15px] mt-1 line-clamp-1">{speech.title}</h3>
              <p className="text-sm text-x-gray mt-0.5">{speech.speaker}</p>
              <p className="text-xs text-x-gray mt-1 line-clamp-1">{speech.description}</p>
            </div>

            {/* Arrow */}
            <div className="shrink-0 flex items-center text-x-gray">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
              </svg>
            </div>
          </div>
        );
      })}

      {/* Reader Modal */}
      {selectedSpeech && (
        <ArticleReader
          speech={selectedSpeech}
          onClose={() => setSelectedSpeech(null)}
        />
      )}
    </div>
  );
}
