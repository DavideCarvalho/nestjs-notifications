import 'reflect-metadata';
import { MikroORM } from '@mikro-orm/core';
import { MySqlContainer, type StartedMySqlContainer } from '@testcontainers/mysql';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isDockerAvailable } from '../../../test-contracts/docker';
import { runNotificationStoreContract } from '../../../test-contracts/notification-store.contract';
import { runPendingDigestStoreContract } from '../../../test-contracts/pending-digest-store.contract';
import { type DbConnection, makeMikroOrmNotificationStoreContext } from './contract.testkit';
import { MikroOrmNotificationStore } from './mikro-orm-notification.store';
import { MikroOrmPendingDigestStore } from './mikro-orm-pending-digest.store';
import { notificationEntity } from './notification.entity';
import { makeMikroOrmPendingDigestStoreContext } from './pending-digest.contract.testkit';
import { digestWindowEntity, pendingDigestEntity } from './pending-digest.entity';

// The `schema` option on real engines: the connection keeps its default schema (Postgres `public`,
// MySQL the connection's database), and every table lands in `notif_lib` only.
const describeIfDocker = isDockerAvailable() ? describe : describe.skip;
const SCHEMA = 'notif_lib';
const TABLES = [
  'notification_digest_windows',
  'notification_pending_digests',
  'notifications',
  'notifications_schema_meta',
];

for (const engine of ['postgres', 'mysql'] as const) {
  describeIfDocker(`MikroORM schema option (${engine})`, () => {
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

    runNotificationStoreContract(`MikroORM (${engine}, schema)`, () =>
      makeMikroOrmNotificationStoreContext(engine, connection, SCHEMA),
    );
    runPendingDigestStoreContract(`MikroORM (${engine}, schema)`, () =>
      makeMikroOrmPendingDigestStoreContext(engine, connection, SCHEMA),
    );

    async function boot(): Promise<MikroORM> {
      const driver =
        engine === 'postgres'
          ? (await import('@mikro-orm/postgresql')).PostgreSqlDriver
          : (await import('@mikro-orm/mysql')).MySqlDriver;
      return MikroORM.init({
        driver,
        host: connection.host,
        port: connection.port,
        user: connection.username,
        password: connection.password,
        dbName: connection.database,
        entities: [
          notificationEntity({ schema: SCHEMA }),
          pendingDigestEntity({ schema: SCHEMA }),
          digestWindowEntity({ schema: SCHEMA }),
        ],
      } as Parameters<typeof MikroORM.init>[0]);
    }

    async function tablesIn(orm: MikroORM, schema: string): Promise<string[]> {
      const rows: Array<{ name: string }> = await orm.em
        .getConnection()
        .execute(
          'select table_name as name from information_schema.tables where table_schema = ?',
          [schema],
          'all',
        );
      return rows.map((r) => r.name).sort();
    }

    it('keeps every table in the schema, none in the default one; a second boot heals nothing', async () => {
      const orm = await boot();
      try {
        const store = new MikroOrmNotificationStore(orm.em, { schema: SCHEMA });
        await store.ensureSchema();
        await new MikroOrmPendingDigestStore(orm.em, { schema: SCHEMA }).ensureSchema();
        expect(await tablesIn(orm, SCHEMA)).toEqual(TABLES);
        const fallback = engine === 'postgres' ? 'public' : connection.database;
        expect(await tablesIn(orm, fallback)).toEqual([]);
        // The heal sees the existing tables (MySQL: in the other database) and has nothing to do.
        const { notificationsSchemaSql } = await import('./schema');
        const { pendingDigestSchemaSql } = await import('./pending-digest.schema');
        expect(await notificationsSchemaSql(orm.em, { schema: SCHEMA })).toBe('');
        expect(await pendingDigestSchemaSql(orm.em, { schema: SCHEMA })).toBe('');
        if (engine === 'postgres') {
          const indexes: Array<{ schemaname: string }> = await orm.em
            .getConnection()
            .execute(
              `select schemaname from pg_indexes where indexname = 'notifications_notifiable_idx'`,
              [],
              'all',
            );
          expect(indexes.map((i) => i.schemaname)).toEqual([SCHEMA]);
        }
      } finally {
        await orm.close(true);
      }
    });

    it('adds a dropped column back inside the schema after a fingerprint change', async () => {
      const orm = await boot();
      try {
        const q = (n: string) => orm.em.getPlatform().quoteIdentifier(n);
        await orm.em
          .getConnection()
          .execute(`alter table ${q(SCHEMA)}.${q('notifications')} drop column ${q('trace_id')}`);
        await orm.em
          .getConnection()
          .execute(`delete from ${q(SCHEMA)}.${q('notifications_schema_meta')}`);
        await new MikroOrmNotificationStore(orm.em, { schema: SCHEMA }).ensureSchema();
        const cols: Array<{ name: string }> = await orm.em
          .getConnection()
          .execute(
            `select column_name as name from information_schema.columns where table_schema = ? and table_name = 'notifications'`,
            [SCHEMA],
            'all',
          );
        expect(cols.map((c) => c.name)).toContain('trace_id');
      } finally {
        await orm.close(true);
      }
    });

    it('runs inside an app transaction', async () => {
      const orm = await boot();
      try {
        await orm.em.transactional(async (em) => {
          const store = new MikroOrmNotificationStore(em, { schema: SCHEMA });
          await store.save({
            type: 'Tx',
            notifiableType: 'User',
            notifiableId: 'tx',
            data: {},
            tenantId: null,
          });
        });
        const store = new MikroOrmNotificationStore(orm.em, { schema: SCHEMA });
        expect((await store.getForNotifiable('User', 'tx')).map((r) => r.type)).toEqual(['Tx']);
      } finally {
        await orm.close(true);
      }
    });
  });
}
