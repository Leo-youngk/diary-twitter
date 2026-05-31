// ── Ledger module — fully isolated from diary data ──────────────────────────
// All data stored under 'ledger-v1-*' localStorage keys, no overlap with diary.

export type TxType = 'income' | 'expense';

export interface CategoryOption {
  key: string;
  emoji: string;
}

export const EXPENSE_CATS: CategoryOption[] = [
  { key: '餐饮', emoji: '🍜' },
  { key: '购物', emoji: '🛍️' },
  { key: '交通', emoji: '🚇' },
  { key: '娱乐', emoji: '🎮' },
  { key: '住房', emoji: '🏠' },
  { key: '医疗', emoji: '💊' },
  { key: '教育', emoji: '📚' },
  { key: '日用', emoji: '🧴' },
  { key: '其他', emoji: '📦' },
];

export const INCOME_CATS: CategoryOption[] = [
  { key: '工资', emoji: '💼' },
  { key: '奖金', emoji: '🎁' },
  { key: '副业', emoji: '💡' },
  { key: '投资', emoji: '📈' },
  { key: '转账', emoji: '💸' },
  { key: '其他', emoji: '📦' },
];

export interface Transaction {
  id: string;
  type: TxType;
  amount: number;     // e.g. 25.50 (yuan)
  category: string;
  note?: string;
  date: string;       // YYYY-MM-DD (local date)
  createdAt: string;  // ISO timestamp
}

const STORAGE_KEY = 'ledger-v1-transactions';

export function loadTransactions(): Transaction[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveTransactions(txs: Transaction[]): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(txs)); } catch {}
}

export function generateTxId(): string {
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Returns income, expense, balance for a given year/month (1-indexed month). */
export function getMonthStats(txs: Transaction[], year: number, month: number) {
  const filtered = txs.filter((tx) => {
    const [y, m] = tx.date.split('-').map(Number);
    return y === year && m === month;
  });
  const income = filtered.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = filtered.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  return { income, expense, balance: income - expense };
}

export function getCategoryEmoji(category: string, type: TxType): string {
  const cats = type === 'expense' ? EXPENSE_CATS : INCOME_CATS;
  return cats.find((c) => c.key === category)?.emoji ?? '📦';
}

/** Today as YYYY-MM-DD in local time (not UTC). */
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Format date string as "M月D日 周X". */
export function formatLedgerDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  return `${m}月${d}日 周${days[date.getDay()]}`;
}

/** Format number as "¥1,234.56" */
export function fmtAmt(n: number): string {
  return '¥' + n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
