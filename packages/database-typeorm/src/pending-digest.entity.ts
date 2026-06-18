import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * TypeORM entity for notifications suppressed by a non-instant digest cadence and awaiting their
 * batch. One row per suppressed notification. Column types are portable across SQLite, MySQL and
 * Postgres (`Date` lets TypeORM pick the driver datetime, `simple-json` stores the payload as text
 * everywhere). The `(cadence, tenantId, notifiableType, notifiableId, category)` index backs the
 * collector's grouped read.
 *
 * The five indexed columns carry explicit, bounded `length`s. TypeORM defaults `varchar` to 255,
 * and on MySQL's utf8mb4 (4 bytes/char) a composite index over five 255-char columns is
 * 5 × 255 × 4 = 5100 bytes — past MySQL's 3072-byte index limit, so `ensureSchema()`/`CREATE INDEX`
 * fails with "Specified key was too long". The bounded lengths below sum to well under the limit
 * (and SQLite/Postgres are unaffected), so the index is created identically on every engine.
 */
@Entity('notification_pending_digests')
@Index(['cadence', 'tenantId', 'notifiableType', 'notifiableId', 'category'])
export class PendingDigestEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  /** `'daily' | 'weekly'`. */
  @Column({ type: 'varchar', length: 16 })
  cadence!: string;

  @Column({ type: 'varchar', length: 150 })
  notifiableType!: string;

  @Column({ type: 'varchar', length: 150 })
  notifiableId!: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  tenantId!: string | null;

  @Column({ type: 'varchar', length: 150 })
  category!: string;

  /** The notification class name (rebuildable via the core NotificationSerializer). */
  @Column({ type: 'varchar' })
  notificationName!: string;

  /** The serialized notification payload. */
  @Column({ type: 'simple-json' })
  notificationData!: Record<string, unknown>;

  // `precision: 3` preserves millisecond precision (MySQL DATETIME otherwise truncates to seconds),
  // so oldest-first ordering inside a digest group is stable across SQLite/Postgres/MySQL.
  @Column({ type: Date, precision: 3 })
  createdAt!: Date;
}

/**
 * Idempotency record for a flush window: one row per `(cadence, windowKey)` that has run, so a
 * re-run of the same window is a no-op. Inserted under a unique primary key — a duplicate insert
 * fails, which {@link TypeOrmPendingDigestStore.tryLockWindow} treats as "already run".
 */
@Entity('notification_digest_windows')
export class DigestWindowEntity {
  /** `${cadence}:${windowKey}`. */
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ type: Date, precision: 3 })
  ranAt!: Date;
}
