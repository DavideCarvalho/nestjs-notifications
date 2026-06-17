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

  it('scopes reads by tenant when a tenantId is provided', async () => {
    const t1 = await store.save({
      type: 'T1',
      notifiableType: 'User',
      notifiableId: 'tenant-user',
      tenantId: 'tenant-1',
      data: { n: 1 },
    });
    await store.save({
      type: 'T2',
      notifiableType: 'User',
      notifiableId: 'tenant-user',
      tenantId: 'tenant-2',
      data: { n: 2 },
    });

    // tenantId persists round-trip
    expect(t1.tenantId).toBe('tenant-1');

    // filtering by tenant-1 returns only its row
    const forTenant1 = await store.getForNotifiable('User', 'tenant-user', 'tenant-1');
    expect(forTenant1.map((r) => r.type)).toEqual(['T1']);

    // reading another tenant returns nothing
    expect(await store.getForNotifiable('User', 'tenant-user', 'nope')).toHaveLength(0);

    // unfiltered read returns both tenants' rows
    const unscoped = await store.getForNotifiable('User', 'tenant-user');
    expect(unscoped.map((r) => r.type).sort()).toEqual(['T1', 'T2']);

    // getUnread + markAllAsRead respect the tenant filter
    expect((await store.getUnread('User', 'tenant-user', 'tenant-1')).map((r) => r.type)).toEqual([
      'T1',
    ]);
    await store.markAllAsRead('User', 'tenant-user', 'tenant-1');
    expect(await store.getUnread('User', 'tenant-user', 'tenant-1')).toHaveLength(0);
    expect(await store.getUnread('User', 'tenant-user', 'tenant-2')).toHaveLength(1);
  });

  it('persists captured causer/trace columns round-trip; null when omitted', async () => {
    const withContext = await store.save({
      type: 'WithContext',
      notifiableType: 'User',
      notifiableId: 'causer-user',
      data: { n: 1 },
      causerType: 'Admin',
      causerId: '7',
      traceId: 'tx-9',
    });
    expect(withContext.causerType).toBe('Admin');
    expect(withContext.causerId).toBe('7');
    expect(withContext.traceId).toBe('tx-9');

    const [row] = await store.getForNotifiable('User', 'causer-user');
    expect(row?.causerType).toBe('Admin');
    expect(row?.causerId).toBe('7');
    expect(row?.traceId).toBe('tx-9');

    // omitted → null (old rows / no-context sends stay back-compat)
    const without = await store.save({
      type: 'NoContext',
      notifiableType: 'User',
      notifiableId: 'plain-user',
      data: { n: 2 },
    });
    expect(without.causerType).toBeNull();
    expect(without.causerId).toBeNull();
    expect(without.traceId).toBeNull();
  });
});

function delay(ms = 5): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
