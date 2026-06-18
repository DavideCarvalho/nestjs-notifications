import { randomUUID } from 'node:crypto';
import type {
  NewStoredNotification,
  NotificationStore,
  PaginateForNotifiableOptions,
  PaginatedStoredNotifications,
  StoredNotification,
  UpsertStoredNotification,
} from '@dudousxd/nestjs-notifications-database';
import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { NotificationEntity } from './notification.entity';
import { ensureNotificationsTable } from './schema';

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

/** MikroORM-backed {@link NotificationStore}. */
@Injectable()
export class MikroOrmNotificationStore implements NotificationStore {
  // MikroOrmModule provides EntityManager globally; Nest resolves it by type.
  constructor(private readonly em: EntityManager) {}

  async save(notification: NewStoredNotification): Promise<StoredNotification> {
    const em = this.em.fork();
    const now = new Date();
    const entity = em.create(NotificationEntity, {
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
    await em.persist(entity).flush();
    return toStored(entity);
  }

  async markAsRead(id: string): Promise<void> {
    await this.em.nativeUpdate(NotificationEntity, { id }, { readAt: new Date() });
  }

  async markAllAsRead(
    notifiableType: string,
    notifiableId: string,
    tenantId?: string,
  ): Promise<void> {
    await this.em.nativeUpdate(
      NotificationEntity,
      {
        notifiableType,
        notifiableId,
        ...(tenantId !== undefined ? { tenantId } : {}),
        readAt: null,
      },
      { readAt: new Date() },
    );
  }

  async getForNotifiable(
    notifiableType: string,
    notifiableId: string,
    tenantId?: string,
  ): Promise<StoredNotification[]> {
    const rows = await this.em
      .fork()
      .find(
        NotificationEntity,
        { notifiableType, notifiableId, ...(tenantId !== undefined ? { tenantId } : {}) },
        { orderBy: { createdAt: 'DESC' } },
      );
    return rows.map(toStored);
  }

  async getUnread(
    notifiableType: string,
    notifiableId: string,
    tenantId?: string,
  ): Promise<StoredNotification[]> {
    const rows = await this.em.fork().find(
      NotificationEntity,
      {
        notifiableType,
        notifiableId,
        ...(tenantId !== undefined ? { tenantId } : {}),
        readAt: null,
      },
      { orderBy: { createdAt: 'DESC' } },
    );
    return rows.map(toStored);
  }

  async delete(id: string): Promise<void> {
    await this.em.nativeDelete(NotificationEntity, { id });
  }

  async paginateForNotifiable(
    notifiableType: string,
    notifiableId: string,
    options: PaginateForNotifiableOptions,
  ): Promise<PaginatedStoredNotifications> {
    const [rows, total] = await this.em.fork().findAndCount(
      NotificationEntity,
      {
        notifiableType,
        notifiableId,
        ...(options.tenantId !== undefined ? { tenantId: options.tenantId } : {}),
      },
      { orderBy: { createdAt: 'DESC' }, limit: options.limit, offset: options.offset },
    );
    return { items: rows.map(toStored), total };
  }

  async upsert(input: UpsertStoredNotification): Promise<StoredNotification> {
    const em = this.em.fork();
    const now = new Date();
    const existing = await em.findOne(NotificationEntity, { id: input.id });
    if (existing) {
      existing.type = input.type;
      existing.notifiableType = input.notifiableType;
      existing.notifiableId = input.notifiableId;
      existing.tenantId = input.tenantId ?? null;
      existing.causerType = input.causerType ?? null;
      existing.causerId = input.causerId ?? null;
      existing.traceId = input.traceId ?? null;
      existing.data = input.data;
      existing.readAt = null;
      existing.updatedAt = now;
      await em.persist(existing).flush();
      return toStored(existing);
    }
    const entity = em.create(NotificationEntity, {
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
      createdAt: now,
      updatedAt: now,
    });
    await em.persist(entity).flush();
    return toStored(entity);
  }

  async prune(options: { before: Date; onlyRead?: boolean }): Promise<number> {
    return this.em.nativeDelete(NotificationEntity, {
      createdAt: { $lte: options.before },
      ...(options.onlyRead ? { readAt: { $ne: null } } : {}),
    });
  }

  /** Create/patch the notifications table if needed (non-destructive). */
  async ensureSchema(): Promise<void> {
    await ensureNotificationsTable(this.em);
  }
}
