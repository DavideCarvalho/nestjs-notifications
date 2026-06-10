import type { Notifiable, NotifiableRef } from '@dudousxd/nestjs-notifications-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryStore } from './in-memory.store';
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
      page: 1,
      perPage: 2,
      total: 3,
    });
    expect(page1.items.map((r) => r.type)).toEqual(['C', 'B']);

    const page2 = await service.paginate(ref, { page: 2, perPage: 2 });
    expect(page2.items.map((r) => r.type)).toEqual(['A']);
    expect(page2.total).toBe(3);
  });

  it('paginate() defaults to page 1, perPage 20', async () => {
    await seed(store);
    const page = await service.paginate(ref);
    expect(page.page).toBe(1);
    expect(page.perPage).toBe(20);
    expect(page.items).toHaveLength(3);
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
