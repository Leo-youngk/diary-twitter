import { useEffect } from 'react';
import { dismissPublication, usePublications, type Publication } from '@/app/publications';
import { sendXCommand } from '@/data/actions';
import { retrySync, useConnection, useRowIsSynced } from '@/data/connection';
import { useXPost } from '@/data/hooks';
import { store, ui } from '@/data/store';
import { publicationProgress } from '@/lib/publicationProgress';
import Icon from './Icon';
import PublicationStages from './PublicationStages';

function PublishingItem({ item }: { item: Publication }) {
  const connection = useConnection();
  const synced = useRowIsSynced(item.table, item.id);
  const row = ui.useRow(item.table, item.id, store);
  const x = useXPost(item.id);
  const progress = publicationProgress({ synced, requestedX: item.requestedX, skippedX: item.skippedX,
    online: connection.state === 'online', error: connection.error, x });
  const deleted = !row.createdAt;
  useEffect(() => {
    if (deleted) { dismissPublication(item.id); return; }
    if (!progress.done) return;
    const timer = setTimeout(() => dismissPublication(item.id), 6000);
    return () => clearTimeout(timer);
  }, [item.id, progress.done, deleted]);
  if (deleted) return null;
  return (
    <section aria-label={item.table === 'replies' ? '追加发布状态' : '帖子发布状态'}
      className="toast-slide-in pointer-events-auto w-full max-w-[360px] rounded-2xl border border-x-border bg-x-dark px-4 py-3 text-x-fg shadow-lg">
      <div className="mb-2.5 flex items-center gap-2">
        <div role="status" className="min-w-0 flex-1 text-[13px] font-semibold">{progress.message}</div>
        {progress.failed && <button type="button" className="text-[12px] font-semibold text-x-blue"
          onClick={() => sendXCommand(item.id, 'retry')}>重试</button>}
        {!synced && connection.state !== 'online' && <button type="button" className="text-[12px] font-semibold text-x-blue"
          onClick={retrySync}>重连</button>}
        {x?.state === 'sent' && x.link && <a className="text-[12px] text-x-blue" href={x.link} target="_blank" rel="noopener noreferrer">查看 X</a>}
        <button type="button" aria-label="收起发布进度" className="-m-1 p-1 text-x-gray" onClick={() => dismissPublication(item.id)}><Icon name="close" size={15} /></button>
      </div>
      <PublicationStages progress={progress} />
      {progress.detail && <p role={progress.failed ? 'alert' : undefined} className="mt-2 break-words text-[11px] leading-relaxed text-x-gray">{progress.detail}</p>}
    </section>
  );
}

/** Lives outside the composer, so closing it never hides a pending publication. */
export default function PublishingNotice() {
  return usePublications().map(item => <PublishingItem key={item.id} item={item} />);
}
