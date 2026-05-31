'use client';

import { useState, useEffect } from 'react';
import {
  TxType, Transaction, EXPENSE_CATS, INCOME_CATS,
  todayLocal, fmtAmt,
} from '@/lib/ledger';
import { cn } from '@/lib/utils';

interface QuickEntryProps {
  onClose: () => void;
  onAdd: (tx: Omit<Transaction, 'id' | 'createdAt'>) => void;
}

export default function QuickEntry({ onClose, onAdd }: QuickEntryProps) {
  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayLocal);

  const cats = type === 'expense' ? EXPENSE_CATS : INCOME_CATS;

  // Pre-select first category on type change
  useEffect(() => {
    setCategory(cats[0].key);
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const parsedAmt = parseFloat(amount);
  const canSubmit = !isNaN(parsedAmt) && parsedAmt > 0 && !!category;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onAdd({
      type,
      amount: Math.round(parsedAmt * 100) / 100,
      category,
      note: note.trim() || undefined,
      date,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Bottom sheet */}
      <div
        className="relative bg-x-dark w-full max-w-[600px] rounded-t-2xl border-t border-x-border shadow-2xl sheet-slide-up"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-8 h-1 rounded-full bg-x-border/70" />
        </div>

        {/* Type toggle */}
        <div className="flex gap-2.5 px-5 pt-2 pb-4">
          <button
            onClick={() => setType('expense')}
            className={cn(
              'flex-1 py-2.5 rounded-full font-bold text-sm transition-colors',
              type === 'expense' ? 'bg-x-danger text-white' : 'bg-x-darker text-x-gray',
            )}
          >
            支出
          </button>
          <button
            onClick={() => setType('income')}
            className={cn(
              'flex-1 py-2.5 rounded-full font-bold text-sm transition-colors',
              type === 'income' ? 'bg-x-green text-white' : 'bg-x-darker text-x-gray',
            )}
          >
            收入
          </button>
        </div>

        {/* Amount input */}
        <div className="px-5 pb-5 border-b border-x-border/30">
          <div className="flex items-baseline gap-1">
            <span className="text-x-gray text-[22px] font-light">¥</span>
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              step="0.01"
              min="0"
              autoFocus
              className="flex-1 bg-transparent text-[42px] font-bold text-white outline-none placeholder:text-x-gray/30 w-0"
            />
          </div>
          {canSubmit && (
            <p className="text-xs text-x-gray/60 mt-1">
              {fmtAmt(parsedAmt)}
            </p>
          )}
        </div>

        {/* Category grid */}
        <div className="px-5 py-4 border-b border-x-border/30">
          <div className="grid grid-cols-4 gap-2">
            {cats.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                className={cn(
                  'flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-medium transition-colors',
                  category === cat.key
                    ? 'bg-x-blue/20 text-x-blue ring-1 ring-x-blue/40'
                    : 'bg-x-darker text-x-gray hover:text-white',
                )}
              >
                <span className="text-xl leading-none">{cat.emoji}</span>
                <span>{cat.key}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Note + Date row */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-x-border/30">
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current text-x-gray/50 shrink-0">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
          </svg>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="备注（可选）"
            className="flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-x-gray/50"
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="bg-transparent text-xs text-x-gray/70 outline-none text-right [color-scheme:dark]"
          />
        </div>

        {/* Submit */}
        <div className="px-5 pt-4">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              'w-full py-3.5 rounded-full font-bold text-[15px] transition-colors',
              canSubmit
                ? type === 'expense'
                  ? 'bg-x-danger hover:bg-x-danger/80 text-white'
                  : 'bg-x-green hover:bg-x-green/80 text-white'
                : 'bg-x-darker text-x-gray/50 cursor-not-allowed',
            )}
          >
            {canSubmit
              ? `确认${type === 'expense' ? '支出' : '收入'} ${fmtAmt(parsedAmt)}`
              : '请输入金额并选择分类'}
          </button>
        </div>
      </div>
    </div>
  );
}
