import 'reflect-metadata';
import { MySqlContainer, type StartedMySqlContainer } from '@testcontainers/mysql';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isDockerAvailable } from '../../../test-contracts/docker';
import { runNotificationStoreContract } from '../../../test-contracts/notification-store.contract';
import { runPendingDigestStoreContract } from '../../../test-contracts/pending-digest-store.contract';
import {
  type DbConnection,
  makeTypeOrmNotificationStoreContext,
  makeTypeOrmPendingDigestStoreContext,
} from './contract.testkit';
import { notificationEntity } from './notification.entity';
import { digestWindowEntity, pendingDigestEntity } from './pending-digest.entity';
import { ensureNotificationsTable } from './schema';
import { TypeOrmNotificationStore } from './typeorm-notification.store';

// The `schema` option on real engines: the connection keeps its default schema (Postgres `public`,
// MySQL the connection's database), and every table lands in `notif_lib` only.
const describeIfDocker = isDockerAvailable() ? describe : describe.skip;
const SCHEMA = 'notif_lib';
const TABLES = ['notifications', 'notification_pending_digests', 'notification_digest_windows'];

async function boot(type: 'postgres' | 'mysql', connection: DbConnection): Promise<DataSource> {
  const ds = new DataSource({
    type,
    ...connection,
    ...(type === 'mysql' ? { timezone: 'Z' } : {}),
    entities: [
      notificationEntity({ schema: SCHEMA }),
      pendingDigestEntity({ schema: SCHEMA }),
      digestWindowEntity({ schema: SCHEMA }),
    ],
    synchronize: false,
  } as ConstructorParameters<typeof DataSource>[0]);
  return ds.initialize();
}

async function tablesIn(ds: DataSource, schema: string): Promise<string[]> {
  const rows: Array<{ name: string }> = await ds.query(
    `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ${
      ds.options.type === 'mysql' ? '?' : '$1'
    }`,
    [schema],
  );
  return rows.map((r) => r.name).sort();
}

for (const engine of ['postgres', 'mysql'] as const) {
  describeIfDocker(`TypeORM schema option (${engine})`, () => {
    let container: StartedPostgreSqlContainer | StartedMySqlContainer;
    let connection: DbConnection;

    beforeAll(async () => {
      if (engine === 'postgres') {
        const pg = await new PostgreSqlContainer('postgres:16-alpine').start();
        container = pg;
        connection = {
          host: pg.getHost(),
          port: pg.getPort(),
          username: pg.getUsername(),
          password: pg.getPassword(),
          database: pg.getDatabase(),
        };
      } else {
        // Root: the store creates the `notif_lib` database itself.
        const my = await new MySqlContainer('mysql:8.0').start();
        container = my;
        connection = {
          host: my.getHost(),
          port: my.getPort(),
          username: 'root',
          password: my.getRootPassword(),
          database: my.getDatabase(),
        };
      }
    });

    afterAll(async () => {
      await container?.stop();
    });

    runNotificationStoreContract(`TypeORM (${engine}, schema)`, () =>
      makeTypeOrmNotificationStoreContext(engine, connection, SCHEMA),
    );
    runPendingDigestStoreContract(`TypeORM (${engine}, schema)`, () =>
      makeTypeOrmPendingDigestStoreContext(engine, connection, SCHEMA),
    );

    it('creates every table in the schema, none in the default one, and heals idempotently', async () => {
      const ds = await boot(engine, connection);
      try {
        await ensureNotificationsTable(ds, { schema: SCHEMA });
        await ensureNotificationsTable(ds, { schema: SCHEMA });
        expect(await tablesIn(ds, SCHEMA)).toEqual(TABLES.slice().sort());
        const fallback = engine === 'postgres' ? 'public' : connection.database;
        expect(await tablesIn(ds, fallback)).toEqual([]);
        if (engine === 'postgres') {
          const indexes: Array<{ schemaname: string }> = await ds.query(
            `SELECT schemaname FROM pg_indexes WHERE indexname = 'notifications_notifiable_idx'`,
          );
          expect(indexes.map((i) => i.schemaname)).toEqual([SCHEMA]);
        }
      } finally {
        await ds.destroy();
      }
    });

    it('adds a missing column inside the schema', async () => {
      const ds = await boot(engine, connection);
      try {
        const table =
          engine === 'postgres' ? `"${SCHEMA}"."notifications"` : `\`${SCHEMA}\`.\`notifications\``;
        const column = engine === 'postgres' ? '"traceId"' : '`traceId`';
        await ds.query(`ALTER TABLE ${table} DROP COLUMN ${column}`);
        await new TypeOrmNotificationStore(
          ds.getRepository(notificationEntity({ schema: SCHEMA })),
        ).ensureSchema();
        const cols: Array<{ name: string }> = await ds.query(
          `SELECT column_name AS name FROM information_schema.columns WHERE table_schema = ${
            engine === 'mysql' ? '?' : '$1'
          } AND table_name = 'notifications'`,
          [SCHEMA],
        );
        expect(cols.map((c) => c.name)).toContain('traceId');
      } finally {
        await ds.destroy();
      }
    });
  });
}
