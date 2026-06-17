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

  @Column({ type: Date, nullable: true })
  readAt!: Date | null;

  @Column({ type: Date })
  createdAt!: Date;

  @Column({ type: Date })
  updatedAt!: Date;
}
