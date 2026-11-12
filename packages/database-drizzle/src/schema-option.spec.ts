import 'reflect-metadata';
import { PGlite } from '@electric-sql/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';
import { describe, expect, it, vi } from 'vitest';
import { DrizzleNotificationStore } from './drizzle-notification.store';
import { DrizzlePendingDigestStore } from './drizzle-pending-digest.store';
import { staticProviders } from './module-options';
import { createNotificationTables, runSchemaDdl } from './schema';
import { DRIZZLE_NOTIFICATION_TABLES, type DrizzlePgDatabase } from './tokens';

describe('schema option (Drizzle)', () => {
  it('refuses public, long and unsafe names', () => {
    expect(() => createNotificationTables({ schema: 'public' })).toThrow(/leave `schema` unset/);
    expect(() => createNotificationTables({ schema: 'x'.repeat(64) })).toThrow(/63/);
    expect(() => createNotificationTables({ schema: 'a;b' })).toThrow(/Unsafe/);
  });

  it('the module `schema` option builds the canonical tables in that schema', () => {
    const db = {} as DrizzlePgDatabase;
    const providers = staticProviders({ db, schema: 'notif_lib' });
    const tables = (providers[1] as { useValue: ReturnType<typeof createNotificationTables> })
      .useValue;
    expect(getTableConfig(tables.notifications)).toMatchObject({
      name: 'notifications',
      schema: 'notif_lib',
    });
    expect(getTableConfig(tables.digestWindows).schema).toBe('notif_lib');
    expect((providers[1] as { provide: unknown }).provide).toBe(DRIZZLE_NOTIFICATION_TABLES);
    expect(() =>
      staticProviders({ db, schema: 'notif_lib', tables: createNotificationTables() }),
    ).toThrow(/either `tables` or `schema`/);
    expect((staticProviders({ db })[1] as { useValue: unknown }).useValue).toBeNull();
  });

  it('creates the schema only when it is missing, and names the grant on failure', async () => {
    const execute = vi.fn(async () => undefined);
    await runSchemaDdl(execute, async () => ({ rows: [{ '?column?': 1 }] }), [
      'CREATE SCHEMA IF NOT EXISTS "notif_lib"',
      'CREATE TABLE x',
    ]);
    expect(execute.mock.calls).toEqual([['CREATE TABLE x']]);
    const denied = vi.fn(async () => {
      throw new Error('permission denied for database app');
    });
    await expect(
      runSchemaDdl(denied, async () => ({ rows: [] }), ['CREATE SCHEMA IF NOT EXISTS "notif_lib"']),
    ).rejects.toThrow(/GRANT CREATE ON DATABASE/);
  });

  it('every table and index lands in the schema, nothing in public (pglite)', async () => {
    const client = new PGlite();
    const db = drizzle(client) as unknown as DrizzlePgDatabase;
    try {
      const tables = createNotificationTables({ schema: 'notif_lib' });
      await new DrizzleNotificationStore(db, tables).ensureSchema();
      await new DrizzleNotificationStore(db, tables).ensureSchema();
      await new DrizzlePendingDigestStore(db, tables).ensureSchema();
      const where = async (schema: string) =>
        (
          await client.query<{ name: string }>(
            'SELECT tablename AS name FROM pg_tables WHERE schemaname = $1 ORDER BY 1',
            [schema],
          )
        ).rows.map((r) => r.name);
      expect(await where('notif_lib')).toEqual([
        'notification_digest_windows',
        'notification_pending_digests',
        'notifications',
      ]);
      expect(await where('public')).toEqual([]);
      const indexes = await client.query<{ schemaname: string }>(
        "SELECT schemaname FROM pg_indexes WHERE indexname LIKE 'notification%_idx'",
      );
      expect(new Set(indexes.rows.map((r) => r.schemaname))).toEqual(new Set(['notif_lib']));
    } finally {
      await client.close();
    }
  }, 60_000);
});
