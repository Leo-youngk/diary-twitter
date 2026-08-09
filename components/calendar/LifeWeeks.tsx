'use client';

import { Fragment, useMemo } from 'react';
import { Post } from '@/lib/types';
import { cn } from '@/lib/utils';

const LIFESPAN_YEARS = 80;
const WEEKS_PER_YEAR = 52;
const TOTAL_WEEKS = LIFESPAN_YEARS * WEEKS_PER_YEAR;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const ROWS = Array.from({ length: LIFESPAN_YEARS }, (_, i) => i);
const COLS = Array.from({ length: WEEKS_PER_YEAR }, (_, i) => i);

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function LifeWeeks({ birthDate, posts }: { birthDate: string; posts: Post[] }) {
  const stats = useMemo(() => {
    const birth = parseLocalDate(birthDate);
    const now = new Date();
    const rawIndex = Math.floor((now.getTime() - birth.getTime()) / WEEK_MS);
    const currentWeekIndex = Math.min(Math.max(rawIndex, 0), TOTAL_WEEKS - 1);
    const elapsedInclusive = currentWeekIndex + 1;

    const recorded = new Set<number>();
    posts.forEach((p) => {
      const idx = Math.floor((new Date(p.createdAt).getTime() - birth.getTime()) / WEEK_MS);
      if (idx >= 0 && idx <= currentWeekIndex) recorded.add(idx);
    });

    return {
      currentWeekIndex,
      recorded,
      elapsedInclusive,
      remainingWeeks: TOTAL_WEEKS - elapsedInclusive,
      ageYears: Math.floor(currentWeekIndex / WEEKS_PER_YEAR),
      weeksIntoYear: currentWeekIndex % WEEKS_PER_YEAR,
      percentUsed: Math.round((elapsedInclusive / TOTAL_WEEKS) * 1000) / 10,
      remainingYears: Math.round((TOTAL_WEEKS - elapsedInclusive) / WEEKS_PER_YEAR),
      recordedPercent: Math.round((recorded.size / elapsedInclusive) * 100),
    };
  }, [birthDate, posts]);

  return (
    <div className="px-4 py-4">
      <p className="text-sm text-x-gray leading-relaxed mb-4">
        以 80 岁为参照，这是你的一生按周展开的样子——每个格子是一周。灰色是已经过去但没留下记录的周，绿色是写过点什么的周，琥珀色是本周。
      </p>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="border border-x-border rounded-xl p-3">
          <p className="text-2xl font-bold">
            {stats.ageYears}
            <span className="text-sm font-normal text-x-gray"> 岁 {stats.weeksIntoYear} 周</span>
          </p>
          <p className="text-xs text-x-gray mt-1">已经度过 {stats.elapsedInclusive} 周</p>
        </div>
        <div className="border border-x-border rounded-xl p-3">
          <p className="text-2xl font-bold">
            {stats.remainingWeeks}
            <span className="text-sm font-normal text-x-gray"> 周</span>
          </p>
          <p className="text-xs text-x-gray mt-1">大约还剩（约 {stats.remainingYears} 年）</p>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between text-xs text-x-gray mb-1">
          <span>已用去人生的 {stats.percentUsed}%</span>
          <span>已记录 {stats.recorded.size} 周（{stats.recordedPercent}%）</span>
        </div>
        <div className="h-2 rounded-full bg-x-darker overflow-hidden">
          <div className="h-full bg-x-blue rounded-full" style={{ width: `${stats.percentUsed}%` }} />
        </div>
      </div>

      <div
        className="grid gap-[1.5px]"
        style={{ gridTemplateColumns: `16px repeat(${WEEKS_PER_YEAR}, minmax(0, 1fr))` }}
      >
        {ROWS.map((r) => (
          <Fragment key={r}>
            <div className="text-[7px] leading-none text-x-gray flex items-center justify-end pr-0.5">
              {(r + 1) % 10 === 0 ? r + 1 : ''}
            </div>
            {COLS.map((c) => {
              const idx = r * WEEKS_PER_YEAR + c;
              const isCurrent = idx === stats.currentWeekIndex;
              const isPast = idx < stats.currentWeekIndex;
              const isRecorded = stats.recorded.has(idx);
              return (
                <div
                  key={idx}
                  className={cn(
                    'aspect-square rounded-[1px]',
                    isCurrent && 'bg-amber-500',
                    !isCurrent && isPast && isRecorded && 'bg-x-blue',
                    !isCurrent && isPast && !isRecorded && 'bg-x-gray/35',
                    !isCurrent && !isPast && 'border border-x-border/70'
                  )}
                />
              );
            })}
          </Fragment>
        ))}
      </div>

      <div className="flex items-center gap-4 mt-4 text-xs text-x-gray flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[1px] bg-x-blue inline-block" />已记录</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[1px] bg-x-gray/35 inline-block" />未记录</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[1px] bg-amber-500 inline-block" />本周</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[1px] border border-x-border/70 inline-block" />未来</span>
      </div>
    </div>
  );
}
