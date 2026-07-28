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
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type FindOperator, In, IsNull, LessThanOrEqual, Not, type Repository } from 'typeorm';
import { NotificationEntity } from './notification.entity';
import { ensureNotificationsTable } from './schema';

/** `types` absent or empty applies no filter; otherwise an IN clause on `type`. */
function typeFilter(types?: string[]): { type?: FindOperator<string> } {
  return types !== undefined && types.length > 0 ? { type: In(types) } : {};
}

/** Ownership predicate for the scoped mutations; an absent `tenantId` matches any tenant. */
function ownerFilter(owner: NotificationOwnerRef): {
  notifiableType: string;
  notifiableId: string;
  tenantId?: string;
} {
  return {
    notifiableType: owner.notifiableType,
    notifiableId: owner.notifiableId,
    ...(owner.tenantId !== undefined ? { tenantId: owner.tenantId } : {}),
  };
}

/** Maps a {@link NotificationEntity} row to the channel-agnostic {@link StoredNotification}. */
function toStored(row: NotificationEntity): StoredNotification {
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

/** TypeORM-backed {@link NotificationStore}. */
@Injectable()
export class TypeOrmNotificationStore implements NotificationStore {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly repo: Repository<NotificationEntity>,
  ) {}

  async save(notification: NewStoredNotification): Promise<StoredNotification> {
    // Timestamps are set in code (millisecond precision) for stable ordering and parity
    // with the other stores — SQLite's datetime is only second-precise.
    const now = new Date();
    const entity = this.repo.create({
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
    });
    const saved = await this.repo.save(entity);
    return toStored(saved);
  }

  async markAsRead(id: string): Promise<void> {
    await this.repo.update(id, { readAt: new Date(), updatedAt: new Date() });
  }

  async markAllAsRead(
    notifiableType: string,
    notifiableId: string,
    tenantId?: string,
  ): Promise<void> {
    await this.repo.update(
      {
        notifiableType,
        notifiableId,
        ...(tenantId !== undefined ? { tenantId } : {}),
        readAt: IsNull(),
      },
      { readAt: new Date(), updatedAt: new Date() },
    );
  }

  async getForNotifiable(
    notifiableType: string,
    notifiableId: string,
    tenantId?: string,
    types?: string[],
  ): Promise<StoredNotification[]> {
    const rows = await this.repo.find({
      where: {
        notifiableType,
        notifiableId,
        ...(tenantId !== undefined ? { tenantId } : {}),
        ...typeFilter(types),
      },
      order: { createdAt: 'DESC' },
    });
    return rows.map(toStored);
  }

  async getUnread(
    notifiableType: string,
    notifiableId: string,
    tenantId?: string,
    types?: string[],
  ): Promise<StoredNotification[]> {
    const rows = await this.repo.find({
      where: {
        notifiableType,
        notifiableId,
        ...(tenantId !== undefined ? { tenantId } : {}),
        ...typeFilter(types),
        readAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });
    return rows.map(toStored);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }

  async deleteOwned(id: string, owner: NotificationOwnerRef): Promise<boolean> {
    const result = await this.repo.delete({ id, ...ownerFilter(owner) });
    return (result.affected ?? 0) > 0;
  }

  async markAsReadOwned(id: string, owner: NotificationOwnerRef): Promise<boolean> {
    // Match on ownership alone, not on readAt — an already-read row still belongs to the owner,
    // so re-reading it is a success, matching markAsRead's idempotence.
    const result = await this.repo.update(
      { id, ...ownerFilter(owner) },
      { readAt: new Date(), updatedAt: new Date() },
    );
    return (result.affected ?? 0) > 0;
  }

  async findById(id: string): Promise<StoredNotification | null> {
    const row = await this.repo.findOne({ where: { id } });
    return row ? toStored(row) : null;
  }

  async paginateForNotifiable(
    notifiableType: string,
    notifiableId: string,
    options: PaginateForNotifiableOptions,
  ): Promise<PaginatedStoredNotifications> {
    const [rows, total] = await this.repo.findAndCount({
      where: {
        notifiableType,
        notifiableId,
        ...(options.tenantId !== undefined ? { tenantId: options.tenantId } : {}),
        ...typeFilter(options.types),
      },
      order: { createdAt: 'DESC' },
      skip: options.offset,
      take: options.limit,
    });
    return { items: rows.map(toStored), total };
  }

  async upsert(input: UpsertStoredNotification): Promise<StoredNotification> {
    const now = new Date();
    const existing = await this.repo.findOne({ where: { id: input.id } });
    // save() upserts by primary key — updates when the row exists, inserts otherwise.
    const saved = await this.repo.save(
      this.repo.create({
        id: input.id,
        type: input.type,
        notifiableType: input.notifiableType,
        notifiableId: input.notifiableId,
        tenantId: input.tenantId ?? null,
        causerType: input.causerType ?? null,
        causerId: input.causerId ?? null,
        traceId: input.traceId ?? null,
        data: input.data,
        readAt: null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }),
    );
    return toStored(saved);
  }

  async prune(options: { before: Date; onlyRead?: boolean }): Promise<number> {
    const result = await this.repo.delete({
      createdAt: LessThanOrEqual(options.before),
      ...(options.onlyRead ? { readAt: Not(IsNull()) } : {}),
    });
    return result.affected ?? 0;
  }

  /** Create the notifications table if missing (non-destructive). */
  async ensureSchema(): Promise<void> {
    await ensureNotificationsTable(this.repo.manager.connection);
  }
}
