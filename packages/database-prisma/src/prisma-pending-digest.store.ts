import { randomUUID } from 'node:crypto';
import type {
  DigestCadence,
  NewPendingDigestEntry,
  PendingDigestEntry,
  PendingDigestGroup,
  PendingDigestStore,
} from '@dudousxd/nestjs-notifications-preferences';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  PRISMA_PENDING_DIGEST_CLIENT,
  type PrismaPendingDigestClientLike,
} from './prisma-pending-digest-client';

/** Ids per `deleteMany({ id: { in } })`, well under every engine's bind-parameter limit. */
const CLEAR_CHUNK = 1000;

/** The columns that identify a digest group within one cadence. */
const GROUP_COLUMNS = ['tenantId', 'notifiableType', 'notifiableId', 'category'];

/** Stable group key for a `(tenant, notifiable, category, cadence)`. */
function groupKey(row: any): string {
  return JSON.stringify([
    row.tenantId ?? null,
    row.notifiableType,
    row.notifiableId,
    row.category,
    row.cadence,
  ]);
}

/** The group-key columns of a {@link PendingDigestGroup}. */
function keyOf(group: PendingDigestGroup): Record<string, unknown> {
  return {
    tenantId: group.tenantId,
    notifiableType: group.notifiable.type,
    notifiableId: group.notifiable.id,
    category: group.category,
    cadence: group.cadence,
  };
}

function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Group rows (already ordered oldest-first) by their `(tenant, notifiable, category, cadence)`. */
function groupRows(rows: any[]): Map<string, PendingDigestGroup> {
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

/** Map a Prisma `PendingDigest` row to the channel-agnostic {@link PendingDigestEntry}. */
function toEntry(row: any): PendingDigestEntry {
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
 * Prisma-backed {@link PendingDigestStore} — the persistent adapter for the digest feature. Mirrors
 * the TypeORM / MikroORM adapters' semantics exactly, but against a structural Prisma client
 * delegate ({@link PrismaPendingDigestClientLike}) — no hard `@prisma/client` import. Idempotency
 * uses a unique-key insert into the `DigestWindow` model: a duplicate insert means the window
 * already ran.
 */
@Injectable()
export class PrismaPendingDigestStore implements PendingDigestStore {
  constructor(
    @Inject(PRISMA_PENDING_DIGEST_CLIENT)
    private readonly client: PrismaPendingDigestClientLike,
  ) {}

  async enqueue(entry: NewPendingDigestEntry): Promise<void> {
    await this.client.pendingDigest.create({
      data: {
        id: randomUUID(),
        cadence: entry.cadence,
        notifiableType: entry.notifiable.type,
        notifiableId: String(entry.notifiable.id),
        tenantId: entry.tenantId ?? null,
        category: entry.category,
        notificationName: entry.notification.name,
        notificationData: entry.notification.data,
        createdAt: new Date(),
      },
    });
  }

  async listGroups(cadence: DigestCadence): Promise<PendingDigestGroup[]> {
    return [...groupRows(await this.findPending({ cadence })).values()];
  }

  async listGroupsPage(
    cadence: DigestCadence,
    page: { limit: number; offset: number },
  ): Promise<PendingDigestGroup[]> {
    const delegate = this.client.pendingDigest;
    if (typeof delegate.groupBy !== 'function') {
      const groups = [...groupRows(await this.findPending({ cadence })).values()];
      groups.sort((a, b) => compareKeys(groupKey(keyOf(a)), groupKey(keyOf(b))));
      return groups.slice(page.offset, page.offset + page.limit);
    }
    const keys = await delegate.groupBy({
      by: GROUP_COLUMNS,
      where: { cadence },
      orderBy: GROUP_COLUMNS.map((column) => ({ [column]: 'asc' })),
      skip: page.offset,
      take: page.limit,
    });
    if (keys.length === 0) return [];
    const rows = await this.findPending({
      cadence,
      OR: keys.map((key) => ({
        tenantId: key.tenantId ?? null,
        notifiableType: key.notifiableType,
        notifiableId: key.notifiableId,
        category: key.category,
      })),
    });
    const groups = groupRows(rows);
    return keys.flatMap((key) => groups.get(groupKey({ ...key, cadence })) ?? []);
  }

  async clear(ids: string[]): Promise<void> {
    for (let start = 0; start < ids.length; start += CLEAR_CHUNK) {
      await this.client.pendingDigest.deleteMany({
        where: { id: { in: ids.slice(start, start + CLEAR_CHUNK) } },
      });
    }
  }

  private findPending(where: Record<string, unknown>): Promise<any[]> {
    return this.client.pendingDigest.findMany({ where, orderBy: { createdAt: 'asc' } });
  }

  async tryLockWindow(cadence: DigestCadence, windowKey: string): Promise<boolean> {
    const id = `${cadence}:${windowKey}`;
    try {
      await this.client.digestWindow.create({ data: { id, ranAt: new Date() } });
      return true;
    } catch {
      // Duplicate primary key → the window already ran. Treat as not-acquired (no double-send).
      return false;
    }
  }

  /**
   * No-op: Prisma is schema-first. Create the `PendingDigest` + `DigestWindow` models in your
   * `schema.prisma` and apply them with `prisma migrate` / `prisma db push` — the library won't run
   * DDL here.
   */
  async ensureSchema(): Promise<void> {
    new Logger('Notifications').log(
      'Prisma manages its own schema — add the PendingDigest + DigestWindow models to ' +
        'schema.prisma and run `prisma migrate`. Skipping auto-create.',
    );
  }
}
