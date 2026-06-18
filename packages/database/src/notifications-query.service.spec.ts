import type { Notifiable, NotifiableRef } from '@dudousxd/nestjs-notifications-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryStore } from './in-memory.store';
import type { NotificationStore } from './interfaces';
import { NotificationsQueryService } from './notifications-query.service';

const ref: NotifiableRef = { type: 'User', id: '42' };

const delay = (ms = 2) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function seed(store: InMemoryStore) {
  // Saved oldest-first; the store returns newest-first. Distinct createdAt keeps
  // ordering deterministic.
  const a = await store.save({
    type: 'A',
    notifiableType: 'User',
    notifiableId: '42',
    data: { n: 1 },
  });
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
  // A different notifiable, to prove scoping.
  await store.save({ type: 'X', notifiableType: 'User', notifiableId: '99', data: { n: 9 } });
  return { a, b, c };
}

describe('NotificationsQueryService', () => {
  let store: InMemoryStore;
  let service: NotificationsQueryService;

  beforeEach(() => {
    store = new InMemoryStore();
    service = new NotificationsQueryService(store);
  });

  it('all() returns only the target rows', async () => {
    await seed(store);
    const all = await service.all(ref);
    expect(all).toHaveLength(3);
    expect(all.every((r) => r.notifiableType === 'User' && r.notifiableId === '42')).toBe(true);
    expect(all.map((r) => r.type)).toEqual(['C', 'B', 'A']);
  });

  it('unread() and unreadCount() reflect read state', async () => {
    const { b } = await seed(store);
    expect(await service.unreadCount(ref)).toBe(3);

    await service.markAsRead(b.id);
    const unread = await service.unread(ref);
    expect(unread.map((r) => r.type)).toEqual(['C', 'A']);
    expect(await service.unreadCount(ref)).toBe(2);
  });

  it('paginate() slices over all() with totals', async () => {
    await seed(store);
    const page1 = await service.paginate(ref, { page: 1, perPage: 2 });
    expect(page1).toEqual({
      items: page1.items,
      meta: { page: 1, perPage: 2, total: 3, lastPage: 2 },
    });
    expect(page1.items.map((r) => r.type)).toEqual(['C', 'B']);

    const page2 = await service.paginate(ref, { page: 2, perPage: 2 });
    expect(page2.items.map((r) => r.type)).toEqual(['A']);
    expect(page2.meta.total).toBe(3);
    expect(page2.meta.lastPage).toBe(2);
  });

  it('paginate() defaults to page 1, perPage 20', async () => {
    await seed(store);
    const page = await service.paginate(ref);
    expect(page.meta.page).toBe(1);
    expect(page.meta.perPage).toBe(20);
    expect(page.items).toHaveLength(3);
  });

  it('paginate() pushes limit/offset down into the store', async () => {
    await seed(store);
    const spy = vi.spyOn(store, 'paginateForNotifiable');

    await service.paginate(ref, { page: 2, perPage: 2 });

    expect(spy).toHaveBeenCalledWith('User', '42', { limit: 2, offset: 2, tenantId: undefined });
  });

  it('paginate() scopes the store call to a tenant', async () => {
    const spy = vi.spyOn(store, 'paginateForNotifiable');
    await service.forTenant('ws-1').paginate(ref, { page: 1, perPage: 5 });
    expect(spy).toHaveBeenCalledWith('User', '42', { limit: 5, offset: 0, tenantId: 'ws-1' });
  });

  it('paginate() returns only one page from the store, not the full list', async () => {
    // A store that asserts it is never asked for the whole list — only a bounded page.
    const pageRows = [{ id: 'r1', type: 'C' } as never, { id: 'r2', type: 'B' } as never];
    const store: NotificationStore = {
      save: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      getForNotifiable: vi.fn(async () => {
        throw new Error('getForNotifiable must not be called when paginating');
      }),
      getUnread: vi.fn(),
      delete: vi.fn(),
      paginateForNotifiable: vi.fn(async () => ({ items: pageRows, total: 50 })),
    };
    const svc = new NotificationsQueryService(store);

    const page = await svc.paginate(ref, { page: 1, perPage: 2 });

    expect(store.paginateForNotifiable).toHaveBeenCalledWith('User', '42', {
      limit: 2,
      offset: 0,
      tenantId: undefined,
    });
    expect(store.getForNotifiable).not.toHaveBeenCalled();
    expect(page.items).toHaveLength(2);
    expect(page.meta).toEqual({ page: 1, perPage: 2, total: 50, lastPage: 25 });
  });

  it('paginate() falls back to in-memory slicing for stores without pushdown', async () => {
    // A legacy store that only implements the required methods.
    const rows = [
      { id: 'r1', type: 'C' } as never,
      { id: 'r2', type: 'B' } as never,
      { id: 'r3', type: 'A' } as never,
    ];
    const store: NotificationStore = {
      save: vi.fn(),
      markAsRead: vi.fn(),
      markAllAsRead: vi.fn(),
      getForNotifiable: vi.fn(async () => rows),
      getUnread: vi.fn(),
      delete: vi.fn(),
    };
    const svc = new NotificationsQueryService(store);

    const page = await svc.paginate(ref, { page: 2, perPage: 2 });

    expect(store.getForNotifiable).toHaveBeenCalled();
    expect(page.items).toHaveLength(1);
    expect(page.meta).toEqual({ page: 2, perPage: 2, total: 3, lastPage: 2 });
  });

  it('markAllAsRead() clears unread for the target only', async () => {
    await seed(store);
    await service.markAllAsRead(ref);
    expect(await service.unreadCount(ref)).toBe(0);
    // The other notifiable is untouched.
    expect(await service.unreadCount({ type: 'User', id: '99' })).toBe(1);
  });

  it('delete() removes one row', async () => {
    const { a } = await seed(store);
    await service.delete(a.id);
    const all = await service.all(ref);
    expect(all.map((r) => r.type)).toEqual(['C', 'B']);
  });

  it('resolves a Notifiable via toNotifiableRef() the same as a raw ref', async () => {
    await seed(store);
    const notifiable: Notifiable = {
      routeNotificationFor: () => undefined,
      toNotifiableRef: () => ({ type: 'User', id: '42' }),
    };

    const viaRef = await service.all(ref);
    const viaNotifiable = await service.all(notifiable);
    expect(viaNotifiable.map((r) => r.id)).toEqual(viaRef.map((r) => r.id));
    expect(await service.unreadCount(notifiable)).toBe(3);
  });

  it('throws when a notifiable has no ref', async () => {
    const notifiable: Notifiable = { routeNotificationFor: () => undefined };
    await expect(service.all(notifiable)).rejects.toThrow(/notifiable reference/);
  });
});

describe('NotificationsQueryService cross-device read sync', () => {
  it('does not publish when no publisher is bound (back-compat)', async () => {
    const store = new InMemoryStore();
    const svc = new NotificationsQueryService(store);
    const { a } = await seed(store);
    await svc.markAsRead(a.id, ref);
    expect((await svc.unread(ref)).map((n) => n.id)).not.toContain(a.id);
  });

  it('publishes a read event on markAsRead when a target is provided', async () => {
    const store = new InMemoryStore();
    const publishRead = vi.fn();
    const svc = new NotificationsQueryService(store, { publishRead });
    const { a } = await seed(store);

    await svc.markAsRead(a.id, ref);

    expect(publishRead).toHaveBeenCalledTimes(1);
    const event = publishRead.mock.calls[0]?.[0];
    expect(event).toMatchObject({ ref, notificationId: a.id });
    expect(typeof event.readAt).toBe('string');
  });

  it('does not publish on markAsRead without a target', async () => {
    const store = new InMemoryStore();
    const publishRead = vi.fn();
    const svc = new NotificationsQueryService(store, { publishRead });
    const { a } = await seed(store);

    await svc.markAsRead(a.id);
    expect(publishRead).not.toHaveBeenCalled();
  });

  it('publishes a "mark all read" event (notificationId null)', async () => {
    const store = new InMemoryStore();
    const publishRead = vi.fn();
    const svc = new NotificationsQueryService(store, { publishRead });
    await seed(store);

    await svc.markAllAsRead(ref);

    expect(publishRead).toHaveBeenCalledTimes(1);
    expect(publishRead.mock.calls[0]?.[0]).toMatchObject({ ref, notificationId: null });
  });

  it('forTenant scopes the published event tenant', async () => {
    const store = new InMemoryStore();
    const publishRead = vi.fn();
    const svc = new NotificationsQueryService(store, { publishRead });

    await svc.forTenant('acme').markAllAsRead(ref);
    expect(publishRead.mock.calls[0]?.[0]).toMatchObject({
      tenantId: 'acme',
      notificationId: null,
    });
  });
});
