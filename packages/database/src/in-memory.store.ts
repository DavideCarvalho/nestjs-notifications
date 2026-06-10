import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { NewStoredNotification, NotificationStore, StoredNotification } from './interfaces';

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

  async markAllAsRead(notifiableType: string, notifiableId: string): Promise<void> {
    for (const row of this.rows.values()) {
      if (
        row.notifiableType === notifiableType &&
        row.notifiableId === notifiableId &&
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
  ): Promise<StoredNotification[]> {
    return this.all().filter(
      (r) => r.notifiableType === notifiableType && r.notifiableId === notifiableId,
    );
  }

  async getUnread(notifiableType: string, notifiableId: string): Promise<StoredNotification[]> {
    return (await this.getForNotifiable(notifiableType, notifiableId)).filter((r) => !r.readAt);
  }

  async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }

  private all(): StoredNotification[] {
    return [...this.rows.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
}
