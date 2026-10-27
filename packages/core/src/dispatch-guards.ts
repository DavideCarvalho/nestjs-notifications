import type { Notifiable, Notification } from './interfaces';

/**
 * Pluggable store backing idempotency / dedup. Records that a given key has been seen and
 * reports whether it was already present (so the dispatch path can suppress a duplicate).
 *
 * The contract is "reserve, returning whether it was new": a single atomic-ish operation that
 * both records the key and tells the caller if this is the first time it has been seen within
 * the TTL window. Implementations are free to be approximate under races (an in-memory map is
 * exact; a Redis `SET key NX PX ttl` is exact cross-process).
 */
export interface IdempotencyStore {
  /**
   * Reserve `key` for `ttlMs`. Returns `true` when the key was NOT already present (i.e. this
   * send should proceed) and `false` when it was already reserved (duplicate → suppress).
   */
  reserve(key: string, ttlMs: number): boolean | Promise<boolean>;
}

/**
 * Pluggable counter store backing throttling / rate-limiting. Increments the counter for a key
 * within a fixed window and returns the post-increment count, so the dispatch path can compare
 * against the configured limit.
 */
export interface ThrottleStore {
  /**
   * Increment the counter for `key` within a `windowMs` window and return the new count. The
   * first increment in a fresh window starts (and pins) the window; the counter resets once the
   * window elapses.
   */
  increment(key: string, windowMs: number): number | Promise<number>;
}

/** Floor for the size at which an in-memory guard store sweeps every entry for expired ones. */
const MIN_SWEEP_SIZE = 1024;

/**
 * Expiry bookkeeping shared by the in-memory guard stores. Entries live in a `Map` in insertion
 * order, and a refreshed key is re-inserted at the back, so with a common TTL the front of the map
 * is always the next entry to expire: each write drops expired entries from the front in O(1)
 * amortized. Entries with differing TTLs can leave an expired entry behind a live one, so a full
 * sweep also runs whenever the map has doubled since the previous one.
 */
class ExpiringMap<V> {
  private readonly entries = new Map<string, V>();
  private sweepAt = MIN_SWEEP_SIZE;

  constructor(private readonly expiresAt: (value: V) => number) {}

  get(key: string): V | undefined {
    return this.entries.get(key);
  }

  get size(): number {
    return this.entries.size;
  }

  /** Insert `value` at the back (moving an existing key), then evict expired entries. */
  set(key: string, value: V, now: number): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    for (const [k, v] of this.entries) {
      if (this.expiresAt(v) > now) break;
      this.entries.delete(k);
    }
    if (this.entries.size >= this.sweepAt) {
      for (const [k, v] of this.entries) {
        if (this.expiresAt(v) <= now) this.entries.delete(k);
      }
      this.sweepAt = Math.max(MIN_SWEEP_SIZE, this.entries.size * 2);
    }
  }
}

/**
 * In-memory {@link IdempotencyStore}. Default when no store is bound. Single-process only —
 * for multi-instance dedup bind a Redis-backed store (documented as a follow-up). Expired
 * entries are evicted as new keys are reserved.
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly seen = new ExpiringMap<number>((expiresAt) => expiresAt);

  reserve(key: string, ttlMs: number): boolean {
    const now = Date.now();
    const expiresAt = this.seen.get(key);
    if (expiresAt !== undefined && expiresAt > now) {
      return false;
    }
    this.seen.set(key, now + ttlMs, now);
    return true;
  }
}

/**
 * In-memory {@link ThrottleStore} using a fixed-window counter. Default when no store is bound.
 * Single-process only — bind a Redis-backed store for cross-instance limits. Elapsed windows are
 * evicted as new windows open.
 */
export class InMemoryThrottleStore implements ThrottleStore {
  private readonly windows = new ExpiringMap<{ count: number; resetAt: number }>(
    (entry) => entry.resetAt,
  );

  increment(key: string, windowMs: number): number {
    const now = Date.now();
    const entry = this.windows.get(key);
    if (!entry || entry.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + windowMs }, now);
      return 1;
    }
    entry.count += 1;
    return entry.count;
  }
}

/** What happens to a delivery that exceeds its throttle limit. */
export type ThrottleOverflow = 'drop' | 'defer';

/**
 * Per-notification dedup configuration, read off the notification instance. Backwards
 * compatible: a notification that declares none of these is never deduplicated.
 */
export interface IdempotencyAware {
  /**
   * A stable key identifying this logical send. Two sends with the same key (per notifiable +
   * tenant, unless {@link idempotencyScope} says otherwise) within the window deliver once.
   * Return `undefined` to opt out for this instance.
   */
  idempotencyKey?(notifiable: Notifiable): string | undefined;
  /** Dedup window in milliseconds. Defaults to the module-level `idempotency.ttlMs`. */
  idempotencyTtlMs?: number;
  /**
   * Whether the key is scoped per-notifiable (default `'notifiable'`) or globally (`'global'`).
   * Per-notifiable means the same key still delivers to two different users.
   */
  idempotencyScope?: 'notifiable' | 'global';
}

/**
 * Per-notification throttle configuration, read off the notification instance. Backwards
 * compatible: a notification that declares no `throttle()` is never rate-limited.
 */
export interface ThrottleAware {
  /**
   * Rate-limit config for this notification, or `undefined` to skip throttling. `max` deliveries
   * per `windowMs` per notifiable (further keyed by `category` when set).
   */
  throttle?(notifiable: Notifiable): ThrottleConfig | undefined;
}

/** Resolved throttle config for one notification + notifiable. */
export interface ThrottleConfig {
  /** Max allowed within the window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Optional category so unrelated notification types share/segregate a bucket. */
  category?: string;
  /** What to do with the excess. Defaults to the module-level `throttle.overflow` (`'drop'`). */
  overflow?: ThrottleOverflow;
}

/** Module-level defaults for the dispatch guards. All optional; omitting all is a no-op. */
export interface DispatchGuardOptions {
  idempotency?: {
    /** Bind a custom store; defaults to an {@link InMemoryIdempotencyStore}. */
    store?: IdempotencyStore;
    /** Default dedup window when a notification doesn't specify one. Default `60000` (1 min). */
    ttlMs?: number;
  };
  throttle?: {
    /** Bind a custom store; defaults to an {@link InMemoryThrottleStore}. */
    store?: ThrottleStore;
    /** Default overflow behavior. Default `'drop'`. */
    overflow?: ThrottleOverflow;
  };
}

/** Build the idempotency key actually handed to the store, honoring scope + tenant. */
export function idempotencyStoreKey(
  rawKey: string,
  notifiable: Notifiable,
  tenant: string | undefined,
  scope: 'notifiable' | 'global',
): string {
  if (scope === 'global') return tenant ? `${tenant}:${rawKey}` : rawKey;
  const ref = notifiableKey(notifiable);
  return tenant ? `${tenant}:${ref}:${rawKey}` : `${ref}:${rawKey}`;
}

/** Build the throttle bucket key for a notifiable + category + tenant. */
export function throttleStoreKey(
  notifiable: Notifiable,
  category: string | undefined,
  tenant: string | undefined,
): string {
  const ref = notifiableKey(notifiable);
  const cat = category ?? '*';
  return tenant ? `${tenant}:${ref}:${cat}` : `${ref}:${cat}`;
}

/** Best-effort stable identifier for a notifiable, used to scope guard keys. */
function notifiableKey(notifiable: Notifiable): string {
  const ref =
    typeof notifiable.toNotifiableRef === 'function' ? notifiable.toNotifiableRef() : undefined;
  if (ref) return `${ref.type}#${ref.id}`;
  // Fall back to the constructor name; callers wanting cross-notifiable correctness should
  // implement toNotifiableRef (the same hook async dispatch already requires).
  return (notifiable as { constructor?: { name?: string } }).constructor?.name ?? 'anon';
}

/** Read the idempotency hooks off a notification instance (duck-typed, all optional). */
export function readIdempotency(notification: Notification): IdempotencyAware {
  return notification as IdempotencyAware;
}

/** Read the throttle hook off a notification instance. */
export function readThrottle(notification: Notification): ThrottleAware {
  return notification as ThrottleAware;
}
