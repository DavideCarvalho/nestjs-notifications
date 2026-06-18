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

/** Stable group key for a `(tenant, notifiable, category, cadence)`. */
function groupKey(row: PendingDigestEntity): string {
  return JSON.stringify([
    row.tenantId ?? null,
    row.notifiableType,
    row.notifiableId,
    row.category,
    row.cadence,
  ]);
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
    return [...groups.values()];
  }

  async clear(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.em.nativeDelete(PendingDigestEntity, { id: { $in: ids } });
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
