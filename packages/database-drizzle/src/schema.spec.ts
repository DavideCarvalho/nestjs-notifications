import { PGlite } from '@electric-sql/pglite';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';
import { describe, expect, it } from 'vitest';
import { DrizzleNotificationStore } from './drizzle-notification.store';
import { DrizzlePendingDigestStore } from './drizzle-pending-digest.store';
import {
  DEFAULT_TABLE_NAMES,
  createNotificationTables,
  notificationTables,
  notificationsManagedTables,
  notificationsSchemaDdl,
  pendingDigestSchemaDdl,
} from './schema';
import type { DrizzlePgDatabase } from './tokens';

describe('createNotificationTables / schema DDL', () => {
  it('defaults to the canonical table names', () => {
    expect(notificationsManagedTables()).toEqual([
      DEFAULT_TABLE_NAMES.notifications,
      DEFAULT_TABLE_NAMES.pendingDigests,
      DEFAULT_TABLE_NAMES.digestWindows,
    ]);
  });

  it('honors BYO names + schema, deriving index names from them', () => {
    const t = createNotificationTables({ tableNames: { notifications: 'inbox' }, schema: 'app' });
    const cfg = getTableConfig(t.notifications);
    expect(cfg.name).toBe('inbox');
    expect(cfg.schema).toBe('app');
    expect(cfg.indexes[0]?.config.name).toBe('inbox_notifiable_idx');
    expect(notificationsSchemaDdl(t)[0]).toBe('CREATE SCHEMA IF NOT EXISTS "app"');
  });

  it('rejects unsafe identifiers', () => {
    expect(() => createNotificationTables({ tableNames: { notifications: 'x"; drop' } })).toThrow(
      /Unsafe/,
    );
    expect(() => createNotificationTables({ schema: 'a.b' })).toThrow(/Unsafe/);
  });

  it('ensureSchema creates exactly the columns the Drizzle tables declare, idempotently (no drift)', async () => {
    const client = new PGlite();
    const db = drizzle(client) as unknown as DrizzlePgDatabase;
    const tables = createNotificationTables({ schema: 'drift_check' });
    const stores = [
      new DrizzleNotificationStore(db, tables),
      new DrizzlePendingDigestStore(db, tables),
    ];
    for (const store of stores) {
      await store.ensureSchema();
      await store.ensureSchema();
    }
    for (const table of Object.values(tables)) {
      const cfg = getTableConfig(table);
      const { rows } = await client.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>(
        `SELECT column_name, data_type, is_nullable FROM information_schema.columns
         WHERE table_schema = 'drift_check' AND table_name = $1`,
        [cfg.name],
      );
      const live = new Map(rows.map((r) => [r.column_name, r]));
      expect([...live.keys()].sort()).toEqual(cfg.columns.map((c) => c.name).sort());
      for (const column of cfg.columns) {
        expect(live.get(column.name)?.is_nullable, `${cfg.name}.${column.name}`).toBe(
          column.notNull ? 'NO' : 'YES',
        );
      }
    }
    await client.close();
  });

  it('the DDL never drops or alters', () => {
    const ddl = [...notificationsSchemaDdl(), ...pendingDigestSchemaDdl(notificationTables)].join(
      '\n',
    );
    expect(ddl).not.toMatch(/\b(DROP|ALTER)\b/);
  });
});
