import type { XPostRow } from './schema';

export interface PublicationProgress {
  labels: string[];
  complete: boolean[];
  active: number;
  message: string;
  detail: string;
  done: boolean;
  failed: boolean;
  retrying: boolean;
  waiting: boolean;
}

/** A platform the post was sent to, and the server's delivery row for it so far. */
export interface Delivery { name: string; row: XPostRow | null }

type Status =
  | { kind: 'sent' }
  | { kind: 'dismissed'; detail: string }
  | { kind: 'failed'; message: string; detail: string }
  | { kind: 'pending'; message: string; detail: string; waiting: boolean };

function status({ name, row }: Delivery, online: boolean): Status {
  if (row?.command === 'send') return { kind: 'pending', message: `正在提交 ${name} 同步请求`, detail: '', waiting: true };
  if (row?.command === 'retry') return { kind: 'pending', message: `正在提交 ${name} 重试请求`, detail: '', waiting: !online };
  if (row?.state === 'sent') return { kind: 'sent' };
  if (row?.state === 'dismissed') return { kind: 'dismissed', detail: row.error || '' };
  if (row?.state === 'failed') return { kind: 'failed', message: `${name} 同步失败`, detail: row.error || '请稍后重试' };
  return {
    kind: 'pending',
    message: row?.state === 'publishing' ? `正在确认 ${name} 发布结果` : row?.state === 'sending' ? `正在发送到 ${name}` : `等待发送到 ${name}`,
    detail: row?.error || (!online ? '云端会继续发布，重新连接后更新结果' : '由云端继续处理，可离开此页面'),
    // A disconnected phone cannot confirm an active server job's progress.
    waiting: !online || !row || row.state === 'queued' || !!row.error,
  };
}

/** Stages advance only on a row acknowledgement or a server delivery result, for every platform the post went to. */
export function publicationProgress({ synced, requestedX, skippedX = false, online, error = '', x, channels = [] }: {
  synced: boolean; requestedX: boolean; skippedX?: boolean; online: boolean; error?: string; x: XPostRow | null; channels?: Delivery[];
}): PublicationProgress {
  const deliveries = [...(requestedX ? [{ name: 'X', row: x }] : []), ...channels];
  const statuses = deliveries.map((delivery) => status(delivery, online));
  const finished = statuses.map((item) => item.kind === 'sent' || item.kind === 'dismissed');
  const pending = statuses.findIndex((_item, index) => !finished[index]);
  const result: PublicationProgress = {
    labels: ['日记本', '云端保存', ...deliveries.map(({ name }) => `${name} 发布`)],
    complete: [true, synced, ...statuses.map((item) => item.kind === 'sent')],
    active: synced ? pending === -1 ? -1 : pending + 2 : 1,
    message: '正在发布', detail: '', done: false, failed: false,
    retrying: deliveries.some(({ row }) => row?.command === 'retry'), waiting: !online,
  };
  const failure = statuses.find((item) => item.kind === 'failed');
  const next = statuses[pending];
  if (!synced) {
    result.message = online ? '正在保存到云端' : '已保存，等待云端连接';
    result.detail = error || (online ? '云端确认后继续同步' : '连接恢复后会自动继续');
  } else if (deliveries.length === 0) {
    result.done = true; result.message = '已保存到云端';
    result.detail = skippedX ? '超出 X 字数限制，此帖未同步到 X' : '此帖未开启同步';
  } else if (failure?.kind === 'failed') {
    result.failed = true; result.message = failure.message; result.detail = failure.detail;
  } else if (next?.kind === 'pending') {
    result.message = next.message; result.detail = next.detail; result.waiting = next.waiting;
  } else {
    result.done = true;
    const sent = deliveries.filter((_delivery, index) => statuses[index].kind === 'sent').map(({ name }) => name);
    const cancelled = deliveries.filter((_delivery, index) => statuses[index].kind === 'dismissed').map(({ name }) => name);
    result.message = `${sent.length > 0 ? `已同步到 ${sent.join('、')}` : '已保存'}${cancelled.length > 0 ? `，${cancelled.join('、')} 同步已取消` : ''}`;
    const dismissed = statuses.find((item) => item.kind === 'dismissed');
    result.detail = dismissed?.kind === 'dismissed' ? dismissed.detail : '';
  }
  return result;
}
