'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/context';
import { cn, toLocalDateKey } from '@/lib/utils';
import FeedList from '@/components/feed/FeedList';
import LifeWeeks from '@/components/calendar/LifeWeeks';

export default function CalendarPage() {
  const { posts, currentUser } = useApp();
  const [view, setView] = useState<'month' | 'life'>('month');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const postsByDate = useMemo(() => {
    const map: Record<string, typeof posts> = {};
    posts.forEach((p) => {
      const dateKey = toLocalDateKey(p.createdAt);
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
    setSelectedDate(toLocalDateKey(new Date()));
  };

  const monthLabel = `${year}年${month + 1}月`;

  const selectedPosts = selectedDate ? (postsByDate[selectedDate] || []) : [];

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-x-dark border-b border-x-border">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold">日历</h1>
          <button onClick={goToday} className="text-x-blue text-sm font-bold hover:underline">
            今天
          </button>
        </div>
        <div className="flex">
          <button
            onClick={() => setView('month')}
            role="tab"
            aria-selected={view === 'month'}
            className={cn(
              'flex-1 py-2.5 text-sm transition-colors relative',
              view === 'month' ? 'text-x-blue font-bold' : 'text-x-gray font-normal hover:text-x-blue/70'
            )}
          >
            月历
            {view === 'month' && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-x-blue rounded-full" />
            )}
          </button>
          <button
            onClick={() => setView('life')}
            role="tab"
            aria-selected={view === 'life'}
            className={cn(
              'flex-1 py-2.5 text-sm transition-colors relative',
              view === 'life' ? 'text-x-blue font-bold' : 'text-x-gray font-normal hover:text-x-blue/70'
            )}
          >
            人生周历
            {view === 'life' && (
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-x-blue rounded-full" />
            )}
          </button>
        </div>
      </div>

      {view === 'life' ? (
        currentUser.birthDate ? (
          <LifeWeeks birthDate={currentUser.birthDate} posts={posts} />
        ) : (
          <div className="px-4 py-10 text-center">
            <p className="text-x-gray text-sm mb-4 leading-relaxed">
              设置出生日期后，这里会显示你的人生进度——按 80 岁计算，一共大约 4160 周。
            </p>
            <Link
              href="/settings"
              className="inline-block bg-x-blue hover:bg-x-blue-hover text-white font-bold rounded-full px-5 py-2.5 text-sm transition-colors"
            >
              去设置出生日期
            </Link>
          </div>
        )
      ) : (
        <>
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
                const dateKey = toLocalDateKey(new Date(year, month, day));
                const dayPosts = postsByDate[dateKey] || [];
                const isSelected = selectedDate === dateKey;
                const isToday = dateKey === toLocalDateKey(new Date());
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
                <FeedList posts={selectedPosts} resetKey={selectedDate} />
              ) : (
                <div className="px-4 py-8 text-center text-x-gray text-sm">
                  这一天没有记录
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
