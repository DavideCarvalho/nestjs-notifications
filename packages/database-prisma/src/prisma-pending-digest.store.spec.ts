import { describe, expect, it, vi } from 'vitest';
import type { PrismaPendingDigestClientLike } from './prisma-pending-digest-client';
import { PrismaPendingDigestStore } from './prisma-pending-digest.store';

/**
 * In-memory fake of the structural Prisma digest client. `pendingDigest.create` appends rows;
 * `findMany` filters by `cadence` and orders by `createdAt asc`; `deleteMany` removes by `id.in`.
 * `digestWindow.create` enforces a unique `id` (rejecting duplicates) to exercise the idempotency
 * lock — exactly the engine behaviour the real adapter relies on.
 */
function makeClient() {
  const rows: any[] = [];
  const windows = new Set<string>();
  const pendingDigest = {
    create: vi.fn(async (args: { data: any }) => {
      rows.push(args.data);
      return args.data;
    }),
    findMany: vi.fn(async (args: { where: any; orderBy?: any }) => {
      const filtered = rows.filter((r) => r.cadence === args.where.cadence);
      filtered.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return filtered;
    }),
    deleteMany: vi.fn(async (args: { where: any }) => {
      const ids: string[] = args.where.id.in;
      let count = 0;
      for (const id of ids) {
        const idx = rows.findIndex((r) => r.id === id);
        if (idx >= 0) {
          rows.splice(idx, 1);
          count++;
        }
      }
      return { count };
    }),
  };
  const digestWindow = {
    create: vi.fn(async (args: { data: any }) => {
      if (windows.has(args.data.id)) throw new Error('Unique constraint failed');
      windows.add(args.data.id);
      return args.data;
    }),
  };
  return { client: { pendingDigest, digestWindow }, pendingDigest, digestWindow, rows };
}

function make() {
  const fixture = makeClient();
  const store = new PrismaPendingDigestStore(
    fixture.client as unknown as PrismaPendingDigestClientLike,
  );
  return { store, ...fixture };
}

const ms = (n = 5): Promise<void> => new Promise((resolve) => setTimeout(resolve, n));

describe('PrismaPendingDigestStore', () => {
  it('enqueue() writes a row with the serialized notification + defaulted nulls', async () => {
    const { store, pendingDigest } = make();
    await store.enqueue({
      notifiable: { type: 'User', id: 7 },
      category: 'billing',
      cadence: 'daily',
      notification: { name: 'InvoicePaid', data: { amount: 10 } },
    });
    expect(pendingDigest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        cadence: 'daily',
        notifiableType: 'User',
        notifiableId: '7',
        tenantId: null,
        category: 'billing',
        notificationName: 'InvoicePaid',
        notificationData: { amount: 10 },
      }),
    });
  });

  it('enqueue() passes a provided tenantId through', async () => {
    const { store, pendingDigest } = make();
    await store.enqueue({
      notifiable: { type: 'User', id: '1' },
      tenantId: 'acme',
      category: 'billing',
      cadence: 'daily',
      notification: { name: 'X', data: {} },
    });
    expect(pendingDigest.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: 'acme' }),
    });
  });

  it('listGroups() groups by (tenant, notifiable, category, cadence), oldest-first, scoped to cadence', async () => {
    const { store } = make();
    await store.enqueue({
      notifiable: { type: 'User', id: '1' },
      category: 'billing',
      cadence: 'daily',
      notification: { name: 'First', data: {} },
    });
    await ms();
    await store.enqueue({
      notifiable: { type: 'User', id: '1' },
      category: 'billing',
      cadence: 'daily',
      notification: { name: 'Second', data: {} },
    });
    await store.enqueue({
      notifiable: { type: 'User', id: '1' },
      tenantId: 'acme',
      category: 'billing',
      cadence: 'daily',
      notification: { name: 'Tenant', data: {} },
    });
    await store.enqueue({
      notifiable: { type: 'User', id: '1' },
      category: 'billing',
      cadence: 'weekly',
      notification: { name: 'Weekly', data: {} },
    });

    const groups = await store.listGroups('daily');
    expect(groups).toHaveLength(2);
    const noTenant = groups.find((g) => g.tenantId == null);
    expect(noTenant?.entries.map((e) => e.notification.name)).toEqual(['First', 'Second']);
    const tenant = groups.find((g) => g.tenantId === 'acme');
    expect(tenant?.entries.map((e) => e.notification.name)).toEqual(['Tenant']);

    // weekly is independent
    expect(await store.listGroups('weekly')).toHaveLength(1);
  });

  it('clear() deletes by id (and no-ops on empty)', async () => {
    const { store, pendingDigest } = make();
    await store.clear([]);
    expect(pendingDigest.deleteMany).not.toHaveBeenCalled();
    await store.clear(['a', 'b']);
    expect(pendingDigest.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['a', 'b'] } } });
  });

  it('tryLockWindow() returns true once per (cadence, windowKey), false on repeats', async () => {
    const { store } = make();
    expect(await store.tryLockWindow('daily', '2026-06-17')).toBe(true);
    expect(await store.tryLockWindow('daily', '2026-06-17')).toBe(false);
    expect(await store.tryLockWindow('daily', '2026-06-18')).toBe(true);
    expect(await store.tryLockWindow('weekly', '2026-06-17')).toBe(true);
  });
});
