import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

/**
 * MikroORM entity for notifications suppressed by a non-instant digest cadence and awaiting their
 * batch. One row per suppressed notification. Mirrors the TypeORM `PendingDigestEntity`.
 *
 * Every column declares an explicit `type` instead of relying on `emitDecoratorMetadata` reflection,
 * so the entity discovers correctly even when the consuming app compiles with SWC/esbuild/Vite
 * (which don't emit decorator metadata).
 *
 * The `(cadence, tenantId, notifiableType, notifiableId, category)` index backs the collector's
 * grouped read. `length: 3` on the timestamp keeps millisecond precision so oldest-first ordering
 * inside a digest group is stable across SQLite/Postgres/MySQL.
 */
@Entity({ tableName: 'notification_pending_digests' })
@Index({ properties: ['cadence', 'tenantId', 'notifiableType', 'notifiableId', 'category'] })
export class PendingDigestEntity {
  @PrimaryKey({ type: 'string' })
  id!: string;

  // Indexed columns carry bounded lengths so the 5-column composite index stays under MySQL's
  // 3072-byte limit on utf8mb4 (unbounded varchars default to 255 → 5×255×4 bytes overflows).
  /** `'daily' | 'weekly'`. */
  @Property({ type: 'string', length: 16 })
  cadence!: string;

  @Property({ type: 'string', length: 150 })
  notifiableType!: string;

  @Property({ type: 'string', length: 150 })
  notifiableId!: string;

  @Property({ type: 'string', length: 150, nullable: true })
  tenantId?: string | null;

  @Property({ type: 'string', length: 150 })
  category!: string;

  /** The notification class name (rebuildable via the core NotificationSerializer). */
  @Property({ type: 'string' })
  notificationName!: string;

  /** The serialized notification payload. */
  @Property({ type: 'json' })
  notificationData!: Record<string, unknown>;

  // Explicit `datetime` type so the value round-trips as a Date on every driver. `length: 3` keeps
  // millisecond precision (MySQL DATETIME otherwise truncates to seconds), so oldest-first ordering
  // inside a digest group is stable across SQLite/Postgres/MySQL.
  @Property({ type: 'datetime', length: 3 })
  createdAt!: Date;
}

/**
 * Idempotency record for a flush window: one row per `(cadence, windowKey)` that has run, so a
 * re-run of the same window is a no-op. Inserted under a unique primary key — a duplicate insert
 * fails, which {@link MikroOrmPendingDigestStore.tryLockWindow} treats as "already run".
 */
@Entity({ tableName: 'notification_digest_windows' })
export class DigestWindowEntity {
  /** `${cadence}:${windowKey}`. */
  @PrimaryKey({ type: 'string' })
  id!: string;

  @Property({ type: 'datetime', length: 3 })
  ranAt!: Date;
}
