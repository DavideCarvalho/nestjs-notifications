import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  NewStoredNotification,
  NotificationStore,
  StoredNotification,
  UpsertStoredNotification,
} from './interfaces';

/** In-memory {@link NotificationStore} for tests and prototyping. Not for production. */
@Injectable()
export class InMemoryStore implements NotificationStore {
  private readonly rows = new Map<string, StoredNotification>();

  async save(input: NewStoredNotification): Promise<StoredNotification> {
    const now = new Date();
    const row: StoredNotification = {
      id: randomUUID(),
      type: input.type,
      notifiableType: input.notifiableType,
      notifiableId: input.notifiableId,
      tenantId: input.tenantId ?? null,
      data: input.data,
      readAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(row.id, row);
    return row;
  }

  async markAsRead(id: string): Promise<void> {
    const row = this.rows.get(id);
    if (row && !row.readAt) {
      row.readAt = new Date();
      row.updatedAt = new Date();
    }
  }

  async markAllAsRead(
    notifiableType: string,
    notifiableId: string,
    tenantId?: string,
  ): Promise<void> {
    for (const row of this.rows.values()) {
      if (
        row.notifiableType === notifiableType &&
        row.notifiableId === notifiableId &&
        (tenantId === undefined || row.tenantId === tenantId) &&
        !row.readAt
      ) {
        row.readAt = new Date();
        row.updatedAt = new Date();
      }
    }
  }

  async getForNotifiable(
    notifiableType: string,
    notifiableId: string,
    tenantId?: string,
  ): Promise<StoredNotification[]> {
    return this.all().filter(
      (r) =>
        r.notifiableType === notifiableType &&
        r.notifiableId === notifiableId &&
        (tenantId === undefined || r.tenantId === tenantId),
    );
  }

  async getUnread(
    notifiableType: string,
    notifiableId: string,
    tenantId?: string,
  ): Promise<StoredNotification[]> {
    return (await this.getForNotifiable(notifiableType, notifiableId, tenantId)).filter(
      (r) => !r.readAt,
    );
  }

  async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }

  async upsert(input: UpsertStoredNotification): Promise<StoredNotification> {
    const now = new Date();
    const existing = this.rows.get(input.id);
    const row: StoredNotification = {
      id: input.id,
      type: input.type,
      notifiableType: input.notifiableType,
      notifiableId: input.notifiableId,
      tenantId: input.tenantId ?? null,
      data: input.data,
      // An update is a fresh, unread event; createdAt is preserved across updates.
      readAt: null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.rows.set(row.id, row);
    return row;
  }

  async prune(options: { before: Date; onlyRead?: boolean }): Promise<number> {
    const cutoff = options.before.getTime();
    let deleted = 0;
    for (const [id, row] of this.rows) {
      if (row.createdAt.getTime() <= cutoff && (!options.onlyRead || row.readAt != null)) {
        this.rows.delete(id);
        deleted++;
      }
    }
    return deleted;
  }

  private all(): StoredNotification[] {
    return [...this.rows.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}
