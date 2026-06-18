import { randomUUID } from 'node:crypto';
import type {
  DigestCadence,
  NewPendingDigestEntry,
  PendingDigestEntry,
  PendingDigestGroup,
  PendingDigestStore,
} from '@dudousxd/nestjs-notifications-preferences';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, type Repository } from 'typeorm';
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
 * TypeORM-backed {@link PendingDigestStore} — the persistent adapter for the digest feature. POJO
 * store with a non-destructive {@link ensureSchema}, consistent with the other database stores.
 * Idempotency uses a unique-key insert into a window table: a duplicate insert means the window
 * already ran.
 */
@Injectable()
export class TypeOrmPendingDigestStore implements PendingDigestStore {
  constructor(
    @InjectRepository(PendingDigestEntity)
    private readonly entries: Repository<PendingDigestEntity>,
    @InjectRepository(DigestWindowEntity)
    private readonly windows: Repository<DigestWindowEntity>,
  ) {}

  async enqueue(entry: NewPendingDigestEntry): Promise<void> {
    await this.entries.save(
      this.entries.create({
        id: randomUUID(),
        cadence: entry.cadence,
        notifiableType: entry.notifiable.type,
        notifiableId: String(entry.notifiable.id),
        tenantId: entry.tenantId ?? null,
        category: entry.category,
        notificationName: entry.notification.name,
        notificationData: entry.notification.data,
        createdAt: new Date(),
      }),
    );
  }

  async listGroups(cadence: DigestCadence): Promise<PendingDigestGroup[]> {
    const rows = await this.entries.find({
      where: { cadence },
      order: { createdAt: 'ASC' },
    });
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
    await this.entries.delete({ id: In(ids) });
  }

  async tryLockWindow(cadence: DigestCadence, windowKey: string): Promise<boolean> {
    const id = `${cadence}:${windowKey}`;
    try {
      await this.windows.insert({ id, ranAt: new Date() });
      return true;
    } catch {
      // Duplicate primary key → the window already ran. Treat as not-acquired (no double-send).
      return false;
    }
  }

  /** Create the digest tables if missing (non-destructive). */
  async ensureSchema(): Promise<void> {
    await ensurePendingDigestTables(this.entries.manager.connection);
  }
}
