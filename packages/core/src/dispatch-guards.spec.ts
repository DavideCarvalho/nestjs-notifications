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

  it('keeps dedup exact when keys carry different TTLs', () => {
    const store = new InMemoryIdempotencyStore();
    expect(store.reserve('long', 10_000)).toBe(true);
    for (let i = 0; i < 3000; i++) store.reserve(`short-${i}`, 100);
    vi.advanceTimersByTime(101);
    expect(store.reserve('short-0', 100)).toBe(true);
    expect(store.reserve('long', 10_000)).toBe(false);
    for (let i = 0; i < 3000; i++) store.reserve(`next-${i}`, 100);
    // The expired short keys behind `long` are swept, not retained forever.
    expect(sizeOf(store, 'seen')).toBeLessThan(3000 + 1000);
  });

  it('reserves many distinct keys in linear time', () => {
    vi.useRealTimers();
    const store = new InMemoryIdempotencyStore();
    const startedAt = performance.now();
    for (let i = 0; i < 40_000; i++) store.reserve(`User#${i}:invoice`, 60_000);
    // A full-map walk per insert takes several seconds here; eviction from the front takes ms.
    expect(performance.now() - startedAt).toBeLessThan(1000);
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

  it('evicts elapsed windows instead of retaining every key forever', () => {
    const store = new InMemoryThrottleStore();
    for (let i = 0; i < 5000; i++) store.increment(`k-${i}`, 1000);
    vi.advanceTimersByTime(1001);
    expect(store.increment('fresh', 1000)).toBe(1);
    expect(sizeOf(store, 'windows')).toBe(1);
  });
});

/** Number of keys an in-memory store currently retains. */
function sizeOf(store: object, field: string): number {
  return (store as unknown as Record<string, { size: number }>)[field]?.size ?? Number.NaN;
}

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
