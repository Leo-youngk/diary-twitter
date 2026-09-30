import { blobHashOf } from '@/lib/schema';
import { getToken, signOut } from './auth';

/**
 * Images live outside the synced store, addressed by the SHA-256 of their
 * bytes; posts and the profile only hold `blob:<hash>` refs.
 *
 * A new image is written to Cache Storage under its final URL right away, so
 * it shows (and the service worker serves it) before and without the upload.
 * Uploads are queued and retried until the server has the bytes.
 */

const CACHE_NAME = 'diary-blobs';
const QUEUE_KEY = 'diary-blob-queue';
const objectUrls = new Map<string, string>();

export function blobUrl(hash: string): string {
  return `/api/blob/${hash}`;
}

/** What an <img> should load for a ref. */
export function imageSrc(ref: string): string {
  const hash = blobHashOf(ref);
  if (!hash) return ref;
  return objectUrls.get(hash) ?? blobUrl(hash);
}

function readQueue(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: string[]): void {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); } catch { /* retried next session */ }
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function readCached(hash: string): Promise<Blob | null> {
  try {
    const hit = await (await caches.open(CACHE_NAME)).match(blobUrl(hash));
    if (hit) return await hit.blob();
  } catch { /* Cache Storage unavailable */ }
  const objectUrl = objectUrls.get(hash);
  if (objectUrl) return await (await fetch(objectUrl)).blob();
  return null;
}

let flushing: Promise<void> | null = null;

/** Upload everything still queued. Stops at the first failure and tries again later. */
export function flushUploads(): Promise<void> {
  flushing ??= (async () => {
    try {
      for (const hash of readQueue()) {
        const blob = await readCached(hash);
        if (!blob) {
          console.warn('[blobs] queued image is no longer on this device', hash);
          writeQueue(readQueue().filter((item) => item !== hash));
          continue;
        }
        const token = getToken();
        if (!token) break;
        const response = await fetch(blobUrl(hash), {
          method: 'PUT',
          headers: { 'content-type': blob.type || 'image/jpeg', authorization: `Bearer ${token}` },
          body: blob,
        }).catch(() => null);
        if (response?.status === 401) signOut();
        if (!response?.ok) break;
        writeQueue(readQueue().filter((item) => item !== hash));
      }
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

/** Keep an image on this device, queue its upload, and return its ref. */
export async function storeImage(blob: Blob): Promise<string> {
  const hash = await sha256Hex(await blob.arrayBuffer());
  if (!objectUrls.has(hash)) objectUrls.set(hash, URL.createObjectURL(blob));
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(blobUrl(hash), new Response(blob, { headers: { 'content-type': blob.type || 'image/jpeg' } }));
  } catch {
    console.warn('[blobs] Cache Storage unavailable; the image is kept only until the upload succeeds');
  }
  if (!readQueue().includes(hash)) writeQueue([...readQueue(), hash]);
  void flushUploads();
  return `blob:${hash}`;
}

/** Fetch an image as a data URL (for backups). */
export async function imageAsDataUrl(ref: string): Promise<string | null> {
  const hash = blobHashOf(ref);
  if (!hash) return null;
  let blob = await readCached(hash);
  if (!blob) {
    const response = await fetch(blobUrl(hash)).catch(() => null);
    if (!response?.ok) return null;
    blob = await response.blob();
  }
  return await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return await (await fetch(dataUrl)).blob();
}
