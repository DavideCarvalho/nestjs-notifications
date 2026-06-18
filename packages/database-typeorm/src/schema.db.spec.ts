import 'reflect-metadata';
import { MySqlContainer, type StartedMySqlContainer } from '@testcontainers/mysql';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { isDockerAvailable } from '../../../test-contracts/docker';
import { type DbConnection, type SqlDialect } from './contract.testkit';
import { NotificationEntity } from './notification.entity';
import { TypeOrmNotificationStore } from './typeorm-notification.store';

// THE blind spot REVIEW.md flagged: the non-destructive schema-ensure / column-add path and the
// `typeorm/schema-builder/util/TableUtils` deep-import, validated against REAL Postgres + MySQL —
// where DDL semantics (ADD COLUMN of a NOT-NULL-no-default on a populated table) actually differ
// from SQLite's forgiving engine.
const describeIfDocker = isDockerAvailable() ? describe : describe.skip;

function newDataSource(dialect: SqlDialect, connection: DbConnection): DataSource {
  if (dialect === 'postgres') {
    return new DataSource({
      type: 'postgres',
      ...connection,
      entities: [NotificationEntity],
      synchronize: false,
    });
  }
  return new DataSource({
    type: 'mysql',
    ...connection,
    timezone: 'Z',
    entities: [NotificationEntity],
    synchronize: false,
  });
}

function schemaSuite(dialect: SqlDialect, getConn: () => DbConnection): void {
  describe(`${dialect}`, () => {
    let dataSource: DataSource;
    let store: TypeOrmNotificationStore;

    beforeAll(async () => {
      dataSource = newDataSource(dialect, getConn());
      await dataSource.initialize();
      store = new TypeOrmNotificationStore(dataSource.getRepository(NotificationEntity));
    });

    afterAll(async () => {
      await dataSource?.destroy();
    });

    it('creates the table on demand, idempotently, then CRUD works', async () => {
      const qr = dataSource.createQueryRunner();
      expect(await qr.hasTable('notifications')).toBe(false);
      await qr.release();

      await store.ensureSchema();
      await store.ensureSchema(); // idempotent

      const qr2 = dataSource.createQueryRunner();
      expect(await qr2.hasTable('notifications')).toBe(true);
      await qr2.release();

      const saved = await store.save({
        type: 'Welcome',
        notifiableType: 'User',
        notifiableId: '1',
        data: { hi: true },
      });
      expect(saved.id).toEqual(expect.any(String));
      const rows = await store.getForNotifiable('User', '1');
      expect(rows).toHaveLength(1);
      expect(rows[0]?.data).toEqual({ hi: true });
    });

    it('non-destructively adds a nullable column missing from an existing table, keeping data intact', async () => {
      // Simulate an older deployment by dropping a nullable column the entity expects.
      const dropQr = dataSource.createQueryRunner();
      expect((await dropQr.getTable('notifications'))?.findColumnByName('tenantId')).toBeDefined();
      await dropQr.dropColumn('notifications', 'tenantId');
      expect(
        (await dropQr.getTable('notifications'))?.findColumnByName('tenantId'),
      ).toBeUndefined();
      const existing = await dropQr.query('SELECT id FROM notifications');
      expect(existing.length).toBeGreaterThan(0);
      await dropQr.release();

      // ensureSchema ADDs the column back without recreating/wiping the table — this is the live
      // TableUtils.createTableColumnOptions(column, driver) path on a real engine.
      await store.ensureSchema();
      await store.ensureSchema(); // idempotent once back

      const checkQr = dataSource.createQueryRunner();
      const repaired = await checkQr.getTable('notifications');
      const tenantColumn = repaired?.findColumnByName('tenantId');
      expect(tenantColumn).toBeDefined();
      expect(tenantColumn?.isNullable).toBe(true);
      await checkQr.release();

      // Round-trips through the re-added column.
      const withTenant = await store.save({
        type: 'Tenant',
        notifiableType: 'User',
        notifiableId: '2',
        tenantId: 'acme',
        data: { ok: true },
      });
      expect(withTenant.tenantId).toBe('acme');
    });

    it('self-heals the captured-context columns added after v1', async () => {
      const dropQr = dataSource.createQueryRunner();
      for (const col of ['causerType', 'causerId', 'traceId']) {
        expect((await dropQr.getTable('notifications'))?.findColumnByName(col)).toBeDefined();
        await dropQr.dropColumn('notifications', col);
        expect((await dropQr.getTable('notifications'))?.findColumnByName(col)).toBeUndefined();
      }
      await dropQr.release();

      await store.ensureSchema();

      const checkQr = dataSource.createQueryRunner();
      const repaired = await checkQr.getTable('notifications');
      for (const col of ['causerType', 'causerId', 'traceId']) {
        expect(repaired?.findColumnByName(col)?.isNullable).toBe(true);
      }
      await checkQr.release();

      const saved = await store.save({
        type: 'Audited',
        notifiableType: 'User',
        notifiableId: '3',
        data: { ok: true },
        causerType: 'Admin',
        causerId: '7',
        traceId: 'tx-9',
      });
      expect(saved.causerType).toBe('Admin');
      expect(saved.causerId).toBe('7');
      expect(saved.traceId).toBe('tx-9');
    });

    it('skips a missing NOT-NULL-no-default column on a populated table with a warning instead of throwing', async () => {
      // On a REAL engine, ADD COLUMN of a NOT NULL column with no default on a populated table is a
      // hard error. The guard must detect the populated table and skip with a clear warning — the
      // exact dialect-divergent behavior sqlite never exercised.
      const dropQr = dataSource.createQueryRunner();
      expect((await dropQr.getTable('notifications'))?.findColumnByName('type')).toBeDefined();
      const rowsBefore = await dropQr.query('SELECT COUNT(*) as count FROM notifications');
      expect(Number(rowsBefore[0].count)).toBeGreaterThan(0);
      await dropQr.dropColumn('notifications', 'type');
      expect((await dropQr.getTable('notifications'))?.findColumnByName('type')).toBeUndefined();
      await dropQr.release();

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        await expect(store.ensureSchema()).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalledTimes(1);
        const message = warn.mock.calls[0]?.[0] as string;
        expect(message).toContain('type');
        expect(message).toMatch(/manual migration/i);
      } finally {
        warn.mockRestore();
      }

      const checkQr = dataSource.createQueryRunner();
      expect((await checkQr.getTable('notifications'))?.findColumnByName('type')).toBeUndefined();
      const rowsAfter = await checkQr.query('SELECT COUNT(*) as count FROM notifications');
      expect(Number(rowsAfter[0].count)).toBe(Number(rowsBefore[0].count));
      await checkQr.release();
    });
  });
}

describeIfDocker('TypeOrmNotificationStore.ensureSchema real-engine matrix', () => {
  describe('postgres', () => {
    let container: StartedPostgreSqlContainer;
    const conn: { current?: DbConnection } = {};

    beforeAll(async () => {
      container = await new PostgreSqlContainer('postgres:16-alpine').start();
      conn.current = {
        host: container.getHost(),
        port: container.getPort(),
        username: container.getUsername(),
        password: container.getPassword(),
        database: container.getDatabase(),
      };
    });
    afterAll(async () => {
      await container?.stop();
    });

    schemaSuite('postgres', () => {
      if (!conn.current) throw new Error('postgres container not started');
      return conn.current;
    });
  });

  describe('mysql', () => {
    let container: StartedMySqlContainer;
    const conn: { current?: DbConnection } = {};

    beforeAll(async () => {
      container = await new MySqlContainer('mysql:8.0').start();
      conn.current = {
        host: container.getHost(),
        port: container.getPort(),
        username: container.getUsername(),
        password: container.getUserPassword(),
        database: container.getDatabase(),
      };
    });
    afterAll(async () => {
      await container?.stop();
    });

    schemaSuite('mysql', () => {
      if (!conn.current) throw new Error('mysql container not started');
      return conn.current;
    });
  });
});
