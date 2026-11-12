import 'reflect-metadata';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isDockerAvailable } from '../../../test-contracts/docker';
import { runNotificationStoreContract } from '../../../test-contracts/notification-store.contract';
import { runPendingDigestStoreContract } from '../../../test-contracts/pending-digest-store.contract';
import {
  makeDrizzleNotificationStoreContext,
  makeDrizzlePendingDigestStoreContext,
} from './contract.testkit';
import { DrizzleNotificationStore } from './drizzle-notification.store';
import { DrizzlePendingDigestStore } from './drizzle-pending-digest.store';
import { createNotificationTables } from './schema';
import type { DrizzlePgDatabase } from './tokens';

// The `schema` option on a real Postgres: the connection keeps `public`, every table and index lands
// in `notif_lib`, and a role without CREATE gets the grant in the error.
const describeIfDocker = isDockerAvailable() ? describe : describe.skip;
const SCHEMA = 'notif_lib';

describeIfDocker('Drizzle schema option (postgres)', () => {
  let container: StartedPostgreSqlContainer;
  let connectionString: string;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    connectionString = container.getConnectionUri();
  });

  afterAll(async () => {
    await container?.stop();
  });

  runNotificationStoreContract('Drizzle (postgres, schema)', () =>
    makeDrizzleNotificationStoreContext({ kind: 'postgres', connectionString }, SCHEMA),
  );
  runPendingDigestStoreContract('Drizzle (postgres, schema)', () =>
    makeDrizzlePendingDigestStoreContext({ kind: 'postgres', connectionString }, SCHEMA),
  );

  it('keeps every table in the schema, none in public, and heals idempotently', async () => {
    const pool = new pg.Pool({ connectionString, max: 2 });
    const db = drizzle(pool) as unknown as DrizzlePgDatabase;
    try {
      const tables = createNotificationTables({ schema: 'notif_canonical' });
      for (let i = 0; i < 2; i++) {
        await new DrizzleNotificationStore(db, tables).ensureSchema();
        await new DrizzlePendingDigestStore(db, tables).ensureSchema();
      }
      const { rows } = await pool.query<{ schemaname: string; tablename: string }>(
        `SELECT schemaname, tablename FROM pg_tables
          WHERE tablename IN ('notifications', 'notification_pending_digests', 'notification_digest_windows')
          ORDER BY tablename`,
      );
      expect(rows).toEqual([
        { schemaname: 'notif_canonical', tablename: 'notification_digest_windows' },
        { schemaname: 'notif_canonical', tablename: 'notification_pending_digests' },
        { schemaname: 'notif_canonical', tablename: 'notifications' },
      ]);
      const publicTables = await pool.query(
        `SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'notification%'`,
      );
      expect(publicTables.rowCount).toBe(0);
    } finally {
      await pool.end();
    }
  });

  it('works for a role that may not CREATE once the schema exists, and names the grant before', async () => {
    const admin = new pg.Pool({ connectionString, max: 1 });
    try {
      await admin.query(`CREATE ROLE limited LOGIN PASSWORD 'limited'`);
      await admin.query(`REVOKE CREATE ON DATABASE ${container.getDatabase()} FROM PUBLIC`);
      const url = new URL(connectionString);
      url.username = 'limited';
      url.password = 'limited';
      const pool = new pg.Pool({ connectionString: url.toString(), max: 1 });
      const db = drizzle(pool) as unknown as DrizzlePgDatabase;
      try {
        const tables = createNotificationTables({ schema: 'notif_limited' });
        await expect(new DrizzleNotificationStore(db, tables).ensureSchema()).rejects.toThrow(
          /GRANT CREATE ON DATABASE/,
        );
        await admin.query('CREATE SCHEMA notif_limited AUTHORIZATION limited');
        await new DrizzleNotificationStore(db, tables).ensureSchema();
      } finally {
        await pool.end();
      }
    } finally {
      await admin.end();
    }
  });
});
