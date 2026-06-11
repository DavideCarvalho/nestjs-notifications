import { randomUUID } from 'node:crypto';
import type {
  NewStoredNotification,
  NotificationStore,
  StoredNotification,
} from '@dudousxd/nestjs-notifications-database';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PRISMA_CLIENT, type PrismaNotificationClientLike } from './prisma-client';

/** Maps a Prisma `Notification` row to the channel-agnostic {@link StoredNotification}. */
function toStored(row: any): StoredNotification {
  return {
    id: row.id,
    type: row.type,
    notifiableType: row.notifiableType,
    notifiableId: row.notifiableId,
    tenantId: row.tenantId ?? null,
    data: row.data,
    readAt: row.readAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Prisma-backed {@link NotificationStore}. */
@Injectable()
export class PrismaNotificationStore implements NotificationStore {
  constructor(
    @Inject(PRISMA_CLIENT)
    private readonly client: PrismaNotificationClientLike,
  ) {}

  async save(notification: NewStoredNotification): Promise<StoredNotification> {
    const row = await this.client.notification.create({
      data: {
        id: randomUUID(),
        type: notification.type,
        notifiableType: notification.notifiableType,
        notifiableId: notification.notifiableId,
        tenantId: notification.tenantId ?? null,
        data: notification.data,
        readAt: null,
      },
    });
    return toStored(row);
  }

  async markAsRead(id: string): Promise<void> {
    await this.client.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllAsRead(
    notifiableType: string,
    notifiableId: string,
    tenantId?: string,
  ): Promise<void> {
    await this.client.notification.updateMany({
      where: {
        notifiableType,
        notifiableId,
        ...(tenantId !== undefined ? { tenantId } : {}),
        readAt: null,
      },
      data: { readAt: new Date() },
    });
  }

  async getForNotifiable(
    notifiableType: string,
    notifiableId: string,
    tenantId?: string,
  ): Promise<StoredNotification[]> {
    const rows = await this.client.notification.findMany({
      where: { notifiableType, notifiableId, ...(tenantId !== undefined ? { tenantId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toStored);
  }

  async getUnread(
    notifiableType: string,
    notifiableId: string,
    tenantId?: string,
  ): Promise<StoredNotification[]> {
    const rows = await this.client.notification.findMany({
      where: {
        notifiableType,
        notifiableId,
        ...(tenantId !== undefined ? { tenantId } : {}),
        readAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toStored);
  }

  async delete(id: string): Promise<void> {
    await this.client.notification.delete({ where: { id } });
  }

  /**
   * No-op: Prisma is schema-first. Create the `Notification` model in your `schema.prisma`
   * and apply it with `prisma migrate` / `prisma db push` — the library won't run DDL here.
   */
  async ensureSchema(): Promise<void> {
    new Logger('Notifications').log(
      'Prisma manages its own schema — add the Notification model to schema.prisma and run ' +
        '`prisma migrate`. Skipping auto-create.',
    );
  }
}
