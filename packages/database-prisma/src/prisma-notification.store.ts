import { randomUUID } from 'node:crypto';
import type {
  NewStoredNotification,
  NotificationStore,
  PaginateForNotifiableOptions,
  PaginatedStoredNotifications,
  StoredNotification,
  UpsertStoredNotification,
} from '@dudousxd/nestjs-notifications-database';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PRISMA_CLIENT, type PrismaNotificationClientLike } from './prisma-client';

/** `types` absent or empty applies no filter; otherwise an IN clause on `type`. */
function typeFilter(types?: string[]): { type?: { in: string[] } } {
  return types !== undefined && types.length > 0 ? { type: { in: types } } : {};
}

/** Maps a Prisma `Notification` row to the channel-agnostic {@link StoredNotification}. */
function toStored(row: any): StoredNotification {
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
 * The captured-context columns (causer/trace), included in a Prisma write ONLY when supplied.
 * Prisma is schema-first and consumer-managed: a consumer who has NOT added these columns to
 * `schema.prisma` must not have them sent (Prisma rejects unknown keys). Omitting them when
 * absent keeps old consumer schemas working; a consumer who adds the nullable columns gets them
 * persisted. Documented in the package README / `ensureSchema` note.
 */
function capturedColumns(input: {
  causerType?: string | null;
  causerId?: string | null;
  traceId?: string | null;
}): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if (input.causerType !== undefined) out.causerType = input.causerType;
  if (input.causerId !== undefined) out.causerId = input.causerId;
  if (input.traceId !== undefined) out.traceId = input.traceId;
  return out;
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
        ...capturedColumns(notification),
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
    types?: string[],
  ): Promise<StoredNotification[]> {
    const rows = await this.client.notification.findMany({
      where: {
        notifiableType,
        notifiableId,
        ...(tenantId !== undefined ? { tenantId } : {}),
        ...typeFilter(types),
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toStored);
  }

  async getUnread(
    notifiableType: string,
    notifiableId: string,
    tenantId?: string,
    types?: string[],
  ): Promise<StoredNotification[]> {
    const rows = await this.client.notification.findMany({
      where: {
        notifiableType,
        notifiableId,
        ...(tenantId !== undefined ? { tenantId } : {}),
        ...typeFilter(types),
        readAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toStored);
  }

  async delete(id: string): Promise<void> {
    await this.client.notification.delete({ where: { id } });
  }

  async paginateForNotifiable(
    notifiableType: string,
    notifiableId: string,
    options: PaginateForNotifiableOptions,
  ): Promise<PaginatedStoredNotifications> {
    const where = {
      notifiableType,
      notifiableId,
      ...(options.tenantId !== undefined ? { tenantId: options.tenantId } : {}),
      ...typeFilter(options.types),
    };
    const [rows, total] = await Promise.all([
      this.client.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: options.offset,
        take: options.limit,
      }),
      this.client.notification.count({ where }),
    ]);
    return { items: rows.map(toStored), total };
  }

  async upsert(input: UpsertStoredNotification): Promise<StoredNotification> {
    const fields = {
      type: input.type,
      notifiableType: input.notifiableType,
      notifiableId: input.notifiableId,
      tenantId: input.tenantId ?? null,
      ...capturedColumns(input),
      data: input.data,
      readAt: null,
    };
    const row = await this.client.notification.upsert({
      where: { id: input.id },
      create: { id: input.id, ...fields },
      update: fields,
    });
    return toStored(row);
  }

  async prune(options: { before: Date; onlyRead?: boolean }): Promise<number> {
    const result = await this.client.notification.deleteMany({
      where: {
        createdAt: { lte: options.before },
        ...(options.onlyRead ? { readAt: { not: null } } : {}),
      },
    });
    return result.count;
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
