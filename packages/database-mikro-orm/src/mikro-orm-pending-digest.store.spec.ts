import type { EntityManager } from '@mikro-orm/core';
import { describe, expect, it, vi } from 'vitest';
import { MikroOrmPendingDigestStore } from './mikro-orm-pending-digest.store';
import type { PendingDigestEntity } from './pending-digest.entity';

/**
 * Builds a fake forked EntityManager whose `find` returns the given rows and whose `create`/`persist`
 * captures created entities. `flush` throws when a created window id was already seen, mirroring a
 * unique-key violation for the idempotency lock.
 */
function makeEm(rows: PendingDigestEntity[] = []) {
  const seenWindows = new Set<string>();
  const created: any[] = [];
  let lastFlushThrows = false;

  const fork = {
    create: vi.fn((_entity: unknown, data: any) => {
      // window rows have a `ranAt`; detect a duplicate id for the lock semantics
      if ('ranAt' in data) {
        if (seenWindows.has(data.id)) lastFlushThrows = true;
        else seenWindows.add(data.id);
      }
      created.push(data);
      return data;
    }),
    persist: vi.fn(function persist(this: any) {
      return this;
    }),
    flush: vi.fn(async () => {
      if (lastFlushThrows) {
        lastFlushThrows = false;
        throw new Error('duplicate key');
      }
    }),
    find: vi.fn(async () => rows),
  };

  const em = {
    fork: vi.fn(() => fork),
    nativeDelete: vi.fn(async () => 0),
  };
  return { em, fork, created };
}

function make(rows: PendingDigestEntity[] = []) {
  const { em, fork, created } = makeEm(rows);
  const store = new MikroOrmPendingDigestStore(em as unknown as EntityManager);
  return { store, em, fork, created };
}

describe('MikroOrmPendingDigestStore', () => {
  it('enqueue() persists a row with the serialized notification', async () => {
    const { store, created } = make();
    await store.enqueue({
      notifiable: { type: 'User', id: '7' },
      tenantId: 'acme',
      category: 'billing',
      cadence: 'daily',
      notification: { name: 'InvoicePaid', data: { amount: 10 } },
    });
    expect(created[0]).toEqual(
      expect.objectContaining({
        cadence: 'daily',
        notifiableType: 'User',
        notifiableId: '7',
        tenantId: 'acme',
        category: 'billing',
        notificationName: 'InvoicePaid',
        notificationData: { amount: 10 },
      }),
    );
  });

  it('listGroups() groups rows by (tenant, notifiable, category, cadence)', async () => {
    const rows: PendingDigestEntity[] = [
      row('1', 'User', '1', null, 'billing', 'daily', 'A'),
      row('2', 'User', '1', null, 'billing', 'daily', 'B'),
      row('3', 'User', '2', null, 'billing', 'daily', 'C'),
    ];
    const { store } = make(rows);
    const groups = await store.listGroups('daily');
    expect(groups).toHaveLength(2);
    const forUser1 = groups.find((g) => g.notifiable.id === '1');
    expect(forUser1?.entries).toHaveLength(2);
  });

  it('clear() deletes by id (and no-ops on empty)', async () => {
    const { store, em } = make();
    await store.clear([]);
    expect(em.nativeDelete).not.toHaveBeenCalled();
    await store.clear(['a', 'b']);
    expect(em.nativeDelete).toHaveBeenCalledTimes(1);
  });

  it('tryLockWindow() returns true once, false on a duplicate window', async () => {
    const { store } = make();
    expect(await store.tryLockWindow('daily', '2026-06-17')).toBe(true);
    expect(await store.tryLockWindow('daily', '2026-06-17')).toBe(false);
    expect(await store.tryLockWindow('weekly', '2026-06-17')).toBe(true);
  });
});

function row(
  id: string,
  notifiableType: string,
  notifiableId: string,
  tenantId: string | null,
  category: string,
  cadence: string,
  payload: string,
): PendingDigestEntity {
  return {
    id,
    cadence,
    notifiableType,
    notifiableId,
    tenantId,
    category,
    notificationName: 'InvoicePaid',
    notificationData: { payload },
    createdAt: new Date(),
  };
}
