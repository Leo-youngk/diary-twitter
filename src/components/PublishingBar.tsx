import { useEffect } from 'react';
import { dismissPublication, usePublications, type Publication } from '@/app/publications';
import { useConnection, useRowIsSynced } from '@/data/connection';
import { useChannelPost, useXPost } from '@/data/hooks';
import { store, ui } from '@/data/store';
import { CHANNELS } from '@/lib/channels';
import { publicationProgress } from '@/lib/publicationProgress';
import { cn } from '@/lib/utils';

// How far the bar creeps during each stage. A stage starts where the one
// before could reach, so the bar never moves backwards.
const STAGES = {
  cloud: { from: 0.08, to: 0.5, ms: 6000 },
  deliver: { from: 0.55, to: 0.92, ms: 12_000 },
  done: { from: 0.92, to: 1, ms: 350 },
} as const;

function Bar({ item }: { item: Publication }) {
  const connection = useConnection();
  const synced = useRowIsSynced(item.table, item.id);
  const createdAt = ui.useCell(item.table, item.id, 'createdAt', store);
  const x = useXPost(item.id);
  const rows = { substack: useChannelPost('substack', item.id), threads: useChannelPost('threads', item.id) };
  const channels = (item.channels ?? []).map((channel) => ({ name: CHANNELS[channel].name, row: rows[channel] }));
  const online = connection.state === 'online';
  const progress = publicationProgress({ synced, requestedX: item.requestedX, skippedX: item.skippedX, online, error: connection.error, x, channels });
  // A failure is told on the post and in a toast; a deleted post has nothing left to show.
  const gone = !createdAt || progress.failed;

  useEffect(() => {
    if (gone) { dismissPublication(item.id); return; }
    if (!progress.done) return;
    const timer = setTimeout(() => dismissPublication(item.id), 900);
    return () => clearTimeout(timer);
  }, [item.id, gone, progress.done]);
  if (gone) return null;

  const stage = progress.done ? 'done' : synced ? 'deliver' : 'cloud';
  const { from, to, ms } = STAGES[stage];
  const offline = !online && !progress.done;
  return (
    <div
      role="progressbar"
      aria-label={progress.message}
      className={cn('absolute inset-x-0 top-0 h-[3px] transition-opacity duration-500', progress.done && 'opacity-0 delay-300')}
    >
      <div
        key={stage}
        className={cn('publish-creep h-full origin-left', offline ? 'bg-x-gray' : 'bg-x-blue')}
        style={{ '--from': from, '--to': to, animationDuration: `${ms}ms`, animationPlayState: offline ? 'paused' : 'running' } as React.CSSProperties}
      />
      {offline && <span className="absolute right-3 top-2 rounded-full bg-x-darker px-2 py-0.5 text-[11px] text-x-gray">等待网络</span>}
    </div>
  );
}

/** A thin bar along the top while something is being published, as on X. The newest is drawn last, on top. */
export default function PublishingBar() {
  const items = usePublications();
  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[60]">
      {items.map((item) => <Bar key={item.id} item={item} />)}
    </div>
  );
}
