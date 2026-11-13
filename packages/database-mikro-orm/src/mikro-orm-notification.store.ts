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
import { EntityManager } from '@mikro-orm/core';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { NotificationEntity, notificationEntity } from './notification.entity';
import { ensureNotificationsTable } from './schema';
import {
  acquireSchemaLock,
  computeExpectedFingerprint,
  ensureSchemaMetaTable,
  readStoredFingerprint,
  writeSchemaFingerprint,
} from './schema-fingerprint';
import {
  MIKRO_ORM_NOTIFICATIONS_OPTIONS,
  assertSchemaSupported,
  createSchemaIfMissing,
} from './schema-name';

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
export function notificationsManagedTables(options: { schema?: string } = {}): string[] {
  const schema = options.schema;
  return [...OWNED_TABLE_NAMES].map((t) => (schema !== undefined ? `${schema}.${t}` : t));
}

/** Options for {@link MikroOrmNotificationStore}. */
export interface MikroOrmNotificationStoreOptions {
  /**
   * The schema (Postgres) or database (MySQL) of the `notifications` table, created at boot; every
   * statement names it (`search_path` is never used). Register `notificationEntity({ schema })` in
   * the ORM. Default: unqualified. SQLite has none: setting it throws.
   */
  schema?: string;
}

/** `types` absent or empty applies no filter; otherwise an IN clause on `type`. */
function typeFilter(types?: string[]): { type?: { $in: string[] } } {
  return types !== undefined && types.length > 0 ? { type: { $in: types } } : {};
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

/** MikroORM-backed {@link NotificationStore}. */
@Injectable()
export class MikroOrmNotificationStore implements NotificationStore {
  // MikroOrmModule provides EntityManager globally; Nest resolves it by type.
  private readonly entity: typeof NotificationEntity;
  private readonly schema: string | undefined;

  constructor(
    private readonly em: EntityManager,
    @Optional() @Inject(MIKRO_ORM_NOTIFICATIONS_OPTIONS) options?: MikroOrmNotificationStoreOptions,
  ) {
    this.schema = options?.schema;
    assertSchemaSupported(em, this.schema);
    this.entity = notificationEntity({ schema: this.schema });
  }

  async save(notification: NewStoredNotification): Promise<StoredNotification> {
    const em = this.em.fork();
    const now = new Date();
    const entity = em.create(this.entity, {
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
    await this.em.nativeUpdate(this.entity, { id }, { readAt: new Date() });
  }

  async markAllAsRead(
    notifiableType: string,
    notifiableId: string,
    tenantId?: string,
  ): Promise<void> {
    await this.em.nativeUpdate(
      this.entity,
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
      this.entity,
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
      this.entity,
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

  async countUnread(
    notifiableType: string,
    notifiableId: string,
    tenantId?: string,
    types?: string[],
  ): Promise<number> {
    return this.em.fork().count(this.entity, {
      notifiableType,
      notifiableId,
      ...(tenantId !== undefined ? { tenantId } : {}),
      ...typeFilter(types),
      readAt: null,
    });
  }

  async delete(id: string): Promise<void> {
    await this.em.nativeDelete(this.entity, { id });
  }

  async deleteOwned(id: string, owner: NotificationOwnerRef): Promise<boolean> {
    const affected = await this.em.nativeDelete(this.entity, {
      id,
      ...ownerFilter(owner),
    });
    return affected > 0;
  }

  async markAsReadOwned(id: string, owner: NotificationOwnerRef): Promise<boolean> {
    // Match on ownership alone, not on readAt — an already-read row still belongs to the owner,
    // so re-reading it is a success, matching markAsRead's idempotence.
    const affected = await this.em.nativeUpdate(
      this.entity,
      { id, ...ownerFilter(owner) },
      { readAt: new Date() },
    );
    return affected > 0;
  }

  async findById(id: string): Promise<StoredNotification | null> {
    const row = await this.em.fork().findOne(this.entity, { id });
    return row ? toStored(row) : null;
  }

  async paginateForNotifiable(
    notifiableType: string,
    notifiableId: string,
    options: PaginateForNotifiableOptions,
  ): Promise<PaginatedStoredNotifications> {
    const [rows, total] = await this.em.fork().findAndCount(
      this.entity,
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
    const existing = await em.findOne(this.entity, { id: input.id });
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
    const entity = em.create(this.entity, {
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
    return this.em.nativeDelete(this.entity, {
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
    // With a schema, it is created first; the marker table lives in it, and the lock is per schema.
    const schema = this.schema;
    if (schema !== undefined) await createSchemaIfMissing(em, schema);
    await ensureSchemaMetaTable(em, schema);
    // 2-3. Compare the expected (in-memory) fingerprint with the last-applied one.
    const expectedFingerprint = computeExpectedFingerprint(em, OWNED_TABLE_NAMES, schema);
    if ((await readStoredFingerprint(em, schema)) === expectedFingerprint) {
      // 4. Steady state: schema already matches — skip the whole-DB introspection.
      return;
    }
    // 5. Drift (or first boot): heal under a best-effort advisory lock so concurrent booting
    //    replicas don't all introspect; re-check after acquiring in case a peer healed first.
    const lock = await acquireSchemaLock(em, schema);
    try {
      if ((await readStoredFingerprint(em, schema)) === expectedFingerprint) {
        return;
      }
      await ensureNotificationsTable(em, schema !== undefined ? { schema } : {});
      await writeSchemaFingerprint(em, expectedFingerprint, schema);
    } finally {
      await lock.release();
    }
  }
}
