import { randomUUID, webcrypto } from 'node:crypto';
import { buildIntegrationEvents, type IntegrationEnvelope, type IntegrationEvent } from '../lib/obsidianIntegration';

const DEFAULT_SOURCE_URL = 'https://diary-app.yk2958374240.workers.dev';
const DEFAULT_TARGET_URL = 'https://obsidian-ios-pwa.if5v.workers.dev/api/integrations/twitter';
const MAX_EVENTS_PER_REQUEST = 50;
const MAX_BODY_BYTES = 1_500_000;
const REQUEST_TIMEOUT_MS = 20_000;

const sourceUrl = (process.env.TWITTER_SOURCE_URL || DEFAULT_SOURCE_URL).replace(/\/+$/, '');
const targetUrl = process.env.OBSIDIAN_SYNC_URL || DEFAULT_TARGET_URL;
const syncId = process.env.TWITTER_SYNC_ID || '';
const secret = process.env.OBSIDIAN_SYNC_SECRET || '';

if (!/^[A-Za-z0-9]{16,64}$/.test(syncId)) {
  throw new Error('请设置 TWITTER_SYNC_ID（复刻推特设置页显示的同步码）');
}
if (!secret) throw new Error('请设置 OBSIDIAN_SYNC_SECRET');

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sign(path: string, timestamp: string, nonce: string, body: string): Promise<string> {
  const key = await webcrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await webcrypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`POST\n${path}\n${timestamp}\n${nonce}\n${body}`),
  ));
}

async function getSnapshot(): Promise<{ data: Record<string, unknown> }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${sourceUrl}/api/sync?id=${encodeURIComponent(syncId)}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`读取复刻推特快照失败：HTTP ${response.status}`);
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      throw new Error('复刻推特返回了无效快照');
    }
    const data = (body as { data?: unknown }).data;
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new Error('同步码没有对应的云端数据');
    }
    return { data: data as Record<string, unknown> };
  } finally {
    clearTimeout(timeout);
  }
}

function splitEvents(events: IntegrationEvent[]): IntegrationEvent[][] {
  const batches: IntegrationEvent[][] = [];
  let current: IntegrationEvent[] = [];
  for (const event of events) {
    const candidate = [...current, event];
    const bytes = new TextEncoder().encode(JSON.stringify({
      source: 'twitter-pwa',
      syncId,
      snapshotUpdatedAt: 'size-check',
      events: candidate,
    })).byteLength;
    if (current.length > 0 && (candidate.length > MAX_EVENTS_PER_REQUEST || bytes > MAX_BODY_BYTES)) {
      batches.push(current);
      current = [event];
    } else {
      current = candidate;
    }
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

async function send(events: IntegrationEvent[], snapshotUpdatedAt: string): Promise<void> {
  const url = new URL(targetUrl);
  const envelope: IntegrationEnvelope = {
    source: 'twitter-pwa',
    syncId,
    snapshotUpdatedAt,
    events,
  };
  const body = JSON.stringify(envelope);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomUUID();
  const signature = await sign(url.pathname, timestamp, nonce, body);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-integration-timestamp': timestamp,
        'x-integration-nonce': nonce,
        'x-integration-signature': signature,
      },
      body,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`写入 Obsidian 失败：HTTP ${response.status}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function main(): Promise<void> {
  const { data } = await getSnapshot();
  const updatedAt = typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString();
  const events = await buildIntegrationEvents(null, data, updatedAt);
  const batches = splitEvents(events);
  for (let index = 0; index < batches.length; index += 1) {
    await send(batches[index], updatedAt);
    console.log(`历史同步 ${index + 1}/${batches.length}：${batches[index].length} 条`);
  }
  console.log(`历史同步完成：${events.length} 条文字事件，图片已忽略`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
