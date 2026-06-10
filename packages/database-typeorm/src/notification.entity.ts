import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** TypeORM entity mirroring Laravel's `notifications` table. */
@Entity('notifications')
export class NotificationEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  type!: string;

  @Column({ type: 'varchar' })
  notifiableType!: string;

  @Column({ type: 'varchar' })
  notifiableId!: string;

  @Column({ type: 'json' })
  data!: Record<string, unknown>;

  @Column({ type: 'timestamp', nullable: true })
  readAt!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
