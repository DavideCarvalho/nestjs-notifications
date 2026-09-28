import { randomUUID } from 'node:crypto';
import type {
  NewStoredNotification,
  NotificationOwnerRef,
  NotificationStore,
  PaginateForNotifiableOptions,
  PaginatedStoredNotifications,
  StoredNotification,
  UpsertStoredNotification,
} from '@dudousxd/nestjs-notifications-database';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { type SQL, and, count, desc, eq, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { type NotificationTables, notificationTables, notificationsSchemaDdl } from './schema';
import {
  DRIZZLE_NOTIFICATIONS_DB,
  DRIZZLE_NOTIFICATION_TABLES,
  type DrizzlePgDatabase,
} from './tokens';

type Row = NotificationTables['notifications']['$inferSelect'];

/** Maps a row to the channel-agnostic {@link StoredNotification}. */
function toStored(row: Row): StoredNotification {
  return {
    id: row.id,
    type: row.type,
    notifiableType: row.notifiableType,
    notifiableId: row.notifiableId,
    tenantId: row.tenantId ?? null,
    causerType: row.causerType ?? null,
    causerId: row.causerId ?? null,
    traceId: row.traceId ?? null,
    data: row.data,
    readAt: row.readAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Drizzle-backed (Postgres) {@link NotificationStore}. Implements the full SPI, including the
 * optional ownership-checked mutations, pushed-down pagination, `prune` and an atomic
 * `INSERT ... ON CONFLICT` `upsert`.
 *
 * Usable as a POJO (`new DrizzleNotificationStore(db)`) or through
 * {@link DrizzleNotificationStoreModule}. Pass a transaction as `db` to join the caller's unit
 * of work.
 */
@Injectable()
export class DrizzleNotificationStore implements NotificationStore {
  private readonly table: NotificationTables['notifications'];

  constructor(
    @Inject(DRIZZLE_NOTIFICATIONS_DB) private readonly db: DrizzlePgDatabase,
    @Optional() @Inject(DRIZZLE_NOTIFICATION_TABLES) tables?: Pick<
      NotificationTables,
      'notifications'
    >,
  ) {
    this.table = (tables ?? notificationTables).notifications;
  }

  /** Notifiable (+ optional tenant, + optional type list) predicate shared by the reads. */
  private scope(
    notifiableType: string,
    notifiableId: string,
    tenantId?: string,
    types?: string[],
  ): SQL {
    const t = this.table;
    return and(
      eq(t.notifiableType, notifiableType),
      eq(t.notifiableId, notifiableId),
      tenantId !== undefined ? eq(t.tenantId, tenantId) : undefined,
      types !== undefined && types.length > 0 ? inArray(t.type, types) : undefined,
    ) as SQL;
  }

  /** Ownership predicate for the scoped mutations; an absent `tenantId` matches any tenant. */
  private owned(id: string, owner: NotificationOwnerRef): SQL {
    return and(
      eq(this.table.id, id),
      this.scope(owner.notifiableType, owner.notifiableId, owner.tenantId),
    ) as SQL;
  }

  async save(notification: NewStoredNotification): Promise<StoredNotification> {
    const now = new Date();
    const [row] = await this.db
      .insert(this.table)
      .values({
        id: randomUUID(),
        type: notification.type,
        notifiableType: notification.notifiableType,
        notifiableId: notification.notifiableId,
        tenantId: notification.tenantId ?? null,
        causerType: notification.causerType ?? null,
        causerId: notification.causerId ?? null,
        traceId: notification.traceId ?? null,
        data: notification.data,
        readAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return toStored(row as Row);
  }

  async markAsRead(id: string): Promise<void> {
    const now = new Date();
    await this.db
      .update(this.table)
      .set({ readAt: now, updatedAt: now })
      .where(eq(this.table.id, id));
  }

  async markAllAsRead(
    notifiableType: string,
    notifiableId: string,
    tenantId?: string,
  ): Promise<void> {
    const now = new Date();
    await this.db
      .update(this.table)
      .set({ readAt: now, updatedAt: now })
      .where(and(this.scope(notifiableType, notifiableId, tenantId), isNull(this.table.readAt)));
  }

  async getForNotifiable(
    notifiableType: string,
    notifiableId: string,
    tenantId?: string,
    types?: string[],
  ): Promise<StoredNotification[]> {
    const rows = await this.db
      .select()
      .from(this.table)
      .where(this.scope(notifiableType, notifiableId, tenantId, types))
      .orderBy(desc(this.table.createdAt));
    return rows.map(toStored);
  }

  async getUnread(
    notifiableType: string,
    notifiableId: string,
    tenantId?: string,
    types?: string[],
  ): Promise<StoredNotification[]> {
    const rows = await this.db
      .select()
      .from(this.table)
      .where(
        and(this.scope(notifiableType, notifiableId, tenantId, types), isNull(this.table.readAt)),
      )
      .orderBy(desc(this.table.createdAt));
    return rows.map(toStored);
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(this.table).where(eq(this.table.id, id));
  }

  async deleteOwned(id: string, owner: NotificationOwnerRef): Promise<boolean> {
    const rows = await this.db
      .delete(this.table)
      .where(this.owned(id, owner))
      .returning({ id: this.table.id });
    return rows.length > 0;
  }

  async markAsReadOwned(id: string, owner: NotificationOwnerRef): Promise<boolean> {
    // Match on ownership alone, not on read_at — an already-read row still belongs to the owner,
    // so re-reading it is a success, matching markAsRead's idempotence.
    const now = new Date();
    const rows = await this.db
      .update(this.table)
      .set({ readAt: now, updatedAt: now })
      .where(this.owned(id, owner))
      .returning({ id: this.table.id });
    return rows.length > 0;
  }

  async findById(id: string): Promise<StoredNotification | null> {
    const [row] = await this.db.select().from(this.table).where(eq(this.table.id, id)).limit(1);
    return row ? toStored(row) : null;
  }

  async paginateForNotifiable(
    notifiableType: string,
    notifiableId: string,
    options: PaginateForNotifiableOptions,
  ): Promise<PaginatedStoredNotifications> {
    const where = this.scope(notifiableType, notifiableId, options.tenantId, options.types);
    const [rows, [totals]] = await Promise.all([
      this.db
        .select()
        .from(this.table)
        .where(where)
        .orderBy(desc(this.table.createdAt))
        .limit(options.limit)
        .offset(options.offset),
      this.db.select({ total: count() }).from(this.table).where(where),
    ]);
    return { items: rows.map(toStored), total: Number(totals?.total ?? 0) };
  }

  /**
   * Atomic insert-or-update by the caller-controlled id (`INSERT ... ON CONFLICT (id) DO UPDATE`):
   * an existing row gets the new type/data/notifiable/tenant/causer, `updated_at = now` and
   * `read_at` reset to null (an update is a fresh, unread event); `created_at` is preserved.
   */
  async upsert(input: UpsertStoredNotification): Promise<StoredNotification> {
    const now = new Date();
    const values = {
      type: input.type,
      notifiableType: input.notifiableType,
      notifiableId: input.notifiableId,
      tenantId: input.tenantId ?? null,
      causerType: input.causerType ?? null,
      causerId: input.causerId ?? null,
      traceId: input.traceId ?? null,
      data: input.data,
      readAt: null,
      updatedAt: now,
    };
    const [row] = await this.db
      .insert(this.table)
      .values({ id: input.id, ...values, createdAt: now })
      .onConflictDoUpdate({ target: this.table.id, set: values })
      .returning();
    return toStored(row as Row);
  }

  async prune(options: { before: Date; onlyRead?: boolean | undefined }): Promise<number> {
    const rows = await this.db
      .delete(this.table)
      .where(
        and(
          lte(this.table.createdAt, options.before),
          options.onlyRead ? isNotNull(this.table.readAt) : undefined,
        ),
      )
      .returning({ id: this.table.id });
    return rows.length;
  }

  /** Create the notifications table if missing (`CREATE ... IF NOT EXISTS`, non-destructive). */
  async ensureSchema(): Promise<void> {
    for (const statement of notificationsSchemaDdl({ notifications: this.table })) {
      await this.db.execute(sql.raw(statement));
    }
  }
}
