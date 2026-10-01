import { store } from '@/data/store';
import { toast } from './toast';

// A delivery that finished longer ago than this (e.g. seen on reconnecting
// after a day offline) is old news, not a moment to celebrate.
const FRESH_MS = 10 * 60_000;

/**
 * Existing history stays quiet. The first server update can already be
 * terminal, so read the complete committed row, including kind/error/at.
 */
export function announceXDeliveries(): () => void {
  const states = new Map(store.getRowIds('xposts').map((id) => [id, store.getCell('xposts', id, 'state')]));
  const listener = store.addRowListener('xposts', null, (_store, _table, rowId) => {
    const row = store.getRow('xposts', rowId);
    const previous = states.get(rowId);
    states.set(rowId, row.state);
    if (row.state === previous || (row.state !== 'sent' && row.state !== 'failed')) return;
    if (!row.at || Date.now() - row.at > FRESH_MS) return;
    if (row.state === 'failed') {
      toast(`${row.kind === 'reply' ? '追加同步到 X 失败' : 'X 同步失败'}：${row.error || '请查看帖子下的同步状态'}`, 'error');
    } else {
      toast(row.kind === 'reply' ? '追加已同步到 X！🎉' : '同步到 X 成功！🎉');
    }
  });
  return () => store.delListener(listener);
}
