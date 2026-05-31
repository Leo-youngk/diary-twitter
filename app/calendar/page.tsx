'use client';

import { useState, useMemo } from 'react';
import { useApp } from '@/lib/context';
import { cn } from '@/lib/utils';
import FeedList from '@/components/feed/FeedList';

export default function CalendarPage() {
  const { posts } = useApp();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const postsByDate = useMemo(() => {
    const map: Record<string, typeof posts> = {};
    posts.forEach((p) => {
      const dateKey = p.createdAt.slice(0, 10);
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(p);
    });
    return map;
  }, [posts]);

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDayOfWeek }, (_, i) => i);

  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  const goToday = () => {
    setCurrentMonth(new Date());
    const today = new Date().toISOString().slice(0, 10);
    setSelectedDate(today);
  };

  const monthLabel = `${year}年${month + 1}月`;

  const selectedPosts = selectedDate ? (postsByDate[selectedDate] || []) : [];

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-x-dark/80 backdrop-blur-md border-b border-x-border">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold">日历</h1>
          <button onClick={goToday} className="text-x-blue text-sm font-bold hover:underline">
            今天
          </button>
        </div>
      </div>

      {/* Calendar */}
      <div className="px-4 py-4">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={prevMonth} className="p-2 rounded-full hover:bg-x-hover transition-colors">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
              <path d="M7.414 13l5.043 5.04-1.414 1.42L3.586 12l7.457-7.46 1.414 1.42L7.414 11H21v2H7.414z" />
            </svg>
          </button>
          <h2 className="text-lg font-bold">{monthLabel}</h2>
          <button onClick={nextMonth} className="p-2 rounded-full hover:bg-x-hover transition-colors">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white rotate-180">
              <path d="M7.414 13l5.043 5.04-1.414 1.42L3.586 12l7.457-7.46 1.414 1.42L7.414 11H21v2H7.414z" />
            </svg>
          </button>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
            <div key={d} className="text-center text-xs text-x-gray py-1">{d}</div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-1">
          {blanks.map((i) => (
            <div key={`blank-${i}`} />
          ))}
          {days.map((day) => {
            const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayPosts = postsByDate[dateKey] || [];
            const isSelected = selectedDate === dateKey;
            const isToday = dateKey === new Date().toISOString().slice(0, 10);
            const hasThought = dayPosts.some((p) => p.entryType === 'thought');
            const hasDiary = dayPosts.some((p) => p.entryType === 'diary');
            const hasArticle = dayPosts.some((p) => p.entryType === 'article');

            return (
              <button
                key={day}
                onClick={() => setSelectedDate(isSelected ? null : dateKey)}
                className={cn(
                  'aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-colors relative',
                  isSelected ? 'bg-x-blue text-white' : 'hover:bg-x-hover',
                  isToday && !isSelected && 'ring-1 ring-x-blue',
                  dayPosts.length === 0 && 'text-x-gray'
                )}
              >
                {day}
                {dayPosts.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5">
                    {hasThought && <div className="w-1.5 h-1.5 rounded-full bg-x-blue" />}
                    {hasDiary && <div className="w-1.5 h-1.5 rounded-full bg-x-green" />}
                    {hasArticle && <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected date posts */}
      {selectedDate && (
        <div className="border-t border-x-border">
          <div className="px-4 py-3 text-sm text-x-gray">
            {selectedDate} · {selectedPosts.length} 条记录
          </div>
          {selectedPosts.length > 0 ? (
            <FeedList posts={selectedPosts} />
          ) : (
            <div className="px-4 py-8 text-center text-x-gray text-sm">
              这一天没有记录
            </div>
          )}
        </div>
      )}
    </div>
  );
}
