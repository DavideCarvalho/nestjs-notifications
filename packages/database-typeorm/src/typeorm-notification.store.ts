import { randomUUID } from 'node:crypto';
import type {
  NewStoredNotification,
  NotificationStore,
  StoredNotification,
} from '@dudousxd/nestjs-notifications-database';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, type Repository } from 'typeorm';
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

  async markAllAsRead(notifiableType: string, notifiableId: string): Promise<void> {
    await this.repo.update(
      { notifiableType, notifiableId, readAt: IsNull() },
      { readAt: new Date(), updatedAt: new Date() },
    );
  }

  async getForNotifiable(
    notifiableType: string,
    notifiableId: string,
  ): Promise<StoredNotification[]> {
    const rows = await this.repo.find({
      where: { notifiableType, notifiableId },
      order: { createdAt: 'DESC' },
    });
    return rows.map(toStored);
  }

  async getUnread(notifiableType: string, notifiableId: string): Promise<StoredNotification[]> {
    const rows = await this.repo.find({
      where: { notifiableType, notifiableId, readAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
    return rows.map(toStored);
  }

  async delete(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
