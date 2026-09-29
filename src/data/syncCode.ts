// The sync code identifies this person's data on the server and is the only
// credential for it. Same localStorage key as before the rebuild, so an
// installed app keeps its data across the switch.

import { SYNC_CODE_PATTERN } from '@/lib/schema';

const KEY = 'diary-sync-id';
let cached: string | null = null;

export function getSyncCode(): string {
  if (cached) return cached;
  let code: string | null = null;
  try { code = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  if (!code || !SYNC_CODE_PATTERN.test(code)) {
    code = crypto.randomUUID().replace(/-/g, '');
    try { localStorage.setItem(KEY, code); } catch { /* keeps working for this session */ }
  }
  cached = code;
  return code;
}

export function isValidSyncCode(code: string): boolean {
  return SYNC_CODE_PATTERN.test(code);
}

/** Switch to another device's data; the caller reloads the app afterwards. */
export function setSyncCode(code: string): void {
  localStorage.setItem(KEY, code);
  cached = code;
}
