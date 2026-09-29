import { useMemo, useRef, useState } from 'react';
import { useMainTab } from '@/app/mainTab';
import { useHideOnScroll } from '@/app/useHideOnScroll';
import { useNav } from '@/app/nav';
import Icon from '@/components/Icon';
import PaneHeader from '@/components/PaneHeader';
import PostRow from '@/components/PostRow';
import { useGoalProgress, usePosts, useProfile, useToday } from '@/data/hooks';
import { isComplete } from '@/lib/goals';
import { cn, formatDayCN, toLocalDateKey } from '@/lib/utils';
import LifeWeeks from './LifeWeeks';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export default function CalendarPane() {
  const posts = usePosts();
  const profile = useProfile();
  const goals = useGoalProgress();
  const today = useToday();
  const { push } = useNav();
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerHidden = useHideOnScroll(scrollRef, useMainTab() === 'calendar');
  const [view, setView] = useState<'month' | 'life'>('month');
  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(today);

  const byDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const post of posts) {
      const key = toLocalDateKey(post.createdAt);
      const ids = map.get(key);
      if (ids) ids.push(post.id);
      else map.set(key, [post.id]);
    }
    return map;
  }, [posts]);

  const year = month.getFullYear();
  const m = month.getMonth();
  const days = new Date(year, m + 1, 0).getDate();
  const blanks = new Date(year, m, 1).getDay();
  const selectedIds = selected ? byDay.get(selected) ?? [] : [];
  const selectedGoals = selected ? goals.get(selected) : undefined;

  const shift = (delta: number) => { setMonth(new Date(year, m + delta, 1)); setSelected(null); };

  return (
    <div ref={scrollRef} data-scroll-root className="relative h-full overflow-y-auto pb-28">
      <PaneHeader
        title="日历"
        hidden={headerHidden}
        right={(
          <button type="button" onClick={() => { setMonth(new Date()); setSelected(today); setView('month'); }} className="text-[15px] text-x-blue">
            今天
          </button>
        )}
      >
        <div className="flex" role="tablist">
          {(['month', 'life'] as const).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={cn('relative flex-1 pb-2.5 pt-1 text-[15px]', view === key ? 'font-semibold' : 'text-x-gray')}
            >
              {key === 'month' ? '月历' : '人生周历'}
              {view === key && <span className="absolute bottom-0 left-1/2 h-[3px] w-10 -translate-x-1/2 rounded-full bg-x-blue" />}
            </button>
          ))}
        </div>
      </PaneHeader>

      {view === 'life' ? (
        profile.birthDate ? (
          <LifeWeeks birthDate={profile.birthDate} posts={posts} />
        ) : (
          <div className="px-8 py-16 text-center">
            <p className="text-[15px] leading-relaxed text-x-gray">填上出生日期，这里会按 80 岁把一生按周铺开，大约 4160 格。</p>
            <button type="button" onClick={() => push('Settings', {})} className="pressable mt-5 rounded-full bg-x-fg px-5 py-2 text-[15px] font-semibold text-x-dark">
              去填写
            </button>
          </div>
        )
      ) : (
        <>
          <div className="px-4 pb-2 pt-3">
            <div className="mb-3 flex items-center justify-between">
              <button type="button" onClick={() => shift(-1)} className="pressable rounded-full p-2" aria-label="上个月"><Icon name="chevronLeft" /></button>
              <h2 className="text-[17px] font-semibold">{year}年{m + 1}月</h2>
              <button type="button" onClick={() => shift(1)} className="pressable rounded-full p-2" aria-label="下个月"><Icon name="chevronRight" /></button>
            </div>
            <div className="mb-1 grid grid-cols-7 text-center text-[12px] text-x-gray">
              {WEEKDAYS.map((d) => <div key={d} className="py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: blanks }, (_, i) => <div key={`b${i}`} />)}
              {Array.from({ length: days }, (_, i) => {
                const key = toLocalDateKey(new Date(year, m, i + 1));
                const count = byDay.get(key)?.length ?? 0;
                const isSelected = selected === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelected(isSelected ? null : key)}
                    aria-label={`${formatDayCN(key)}，${count} 条`}
                    className={cn(
                      'flex aspect-square flex-col items-center justify-center rounded-xl text-[15px]',
                      isSelected ? 'bg-x-fg font-semibold text-x-dark' : key === today ? 'font-semibold text-x-blue' : count === 0 && 'text-x-gray',
                    )}
                  >
                    {i + 1}
                    <span className={cn('mt-0.5 h-1.5 w-1.5 rounded-full', count > 0 ? (isSelected ? 'bg-x-dark' : 'bg-x-blue') : 'bg-transparent')} />
                  </button>
                );
              })}
            </div>
          </div>
          {selected && (
            <section className="mt-2 border-t border-x-border">
              <div className="flex items-center justify-between px-4 py-2.5 text-[13px] text-x-gray">
                <span>{formatDayCN(selected)} · {selectedIds.length} 条</span>
                {selectedGoals && selectedGoals.total > 0 && (
                  <span className={cn('flex items-center gap-1', isComplete(selectedGoals) && 'text-x-blue')}>
                    <Icon name="target" size={14} />
                    目标 {selectedGoals.done}/{selectedGoals.total}
                  </span>
                )}
              </div>
              {selectedIds.length === 0
                ? <p className="px-8 py-10 text-center text-[15px] text-x-gray">这一天没有记录。</p>
                : selectedIds.map((id) => <PostRow key={id} id={id} />)}
            </section>
          )}
        </>
      )}
    </div>
  );
}
