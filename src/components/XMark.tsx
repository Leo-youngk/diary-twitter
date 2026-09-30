import type { XPostRow } from '@/lib/schema';
import { cn } from '@/lib/utils';
import { XLogo } from './Icon';

/** Where this post stands on X: grey when published, faint while on its way, red when it needs attention. */
export default function XMark({ x, size = 12 }: { x: XPostRow | null; size?: number }) {
  if (!x || x.state === 'dismissed') return null;
  const failed = x.state === 'failed';
  const pending = x.state === 'queued' || x.state === 'sending' || x.state === 'publishing';
  const title = failed ? `X 同步需要处理：${x.error}`
    : pending ? (x.error || (x.state === 'publishing' ? 'Buffer 已接收，正在核对 X 发布状态' : '等待发到 X'))
    : '已发到 X';
  return (
    <span title={title} className={cn('inline-flex items-center', failed ? 'text-x-danger' : 'text-x-gray', pending && 'opacity-50')}>
      <XLogo size={size} />
    </span>
  );
}
