import { Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

/**
 * MikroORM entity mirroring Laravel's `notifications` table.
 *
 * Every column declares an explicit `type` instead of relying on
 * `emitDecoratorMetadata` reflection, so the entity discovers correctly even
 * when the consuming app compiles with SWC/esbuild/Vite (which don't emit
 * decorator metadata).
 */
@Entity({ tableName: 'notifications' })
export class NotificationEntity {
  @PrimaryKey({ type: 'string' })
  id!: string;

  @Property({ type: 'string' })
  type!: string;

  @Property({ type: 'string' })
  notifiableType!: string;

  @Property({ type: 'string' })
  notifiableId!: string;

  @Property({ type: 'string', nullable: true })
  tenantId?: string | null;

  // WHO triggered the notification + the correlation trace, captured from
  // `@dudousxd/nestjs-context` at send() time. NULLABLE — they self-heal on existing tables
  // via the schema updater's safe (non-destructive) update. Old rows / no-context sends = null.
  @Property({ type: 'string', nullable: true })
  causerType?: string | null;

  @Property({ type: 'string', nullable: true })
  causerId?: string | null;

  @Property({ type: 'string', nullable: true })
  traceId?: string | null;

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
