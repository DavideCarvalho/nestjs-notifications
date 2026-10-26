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

    it('clear() deletes more ids than one SQL statement can bind', async () => {
      for (const name of ['A', 'B', 'C']) {
        await store().enqueue({
          notifiable: { type: 'User', id: '1' },
          category: 'billing',
          cadence: 'daily',
          notification: serialized(name),
        });
      }
      const ids = (await store().listGroups('daily')).flatMap((g) => g.entries.map((e) => e.id));
      // Past Postgres' 65,535 bind parameters and SQLite's 32,766 variables.
      const unknown = Array.from({ length: 70_000 }, (_, i) => `missing-${i}`);

      await store().clear([...unknown.slice(0, 35_000), ...ids, ...unknown.slice(35_000)]);

      expect(await store().listGroups('daily')).toHaveLength(0);
    });

    it('listGroupsPage() returns whole groups in a stable order, a page at a time', async () => {
      const keys: [string | null, string, string][] = [
        [null, '1', 'billing'],
        [null, '1', 'social'],
        [null, '2', 'billing'],
        ['acme', '1', 'billing'],
        ['acme', '3', 'billing'],
      ];
      for (const [tenantId, id, category] of keys) {
        for (const name of ['First', 'Second']) {
          await store().enqueue({
            notifiable: { type: 'User', id },
            tenantId,
            category,
            cadence: 'daily',
            notification: serialized(`${name}-${tenantId}-${id}-${category}`),
          });
          await ms(2);
        }
      }
      await store().enqueue({
        notifiable: { type: 'User', id: '1' },
        category: 'billing',
        cadence: 'weekly',
        notification: serialized('Weekly'),
      });

      expect(store().listGroupsPage).toBeTypeOf('function');
      const page = (offset: number) =>
        store().listGroupsPage?.('daily', { limit: 2, offset }) ?? Promise.resolve([]);
      const pages = [await page(0), await page(2), await page(4), await page(6)];
      expect(pages.map((p) => p.length)).toEqual([2, 2, 1, 0]);

      const label = (g: {
        tenantId: string | null;
        notifiable: { id: string | number };
        category: string;
      }) => `${g.tenantId}-${g.notifiable.id}-${g.category}`;
      const paged = pages.flat();
      expect(paged.map(label).sort()).toEqual(keys.map(([t, id, c]) => `${t}-${id}-${c}`).sort());
      for (const group of paged) {
        expect(group.cadence).toBe('daily');
        expect(group.entries.map((e) => e.notification.name)).toEqual([
          `First-${label(group)}`,
          `Second-${label(group)}`,
        ]);
      }
      // Same order on a repeat read.
      expect((await page(0)).map(label)).toEqual(pages[0]?.map(label));

      // Clearing the first page's groups shifts the rest forward.
      await store().clear(pages[0]?.flatMap((g) => g.entries.map((e) => e.id)) ?? []);
      expect((await page(0)).map(label)).toEqual(pages[1]?.map(label));
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
