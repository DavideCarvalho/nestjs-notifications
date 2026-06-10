import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

/** MikroORM entity mirroring Laravel's `notifications` table. */
@Entity({ tableName: 'notifications' })
export class NotificationEntity {
  @PrimaryKey()
  id!: string;

  @Property()
  type!: string;

  @Property()
  notifiableType!: string;

  @Property()
  notifiableId!: string;

  @Property({ type: 'json' })
  data!: Record<string, unknown>;

  @Property({ nullable: true })
  readAt?: Date | null;

  @Property()
  createdAt!: Date;

  @Property({ onUpdate: () => new Date() })
  updatedAt!: Date;
}
