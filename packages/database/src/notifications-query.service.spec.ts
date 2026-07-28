import type { Notifiable, NotifiableRef } from '@dudousxd/nestjs-notifications-core';
import { Logger } from '@nestjs/common';
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

/**
 * Ownership enforcement on the two per-id mutations. Without it, `DELETE /notifications/:id` acts
 * on any id the caller can name — the controller passes the resolved ref precisely so it can't.
 */
describe('NotificationsQueryService ownership enforcement', () => {
  const other: NotifiableRef = { type: 'User', id: '99' };

  beforeEach(() => {
    NotificationsQueryService.resetOwnershipWarning();
  });

  describe('with a store implementing the scoped mutations (deleteOwned/markAsReadOwned)', () => {
    it('delete() removes the caller’s own notification', async () => {
      const store = new InMemoryStore();
      const svc = new NotificationsQueryService(store);
      const { a } = await seed(store);

      await svc.delete(a.id, ref);

      expect(await store.findById(a.id)).toBeNull();
    });

    it('delete() throws NotFoundException for another notifiable’s row and leaves it intact', async () => {
      const store = new InMemoryStore();
      const svc = new NotificationsQueryService(store);
      const { a } = await seed(store);

      await expect(svc.delete(a.id, other)).rejects.toMatchObject({ status: 404 });
      expect(await store.findById(a.id)).not.toBeNull();
    });

    it('delete() prefers the scoped store method over a read-then-write', async () => {
      const store = new InMemoryStore();
      const deleteOwned = vi.spyOn(store, 'deleteOwned');
      const findById = vi.spyOn(store, 'findById');
      const svc = new NotificationsQueryService(store);
      const { a } = await seed(store);

      await svc.delete(a.id, ref);

      expect(deleteOwned).toHaveBeenCalledWith(a.id, {
        notifiableType: 'User',
        notifiableId: '42',
        tenantId: undefined,
      });
      expect(findById).not.toHaveBeenCalled();
    });

    it('markAsRead() throws NotFoundException for another notifiable’s row and leaves it unread', async () => {
      const store = new InMemoryStore();
      const svc = new NotificationsQueryService(store);
      const { a } = await seed(store);

      await expect(svc.markAsRead(a.id, other)).rejects.toMatchObject({ status: 404 });
      expect((await store.findById(a.id))?.readAt).toBeNull();
    });

    it('markAsRead() does not broadcast a read event when ownership fails', async () => {
      const store = new InMemoryStore();
      const publishRead = vi.fn();
      const svc = new NotificationsQueryService(store, { publishRead });
      const { a } = await seed(store);

      await expect(svc.markAsRead(a.id, other)).rejects.toMatchObject({ status: 404 });
      expect(publishRead).not.toHaveBeenCalled();
    });

    it('markAsRead() still broadcasts for the rightful owner', async () => {
      const store = new InMemoryStore();
      const publishRead = vi.fn();
      const svc = new NotificationsQueryService(store, { publishRead });
      const { a } = await seed(store);

      await svc.markAsRead(a.id, ref);

      expect((await store.findById(a.id))?.readAt).not.toBeNull();
      expect(publishRead).toHaveBeenCalledTimes(1);
    });
  });

  describe('without a target (programmatic callers)', () => {
    it('delete() stays unscoped, preserving the existing contract', async () => {
      const store = new InMemoryStore();
      const deleteOwned = vi.spyOn(store, 'deleteOwned');
      const svc = new NotificationsQueryService(store);
      const { a } = await seed(store);

      await svc.delete(a.id);

      expect(await store.findById(a.id)).toBeNull();
      expect(deleteOwned).not.toHaveBeenCalled();
    });

    it('markAsRead() stays unscoped', async () => {
      const store = new InMemoryStore();
      const svc = new NotificationsQueryService(store);
      const { a } = await seed(store);

      await svc.markAsRead(a.id);

      expect((await store.findById(a.id))?.readAt).not.toBeNull();
    });
  });

  describe('with a store implementing only findById', () => {
    /** A store with the required methods plus findById, but no scoped mutations. */
    function findByIdOnlyStore() {
      const backing = new InMemoryStore();
      const store: NotificationStore = {
        save: (n) => backing.save(n),
        markAsRead: (id) => backing.markAsRead(id),
        markAllAsRead: (t, i, tid) => backing.markAllAsRead(t, i, tid),
        getForNotifiable: (t, i, tid, types) => backing.getForNotifiable(t, i, tid, types),
        getUnread: (t, i, tid, types) => backing.getUnread(t, i, tid, types),
        delete: (id) => backing.delete(id),
        findById: (id) => backing.findById(id),
      };
      return { store, backing };
    }

    it('delete() falls back to a read-then-write and allows the owner', async () => {
      const { store, backing } = findByIdOnlyStore();
      const svc = new NotificationsQueryService(store);
      const { a } = await seed(backing);

      await svc.delete(a.id, ref);

      expect(await backing.findById(a.id)).toBeNull();
    });

    it('delete() throws NotFoundException for another notifiable’s row', async () => {
      const { store, backing } = findByIdOnlyStore();
      const svc = new NotificationsQueryService(store);
      const { a } = await seed(backing);

      await expect(svc.delete(a.id, other)).rejects.toMatchObject({ status: 404 });
      expect(await backing.findById(a.id)).not.toBeNull();
    });

    it('delete() throws NotFoundException for an id that does not exist', async () => {
      const { store } = findByIdOnlyStore();
      const svc = new NotificationsQueryService(store);

      await expect(svc.delete('missing', ref)).rejects.toMatchObject({ status: 404 });
    });

    it('markAsRead() throws NotFoundException for another notifiable’s row', async () => {
      const { store, backing } = findByIdOnlyStore();
      const svc = new NotificationsQueryService(store);
      const { a } = await seed(backing);

      await expect(svc.markAsRead(a.id, other)).rejects.toMatchObject({ status: 404 });
      expect((await backing.findById(a.id))?.readAt).toBeNull();
    });

    it('rejects a row owned by the same notifiable in another tenant', async () => {
      const { store, backing } = findByIdOnlyStore();
      const svc = new NotificationsQueryService(store);
      const row = await backing.save({
        type: 'Scoped',
        notifiableType: 'User',
        notifiableId: '42',
        tenantId: 'acme',
        data: {},
      });

      await expect(svc.forTenant('other-tenant').delete(row.id, ref)).rejects.toMatchObject({
        status: 404,
      });
      expect(await backing.findById(row.id)).not.toBeNull();
    });
  });

  describe('with a store that can enforce nothing', () => {
    /** The bare minimum NotificationStore — no scoped mutations, no findById. */
    function minimalStore() {
      const backing = new InMemoryStore();
      const store: NotificationStore = {
        save: (n) => backing.save(n),
        markAsRead: (id) => backing.markAsRead(id),
        markAllAsRead: (t, i, tid) => backing.markAllAsRead(t, i, tid),
        getForNotifiable: (t, i, tid, types) => backing.getForNotifiable(t, i, tid, types),
        getUnread: (t, i, tid, types) => backing.getUnread(t, i, tid, types),
        delete: (id) => backing.delete(id),
      };
      return { store, backing };
    }

    it('degrades to the unchecked mutation but warns about it', async () => {
      const { store, backing } = minimalStore();
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const svc = new NotificationsQueryService(store);
      const { a } = await seed(backing);

      await svc.delete(a.id, other);

      expect(await backing.findById(a.id)).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toContain('ownership cannot be verified');
    });

    it('warns only once per process, not per request', async () => {
      const { store, backing } = minimalStore();
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const svc = new NotificationsQueryService(store);
      const { a, b } = await seed(backing);

      await svc.delete(a.id, ref);
      await svc.delete(b.id, ref);

      expect(warn).toHaveBeenCalledTimes(1);
    });
  });
});
