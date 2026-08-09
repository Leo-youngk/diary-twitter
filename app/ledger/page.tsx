'use client';

import { useState, useEffect, useMemo } from 'react';
import { useScrollDirection } from '@/hooks/useScrollDirection';
import { useApp } from '@/lib/context';
import {
  Transaction, loadTransactions, saveTransactions, generateTxId,
  getMonthStats, getCategoryEmoji, formatLedgerDate, fmtAmt, todayLocal,
} from '@/lib/ledger';
import { cn } from '@/lib/utils';
import QuickEntry from '@/components/ledger/QuickEntry';

export default function LedgerPage() {
  const { notifyLedgerChange } = useApp();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [filter, setFilter] = useState<'all' | 'expense' | 'income'>('all');
  const [showEntry, setShowEntry] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const navHidden = useScrollDirection();

  // Load from localStorage after mount
  useEffect(() => {
    setTransactions(loadTransactions());
    setMounted(true);
  }, []);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const monthLabel = `${year}年${month}月`;

  const prevMonth = () => setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  const stats = useMemo(() => getMonthStats(transactions, year, month), [transactions, year, month]);

  // Transactions for the current month, filtered by type
  const monthTxs = useMemo(() => {
    return transactions
      .filter((tx) => {
        const [y, m] = tx.date.split('-').map(Number);
        return y === year && m === month;
      })
      .filter((tx) => filter === 'all' || tx.type === filter)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [transactions, year, month, filter]);

  // Group by date (descending)
  const grouped = useMemo(() => {
    const map = new Map<string, Transaction[]>();
    monthTxs.forEach((tx) => {
      if (!map.has(tx.date)) map.set(tx.date, []);
      map.get(tx.date)!.push(tx);
    });
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [monthTxs]);

  const addTransaction = (tx: Omit<Transaction, 'id' | 'createdAt'>) => {
    const newTx: Transaction = { ...tx, id: generateTxId(), createdAt: new Date().toISOString() };
    setTransactions((prev) => {
      const next = [newTx, ...prev];
      saveTransactions(next);
      return next;
    });
    notifyLedgerChange();
  };

  const deleteTransaction = (id: string) => {
    setTransactions((prev) => {
      const next = prev.filter((t) => t.id !== id);
      saveTransactions(next);
      return next;
    });
    notifyLedgerChange();
  };

  const tabs = [
    { key: 'all', label: '全部' },
    { key: 'expense', label: '支出' },
    { key: 'income', label: '收入' },
  ] as const;

  // pb-20 clears the FAB only — space for the nav comes from [data-scroll-root].
  return (
    <div className="pb-20">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-x-dark border-b border-x-border">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-xl font-bold">账本</h1>

          {/* Month navigation */}
          <div className="flex items-center gap-1">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-full hover:bg-x-hover transition-colors text-x-gray hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M7.414 13l5.043 5.04-1.414 1.42L3.586 12l7.457-7.46 1.414 1.42L7.414 11H21v2H7.414z" />
              </svg>
            </button>
            <span className="text-sm font-semibold min-w-[80px] text-center">{monthLabel}</span>
            <button
              onClick={nextMonth}
              className="p-1.5 rounded-full hover:bg-x-hover transition-colors text-x-gray hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current rotate-180">
                <path d="M7.414 13l5.043 5.04-1.414 1.42L3.586 12l7.457-7.46 1.414 1.42L7.414 11H21v2H7.414z" />
              </svg>
            </button>

            {/* Desktop add button */}
            <button
              onClick={() => setShowEntry(true)}
              className="hidden md:flex items-center gap-1.5 ml-3 bg-x-blue hover:bg-x-blue-hover text-white font-bold rounded-full px-4 py-1.5 text-sm transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                <path d="M11 11V3h2v8h8v2h-8v8h-2v-8H3v-2h8z" />
              </svg>
              记一笔
            </button>
          </div>
        </div>
      </div>

      {/* Monthly summary card */}
      <div className="mx-4 mt-4 mb-3 p-4 rounded-2xl bg-x-darker border border-x-border/50">
        <div className="grid grid-cols-3 divide-x divide-x-border/30">
          <div className="text-center pr-4">
            <p className="text-xs text-x-gray mb-1.5">收入</p>
            <p className="text-[17px] font-bold text-x-green">{fmtAmt(stats.income)}</p>
          </div>
          <div className="text-center px-4">
            <p className="text-xs text-x-gray mb-1.5">支出</p>
            <p className="text-[17px] font-bold text-x-danger">{fmtAmt(stats.expense)}</p>
          </div>
          <div className="text-center pl-4">
            <p className="text-xs text-x-gray mb-1.5">结余</p>
            <p className={cn('text-[17px] font-bold', stats.balance >= 0 ? 'text-x-blue' : 'text-x-danger')}>
              {stats.balance < 0 ? '-' : ''}{fmtAmt(Math.abs(stats.balance))}
            </p>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-x-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              'flex-1 py-3 flex items-center justify-center transition-colors',
              filter === tab.key ? 'text-white font-semibold' : 'text-x-gray font-normal',
            )}
          >
            <span className="inline-block relative">
              {tab.label}
              {filter === tab.key && (
                <span
                  className="absolute left-0 w-full h-[3px] bg-x-blue rounded-full"
                  style={{ bottom: '-12px' }}
                />
              )}
            </span>
          </button>
        ))}
      </div>

      {/* Transaction list */}
      {!mounted ? null : grouped.length === 0 ? (
        <div className="py-20 text-center text-x-gray">
          <p className="text-4xl mb-4">💰</p>
          <p className="font-bold text-lg mb-1 text-white/80">这个月还没有记录</p>
          <p className="text-sm">点击右下角 + 开始记账</p>
        </div>
      ) : (
        grouped.map(([date, txs]) => {
          const dayExpense = txs.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
          const dayIncome = txs.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);

          return (
            <div key={date}>
              {/* Date group header */}
              <div className="flex justify-between items-center px-4 py-2 bg-x-darker/60 border-y border-x-border/20">
                <span className="text-xs font-medium text-x-gray">{formatLedgerDate(date)}</span>
                <span className="text-xs text-x-gray/80">
                  {dayIncome > 0 && <span className="text-x-green mr-2">+{fmtAmt(dayIncome)}</span>}
                  {dayExpense > 0 && <span className="text-x-danger">−{fmtAmt(dayExpense)}</span>}
                </span>
              </div>

              {/* Transaction items */}
              {txs.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 px-4 py-3.5 border-b border-x-border/40 hover:bg-white/[0.02] transition-colors group"
                >
                  {/* Category icon */}
                  <div className="w-9 h-9 rounded-full bg-x-darker flex items-center justify-center text-lg shrink-0">
                    {getCategoryEmoji(tx.category, tx.type)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium">{tx.category}</p>
                    {tx.note && (
                      <p className="text-[12px] text-x-gray/60 mt-0.5 truncate">{tx.note}</p>
                    )}
                  </div>

                  {/* Amount */}
                  <p className={cn(
                    'font-semibold text-[15px] shrink-0',
                    tx.type === 'income' ? 'text-x-green' : 'text-x-danger',
                  )}>
                    {tx.type === 'income' ? '+' : '−'}{fmtAmt(tx.amount)}
                  </p>

                  {/* Delete — first click shows confirm, second click deletes */}
                  {confirmDeleteId === tx.id ? (
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => { deleteTransaction(tx.id); setConfirmDeleteId(null); }}
                        className="text-xs font-bold text-white bg-x-danger px-2.5 py-1 rounded-full hover:bg-x-danger/80 transition-colors"
                      >
                        删除
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-xs text-x-gray hover:text-white transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(tx.id)}
                      className="p-1.5 text-x-gray/0 group-hover:text-x-gray/40 hover:!text-x-danger transition-colors shrink-0"
                      title="删除"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          );
        })
      )}

      {/* Mobile FAB — the only way to add a transaction on mobile, so it stays
          put and only drops down into the space the nav pill vacates. */}
      <button
        onClick={() => setShowEntry(true)}
        style={{ bottom: navHidden ? 'calc(var(--nav-gap) + 6px)' : 'calc(var(--nav-h) + 12px)' }}
        className={cn(
          'fixed right-4 md:hidden w-14 h-14 bg-x-blue rounded-full',
          'flex items-center justify-center shadow-2xl',
          'hover:bg-x-blue-hover transition-all duration-300 z-40',
        )}
        aria-label="记一笔"
      >
        <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white">
          <path d="M11 11V3h2v8h8v2h-8v8h-2v-8H3v-2h8z" />
        </svg>
      </button>

      {/* Quick entry sheet */}
      {showEntry && (
        <QuickEntry onClose={() => setShowEntry(false)} onAdd={addTransaction} />
      )}
    </div>
  );
}
