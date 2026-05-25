'use client';

import { useApp } from '@/lib/context';
import { ToastMessage } from '@/lib/types';

export default function ToastContainer() {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast-slide-in px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium min-w-[280px] text-center cursor-pointer ${
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
