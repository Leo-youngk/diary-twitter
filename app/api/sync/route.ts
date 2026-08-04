import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB
const ID_PATTERN = /^[a-z0-9]{16,64}$/i;

// GET /api/sync?id=xxx — fetch this device's synced data
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !ID_PATTERN.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const { env } = await getCloudflareContext({ async: true });
  const value = await env.DIARY_KV.get(`diary:${id}`);
  if (!value) return NextResponse.json({ data: null });

  return new NextResponse(value, { headers: { 'Content-Type': 'application/json' } });
}

// POST /api/sync — body: { id, data }
export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  let body: { id?: string; data?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { id, data } = body;
  if (!id || !ID_PATTERN.test(id) || data === undefined) {
    return NextResponse.json({ error: 'Invalid id or data' }, { status: 400 });
  }

  const { env } = await getCloudflareContext({ async: true });
  await env.DIARY_KV.put(`diary:${id}`, JSON.stringify(data));

  return NextResponse.json({ ok: true });
}
