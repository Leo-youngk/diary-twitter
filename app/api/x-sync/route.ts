import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import {
  dismissXFailure,
  getXSyncStatus,
  retryXFailures,
  type BufferSyncEnv,
} from '@/lib/bufferIntegration';

const ID_PATTERN = /^[a-z0-9]{16,64}$/i;
const POST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function syncEnv(): Promise<BufferSyncEnv> {
  const { env } = await getCloudflareContext({ async: true });
  return env as CloudflareEnv & BufferSyncEnv;
}

// GET /api/x-sync?id=xxx — where each post sent to X currently stands
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id || !ID_PATTERN.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  return NextResponse.json(await getXSyncStatus(await syncEnv(), id));
}

// POST /api/x-sync — body: { id, action: 'retry' | 'dismiss', postId? }
export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body) || typeof body.id !== 'string' || !ID_PATTERN.test(body.id)) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const postId = typeof body.postId === 'string' ? body.postId : undefined;
  if (postId !== undefined && !POST_ID_PATTERN.test(postId)) {
    return NextResponse.json({ error: 'Invalid postId' }, { status: 400 });
  }

  const env = await syncEnv();
  if (body.action === 'retry') {
    await retryXFailures(env, body.id, postId);
  } else if (body.action === 'dismiss' && postId) {
    await dismissXFailure(env, body.id, postId);
  } else {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }
  return NextResponse.json(await getXSyncStatus(env, body.id));
}
