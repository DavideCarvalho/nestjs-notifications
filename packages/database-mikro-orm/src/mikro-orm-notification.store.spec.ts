import type { EntityManager } from '@mikro-orm/core';
import { describe, expect, it, vi } from 'vitest';
import { MikroOrmNotificationStore } from './mikro-orm-notification.store';
import { NotificationEntity } from './notification.entity';

function makeEm() {
  const inner = {
    create: vi.fn((_entity: unknown, data: Partial<NotificationEntity>) => ({
      ...data,
    })),
    // v7 dropped `persistAndFlush`; the store now does `em.persist(x).flush()`.
    flush: vi.fn(async () => undefined),
    persist: vi.fn(function (this: unknown) {
      return inner;
    }),
    find: vi.fn(async () => [] as NotificationEntity[]),
    nativeUpdate: vi.fn(async () => 0),
    nativeDelete: vi.fn(async () => 0),
  };
  const em = {
    ...inner,
    fork: vi.fn(() => inner),
  };
  return { em, inner };
}

describe('MikroOrmNotificationStore', () => {
  it('save() returns a full StoredNotification', async () => {
    const { em, inner } = makeEm();
    const store = new MikroOrmNotificationStore(em as unknown as EntityManager);

    const result = await store.save({
      type: 'InvoicePaid',
      notifiableType: 'User',
      notifiableId: '42',
      data: { amount: 100 },
    });

    expect(inner.create).toHaveBeenCalledWith(
      NotificationEntity,
      expect.objectContaining({ type: 'InvoicePaid', readAt: null }),
    );
    expect(inner.persist).toHaveBeenCalled();
    expect(result.id).toEqual(expect.any(String));
    expect(result.type).toBe('InvoicePaid');
    expect(result.notifiableType).toBe('User');
    expect(result.notifiableId).toBe('42');
    expect(result.data).toEqual({ amount: 100 });
    expect(result.readAt).toBeNull();
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it('getUnread() queries with readAt null', async () => {
    const { em, inner } = makeEm();
    const store = new MikroOrmNotificationStore(em as unknown as EntityManager);

    await store.getUnread('User', '42');

    expect(inner.find).toHaveBeenCalledWith(
      NotificationEntity,
      { notifiableType: 'User', notifiableId: '42', readAt: null },
      { orderBy: { createdAt: 'DESC' } },
    );
  });

  it('getUnread() adds the tenant filter when a tenantId is given', async () => {
    const { em, inner } = makeEm();
    const store = new MikroOrmNotificationStore(em as unknown as EntityManager);

    await store.getUnread('User', '42', 'tenant-1');

    expect(inner.find).toHaveBeenCalledWith(
      NotificationEntity,
      { notifiableType: 'User', notifiableId: '42', tenantId: 'tenant-1', readAt: null },
      { orderBy: { createdAt: 'DESC' } },
    );
  });

  it('delete() issues a nativeDelete by id', async () => {
    const { em } = makeEm();
    const store = new MikroOrmNotificationStore(em as unknown as EntityManager);

    await store.delete('abc');

    expect(em.nativeDelete).toHaveBeenCalledWith(NotificationEntity, { id: 'abc' });
  });
});
