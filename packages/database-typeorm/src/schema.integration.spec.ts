import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NotificationEntity } from './notification.entity';
import { TypeOrmNotificationStore } from './typeorm-notification.store';

describe('TypeOrmNotificationStore.ensureSchema (integration, sqlite)', () => {
  let dataSource: DataSource;
  let store: TypeOrmNotificationStore;

  beforeAll(async () => {
    // synchronize: false — the table does NOT exist until ensureSchema() creates it.
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [NotificationEntity],
      synchronize: false,
    });
    await dataSource.initialize();
    store = new TypeOrmNotificationStore(dataSource.getRepository(NotificationEntity));
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('creates the table on demand, idempotently, then CRUD works', async () => {
    const qr = dataSource.createQueryRunner();
    expect(await qr.hasTable('notifications')).toBe(false);
    await qr.release();

    await store.ensureSchema();
    await store.ensureSchema(); // idempotent — no throw, no-op the second time

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

  it('non-destructively adds a column missing from an existing table, keeping data intact', async () => {
    // The previous test left the fully-shaped table populated with one row. Simulate an
    // older deployment by dropping a nullable column the entity expects ("tenantId").
    const dropQr = dataSource.createQueryRunner();
    const before = await dropQr.getTable('notifications');
    expect(before?.findColumnByName('tenantId')).toBeDefined();
    await dropQr.dropColumn('notifications', 'tenantId');
    const after = await dropQr.getTable('notifications');
    expect(after?.findColumnByName('tenantId')).toBeUndefined();
    // Existing row + its data survive the drop.
    const existingRows = await dropQr.query('SELECT id, data FROM notifications');
    expect(existingRows).toHaveLength(1);
    const survivingId = existingRows[0].id as string;
    await dropQr.release();

    // ensureSchema must ADD the missing column without recreating or wiping the table.
    await store.ensureSchema();
    await store.ensureSchema(); // idempotent once the column is back

    const checkQr = dataSource.createQueryRunner();
    const repaired = await checkQr.getTable('notifications');
    const tenantColumn = repaired?.findColumnByName('tenantId');
    expect(tenantColumn).toBeDefined();
    expect(tenantColumn?.isNullable).toBe(true);
    // The pre-existing row is untouched; the re-added column reads as NULL for it.
    const preservedRows = await checkQr.query(
      'SELECT id, tenantId FROM notifications WHERE id = ?',
      [survivingId],
    );
    expect(preservedRows).toHaveLength(1);
    expect(preservedRows[0].tenantId).toBeNull();
    await checkQr.release();

    // The store round-trips through the re-added column.
    const withTenant = await store.save({
      type: 'Tenant',
      notifiableType: 'User',
      notifiableId: '2',
      tenantId: 'acme',
      data: { ok: true },
    });
    expect(withTenant.tenantId).toBe('acme');
  });

  it('skips a missing NOT-NULL-no-default column on a populated table with a warning instead of throwing', async () => {
    // The table is populated from prior tests. Simulate an old deployment missing a column that the
    // entity declares NOT NULL with no default ("type") — `ADD COLUMN` of such a column on a table
    // that already holds rows is a raw DDL error that ensureSchema must NOT let surface.
    const dropQr = dataSource.createQueryRunner();
    expect((await dropQr.getTable('notifications'))?.findColumnByName('type')).toBeDefined();
    const rowsBefore = await dropQr.query('SELECT COUNT(*) as count FROM notifications');
    expect(Number(rowsBefore[0].count)).toBeGreaterThan(0); // populated
    await dropQr.dropColumn('notifications', 'type');
    expect((await dropQr.getTable('notifications'))?.findColumnByName('type')).toBeUndefined();
    await dropQr.release();

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      // Must NOT throw the opaque DDL error — it skips the column with a clear warning instead.
      await expect(store.ensureSchema()).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
      const message = warn.mock.calls[0]?.[0] as string;
      expect(message).toContain('type'); // names the offending column
      expect(message).toMatch(/manual migration/i); // tells the operator what to do
    } finally {
      warn.mockRestore();
    }

    // The column stays absent (it was skipped, not added) and the table is otherwise intact.
    const checkQr = dataSource.createQueryRunner();
    expect((await checkQr.getTable('notifications'))?.findColumnByName('type')).toBeUndefined();
    const rowsAfter = await checkQr.query('SELECT COUNT(*) as count FROM notifications');
    expect(Number(rowsAfter[0].count)).toBe(Number(rowsBefore[0].count)); // data untouched
    await checkQr.release();
  });
});
