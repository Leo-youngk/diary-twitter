import { describe, it, expect } from 'vitest';
import { reconcile, type SyncPayload } from '../sync';

const payload = (updatedAt: string): SyncPayload => ({ posts: [], user: {}, updatedAt });

describe('reconcile', () => {
  it('pushes local when there is no remote copy', () => {
    expect(reconcile('2026-01-01T00:00:00Z', null)).toEqual({ action: 'push-local' });
  });

  it('pushes local when the remote timestamp is unparseable', () => {
    expect(reconcile('2026-01-01T00:00:00Z', payload('not-a-date'))).toEqual({ action: 'push-local' });
  });

  it('adopts remote on a device that has never written locally', () => {
    const remote = payload('2026-01-01T00:00:00Z');
    expect(reconcile(null, remote)).toEqual({ action: 'adopt-remote', payload: remote });
  });

  it('adopts remote when it is newer', () => {
    const remote = payload('2026-02-01T00:00:00Z');
    expect(reconcile('2026-01-01T00:00:00Z', remote)).toEqual({ action: 'adopt-remote', payload: remote });
  });

  it('keeps local when it is newer', () => {
    expect(reconcile('2026-03-01T00:00:00Z', payload('2026-02-01T00:00:00Z')))
      .toEqual({ action: 'push-local' });
  });

  it('does nothing when both sides are at the same revision', () => {
    expect(reconcile('2026-02-01T00:00:00Z', payload('2026-02-01T00:00:00Z')))
      .toEqual({ action: 'none' });
  });
});
