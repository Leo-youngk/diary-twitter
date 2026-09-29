import { useRef, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { toast } from '@/app/toast';
import Icon from '@/components/Icon';
import PaneHeader from '@/components/PaneHeader';
import ProgressRing from '@/components/ProgressRing';
import {
  addGoal, carryOverGoals, deleteGoal, MAX_GOAL_LENGTH, renameGoal, restoreGoal, toggleGoal,
} from '@/data/actions';
import { useGoal, useGoalIds, useGoalProgress, useToday, type Goal } from '@/data/hooks';
import { store } from '@/data/store';
import { isComplete, lastUnfinishedDay, perfectStreak, type DayProgress } from '@/lib/goals';
import { addDays, cn, formatDayCN, parseDateKey, relativeDayName } from '@/lib/utils';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];
const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
// iOS zooms into text fields under 16px; the goal text follows the font-size setting above that.
const GOAL_FONT = { fontSize: 'max(16px, calc(16px * var(--font-scale)))' };

/** Return confirms, except while an input method is still composing (拼音 uses Return to commit). */
function isEnter(e: React.KeyboardEvent): boolean {
  return e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229;
}

function removeGoal(id: string): void {
  const row = deleteGoal(id);
  if (row) toast('已删除目标', 'info', { label: '撤销', run: () => restoreGoal(id, row) });
}

function WeekStrip({ day, today, progress, onPick }: {
  day: string;
  today: string;
  progress: ReadonlyMap<string, DayProgress>;
  onPick: (day: string) => void;
}) {
  const start = addDays(day, -parseDateKey(day).getDay());
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="flex items-center px-1 pb-2">
      <button type="button" onClick={() => onPick(addDays(day, -7))} className="pressable shrink-0 p-2 text-x-gray" aria-label="上一周">
        <Icon name="chevronLeft" size={18} />
      </button>
      <div className="grid flex-1 grid-cols-7">
        {days.map((key, i) => {
          const entry = progress.get(key);
          const selected = key === day;
          const isToday = key === today;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onPick(key)}
              aria-pressed={selected}
              aria-label={`${formatDayCN(key)}${entry ? `，完成 ${entry.done}/${entry.total}` : ''}`}
              className="flex flex-col items-center gap-1 py-0.5"
            >
              <span className={cn('text-[11px]', isToday ? 'font-semibold text-x-blue' : 'text-x-gray')}>{WEEKDAYS[i]}</span>
              <span className="relative flex h-9 w-9 items-center justify-center">
                <ProgressRing total={entry?.total ?? 0} done={entry?.done ?? 0} size={36} stroke={2.5} className="absolute inset-0" />
                <span
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full text-[15px] tabular-nums transition-colors',
                    selected ? 'bg-x-fg font-semibold text-x-dark' : isToday && 'font-semibold text-x-blue',
                  )}
                >
                  {parseDateKey(key).getDate()}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <button type="button" onClick={() => onPick(addDays(day, 7))} className="pressable shrink-0 p-2 text-x-gray" aria-label="下一周">
        <Icon name="chevronRight" size={18} />
      </button>
    </div>
  );
}

function DaySummary({ day, today, progress }: { day: string; today: string; progress: ReadonlyMap<string, DayProgress> }) {
  const entry = progress.get(day);
  const name = relativeDayName(day, today);
  const relative = name === '今天' || name === '昨天' || name === '明天';
  const streak = day === today ? perfectStreak(progress, today) : 0;
  return (
    <div className="flex min-h-[80px] items-center gap-4 px-4 pb-2 pt-4">
      <div className="min-w-0 flex-1">
        <h2 className="text-[22px] font-bold leading-tight">{name}</h2>
        <p className="mt-1 text-[14px] text-x-gray">
          {relative ? formatDayCN(day) : WEEKDAY_NAMES[parseDateKey(day).getDay()]}
          {streak >= 2 && ` · 已连续 ${streak} 天全部完成`}
        </p>
      </div>
      {entry && entry.total > 0 && (
        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center" aria-label={`完成 ${entry.done}/${entry.total}`}>
          <ProgressRing total={entry.total} done={entry.done} size={56} stroke={4} className="absolute inset-0" />
          {isComplete(entry)
            ? <Icon name="check" size={24} strokeWidth={2.6} className="text-x-blue" />
            : <span className="text-[14px] font-semibold tabular-nums">{entry.done}/{entry.total}</span>}
        </div>
      )}
    </div>
  );
}

function CheckButton({ goal }: { goal: Goal }) {
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
          'flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 transition-colors duration-150',
          goal.done ? 'border-x-blue bg-x-blue text-white' : 'border-x-gray/60',
          goal.done && tapped && 'check-pop',
        )}
      >
        {goal.done && <Icon name="check" size={13} strokeWidth={3.2} />}
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
    <li className="flex items-start gap-3 px-4 py-2.5">
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

function AddGoal({ day }: { day: string }) {
  const [text, setText] = useState('');
  const commit = () => { if (addGoal(day, text)) setText(''); };
  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
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
        placeholder="添加目标"
        enterKeyHint="done"
        maxLength={MAX_GOAL_LENGTH}
        style={GOAL_FONT}
        className="min-w-0 flex-1 resize-none bg-transparent leading-[1.5] outline-none placeholder:text-x-gray"
      />
    </div>
  );
}

/** Offers the last day's unfinished goals when today's list is still empty. */
function CarryOver({ today, progress }: { today: string; progress: ReadonlyMap<string, DayProgress> }) {
  const from = lastUnfinishedDay(progress, today);
  const ids = useGoalIds(from ?? '');
  if (!from) return null;
  const pending = ids.filter((id) => store.getCell('goals', id, 'done') !== true);
  if (pending.length === 0) return null;
  return (
    <div className="mx-4 mb-2 mt-1 rounded-2xl bg-x-darker px-4 py-3.5">
      <p className="text-[14px] text-x-gray">{relativeDayName(from, today)}还有 {pending.length} 个没完成</p>
      <ul className="mt-1.5 space-y-0.5 text-[15px]">
        {pending.slice(0, 3).map((id) => (
          <li key={id} className="truncate">· {String(store.getCell('goals', id, 'text') ?? '')}</li>
        ))}
        {pending.length > 3 && <li className="text-x-gray">…</li>}
      </ul>
      <button
        type="button"
        onClick={() => { if (carryOverGoals(from, today) > 0) toast('已带到今天'); }}
        className="pressable mt-3 rounded-full bg-x-fg px-4 py-1.5 text-[14px] font-semibold text-x-dark"
      >
        带到今天
      </button>
    </div>
  );
}

/** 每日目标: write a few things for the day, tick them off as they get done. */
export default function GoalsPane() {
  const today = useToday();
  // null follows today, also across midnight while the app stays open.
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked ?? today;
  const progress = useGoalProgress();
  const ids = useGoalIds(day);
  const pick = (next: string) => setPicked(next === today ? null : next);

  return (
    <div data-scroll-root className="relative h-full overflow-y-auto pb-28">
      <PaneHeader
        title="目标"
        right={day !== today && (
          <button type="button" onClick={() => setPicked(null)} className="text-[15px] text-x-blue">今天</button>
        )}
      >
        <WeekStrip day={day} today={today} progress={progress} onPick={pick} />
      </PaneHeader>

      <DaySummary day={day} today={today} progress={progress} />

      {day === today && ids.length === 0 && <CarryOver today={today} progress={progress} />}
      {progress.size === 0 && (
        <p className="px-4 pb-1 pt-1 text-[14px] leading-relaxed text-x-gray">
          每天写下几件想完成的事，做完就点左边的圆圈打卡。也可以提前写好明天的。
        </p>
      )}

      <ul>
        {ids.map((id) => <GoalItem key={id} id={id} />)}
      </ul>
      <AddGoal key={day} day={day} />
    </div>
  );
}
