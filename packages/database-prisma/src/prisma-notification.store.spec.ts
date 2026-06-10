import { describe, expect, it, vi } from 'vitest';
import type { PrismaNotificationClientLike } from './prisma-client';
import { PrismaNotificationStore } from './prisma-notification.store';

function makeClient() {
  const notification = {
    create: vi.fn(async (args: { data: any }) => ({
      ...args.data,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    })),
    update: vi.fn(async () => ({})),
    updateMany: vi.fn(async () => ({ count: 0 })),
    findMany: vi.fn(async () => [] as any[]),
    delete: vi.fn(async () => ({})),
  };
  return { client: { notification }, notification };
}

describe('PrismaNotificationStore', () => {
  it('save() returns a full StoredNotification', async () => {
    const { client, notification } = makeClient();
    const store = new PrismaNotificationStore(client as unknown as PrismaNotificationClientLike);

    const result = await store.save({
      type: 'InvoicePaid',
      notifiableType: 'User',
      notifiableId: '42',
      data: { amount: 100 },
    });

    expect(notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'InvoicePaid', readAt: null }),
    });
    expect(result.id).toEqual(expect.any(String));
    expect(result.type).toBe('InvoicePaid');
    expect(result.notifiableType).toBe('User');
    expect(result.notifiableId).toBe('42');
    expect(result.data).toEqual({ amount: 100 });
    expect(result.readAt).toBeNull();
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it('getUnread() queries with readAt null ordered by createdAt desc', async () => {
    const { client, notification } = makeClient();
    notification.findMany.mockResolvedValueOnce([
      {
        id: 'n1',
        type: 'InvoicePaid',
        notifiableType: 'User',
        notifiableId: '42',
        data: { amount: 100 },
        readAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const store = new PrismaNotificationStore(client as unknown as PrismaNotificationClientLike);

    const rows = await store.getUnread('User', '42');

    expect(notification.findMany).toHaveBeenCalledWith({
      where: { notifiableType: 'User', notifiableId: '42', readAt: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.readAt).toBeNull();
  });

  it('markAllAsRead() updates only unread rows for the notifiable', async () => {
    const { client, notification } = makeClient();
    const store = new PrismaNotificationStore(client as unknown as PrismaNotificationClientLike);

    await store.markAllAsRead('User', '42');

    expect(notification.updateMany).toHaveBeenCalledWith({
      where: { notifiableType: 'User', notifiableId: '42', readAt: null },
      data: expect.objectContaining({ readAt: expect.any(Date) }),
    });
  });

  it('delete() deletes by id', async () => {
    const { client, notification } = makeClient();
    const store = new PrismaNotificationStore(client as unknown as PrismaNotificationClientLike);

    await store.delete('abc');

    expect(notification.delete).toHaveBeenCalledWith({ where: { id: 'abc' } });
  });
});
