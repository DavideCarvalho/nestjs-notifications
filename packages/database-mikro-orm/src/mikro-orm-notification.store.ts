import { randomUUID } from 'node:crypto';
import type {
  NewStoredNotification,
  NotificationStore,
  StoredNotification,
} from '@dudousxd/nestjs-notifications-database';
import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { NotificationEntity } from './notification.entity';

/** Maps a {@link NotificationEntity} row to the channel-agnostic {@link StoredNotification}. */
function toStored(row: NotificationEntity): StoredNotification {
  return {
    id: row.id,
    type: row.type,
    notifiableType: row.notifiableType,
    notifiableId: row.notifiableId,
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
      data: notification.data,
      readAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await em.persistAndFlush(entity);
    return toStored(entity);
  }

  async markAsRead(id: string): Promise<void> {
    await this.em.nativeUpdate(NotificationEntity, { id }, { readAt: new Date() });
  }

  async markAllAsRead(notifiableType: string, notifiableId: string): Promise<void> {
    await this.em.nativeUpdate(
      NotificationEntity,
      { notifiableType, notifiableId, readAt: null },
      { readAt: new Date() },
    );
  }

  async getForNotifiable(
    notifiableType: string,
    notifiableId: string,
  ): Promise<StoredNotification[]> {
    const rows = await this.em
      .fork()
      .find(
        NotificationEntity,
        { notifiableType, notifiableId },
        { orderBy: { createdAt: 'DESC' } },
      );
    return rows.map(toStored);
  }

  async getUnread(notifiableType: string, notifiableId: string): Promise<StoredNotification[]> {
    const rows = await this.em
      .fork()
      .find(
        NotificationEntity,
        { notifiableType, notifiableId, readAt: null },
        { orderBy: { createdAt: 'DESC' } },
      );
    return rows.map(toStored);
  }

  async delete(id: string): Promise<void> {
    await this.em.nativeDelete(NotificationEntity, { id });
  }
}
