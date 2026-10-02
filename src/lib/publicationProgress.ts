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

/** Stages advance only on a row acknowledgement or a server delivery result. */
export function publicationProgress({ synced, requestedX, skippedX = false, online, error = '', x }: {
  synced: boolean; requestedX: boolean; skippedX?: boolean; online: boolean; error?: string; x: XPostRow | null;
}): PublicationProgress {
  const labels = requestedX ? ['日记本', '云端保存', 'X 发布'] : ['日记本', '云端保存'];
  const result: PublicationProgress = {
    labels, complete: requestedX ? [true, synced, x?.state === 'sent'] : [true, synced],
    active: synced ? requestedX ? 2 : -1 : 1,
    message: '正在发布', detail: '', done: false, failed: false, retrying: x?.command === 'retry', waiting: !online,
  };
  if (!synced) {
    result.message = online ? '正在保存到云端' : '已保存，等待云端连接';
    result.detail = error || (online ? '云端确认后继续同步' : '连接恢复后会自动继续');
  } else if (!requestedX) {
    result.done = true; result.message = '已保存到云端';
    result.detail = skippedX ? '超出 X 字数限制，此帖未同步到 X' : '此帖未开启 X 同步';
  } else if (result.retrying) {
    result.message = '正在提交 X 重试请求';
  } else if (x?.state === 'sent') {
    result.done = true; result.active = -1; result.message = '已同步到 X';
  } else if (x?.state === 'dismissed') {
    result.done = true; result.active = -1; result.message = '已保存，X 同步已取消';
    result.detail = x.error || '';
  } else if (x?.state === 'failed') {
    result.failed = true; result.message = 'X 同步失败'; result.detail = x.error || '请稍后重试';
  } else {
    result.message = x?.state === 'publishing' ? '正在确认 X 发布结果'
      : x?.state === 'sending' ? '正在发送到 X' : '等待发送到 X';
    result.detail = x?.error || (!online ? '云端会继续发布，重新连接后更新结果' : '由云端继续处理，可离开此页面');
    // A disconnected phone cannot confirm an active server job's progress.
    result.waiting = !online || !x || x.state === 'queued' || !!x.error;
  }
  return result;
}
