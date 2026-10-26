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
import { type FindOptionsWhere, In, IsNull, type Repository } from 'typeorm';
import { DigestWindowEntity, PendingDigestEntity } from './pending-digest.entity';
import { ensurePendingDigestTables } from './pending-digest.schema';

/** Ids per `DELETE … IN (…)`, well under every engine's bind-parameter limit. */
const CLEAR_CHUNK = 1000;

/** The columns that identify a digest group within one cadence. */
interface GroupKeyRow {
  tenantId: string | null;
  notifiableType: string;
  notifiableId: string;
  category: string;
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
    return [...groupRows(rows).values()];
  }

  async listGroupsPage(
    cadence: DigestCadence,
    page: { limit: number; offset: number },
  ): Promise<PendingDigestGroup[]> {
    const keys: GroupKeyRow[] = await this.entries
      .createQueryBuilder('d')
      .select('d.tenantId', 'tenantId')
      .addSelect('d.notifiableType', 'notifiableType')
      .addSelect('d.notifiableId', 'notifiableId')
      .addSelect('d.category', 'category')
      .where('d.cadence = :cadence', { cadence })
      .groupBy('d.tenantId')
      .addGroupBy('d.notifiableType')
      .addGroupBy('d.notifiableId')
      .addGroupBy('d.category')
      .orderBy('d.tenantId')
      .addOrderBy('d.notifiableType')
      .addOrderBy('d.notifiableId')
      .addOrderBy('d.category')
      .offset(page.offset)
      .limit(page.limit)
      .getRawMany();
    if (keys.length === 0) return [];
    const rows = await this.entries.find({
      where: keys.map(
        (key): FindOptionsWhere<PendingDigestEntity> => ({
          cadence,
          tenantId: key.tenantId ?? IsNull(),
          notifiableType: key.notifiableType,
          notifiableId: key.notifiableId,
          category: key.category,
        }),
      ),
      order: { createdAt: 'ASC' },
    });
    const groups = groupRows(rows);
    return keys.flatMap((key) => groups.get(groupKey({ ...key, cadence })) ?? []);
  }

  async clear(ids: string[]): Promise<void> {
    for (let start = 0; start < ids.length; start += CLEAR_CHUNK) {
      await this.entries.delete({ id: In(ids.slice(start, start + CLEAR_CHUNK)) });
    }
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
