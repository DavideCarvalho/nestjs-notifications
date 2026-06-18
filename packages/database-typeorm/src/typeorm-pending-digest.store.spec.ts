import type { Repository } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import type { DigestWindowEntity, PendingDigestEntity } from './pending-digest.entity';
import { TypeOrmPendingDigestStore } from './typeorm-pending-digest.store';

function makeEntriesRepo(rows: PendingDigestEntity[] = []) {
  return {
    create: vi.fn((input: Partial<PendingDigestEntity>) => input as PendingDigestEntity),
    save: vi.fn(async (entity: PendingDigestEntity) => {
      rows.push(entity);
      return entity;
    }),
    find: vi.fn(async () => rows),
    delete: vi.fn(async () => ({ affected: 0 })),
    manager: { connection: {} },
  };
}

function makeWindowsRepo() {
  const seen = new Set<string>();
  return {
    insert: vi.fn(async (entity: Partial<DigestWindowEntity>) => {
      if (seen.has(entity.id as string)) throw new Error('duplicate');
      seen.add(entity.id as string);
      return {};
    }),
  };
}

function make(rows: PendingDigestEntity[] = []) {
  const entries = makeEntriesRepo(rows);
  const windows = makeWindowsRepo();
  const store = new TypeOrmPendingDigestStore(
    entries as unknown as Repository<PendingDigestEntity>,
    windows as unknown as Repository<DigestWindowEntity>,
  );
  return { store, entries, windows };
}

describe('TypeOrmPendingDigestStore', () => {
  it('enqueue() inserts a row with the serialized notification', async () => {
    const { store, entries } = make();
    await store.enqueue({
      notifiable: { type: 'User', id: '7' },
      tenantId: 'acme',
      category: 'billing',
      cadence: 'daily',
      notification: { name: 'InvoicePaid', data: { amount: 10 } },
    });
    expect(entries.create).toHaveBeenCalledWith(
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
    expect(entries.save).toHaveBeenCalled();
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
    const { store, entries } = make();
    await store.clear([]);
    expect(entries.delete).not.toHaveBeenCalled();
    await store.clear(['a', 'b']);
    expect(entries.delete).toHaveBeenCalledTimes(1);
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
