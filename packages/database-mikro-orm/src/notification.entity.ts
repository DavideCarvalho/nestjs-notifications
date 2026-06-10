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

  // Explicit `datetime` type so the value round-trips as a Date on every driver
  // (SQLite otherwise hydrates it as a raw timestamp string/number).
  @Property({ type: 'datetime', nullable: true })
  readAt?: Date | null;

  @Property({ type: 'datetime' })
  createdAt!: Date;

  @Property({ type: 'datetime', onUpdate: () => new Date() })
  updatedAt!: Date;
}
