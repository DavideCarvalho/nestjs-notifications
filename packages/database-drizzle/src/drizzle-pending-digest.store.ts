import { randomUUID } from 'node:crypto';
import type {
  DigestCadence,
  NewPendingDigestEntry,
  PendingDigestEntry,
  PendingDigestGroup,
  PendingDigestStore,
} from '@dudousxd/nestjs-notifications-preferences';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { type SQL, and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { type NotificationTables, notificationTables, pendingDigestSchemaDdl } from './schema';
import {
  DRIZZLE_NOTIFICATIONS_DB,
  DRIZZLE_NOTIFICATION_TABLES,
  type DrizzlePgDatabase,
} from './tokens';

type Row = NotificationTables['pendingDigests']['$inferSelect'];

/** Ids per `DELETE … IN (…)`, well under Postgres' 65,535 bind parameters. */
const CLEAR_CHUNK = 1000;

/** The columns that identify a digest group within one cadence. */
type GroupKeyRow = Pick<Row, 'tenantId' | 'notifiableType' | 'notifiableId' | 'category'>;

/** Stable group key for a `(tenant, notifiable, category, cadence)`. */
function groupKey(row: GroupKeyRow & Pick<Row, 'cadence'>): string {
  return JSON.stringify([
    row.tenantId ?? null,
    row.notifiableType,
    row.notifiableId,
    row.category,
    row.cadence,
  ]);
}

/** Map a row to the channel-agnostic {@link PendingDigestEntry}. */
/** Group rows (already ordered oldest-first) by their `(tenant, notifiable, category, cadence)`. */
function groupRows(rows: Row[]): Map<string, PendingDigestGroup> {
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

function toEntry(row: Row): PendingDigestEntry {
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
 * Drizzle-backed (Postgres) {@link PendingDigestStore} — the persistent adapter for the digest
 * feature. The window lock is an `INSERT ... ON CONFLICT DO NOTHING RETURNING` on the window's
 * primary key: exactly one caller gets the row back, so a window flushes at most once even under
 * concurrent schedulers.
 */
@Injectable()
export class DrizzlePendingDigestStore implements PendingDigestStore {
  private readonly tables: Pick<NotificationTables, 'pendingDigests' | 'digestWindows'>;

  constructor(
    @Inject(DRIZZLE_NOTIFICATIONS_DB) private readonly db: DrizzlePgDatabase,
    @Optional()
    @Inject(DRIZZLE_NOTIFICATION_TABLES)
    tables?: Pick<NotificationTables, 'pendingDigests' | 'digestWindows'>,
  ) {
    this.tables = tables ?? notificationTables;
  }

  async enqueue(entry: NewPendingDigestEntry): Promise<void> {
    await this.db.insert(this.tables.pendingDigests).values({
      id: randomUUID(),
      cadence: entry.cadence,
      notifiableType: entry.notifiable.type,
      notifiableId: String(entry.notifiable.id),
      tenantId: entry.tenantId ?? null,
      category: entry.category,
      notificationName: entry.notification.name,
      notificationData: entry.notification.data,
      createdAt: new Date(),
    });
  }

  async listGroups(cadence: DigestCadence): Promise<PendingDigestGroup[]> {
    const t = this.tables.pendingDigests;
    const rows = await this.db
      .select()
      .from(t)
      .where(eq(t.cadence, cadence))
      .orderBy(asc(t.createdAt), asc(t.id));
    return [...groupRows(rows).values()];
  }

  async listGroupsPage(
    cadence: DigestCadence,
    page: { limit: number; offset: number },
  ): Promise<PendingDigestGroup[]> {
    const t = this.tables.pendingDigests;
    const keys = await this.db
      .selectDistinct({
        tenantId: t.tenantId,
        notifiableType: t.notifiableType,
        notifiableId: t.notifiableId,
        category: t.category,
      })
      .from(t)
      .where(eq(t.cadence, cadence))
      .orderBy(asc(t.tenantId), asc(t.notifiableType), asc(t.notifiableId), asc(t.category))
      .limit(page.limit)
      .offset(page.offset);
    if (keys.length === 0) return [];
    const rows = await this.db
      .select()
      .from(t)
      .where(
        and(
          eq(t.cadence, cadence),
          or(
            ...keys.map(
              (key) =>
                and(
                  key.tenantId === null ? isNull(t.tenantId) : eq(t.tenantId, key.tenantId),
                  eq(t.notifiableType, key.notifiableType),
                  eq(t.notifiableId, key.notifiableId),
                  eq(t.category, key.category),
                ) as SQL,
            ),
          ),
        ),
      )
      .orderBy(asc(t.createdAt), asc(t.id));
    const groups = groupRows(rows);
    return keys.flatMap((key) => groups.get(groupKey({ ...key, cadence })) ?? []);
  }

  async clear(ids: string[]): Promise<void> {
    const t = this.tables.pendingDigests;
    for (let start = 0; start < ids.length; start += CLEAR_CHUNK) {
      await this.db.delete(t).where(inArray(t.id, ids.slice(start, start + CLEAR_CHUNK)));
    }
  }

  async tryLockWindow(cadence: DigestCadence, windowKey: string): Promise<boolean> {
    const t = this.tables.digestWindows;
    const rows = await this.db
      .insert(t)
      .values({ id: `${cadence}:${windowKey}`, ranAt: new Date() })
      .onConflictDoNothing()
      .returning({ id: t.id });
    return rows.length > 0;
  }

  /** Create the digest tables if missing (`CREATE ... IF NOT EXISTS`, non-destructive). */
  async ensureSchema(): Promise<void> {
    for (const statement of pendingDigestSchemaDdl(this.tables)) {
      await this.db.execute(sql.raw(statement));
    }
  }
}
