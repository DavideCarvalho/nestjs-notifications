import type { PendingDigestStore } from '@dudousxd/nestjs-notifications-preferences';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/** Setup for one {@link PendingDigestStore} contract run. */
export interface PendingDigestStoreContractContext {
  store: PendingDigestStore;
  /** Wipe all pending entries + window locks before each test. */
  reset: () => Promise<void>;
  /** Release the backing resource once the suite finishes. */
  teardown?: () => Promise<void>;
}

export type PendingDigestStoreContractFactory = () => Promise<PendingDigestStoreContractContext>;

const ms = (n = 5): Promise<void> => new Promise((resolve) => setTimeout(resolve, n));

const serialized = (name: string, data: Record<string, unknown> = {}) => ({ name, data });

/**
 * The shared behavioral contract for every {@link PendingDigestStore} (in-memory + the persistent
 * TypeORM adapter, across sqlite/pg/mysql). Asserts the enqueue → grouped-read → clear flow and the
 * per-window idempotency lock behave identically on every engine.
 */
export function runPendingDigestStoreContract(
  name: string,
  makeContext: PendingDigestStoreContractFactory,
): void {
  describe(`PendingDigestStore contract — ${name}`, () => {
    let ctx: PendingDigestStoreContractContext;

    beforeAll(async () => {
      ctx = await makeContext();
    });

    beforeEach(async () => {
      await ctx.reset();
    });

    afterAll(async () => {
      await ctx?.teardown?.();
    });

    const store = (): PendingDigestStore => ctx.store;

    it('enqueue() then listGroups() returns the entry under its cadence', async () => {
      await store().enqueue({
        notifiable: { type: 'User', id: '1' },
        category: 'billing',
        cadence: 'daily',
        notification: serialized('InvoicePaid', { amount: 10 }),
      });

      const daily = await store().listGroups('daily');
      expect(daily).toHaveLength(1);
      expect(daily[0]?.notifiable).toEqual({ type: 'User', id: '1' });
      expect(daily[0]?.category).toBe('billing');
      expect(daily[0]?.cadence).toBe('daily');
      expect(daily[0]?.entries).toHaveLength(1);
      expect(daily[0]?.entries[0]?.notification).toEqual({
        name: 'InvoicePaid',
        data: { amount: 10 },
      });
      expect(daily[0]?.entries[0]?.id).toEqual(expect.any(String));
      expect(daily[0]?.entries[0]?.createdAt).toBeInstanceOf(Date);

      // a different cadence sees nothing
      expect(await store().listGroups('weekly')).toHaveLength(0);
    });

    it('groups entries by (tenant, notifiable, category, cadence), oldest-first within a group', async () => {
      // group 1: User/1 + billing + daily (two entries, ordered by createdAt ASC)
      await store().enqueue({
        notifiable: { type: 'User', id: '1' },
        category: 'billing',
        cadence: 'daily',
        notification: serialized('First'),
      });
      await ms();
      await store().enqueue({
        notifiable: { type: 'User', id: '1' },
        category: 'billing',
        cadence: 'daily',
        notification: serialized('Second'),
      });
      // group 2: different category
      await store().enqueue({
        notifiable: { type: 'User', id: '1' },
        category: 'social',
        cadence: 'daily',
        notification: serialized('Social'),
      });
      // group 3: different notifiable
      await store().enqueue({
        notifiable: { type: 'User', id: '2' },
        category: 'billing',
        cadence: 'daily',
        notification: serialized('Other'),
      });
      // group 4: different tenant
      await store().enqueue({
        notifiable: { type: 'User', id: '1' },
        tenantId: 'acme',
        category: 'billing',
        cadence: 'daily',
        notification: serialized('Tenant'),
      });
      // other cadence — excluded
      await store().enqueue({
        notifiable: { type: 'User', id: '1' },
        category: 'billing',
        cadence: 'weekly',
        notification: serialized('Weekly'),
      });

      const groups = await store().listGroups('daily');
      expect(groups).toHaveLength(4);

      const billing = groups.find(
        (g) => g.category === 'billing' && g.notifiable.id === '1' && g.tenantId == null,
      );
      expect(billing?.entries.map((e) => e.notification.name)).toEqual(['First', 'Second']);

      const tenant = groups.find((g) => g.tenantId === 'acme');
      expect(tenant?.entries.map((e) => e.notification.name)).toEqual(['Tenant']);
    });

    it('clear() deletes the given entries by id and leaves the rest', async () => {
      await store().enqueue({
        notifiable: { type: 'User', id: '1' },
        category: 'billing',
        cadence: 'daily',
        notification: serialized('Keep'),
      });
      await store().enqueue({
        notifiable: { type: 'User', id: '1' },
        category: 'billing',
        cadence: 'daily',
        notification: serialized('Drop'),
      });

      const before = await store().listGroups('daily');
      const dropId = before[0]?.entries.find((e) => e.notification.name === 'Drop')?.id;
      expect(dropId).toBeDefined();

      await store().clear([dropId as string]);

      const after = await store().listGroups('daily');
      const names = after.flatMap((g) => g.entries.map((e) => e.notification.name));
      expect(names).toEqual(['Keep']);

      // clearing an empty list is a no-op
      await store().clear([]);
      expect((await store().listGroups('daily')).flatMap((g) => g.entries)).toHaveLength(1);
    });

    describe('tryLockWindow() idempotency', () => {
      it('returns true once per (cadence, windowKey), false on repeats', async () => {
        expect(await store().tryLockWindow?.('daily', '2026-06-17')).toBe(true);
        expect(await store().tryLockWindow?.('daily', '2026-06-17')).toBe(false);
        expect(await store().tryLockWindow?.('daily', '2026-06-17')).toBe(false);

        // a different window key for the same cadence is independent
        expect(await store().tryLockWindow?.('daily', '2026-06-18')).toBe(true);
        // a different cadence with the same key is independent
        expect(await store().tryLockWindow?.('weekly', '2026-06-17')).toBe(true);
      });
    });
  });
}
