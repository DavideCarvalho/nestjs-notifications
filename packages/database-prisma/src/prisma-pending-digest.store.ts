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
    const rows = await this.client.pendingDigest.findMany({
      where: { cadence },
      orderBy: { createdAt: 'asc' },
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
    await this.client.pendingDigest.deleteMany({ where: { id: { in: ids } } });
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
