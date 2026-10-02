import { toast } from '@/app/toast';
import { sendXCommand } from '@/data/actions';
import { useConnection, useRowIsSynced } from '@/data/connection';
import type { XPostRow } from '@/lib/schema';
import { publicationProgress } from '@/lib/publicationProgress';
import { cn } from '@/lib/utils';
import PublicationStages from './PublicationStages';

/** Kept on the post until resolved; phone users cannot rely on hover titles. */
export default function XDeliveryStatus(props: { id: string; requested: boolean; x: XPostRow | null; table?: 'posts' | 'replies' }) {
  if ((!props.requested && !props.x) || props.x?.state === 'sent' || props.x?.state === 'dismissed') return null;
  return <PendingXDeliveryStatus {...props} />;
}

function PendingXDeliveryStatus({ id, x, table = 'posts' }: { id: string; x: XPostRow | null; table?: 'posts' | 'replies' }) {
  const connection = useConnection();
  const synced = useRowIsSynced(table, id);
  const progress = publicationProgress({ synced, requestedX: true, online: connection.state === 'online', error: connection.error, x });
  return (
    <div className="mt-2 max-w-[320px]" onClick={event => event.stopPropagation()}>
      <PublicationStages progress={progress} />
      <p role="status" className={cn('mt-1 break-words text-[12px] leading-relaxed', progress.failed ? 'text-x-danger' : 'text-x-gray')}>
      {progress.message}{progress.detail && `：${progress.detail}`}
      {progress.failed && (
        <button
          type="button"
          disabled={progress.retrying}
          onClick={(event) => {
            event.stopPropagation();
            sendXCommand(id, 'retry');
            toast('已请求重试 X 同步', 'info');
          }}
          className="ml-2 inline-block font-semibold text-x-blue disabled:opacity-50"
        >
          {progress.retrying ? '等待重试' : '重试'}
        </button>
      )}
      </p>
    </div>
  );
}
