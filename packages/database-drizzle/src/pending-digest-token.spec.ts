import { PENDING_DIGEST_STORE } from '@dudousxd/nestjs-notifications-preferences';
import { describe, expect, it } from 'vitest';

// The digest store module inlines this token via Symbol.for instead of importing it, so requiring
// this adapter never requires the (optional-peer) preferences package at runtime. This pins the
// inlined key to the real export.
describe('PENDING_DIGEST_STORE inlined token', () => {
  it('matches the preferences export through the global Symbol registry', () => {
    expect(Symbol.for('nestjs-notifications:pending-digest-store')).toBe(PENDING_DIGEST_STORE);
  });
});
