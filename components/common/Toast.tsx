'use client';

import { useApp } from '@/lib/context';
import { ToastMessage } from '@/lib/types';

export default function ToastContainer() {
  const { toasts, removeToast } = useApp();

  return (
    // The live region has to be in the DOM before a message arrives, otherwise
    // screen readers announce nothing.
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast-slide-in pointer-events-auto px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium min-w-[280px] text-center cursor-pointer ${
            toast.type === 'success'
              ? 'bg-x-blue'
              : toast.type === 'error'
              ? 'bg-x-danger'
              : 'bg-x-gray'
          }`}
          onClick={() => removeToast(toast.id)}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
