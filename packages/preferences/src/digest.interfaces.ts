import type { NotifiableRef, SerializedNotification } from '@dudousxd/nestjs-notifications-core';

/** The two batching windows a digest can run on. Mirrors the non-instant {@link DigestFrequency}. */
export type DigestCadence = 'daily' | 'weekly';

/**
 * One suppressed notification awaiting its digest, as persisted by a {@link PendingDigestStore}.
 *
 * Everything here is JSON-safe by construction (the notification is stored in its serialized wire
 * form) so the same row survives any backing store — in-memory, SQL, etc. — and can be re-built
 * by the collector at flush time.
 *
 * The group key is `(tenantId, notifiable, category, cadence)`: all entries sharing it are
 * batched into a single {@link DigestNotification} for that recipient.
 */
export interface PendingDigestEntry {
  /** Store-assigned id (used to clear the entry after it is flushed). */
  id: string;
  /** WHO the digest is for. */
  notifiable: NotifiableRef;
  /** Tenant scope, or null in single-tenant apps. */
  tenantId: string | null;
  /** The category that batched this notification (the row of the preference matrix). */
  category: string;
  /** Which window this entry belongs to. */
  cadence: DigestCadence;
  /** The serialized notification, rebuildable via the core NotificationSerializer at flush time. */
  notification: SerializedNotification;
  /** When the original (suppressed) send happened. Used for ordering inside the digest. */
  createdAt: Date;
}

/** Data needed to enqueue a {@link PendingDigestEntry} (id + createdAt assigned by the store). */
export interface NewPendingDigestEntry {
  notifiable: NotifiableRef;
  tenantId?: string | null;
  category: string;
  cadence: DigestCadence;
  notification: SerializedNotification;
}

/**
 * A batch of pending entries that share a group key `(tenant, notifiable, category, cadence)`,
 * returned by {@link PendingDigestStore.listGroups}. The collector turns each group into one
 * {@link DigestNotification}.
 */
export interface PendingDigestGroup {
  notifiable: NotifiableRef;
  tenantId: string | null;
  category: string;
  cadence: DigestCadence;
  entries: PendingDigestEntry[];
}

/**
 * Persistence for notifications suppressed by a non-instant digest cadence. The preference gate
 * (via the core {@link DigestSink}) enqueues into it; the {@link DigestCollector} reads grouped
 * entries per cadence window, dispatches the batch, then clears the flushed entries.
 *
 * Follows the ecosystem persistence convention: a POJO store with an in-memory default and
 * non-destructive schema ensure for the persistent adapters. Implement against your datastore,
 * or use the bundled {@link InMemoryPendingDigestStore}.
 */
export interface PendingDigestStore {
  /** Append one suppressed notification to the pending set. */
  enqueue(entry: NewPendingDigestEntry): Promise<void>;
  /**
   * Return the pending entries for `cadence`, grouped by `(tenant, notifiable, category)`. Each
   * group becomes one digest. Ordered oldest-first within a group.
   */
  listGroups(cadence: DigestCadence): Promise<PendingDigestGroup[]>;
  /** Delete the given entries (by id) after they have been flushed into a digest. */
  clear(ids: string[]): Promise<void>;
  /**
   * Idempotency lock for a flush window. Returns `true` exactly once per `(cadence, windowKey)`;
   * subsequent calls for the same window return `false`, so re-running a flush for an already-run
   * window is a no-op (no double-send). Stores that don't implement it make every flush eligible
   * (the collector still de-dupes by clearing flushed entries, but a concurrent re-run could
   * double-send — implement this for at-most-once-per-window semantics).
   */
  tryLockWindow?(cadence: DigestCadence, windowKey: string): Promise<boolean>;
  /**
   * Optionally create the backing schema if missing — non-destructively (never drops). Called on
   * bootstrap when enabled. In-memory and schema-first stores may omit it.
   */
  ensureSchema?(): Promise<void>;
}
