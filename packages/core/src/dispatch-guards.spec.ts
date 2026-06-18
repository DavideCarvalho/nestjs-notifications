import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InMemoryIdempotencyStore,
  InMemoryThrottleStore,
  idempotencyStoreKey,
  throttleStoreKey,
} from './dispatch-guards';
import type { Notifiable } from './interfaces';

const user = (id: number): Notifiable => ({ toNotifiableRef: () => ({ type: 'User', id }) });

describe('InMemoryIdempotencyStore', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reserves a fresh key (returns true) and suppresses a duplicate within the window', () => {
    const store = new InMemoryIdempotencyStore();
    expect(store.reserve('k', 1000)).toBe(true);
    expect(store.reserve('k', 1000)).toBe(false);
  });

  it('treats different keys independently', () => {
    const store = new InMemoryIdempotencyStore();
    expect(store.reserve('a', 1000)).toBe(true);
    expect(store.reserve('b', 1000)).toBe(true);
  });

  it('allows the key again after the window expires', () => {
    const store = new InMemoryIdempotencyStore();
    expect(store.reserve('k', 1000)).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(store.reserve('k', 1000)).toBe(true);
  });
});

describe('InMemoryThrottleStore', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('counts increments within a window', () => {
    const store = new InMemoryThrottleStore();
    expect(store.increment('k', 1000)).toBe(1);
    expect(store.increment('k', 1000)).toBe(2);
    expect(store.increment('k', 1000)).toBe(3);
  });

  it('resets the counter once the window elapses', () => {
    const store = new InMemoryThrottleStore();
    expect(store.increment('k', 1000)).toBe(1);
    expect(store.increment('k', 1000)).toBe(2);
    vi.advanceTimersByTime(1001);
    expect(store.increment('k', 1000)).toBe(1);
  });

  it('keys are independent', () => {
    const store = new InMemoryThrottleStore();
    expect(store.increment('a', 1000)).toBe(1);
    expect(store.increment('b', 1000)).toBe(1);
  });
});

describe('key builders', () => {
  it('scopes idempotency keys per notifiable by default', () => {
    expect(idempotencyStoreKey('k', user(1), undefined, 'notifiable')).toBe('User#1:k');
    expect(idempotencyStoreKey('k', user(2), undefined, 'notifiable')).toBe('User#2:k');
  });

  it('global scope ignores the notifiable but honors tenant', () => {
    expect(idempotencyStoreKey('k', user(1), undefined, 'global')).toBe('k');
    expect(idempotencyStoreKey('k', user(1), 'acme', 'global')).toBe('acme:k');
  });

  it('throttle key combines notifiable, category and tenant', () => {
    expect(throttleStoreKey(user(1), 'marketing', undefined)).toBe('User#1:marketing');
    expect(throttleStoreKey(user(1), undefined, 'acme')).toBe('acme:User#1:*');
  });
});
