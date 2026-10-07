import { store } from '@/data/store';
import { toast } from './toast';

// A delivery that finished longer ago than this (e.g. seen on reconnecting
// after a day offline) is old news, not a moment to celebrate.
const FRESH_MS = 10 * 60_000;

/** Each platform's delivery table, told under the platform's name. */
const PLATFORMS = [['xposts', 'X'], ['substackposts', 'Substack'], ['threadsposts', 'Threads']] as const;

function announce(table: typeof PLATFORMS[number][0], name: string): () => void {
  const states = new Map(store.getRowIds(table).map((id) => [id, store.getCell(table, id, 'state')]));
  const listener = store.addRowListener(table, null, (_store, _table, rowId) => {
    const row = store.getRow(table, rowId);
    const previous = states.get(rowId);
    states.set(rowId, row.state);
    if (row.state === previous || (row.state !== 'sent' && row.state !== 'failed')) return;
    if (!row.at || Date.now() - row.at > FRESH_MS) return;
    // Parts of an X thread share their post's outcome, which is announced once.
    if (row.kind === 'reply' && store.getCell('replies', rowId, 'thread') === true) return;
    if (row.state === 'failed') {
      toast(`${row.kind === 'reply' ? `追加同步到 ${name} 失败` : `${name} 同步失败`}：${row.error || '请查看帖子下的同步状态'}`, 'error');
    } else {
      const link = String(row.link ?? '');
      toast(row.kind === 'reply' ? `追加已发到 ${name}` : `已发到 ${name}`, 'success',
        link ? { label: '查看', run: () => { window.open(link, '_blank', 'noopener'); } } : undefined);
    }
  });
  return () => store.delListener(listener);
}

/**
 * Tell each platform's outcome for what was just published. Existing history
 * stays quiet. The first server update can already be terminal, so read the
 * complete committed row, including kind/error/at.
 */
export function announceDeliveries(): () => void {
  const stops = PLATFORMS.map(([table, name]) => announce(table, name));
  return () => stops.forEach((stop) => stop());
}
