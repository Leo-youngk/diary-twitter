import type { PublicationProgress } from '@/lib/publicationProgress';
import { cn } from '@/lib/utils';
import Icon from './Icon';

export default function PublicationStages({ progress }: { progress: PublicationProgress }) {
  return (
    <ol aria-label="发布进度" className="flex gap-2">
      {progress.labels.map((label, index) => {
        const complete = progress.complete[index];
        const active = progress.active === index;
        const failed = active && progress.failed;
        return (
          <li key={label} aria-current={active ? 'step' : undefined} className="min-w-0 flex-1">
            <div className={cn('mb-1.5 h-1 rounded-full', complete ? 'bg-x-blue' : failed ? 'bg-x-danger' : active ? 'bg-x-blue/40' : 'bg-x-border')} />
            <span className={cn('flex items-center gap-1 text-[11px]', failed ? 'text-x-danger' : complete || active ? 'text-x-fg' : 'text-x-gray')}>
              {complete ? <Icon name="check" size={12} /> : failed ? <Icon name="close" size={12} />
                : active && !progress.waiting ? <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 animate-spin rounded-full border border-x-blue border-t-transparent motion-reduce:animate-none" />
                  : <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full border border-current" />}
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
