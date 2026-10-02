import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { dismissToast, useToasts } from '@/app/toast';
import { cn } from '@/lib/utils';
import PublishingNotice from './PublishingNotice';

export default function Toasts() {
  const toasts = useToasts();
  const [keyboardInset, setKeyboardInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => setKeyboardInset(viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0);
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
    };
  }, []);
  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[10000] flex flex-col items-center gap-2 px-4"
      // Above the bottom nav pill and the docked reply bar, clear of screen titles.
      style={{ bottom: `calc(env(safe-area-inset-bottom) + ${keyboardInset + 96}px)` }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'toast-slide-in pointer-events-auto flex max-w-[420px] items-center gap-4 rounded-2xl px-5 py-2.5 text-[14px] font-medium shadow-lg',
            toast.type === 'error' ? 'bg-x-danger text-white' : 'bg-x-fg text-x-dark',
          )}
          onClick={() => dismissToast(toast.id)}
        >
          <span className="min-w-0 break-words">{toast.message}</span>
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
      <PublishingNotice />
    </div>,
    document.body,
  );
}
