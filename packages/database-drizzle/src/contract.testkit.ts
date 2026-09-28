import { PGlite } from '@electric-sql/pglite';
import { getTableName, sql } from 'drizzle-orm';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import pg from 'pg';
import type { NotificationStoreContractContext } from '../../../test-contracts/notification-store.contract';
import type { PendingDigestStoreContractContext } from '../../../test-contracts/pending-digest-store.contract';
import { DrizzleNotificationStore } from './drizzle-notification.store';
import { DrizzlePendingDigestStore } from './drizzle-pending-digest.store';
import { type NotificationTables, createNotificationTables } from './schema';
import type { DrizzlePgDatabase } from './tokens';

/**
 * Where the contract runs: `pglite` (in-process Postgres, the default `pnpm test` — no Docker)
 * or a real Postgres reached by connection string (the `*.db.spec.ts` matrix).
 */
export type DrizzleTarget = { kind: 'pglite' } | { kind: 'postgres'; connectionString: string };

interface Handle {
  db: DrizzlePgDatabase;
  close: () => Promise<void>;
}

async function open(target: DrizzleTarget): Promise<Handle> {
  if (target.kind === 'pglite') {
    const client = new PGlite();
    return {
      db: drizzlePglite(client) as unknown as DrizzlePgDatabase,
      close: () => client.close(),
    };
  }
  const pool = new pg.Pool({ connectionString: target.connectionString, max: 4 });
  return { db: drizzlePg(pool) as unknown as DrizzlePgDatabase, close: () => pool.end() };
}

let counter = 0;
/** Unique table names per suite so a shared Postgres never mixes two suites' rows. */
function uniqueTables(): NotificationTables {
  const suffix = `${process.pid}_${Date.now().toString(36)}_${counter++}`;
  return createNotificationTables({
    tableNames: {
      notifications: `notifications_${suffix}`,
      pendingDigests: `pending_digests_${suffix}`,
      digestWindows: `digest_windows_${suffix}`,
    },
  });
}

async function drop(db: DrizzlePgDatabase, tables: string[]): Promise<void> {
  for (const table of tables) await db.execute(sql.raw(`DROP TABLE IF EXISTS "${table}"`));
}

/** Context for the {@link NotificationStore} contract backed by Drizzle. */
export async function makeDrizzleNotificationStoreContext(
  target: DrizzleTarget,
): Promise<NotificationStoreContractContext> {
  const { db, close } = await open(target);
  const tables = uniqueTables();
  const store = new DrizzleNotificationStore(db, tables);
  await store.ensureSchema();
  return {
    store,
    reset: async () => {
      await db.delete(tables.notifications);
    },
    teardown: async () => {
      await drop(db, [getTableName(tables.notifications)]);
      await close();
    },
  };
}

/** Context for the {@link PendingDigestStore} contract backed by Drizzle. */
export async function makeDrizzlePendingDigestStoreContext(
  target: DrizzleTarget,
): Promise<PendingDigestStoreContractContext> {
  const { db, close } = await open(target);
  const tables = uniqueTables();
  const store = new DrizzlePendingDigestStore(db, tables);
  await store.ensureSchema();
  return {
    store,
    reset: async () => {
      await db.delete(tables.pendingDigests);
      await db.delete(tables.digestWindows);
    },
    teardown: async () => {
      await drop(db, [getTableName(tables.pendingDigests), getTableName(tables.digestWindows)]);
      await close();
    },
  };
}
