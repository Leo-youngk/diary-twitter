import { memo, useRef, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { useMainTab } from '@/app/mainTab';
import { toast } from '@/app/toast';
import { useHideOnScroll } from '@/app/useHideOnScroll';
import Icon from '@/components/Icon';
import ProgressRing from '@/components/ProgressRing';
import {
  addGoal, carryOverGoals, deleteGoal, MAX_GOAL_LENGTH, renameGoal, restoreGoal, toggleGoal,
} from '@/data/actions';
import { useGoal, useGoalIds, useGoalProgress, useToday, type Goal } from '@/data/hooks';
import { store } from '@/data/store';
import { isComplete, lastUnfinishedDay, perfectStreak, type DayProgress } from '@/lib/goals';
import { addDays, cn, formatDayCN, parseDateKey, relativeDayName } from '@/lib/utils';

const WEEKS = 18;
const HISTORY_PAGE = 60;
// iOS zooms into text fields under 16px; goal text follows the font-size setting above that.
const GOAL_FONT = { fontSize: 'max(16px, calc(16px * var(--font-scale)))' };

/** Return confirms, except while an input method is still composing (拼音 uses Return to commit). */
function isEnter(e: React.KeyboardEvent): boolean {
  return e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229;
}

function removeGoal(id: string): void {
  const row = deleteGoal(id);
  if (row) toast('已删除目标', 'info', { label: '撤销', run: () => restoreGoal(id, row) });
}

function CheckButton({ goal, small = false }: { goal: Goal; small?: boolean }) {
  // Only a tap animates; goals that were already done appear without a flourish.
  const [tapped, setTapped] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { setTapped(true); toggleGoal(goal.id); }}
      aria-pressed={goal.done}
      aria-label={goal.done ? '取消打卡' : '打卡'}
      className="-m-2 shrink-0 p-2"
    >
      <span
        className={cn(
          'flex items-center justify-center rounded-full border-2 transition-colors duration-150',
          small ? 'h-[18px] w-[18px]' : 'h-[22px] w-[22px]',
          goal.done ? 'border-x-blue bg-x-blue text-white' : 'border-x-gray/60',
          goal.done && tapped && 'check-pop',
        )}
      >
        {goal.done && <Icon name="check" size={small ? 11 : 13} strokeWidth={3.2} />}
      </span>
    </button>
  );
}

function GoalEditor({ goal, onDone }: { goal: Goal; onDone: () => void }) {
  const [text, setText] = useState(goal.text);
  const skipSave = useRef(false);
  const finish = () => {
    if (!skipSave.current) {
      if (text.trim()) renameGoal(goal.id, text);
      else removeGoal(goal.id);
    }
    onDone();
  };
  return (
    <div className="flex min-w-0 flex-1 items-start gap-2">
      <TextareaAutosize
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)}
        onBlur={finish}
        onKeyDown={(e) => {
          if (isEnter(e)) { e.preventDefault(); e.currentTarget.blur(); }
          if (e.key === 'Escape') { skipSave.current = true; e.currentTarget.blur(); }
        }}
        enterKeyHint="done"
        maxLength={MAX_GOAL_LENGTH}
        style={GOAL_FONT}
        className="min-w-0 flex-1 resize-none bg-transparent leading-[1.5] outline-none"
      />
      <button
        type="button"
        // Keep the focus in the field, so the tap reaches this button before the editor closes.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => { skipSave.current = true; removeGoal(goal.id); onDone(); }}
        className="-m-1.5 shrink-0 p-1.5 text-x-gray"
        aria-label="删除目标"
      >
        <Icon name="trash" size={18} />
      </button>
    </div>
  );
}

function GoalItem({ id }: { id: string }) {
  const goal = useGoal(id);
  const [editing, setEditing] = useState(false);
  if (!goal) return null;
  return (
    <li className="flex items-start gap-3 py-2">
      <CheckButton goal={goal} />
      {editing ? (
        <GoalEditor goal={goal} onDone={() => setEditing(false)} />
      ) : (
        <p
          onClick={() => setEditing(true)}
          style={GOAL_FONT}
          className={cn(
            'min-w-0 flex-1 cursor-text whitespace-pre-wrap break-words leading-[1.5] transition-colors',
            goal.done && 'text-x-gray line-through decoration-x-gray/70',
          )}
        >
          {goal.text}
        </p>
      )}
    </li>
  );
}

function AddGoal({ day, placeholder }: { day: string; placeholder: string }) {
  const [text, setText] = useState('');
  const commit = () => { if (addGoal(day, text)) setText(''); };
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="-m-2 shrink-0 p-2 text-x-gray" aria-hidden="true">
        <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-dashed border-x-gray/50">
          <Icon name="plus" size={12} strokeWidth={2.8} />
        </span>
      </span>
      <TextareaAutosize
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (!isEnter(e)) return;
          e.preventDefault();
          // Return adds and stays for the next one; Return on an empty line is done.
          if (text.trim()) commit();
          else e.currentTarget.blur();
        }}
        placeholder={placeholder}
        enterKeyHint="done"
        maxLength={MAX_GOAL_LENGTH}
        style={GOAL_FONT}
        className="min-w-0 flex-1 resize-none bg-transparent leading-[1.5] outline-none placeholder:text-x-gray"
      />
    </div>
  );
}

/** Offers the last day's unfinished goals while today's list is still empty. */
function CarryOver({ today, progress }: { today: string; progress: ReadonlyMap<string, DayProgress> }) {
  const from = lastUnfinishedDay(progress, today);
  const ids = useGoalIds(from ?? '');
  if (!from) return null;
  const pending = ids.filter((id) => store.getCell('goals', id, 'done') !== true);
  if (pending.length === 0) return null;
  return (
    <div className="mt-2 flex items-center gap-3 pt-1">
      <p className="min-w-0 flex-1 text-[14px] text-x-gray">
        {relativeDayName(from, today)}还有 {pending.length} 个没完成
      </p>
      <button
        type="button"
        onClick={() => { if (carryOverGoals(from, today) > 0) toast('已带到今天'); }}
        className="pressable shrink-0 rounded-full bg-x-fg px-3.5 py-1 text-[14px] font-semibold text-x-dark"
      >
        带到今天
      </button>
    </div>
  );
}

/** Today's list, the one place goals are written. */
function TodayCard({ today, progress }: { today: string; progress: ReadonlyMap<string, DayProgress> }) {
  const ids = useGoalIds(today);
  const entry = progress.get(today);
  return (
    <section className="rounded-2xl bg-x-darker px-4 pb-2 pt-3">
      <div className="flex h-7 items-center justify-between">
        <p className="text-[15px]">
          <span className="font-semibold">今天</span>
          <span className="ml-2 text-x-gray">{formatDayCN(today)}</span>
        </p>
        {entry && entry.total > 0 && (
          <span className={cn('flex items-center gap-1.5 text-[13px] tabular-nums', isComplete(entry) ? 'font-semibold text-x-blue' : 'text-x-gray')}>
            <ProgressRing total={entry.total} done={entry.done} size={18} stroke={2.5} />
            {entry.done}/{entry.total}
          </span>
        )}
      </div>
      <ul className="mt-1">
        {ids.map((id) => <GoalItem key={id} id={id} />)}
      </ul>
      <AddGoal key={today} day={today} placeholder={ids.length === 0 ? '写下今天想完成的事' : '添加目标'} />
      {ids.length === 0 && <CarryOver today={today} progress={progress} />}
    </section>
  );
}

function cellClass(entry: DayProgress | undefined): string {
  if (!entry || entry.total === 0) return 'bg-x-search';
  if (entry.done === 0) return 'bg-x-gray/30';
  const ratio = entry.done / entry.total;
  if (ratio >= 1) return 'bg-x-blue';
  return ratio >= 0.5 ? 'bg-x-blue/60' : 'bg-x-blue/30';
}

/** The last few months at a glance, one square per day, like GitHub's contribution graph. */
function Heatmap({ today, progress, onPick }: { today: string; progress: ReadonlyMap<string, DayProgress>; onPick: (day: string) => void }) {
  const lastSunday = addDays(today, -parseDateKey(today).getDay());
  const start = addDays(lastSunday, -(WEEKS - 1) * 7);
  const days = Array.from({ length: WEEKS * 7 }, (_, i) => addDays(start, i));
  const streak = perfectStreak(progress, today);
  return (
    <section className="px-4 pt-5">
      <div className="mb-2 flex items-baseline justify-between text-[13px] text-x-gray">
        <span>最近 {WEEKS} 周</span>
        {streak > 0 && <span>已连续 <span className="font-semibold text-x-fg">{streak}</span> 天全部完成</span>}
      </div>
      <div
        className="grid grid-flow-col gap-[3px]"
        style={{ gridTemplateRows: 'repeat(7, minmax(0, 1fr))', gridTemplateColumns: `repeat(${WEEKS}, minmax(0, 1fr))` }}
        role="img"
        aria-label={`最近 ${WEEKS} 周每天的目标完成情况`}
      >
        {days.map((day) => {
          const entry = progress.get(day);
          const future = day > today;
          return (
            <button
              key={day}
              type="button"
              disabled={future || !entry}
              onClick={() => onPick(day)}
              aria-label={`${formatDayCN(day)}${entry ? ` 完成 ${entry.done}/${entry.total}` : ''}`}
              className={cn(
                'aspect-square rounded-[3px]',
                future ? 'invisible' : cellClass(entry),
                day === today && 'ring-1 ring-x-gray ring-offset-1 ring-offset-[var(--color-x-dark)]',
              )}
            />
          );
        })}
      </div>
    </section>
  );
}

const HistoryGoal = memo(function HistoryGoal({ id }: { id: string }) {
  const goal = useGoal(id);
  if (!goal) return null;
  return (
    <li className="flex items-start gap-2.5 py-1">
      <span className="pt-[3px]"><CheckButton goal={goal} small /></span>
      <p className={cn('min-w-0 flex-1 whitespace-pre-wrap break-words text-[15px] leading-[1.55]', goal.done && 'text-x-gray line-through decoration-x-gray/70')}>
        {goal.text}
      </p>
    </li>
  );
});

/** One past day. Its goals can still be ticked off, e.g. when yesterday's check-in was forgotten. */
const HistoryDay = memo(function HistoryDay({ day, today, entry }: { day: string; today: string; entry: DayProgress }) {
  const ids = useGoalIds(day);
  const name = relativeDayName(day, today);
  return (
    <article data-day={day} className="scroll-mt-4 border-t border-x-border px-4 py-3">
      <div className="flex items-baseline justify-between">
        <p className="text-[14px]">
          <span className="font-semibold">{name === '昨天' ? '昨天' : formatDayCN(day)}</span>
          {name === '昨天' && <span className="ml-2 text-x-gray">{formatDayCN(day)}</span>}
        </p>
        <span className={cn('text-[13px] tabular-nums', isComplete(entry) ? 'font-semibold text-x-blue' : 'text-x-gray')}>
          {isComplete(entry) ? '全部完成' : `${entry.done}/${entry.total}`}
        </span>
      </div>
      <ul className="mt-1.5">
        {ids.map((id) => <HistoryGoal key={id} id={id} />)}
      </ul>
    </article>
  );
});

/** 每日目标: today's list on top, the record of past days below. */
export default function GoalsPane() {
  const today = useToday();
  const progress = useGoalProgress();
  const scrollRef = useRef<HTMLDivElement>(null);
  useHideOnScroll(scrollRef, useMainTab() === 'goals');
  const [shown, setShown] = useState(HISTORY_PAGE);
  const past = [...progress.keys()].filter((day) => day < today && progress.get(day)!.total > 0).sort().reverse();

  const pick = (day: string) => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    if (day === today) { scroller.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const index = past.indexOf(day);
    if (index >= shown) setShown(index + HISTORY_PAGE);
    requestAnimationFrame(() => scroller.querySelector(`[data-day="${day}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <div ref={scrollRef} data-scroll-root className="relative h-full overflow-y-auto pb-28">
      <div className="px-4 pt-3">
        <TodayCard today={today} progress={progress} />
      </div>
      <Heatmap today={today} progress={progress} onPick={pick} />
      <div className="mt-5">
        {past.slice(0, shown).map((day) => <HistoryDay key={day} day={day} today={today} entry={progress.get(day)!} />)}
        {past.length > shown && (
          <button type="button" onClick={() => setShown(shown + HISTORY_PAGE)} className="w-full border-t border-x-border py-3 text-[14px] text-x-blue">
            显示更早的 {Math.min(HISTORY_PAGE, past.length - shown)} 天
          </button>
        )}
      </div>
    </div>
  );
}
