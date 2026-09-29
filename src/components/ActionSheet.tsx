import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export interface SheetAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

interface ActionSheetProps {
  open: boolean;
  actions: SheetAction[];
  onClose: () => void;
}

/** iOS-style action sheet. Hidden with visibility, so it can never hold focus. */
export default function ActionSheet({ open, actions, onClose }: ActionSheetProps) {
  return createPortal(
    <div
      className={cn('overlay fixed inset-0 z-[80] flex items-end justify-center bg-black/35', open && 'open')}
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div
        className="sheet w-full max-w-[600px] px-3"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="overflow-hidden rounded-2xl bg-x-dark">
          {actions.map((action, i) => (
            <button
              key={action.label}
              type="button"
              onClick={() => { onClose(); action.onSelect(); }}
              className={cn(
                'block w-full py-3.5 text-center text-[16px] active:bg-x-hover',
                i > 0 && 'border-t border-x-border',
                action.danger ? 'text-x-danger' : 'text-x-fg',
              )}
            >
              {action.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 block w-full rounded-2xl bg-x-dark py-3.5 text-center text-[16px] font-semibold active:bg-x-hover"
        >
          取消
        </button>
      </div>
    </div>,
    document.body,
  );
}
