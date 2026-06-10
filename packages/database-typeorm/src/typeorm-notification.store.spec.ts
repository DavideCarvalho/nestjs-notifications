import type { Repository } from 'typeorm';
import { IsNull } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import type { NotificationEntity } from './notification.entity';
import { TypeOrmNotificationStore } from './typeorm-notification.store';

function makeRepo() {
  return {
    create: vi.fn((input: Partial<NotificationEntity>) => input as NotificationEntity),
    save: vi.fn(async (entity: NotificationEntity) => ({
      ...entity,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    })),
    find: vi.fn(async () => [] as NotificationEntity[]),
    update: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
  };
}

describe('TypeOrmNotificationStore', () => {
  it('save() returns a full StoredNotification', async () => {
    const repo = makeRepo();
    const store = new TypeOrmNotificationStore(repo as unknown as Repository<NotificationEntity>);

    const result = await store.save({
      type: 'InvoicePaid',
      notifiableType: 'User',
      notifiableId: '42',
      data: { amount: 100 },
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'InvoicePaid', readAt: null }),
    );
    expect(repo.save).toHaveBeenCalled();
    expect(result.id).toEqual(expect.any(String));
    expect(result.type).toBe('InvoicePaid');
    expect(result.notifiableType).toBe('User');
    expect(result.notifiableId).toBe('42');
    expect(result.data).toEqual({ amount: 100 });
    expect(result.readAt).toBeNull();
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it('getUnread() queries with readAt IsNull', async () => {
    const repo = makeRepo();
    const store = new TypeOrmNotificationStore(repo as unknown as Repository<NotificationEntity>);

    await store.getUnread('User', '42');

    expect(repo.find).toHaveBeenCalledWith({
      where: { notifiableType: 'User', notifiableId: '42', readAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  });

  it('markAllAsRead() updates only unread rows for the notifiable', async () => {
    const repo = makeRepo();
    const store = new TypeOrmNotificationStore(repo as unknown as Repository<NotificationEntity>);

    await store.markAllAsRead('User', '42');

    expect(repo.update).toHaveBeenCalledWith(
      { notifiableType: 'User', notifiableId: '42', readAt: IsNull() },
      expect.objectContaining({ readAt: expect.any(Date) }),
    );
  });
});
