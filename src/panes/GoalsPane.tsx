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
import { cn, formatDayCN, relativeDayName } from '@/lib/utils';

const HISTORY_PAGE = 60;
// iOS zooms into text fields under 16px; goal text follows the font-size setting above that.
const GOAL_FONT = { fontSize: 'max(16px, calc(17px * var(--font-scale)))' };

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
    <li className="flex items-start gap-3.5 py-2.5">
      <span className="pt-[2px]"><CheckButton goal={goal} /></span>
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
    <div className="flex items-start gap-3.5 py-2.5">
      <span className="-m-2 mt-[-6px] shrink-0 p-2 text-x-gray" aria-hidden="true">
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

/** Today: the page is about this list. */
function Today({ today, progress }: { today: string; progress: ReadonlyMap<string, DayProgress> }) {
  const ids = useGoalIds(today);
  const entry = progress.get(today);
  const streak = perfectStreak(progress, today);
  const complete = isComplete(entry);
  return (
    <section className="px-5 pt-7">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[14px] text-x-gray">
            {formatDayCN(today)}
            {streak >= 2 && <span> · 连续 {streak} 天全部完成</span>}
          </p>
          <h1 className="mt-0.5 text-[30px] font-bold leading-tight tracking-tight">今天</h1>
        </div>
        {entry && entry.total > 0 && (
          <div className="relative mb-1 flex h-11 w-11 shrink-0 items-center justify-center" aria-label={`完成 ${entry.done}/${entry.total}`}>
            <ProgressRing total={entry.total} done={entry.done} size={44} stroke={3.5} className="absolute inset-0" />
            {complete
              ? <Icon name="check" size={20} strokeWidth={2.8} className="text-x-blue" />
              : <span className="text-[13px] font-semibold tabular-nums">{entry.done}/{entry.total}</span>}
          </div>
        )}
      </div>
      <ul className="mt-5">
        {ids.map((id) => <GoalItem key={id} id={id} />)}
      </ul>
      <AddGoal key={today} day={today} placeholder={ids.length === 0 ? '写下今天想完成的事' : '添加目标'} />
      {ids.length === 0 && <CarryOver today={today} progress={progress} />}
    </section>
  );
}

const HistoryGoal = memo(function HistoryGoal({ id }: { id: string }) {
  const goal = useGoal(id);
  if (!goal) return null;
  return (
    <li className="flex items-start gap-3 py-1.5">
      <span className="pt-[2px]"><CheckButton goal={goal} small /></span>
      <p className={cn('min-w-0 flex-1 whitespace-pre-wrap break-words text-[15px] leading-[1.55]', goal.done && 'text-x-gray line-through decoration-x-gray/70')}>
        {goal.text}
      </p>
    </li>
  );
});

/** One past day on a single quiet line; tap it to see (and still tick off) its goals. */
const HistoryDay = memo(function HistoryDay({ day, today, entry }: { day: string; today: string; entry: DayProgress }) {
  const [open, setOpen] = useState(false);
  const ids = useGoalIds(day);
  const name = relativeDayName(day, today);
  return (
    <li>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-3 text-left active:bg-x-hover">
        <span className="shrink-0 text-[15px]">{name === '昨天' ? '昨天' : formatDayCN(day)}</span>
        <span className="ml-auto flex items-center gap-1" aria-hidden="true">
          {entry.total <= 6 && Array.from({ length: entry.total }, (_, i) => (
            <span key={i} className={cn('h-1.5 w-1.5 rounded-full', i < entry.done ? 'bg-x-blue' : 'bg-x-gray/30')} />
          ))}
        </span>
        <span className={cn('w-9 shrink-0 text-right text-[13px] tabular-nums', isComplete(entry) ? 'text-x-blue' : 'text-x-gray')}>
          {entry.done}/{entry.total}
        </span>
        <Icon name="chevronRight" size={14} className={cn('shrink-0 text-x-gray transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <ul className="px-5 pb-3 pl-[1.35rem]">
          {ids.map((id) => <HistoryGoal key={id} id={id} />)}
        </ul>
      )}
    </li>
  );
});

/** 每日目标: today's list, with the past days kept quietly underneath. */
export default function GoalsPane() {
  const today = useToday();
  const progress = useGoalProgress();
  const scrollRef = useRef<HTMLDivElement>(null);
  useHideOnScroll(scrollRef, useMainTab() === 'goals');
  const [shown, setShown] = useState(HISTORY_PAGE);
  const past = [...progress.keys()].filter((day) => day < today && progress.get(day)!.total > 0).sort().reverse();

  return (
    <div ref={scrollRef} data-scroll-root className="relative h-full overflow-y-auto pb-28">
      <Today today={today} progress={progress} />
      {past.length > 0 && (
        <ul className="mt-10 border-t border-x-border">
          {past.slice(0, shown).map((day) => <HistoryDay key={day} day={day} today={today} entry={progress.get(day)!} />)}
          {past.length > shown && (
            <li>
              <button type="button" onClick={() => setShown(shown + HISTORY_PAGE)} className="w-full py-3 text-[14px] text-x-gray">
                更早的 {past.length - shown} 天
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
