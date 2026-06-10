import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
});
