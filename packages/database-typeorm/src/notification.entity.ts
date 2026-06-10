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

  @Column({ type: 'simple-json' })
  data!: Record<string, unknown>;

  @Column({ type: Date, nullable: true })
  readAt!: Date | null;

  @Column({ type: Date })
  createdAt!: Date;

  @Column({ type: Date })
  updatedAt!: Date;
}
