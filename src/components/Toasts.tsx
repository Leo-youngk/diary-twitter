import { dismissToast, useToasts } from '@/app/toast';
import { cn } from '@/lib/utils';

export default function Toasts() {
  const toasts = useToasts();
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[120] flex flex-col items-center gap-2 px-4"
      // Above the bottom nav pill and the docked reply bar, clear of screen titles.
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 96px)' }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'toast-slide-in pointer-events-auto flex max-w-[420px] items-center gap-4 rounded-full px-5 py-2.5 text-[14px] font-medium shadow-lg',
            toast.type === 'error' ? 'bg-x-danger text-white' : 'bg-x-fg text-x-dark',
          )}
          onClick={() => dismissToast(toast.id)}
        >
          <span>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toast.action!.run(); dismissToast(toast.id); }}
              className="shrink-0 font-bold text-x-blue"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
