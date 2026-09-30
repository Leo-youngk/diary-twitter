import { describe, expect, it } from 'vitest';
import { bearer, issueToken, passphraseMatches, SYNC_PROTOCOL, tokenFromProtocols, verifyToken } from './auth';

describe('device tokens', () => {
  it('verifies a token it issued and returns its device id', async () => {
    const token = await issueToken('secret-a');
    expect(await verifyToken('secret-a', token)).toBe(token.split('.')[0]);
  });

  it('rejects a token signed with another secret, a changed device id, or garbage', async () => {
    const token = await issueToken('secret-a');
    expect(await verifyToken('secret-b', token)).toBeNull();
    const [, signature] = token.split('.');
    expect(await verifyToken('secret-a', `AAAAAAAAAAAAAAAAAAAAAA.${signature}`)).toBeNull();
    expect(await verifyToken('secret-a', 'not-a-token')).toBeNull();
    expect(await verifyToken('secret-a', null)).toBeNull();
  });

  it('matches the passphrase exactly, ignoring surrounding spaces', async () => {
    expect(await passphraseMatches('k7m2-p9qx', ' k7m2-p9qx ')).toBe(true);
    expect(await passphraseMatches('k7m2-p9qx', 'k7m2-p9qy')).toBe(false);
  });

  it('reads the token from the WebSocket subprotocols and from a bearer header', () => {
    expect(tokenFromProtocols(`${SYNC_PROTOCOL}, abc.def`)).toBe('abc.def');
    expect(tokenFromProtocols('abc.def')).toBeNull();
    expect(tokenFromProtocols(null)).toBeNull();
    expect(bearer('Bearer abc.def')).toBe('abc.def');
    expect(bearer(undefined)).toBeNull();
  });
});
