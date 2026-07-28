import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  NewStoredNotification,
  NotificationOwnerRef,
  NotificationStore,
  PaginateForNotifiableOptions,
  PaginatedStoredNotifications,
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
      causerType: input.causerType ?? null,
      causerId: input.causerId ?? null,
      traceId: input.traceId ?? null,
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
    types?: string[],
  ): Promise<StoredNotification[]> {
    return this.all().filter(
      (r) =>
        r.notifiableType === notifiableType &&
        r.notifiableId === notifiableId &&
        (tenantId === undefined || r.tenantId === tenantId) &&
        matchesTypes(r.type, types),
    );
  }

  async getUnread(
    notifiableType: string,
    notifiableId: string,
    tenantId?: string,
    types?: string[],
  ): Promise<StoredNotification[]> {
    return (await this.getForNotifiable(notifiableType, notifiableId, tenantId, types)).filter(
      (r) => !r.readAt,
    );
  }

  async delete(id: string): Promise<void> {
    this.rows.delete(id);
  }

  async deleteOwned(id: string, owner: NotificationOwnerRef): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || !ownedBy(row, owner)) return false;
    this.rows.delete(id);
    return true;
  }

  async markAsReadOwned(id: string, owner: NotificationOwnerRef): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || !ownedBy(row, owner)) return false;
    if (!row.readAt) {
      row.readAt = new Date();
      row.updatedAt = new Date();
    }
    return true;
  }

  async findById(id: string): Promise<StoredNotification | null> {
    return this.rows.get(id) ?? null;
  }

  async paginateForNotifiable(
    notifiableType: string,
    notifiableId: string,
    options: PaginateForNotifiableOptions,
  ): Promise<PaginatedStoredNotifications> {
    const matching = await this.getForNotifiable(
      notifiableType,
      notifiableId,
      options.tenantId,
      options.types,
    );
    return {
      items: matching.slice(options.offset, options.offset + options.limit),
      total: matching.length,
    };
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
      causerType: input.causerType ?? null,
      causerId: input.causerId ?? null,
      traceId: input.traceId ?? null,
      data: input.data,
      // An update is a fresh, unread event; createdAt is preserved across updates.
      readAt: null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.rows.set(row.id, row);
    return row;
  }

  async prune(options: { before: Date; onlyRead?: boolean | undefined }): Promise<number> {
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

/** Whether a row belongs to `owner`. An absent `tenantId` on the owner matches any tenant. */
function ownedBy(row: StoredNotification, owner: NotificationOwnerRef): boolean {
  return (
    row.notifiableType === owner.notifiableType &&
    row.notifiableId === owner.notifiableId &&
    (owner.tenantId === undefined || row.tenantId === owner.tenantId)
  );
}

/** `types` absent or empty matches every type; otherwise `type` must be one of the listed values. */
function matchesTypes(type: string, types?: string[]): boolean {
  return types === undefined || types.length === 0 || types.includes(type);
}
