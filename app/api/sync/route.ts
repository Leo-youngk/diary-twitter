import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

const MAX_BODY_BYTES = 20 * 1024 * 1024; // 20 MB — KV value limit is 25 MB
const ID_PATTERN = /^[a-z0-9]{16,64}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getUpdatedAt(value: unknown): string | null {
  if (!isRecord(value) || typeof value.updatedAt !== 'string') return null;
  return Number.isFinite(Date.parse(value.updatedAt)) ? value.updatedAt : null;
}

function isSyncData(value: unknown): value is Record<string, unknown> {
  return isRecord(value)
    && Array.isArray(value.posts)
    && isRecord(value.user)
    && (value.ledger === undefined || Array.isArray(value.ledger))
    && getUpdatedAt(value) !== null;
}

// GET /api/sync?id=xxx — fetch this device's synced data
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !ID_PATTERN.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const value = await env.DIARY_KV.get(`diary:${id}`);
  if (!value) return NextResponse.json({ data: null });

  try {
    const data: unknown = JSON.parse(value);
    if (!isSyncData(data)) {
      return NextResponse.json({ error: 'Stored sync data is invalid' }, { status: 500 });
    }
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: 'Stored sync data is invalid' }, { status: 500 });
  }
}

// POST /api/sync — body: { id, data }
export async function POST(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!isRecord(parsedBody)) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const id = typeof parsedBody.id === 'string' ? parsedBody.id : undefined;
  const data = parsedBody.data;
  if (!id || !ID_PATTERN.test(id) || data === undefined) {
    return NextResponse.json({ error: 'Invalid id or data' }, { status: 400 });
  }

  if (!isSyncData(data)) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
  }
  const incomingUpdatedAt = data.updatedAt as string;

  const { env } = await getCloudflareContext({ async: true });
  const existingRaw = await env.DIARY_KV.get(`diary:${id}`);
  if (existingRaw) {
    try {
      const existing: unknown = JSON.parse(existingRaw);
      const existingUpdatedAt = getUpdatedAt(existing);
      if (existingUpdatedAt && Date.parse(existingUpdatedAt) > Date.parse(incomingUpdatedAt)) {
        return NextResponse.json({ data: existing }, { status: 409 });
      }
    } catch {
      // An invalid old value is replaced by the validated incoming payload.
    }
  }
  await env.DIARY_KV.put(`diary:${id}`, JSON.stringify(data));

  return NextResponse.json({ ok: true });
}
