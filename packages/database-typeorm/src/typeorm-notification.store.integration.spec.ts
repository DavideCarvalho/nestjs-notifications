import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotificationEntity } from './notification.entity';
import { TypeOrmNotificationStore } from './typeorm-notification.store';

describe('TypeOrmNotificationStore (integration, sqlite)', () => {
  let dataSource: DataSource;
  let store: TypeOrmNotificationStore;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [NotificationEntity],
      synchronize: true,
    });
    await dataSource.initialize();
    store = new TypeOrmNotificationStore(dataSource.getRepository(NotificationEntity));
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('runs the full lifecycle against a real database', async () => {
    // save (in order; createdAt drives DESC ordering)
    const a = await store.save({
      type: 'A',
      notifiableType: 'User',
      notifiableId: '42',
      data: { n: 1 },
    });
    // Ensure distinct createdAt for deterministic ordering.
    await delay();
    const b = await store.save({
      type: 'B',
      notifiableType: 'User',
      notifiableId: '42',
      data: { n: 2 },
    });
    await delay();
    const c = await store.save({
      type: 'C',
      notifiableType: 'User',
      notifiableId: '42',
      data: { n: 3 },
    });
    // A row for a different notifiable, to prove scoping.
    await store.save({
      type: 'X',
      notifiableType: 'User',
      notifiableId: '99',
      data: { n: 9 },
    });

    expect(a.id).toEqual(expect.any(String));
    expect(a.readAt).toBeNull();
    expect(a.createdAt).toBeInstanceOf(Date);

    // getForNotifiable — scoped + newest-first
    const all = await store.getForNotifiable('User', '42');
    expect(all.map((r) => r.type)).toEqual(['C', 'B', 'A']);
    expect(all.every((r) => r.notifiableId === '42')).toBe(true);
    // payload round-trips through JSON column
    expect(all.find((r) => r.id === b.id)?.data).toEqual({ n: 2 });

    // getUnread — all unread initially
    expect((await store.getUnread('User', '42')).map((r) => r.type)).toEqual(['C', 'B', 'A']);

    // markAsRead — single row
    await store.markAsRead(b.id);
    const afterRead = await store.getForNotifiable('User', '42');
    expect(afterRead.find((r) => r.id === b.id)?.readAt).toBeInstanceOf(Date);
    expect((await store.getUnread('User', '42')).map((r) => r.type)).toEqual(['C', 'A']);

    // markAllAsRead — clears the rest for this notifiable only
    await store.markAllAsRead('User', '42');
    expect(await store.getUnread('User', '42')).toHaveLength(0);
    expect(await store.getUnread('User', '99')).toHaveLength(1);

    // delete — removes one row
    await store.delete(c.id);
    const afterDelete = await store.getForNotifiable('User', '42');
    expect(afterDelete.map((r) => r.type)).toEqual(['B', 'A']);
  });
});

function delay(ms = 5): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
