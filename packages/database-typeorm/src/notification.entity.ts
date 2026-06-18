import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * TypeORM entity mirroring Laravel's `notifications` table. Column types are chosen to be
 * portable across SQLite, MySQL and Postgres: `Date` lets TypeORM pick the driver's
 * datetime/timestamp type, and `simple-json` stores the payload as text everywhere.
 */
@Entity('notifications')
export class NotificationEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @Column({ type: 'varchar' })
  type!: string;

  @Column({ type: 'varchar' })
  notifiableType!: string;

  @Column({ type: 'varchar' })
  notifiableId!: string;

  @Column({ type: 'varchar', nullable: true })
  tenantId!: string | null;

  // WHO triggered the notification + the correlation trace, captured from
  // `@dudousxd/nestjs-context` at send() time. NULLABLE and added after v1 — they self-heal
  // on existing tables via `ensureNotificationsTable`'s non-destructive column-add. Old rows
  // (and any send without a context accessor) keep these null.
  @Column({ type: 'varchar', nullable: true })
  causerType!: string | null;

  @Column({ type: 'varchar', nullable: true })
  causerId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  traceId!: string | null;

  @Column({ type: 'simple-json' })
  data!: Record<string, unknown>;

  // `precision: 3` keeps millisecond precision on the datetime columns. MySQL's DATETIME defaults
  // to 0 fractional-second digits (it silently truncates ms), which collapses the JS-set timestamps
  // and breaks newest-first ordering / upsert createdAt-preservation / prune cutoffs. Postgres
  // (microsecond default) and SQLite (text) are unaffected; `(3)` is honored on MySQL and harmless
  // elsewhere — so the timestamps round-trip at ms precision identically across all three engines.
  @Column({ type: Date, nullable: true, precision: 3 })
  readAt!: Date | null;

  @Column({ type: Date, precision: 3 })
  createdAt!: Date;

  @Column({ type: Date, precision: 3 })
  updatedAt!: Date;
}
