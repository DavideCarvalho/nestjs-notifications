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
import {
  acquireSchemaLock,
  computeExpectedFingerprint,
  ensureSchemaMetaTable,
  readStoredFingerprint,
  writeSchemaFingerprint,
} from './schema-fingerprint';

/** The table(s) this store owns — used to scope the schema fingerprint to our own metadata. */
const OWNED_TABLE_NAMES: ReadonlySet<string> = new Set(['notifications']);

/**
 * Tables this store creates and manages at boot (autoSchema). Feed to your ORM's migration differ
 * exclude/skipTables so it never tries to drop them.
 *
 * ```ts
 * await MikroORM.init({
 *   // ...your entities/driver config
 *   schemaGenerator: { skipTables: notificationsManagedTables() },
 * });
 * ```
 *
 * Derived from the same {@link OWNED_TABLE_NAMES} set `ensureSchema()` scopes its own fingerprint
 * to — one list, so a consumer's denylist can never drift from what this store actually owns.
 */
export function notificationsManagedTables(): string[] {
  return [...OWNED_TABLE_NAMES];
}

/** `types` absent or empty applies no filter; otherwise an IN clause on `type`. */
function typeFilter(types?: string[]): { type?: { $in: string[] } } {
  return types !== undefined && types.length > 0 ? { type: { $in: types } } : {};
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
    types?: string[],
  ): Promise<StoredNotification[]> {
    const rows = await this.em.fork().find(
      NotificationEntity,
      {
        notifiableType,
        notifiableId,
        ...(tenantId !== undefined ? { tenantId } : {}),
        ...typeFilter(types),
      },
      { orderBy: { createdAt: 'DESC' } },
    );
    return rows.map(toStored);
  }

  async getUnread(
    notifiableType: string,
    notifiableId: string,
    tenantId?: string,
    types?: string[],
  ): Promise<StoredNotification[]> {
    const rows = await this.em.fork().find(
      NotificationEntity,
      {
        notifiableType,
        notifiableId,
        ...(tenantId !== undefined ? { tenantId } : {}),
        ...typeFilter(types),
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
        ...typeFilter(options.types),
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

  /**
   * Create/patch the notifications table if needed (non-destructive), gated by a schema fingerprint
   * so steady-state boots skip the expensive whole-DB `information_schema` introspection.
   *
   * The marker table records the fingerprint of the last-applied schema; when the in-memory expected
   * fingerprint already matches the stored one, we return without ever calling the schema diff.
   */
  async ensureSchema(): Promise<void> {
    const em = this.em;
    // 1. Idempotent marker table — no introspection, safe against a completely empty database.
    await ensureSchemaMetaTable(em);
    // 2-3. Compare the expected (in-memory) fingerprint with the last-applied one.
    const expectedFingerprint = computeExpectedFingerprint(em, OWNED_TABLE_NAMES);
    if ((await readStoredFingerprint(em)) === expectedFingerprint) {
      // 4. Steady state: schema already matches — skip the whole-DB introspection.
      return;
    }
    // 5. Drift (or first boot): heal under a best-effort advisory lock so concurrent booting
    //    replicas don't all introspect; re-check after acquiring in case a peer healed first.
    const lock = await acquireSchemaLock(em);
    try {
      if ((await readStoredFingerprint(em)) === expectedFingerprint) {
        return;
      }
      await ensureNotificationsTable(em);
      await writeSchemaFingerprint(em, expectedFingerprint);
    } finally {
      await lock.release();
    }
  }
}
