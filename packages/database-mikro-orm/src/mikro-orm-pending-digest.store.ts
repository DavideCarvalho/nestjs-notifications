import { randomUUID } from 'node:crypto';
import type {
  DigestCadence,
  NewPendingDigestEntry,
  PendingDigestEntry,
  PendingDigestGroup,
  PendingDigestStore,
} from '@dudousxd/nestjs-notifications-preferences';
import { EntityManager } from '@mikro-orm/core';
import { Injectable } from '@nestjs/common';
import { DigestWindowEntity, PendingDigestEntity } from './pending-digest.entity';
import { ensurePendingDigestTables } from './pending-digest.schema';

/** Ids per `DELETE … IN (…)`, well under every engine's bind-parameter limit. */
const CLEAR_CHUNK = 1000;

/** The columns that identify a digest group within one cadence. */
interface GroupKeyRow {
  tenantId?: string | null;
  notifiableType: string;
  notifiableId: string;
  category: string;
}

/**
 * The slice of the SQL drivers' query builder used to page group keys. Every driver this adapter
 * supports runs on an SQL `EntityManager`, which provides `createQueryBuilder`.
 */
interface GroupKeyQueryBuilder {
  select(fields: string[]): GroupKeyQueryBuilder;
  where(cond: object): GroupKeyQueryBuilder;
  groupBy(fields: string[]): GroupKeyQueryBuilder;
  orderBy(order: object): GroupKeyQueryBuilder;
  limit(limit: number): GroupKeyQueryBuilder;
  offset(offset: number): GroupKeyQueryBuilder;
  execute(mode: 'all'): Promise<GroupKeyRow[]>;
}

/** Stable group key for a `(tenant, notifiable, category, cadence)`. */
function groupKey(row: GroupKeyRow & { cadence: string }): string {
  return JSON.stringify([
    row.tenantId ?? null,
    row.notifiableType,
    row.notifiableId,
    row.category,
    row.cadence,
  ]);
}

/** Group rows (already ordered oldest-first) by their `(tenant, notifiable, category, cadence)`. */
function groupRows(rows: PendingDigestEntity[]): Map<string, PendingDigestGroup> {
  const groups = new Map<string, PendingDigestGroup>();
  for (const row of rows) {
    const key = groupKey(row);
    let group = groups.get(key);
    if (!group) {
      group = {
        notifiable: { type: row.notifiableType, id: row.notifiableId },
        tenantId: row.tenantId ?? null,
        category: row.category,
        cadence: row.cadence as DigestCadence,
        entries: [],
      };
      groups.set(key, group);
    }
    group.entries.push(toEntry(row));
  }
  return groups;
}

/** Map a row to the channel-agnostic {@link PendingDigestEntry}. */
function toEntry(row: PendingDigestEntity): PendingDigestEntry {
  return {
    id: row.id,
    notifiable: { type: row.notifiableType, id: row.notifiableId },
    tenantId: row.tenantId ?? null,
    category: row.category,
    cadence: row.cadence as DigestCadence,
    notification: { name: row.notificationName, data: row.notificationData },
    createdAt: row.createdAt,
  };
}

/**
 * MikroORM-backed {@link PendingDigestStore} — the persistent adapter for the digest feature. POJO
 * store with a non-destructive {@link ensureSchema}, consistent with the other database stores.
 * Idempotency uses a unique-key insert into a window table: a duplicate insert means the window
 * already ran. Mirrors the TypeORM adapter exactly.
 */
@Injectable()
export class MikroOrmPendingDigestStore implements PendingDigestStore {
  // MikroOrmModule provides EntityManager globally; Nest resolves it by type.
  constructor(private readonly em: EntityManager) {}

  async enqueue(entry: NewPendingDigestEntry): Promise<void> {
    const em = this.em.fork();
    const entity = em.create(PendingDigestEntity, {
      id: randomUUID(),
      cadence: entry.cadence,
      notifiableType: entry.notifiable.type,
      notifiableId: String(entry.notifiable.id),
      tenantId: entry.tenantId ?? null,
      category: entry.category,
      notificationName: entry.notification.name,
      notificationData: { ...entry.notification.data },
      createdAt: new Date(),
    });
    await em.persist(entity).flush();
  }

  async listGroups(cadence: DigestCadence): Promise<PendingDigestGroup[]> {
    const rows = await this.em
      .fork()
      .find(PendingDigestEntity, { cadence }, { orderBy: { createdAt: 'ASC' } });
    return [...groupRows(rows).values()];
  }

  async listGroupsPage(
    cadence: DigestCadence,
    page: { limit: number; offset: number },
  ): Promise<PendingDigestGroup[]> {
    const em = this.em.fork() as EntityManager & {
      createQueryBuilder(entity: typeof PendingDigestEntity): GroupKeyQueryBuilder;
    };
    const fields = ['tenantId', 'notifiableType', 'notifiableId', 'category'];
    const keys = await em
      .createQueryBuilder(PendingDigestEntity)
      .select(fields)
      .where({ cadence })
      .groupBy(fields)
      .orderBy({ tenantId: 'asc', notifiableType: 'asc', notifiableId: 'asc', category: 'asc' })
      .limit(page.limit)
      .offset(page.offset)
      .execute('all');
    if (keys.length === 0) return [];
    const rows = await em.find(
      PendingDigestEntity,
      {
        cadence,
        $or: keys.map((key) => ({
          tenantId: key.tenantId ?? null,
          notifiableType: key.notifiableType,
          notifiableId: key.notifiableId,
          category: key.category,
        })),
      },
      { orderBy: { createdAt: 'ASC' } },
    );
    const groups = groupRows(rows);
    return keys.flatMap((key) => groups.get(groupKey({ ...key, cadence })) ?? []);
  }

  async clear(ids: string[]): Promise<void> {
    for (let start = 0; start < ids.length; start += CLEAR_CHUNK) {
      await this.em.nativeDelete(PendingDigestEntity, {
        id: { $in: ids.slice(start, start + CLEAR_CHUNK) },
      });
    }
  }

  async tryLockWindow(cadence: DigestCadence, windowKey: string): Promise<boolean> {
    const id = `${cadence}:${windowKey}`;
    try {
      const em = this.em.fork();
      const entity = em.create(DigestWindowEntity, { id, ranAt: new Date() });
      await em.persist(entity).flush();
      return true;
    } catch {
      // Duplicate primary key → the window already ran. Treat as not-acquired (no double-send).
      return false;
    }
  }

  /** Create/patch the digest tables if needed (non-destructive). */
  async ensureSchema(): Promise<void> {
    await ensurePendingDigestTables(this.em);
  }
}
