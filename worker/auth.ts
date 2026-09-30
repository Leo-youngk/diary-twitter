import { SYNC_PROTOCOL } from '../src/lib/schema';

// Device tokens: `<deviceId>.<signature>`, where the signature is
// HMAC-SHA256(SESSION_SECRET, deviceId). A device gets one by typing the
// passphrase once and keeps it for good; nothing is stored on the server.

const encoder = new TextEncoder();

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return btoa(String.fromCharCode(...view)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(secret: string, deviceId: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(await crypto.subtle.sign('HMAC', key, encoder.encode(`device:${deviceId}`)));
}

/** Compares digests, so the time taken says nothing about where two texts differ. */
async function sameText(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([a, b].map(async (text) => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)))));
  let difference = 0;
  for (let i = 0; i < x.length; i++) difference |= x[i] ^ y[i];
  return difference === 0;
}

export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/;

export async function issueToken(secret: string): Promise<string> {
  const deviceId = base64url(crypto.getRandomValues(new Uint8Array(16)));
  return `${deviceId}.${await sign(secret, deviceId)}`;
}

/** The device id of a valid token, or null. */
export async function verifyToken(secret: string, token: string | null | undefined): Promise<string | null> {
  if (!token || !TOKEN_PATTERN.test(token)) return null;
  const [deviceId, signature] = token.split('.');
  return await sameText(signature, await sign(secret, deviceId)) ? deviceId : null;
}

export function passphraseMatches(expected: string, given: string): Promise<boolean> {
  return sameText(expected, given.trim());
}

export { SYNC_PROTOCOL };

/** Browsers cannot set headers on a WebSocket, so the token rides as a subprotocol. */
export function tokenFromProtocols(header: string | null): string | null {
  const offered = (header ?? '').split(',').map((item) => item.trim());
  if (!offered.includes(SYNC_PROTOCOL)) return null;
  return offered.find((item) => item !== SYNC_PROTOCOL) ?? null;
}

export function bearer(header: string | null | undefined): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return match ? match[1] : null;
}
