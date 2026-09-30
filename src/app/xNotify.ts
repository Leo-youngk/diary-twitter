import { store } from '@/data/store';
import { toast } from './toast';

// A delivery that finished longer ago than this (e.g. seen on reconnecting
// after a day offline) is old news, not a moment to celebrate.
const FRESH_MS = 10 * 60_000;

/**
 * 「同步到 X 成功！🎉」 when a post or reply this app is watching goes out on X.
 * Installed after the local copy has loaded, so rows that were already sent
 * never announce themselves.
 */
export function announceXDeliveries(): void {
  store.addCellListener('xposts', null, 'state', (_store, _table, rowId, _cell, next, previous) => {
    if (next !== 'sent' || previous === undefined || previous === 'sent') return;
    if (Date.now() - Number(store.getCell('xposts', rowId, 'at') ?? 0) > FRESH_MS) return;
    toast(store.getCell('xposts', rowId, 'kind') === 'reply' ? '追加已同步到 X！🎉' : '同步到 X 成功！🎉');
  });
}
