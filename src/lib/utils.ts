export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** 刚刚 / 3分钟前 / 2小时前 / 昨天 21:04 / 9月21日 / 2025年9月21日 */
export function formatRelativeTime(dateString: string, now: Date = new Date()): string {
  const date = new Date(dateString);
  const diff = now.getTime() - date.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}分钟前`;
  if (diff < 24 * 3600_000) return `${Math.floor(diff / 3600_000)}小时前`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return `昨天 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日`;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/** Timeline style, as on X: 刚刚 / 5m / 2h / 3d / 9月21日 / 2025年9月21日 */
export function formatCompactTime(dateString: string, now: Date = new Date()): string {
  const date = new Date(dateString);
  const diff = now.getTime() - date.getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 24 * 3600_000) return `${Math.floor(diff / 3600_000)}h`;
  if (diff < 7 * 24 * 3600_000) return `${Math.floor(diff / (24 * 3600_000))}d`;
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日`;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatDateCN(dateString: string): string {
  const date = new Date(dateString);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// YYYY-MM-DD in the device's timezone. Slicing the ISO string instead would
// bucket anything written before 08:00 China time into the previous day.
export function toLocalDateKey(date: string | number | Date): string {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight of a 'YYYY-MM-DD' key. */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Calendar arithmetic on day keys (DST-safe: it moves the date, not 24h steps). */
export function addDays(key: string, days: number): string {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + days);
  return toLocalDateKey(date);
}

/** Whole days from one key to another (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDateKey(b).getTime() - parseDateKey(a).getTime()) / 86_400_000);
}

const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 9月30日 周三 */
export function formatDayCN(key: string): string {
  const date = parseDateKey(key);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAY_CN[date.getDay()]}`;
}

/** 今天 / 昨天 / 明天, or 9月28日. */
export function relativeDayName(key: string, today: string): string {
  const diff = daysBetween(today, key);
  if (diff === 0) return '今天';
  if (diff === -1) return '昨天';
  if (diff === 1) return '明天';
  const date = parseDateKey(key);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
