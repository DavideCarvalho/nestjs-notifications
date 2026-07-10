import type { NotificationStore } from '@dudousxd/nestjs-notifications-database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * Setup returned by a {@link NotificationStoreContractFactory}. The contract drives `store`; the
 * optional hooks let an adapter reset state between tests (`reset`) and tear down a backing
 * resource once the suite ends (`teardown`).
 */
export interface NotificationStoreContractContext {
  store: NotificationStore;
  /** Wipe all rows before each test so cases are independent. Required for shared/persistent stores. */
  reset: () => Promise<void>;
  /** Release the backing resource (connection, container) once the whole suite finishes. */
  teardown?: () => Promise<void>;
}

/** Builds the store-under-test for one contract run (called once per `describe`). */
export type NotificationStoreContractFactory = () => Promise<NotificationStoreContractContext>;

const ms = (n = 5): Promise<void> => new Promise((resolve) => setTimeout(resolve, n));

/**
 * The shared behavioral contract for every {@link NotificationStore}. Parametrize it over each
 * adapter (in-memory, TypeORM/sqlite|pg|mysql, MikroORM/sqlite|pg|mysql) so they are all asserted
 * to behave IDENTICALLY. This is the single source of truth for store semantics: divergence between
 * a sqlite happy-path and a real Postgres/MySQL engine surfaces here, not in production.
 *
 * @param name  Label for the run (e.g. `'TypeORM (postgres)'`).
 * @param makeContext  Factory yielding a fresh, resettable store bound to its backing engine.
 */
export function runNotificationStoreContract(
  name: string,
  makeContext: NotificationStoreContractFactory,
): void {
  describe(`NotificationStore contract — ${name}`, () => {
    let ctx: NotificationStoreContractContext;

    beforeAll(async () => {
      ctx = await makeContext();
    });

    beforeEach(async () => {
      await ctx.reset();
    });

    afterAll(async () => {
      await ctx?.teardown?.();
    });

    const store = (): NotificationStore => ctx.store;

    it('save() inserts an unread row with an id and timestamps', async () => {
      const row = await store().save({
        type: 'Welcome',
        notifiableType: 'User',
        notifiableId: '1',
        data: { hi: true },
      });
      expect(row.id).toEqual(expect.any(String));
      expect(row.readAt).toBeNull();
      expect(row.createdAt).toBeInstanceOf(Date);
      expect(row.updatedAt).toBeInstanceOf(Date);
      expect(row.tenantId).toBeNull();
      expect(row.data).toEqual({ hi: true });
    });

    it('getForNotifiable() returns matching rows newest-first, scoped to the notifiable', async () => {
      const a = await store().save(make('A', 'User', '42'));
      await ms();
      const b = await store().save(make('B', 'User', '42'));
      await ms();
      const c = await store().save(make('C', 'User', '42'));
      await store().save(make('X', 'User', '99'));

      const rows = await store().getForNotifiable('User', '42');
      expect(rows.map((r) => r.type)).toEqual(['C', 'B', 'A']);
      expect(rows.every((r) => r.notifiableId === '42')).toBe(true);
      // ids round-trip
      expect(new Set(rows.map((r) => r.id))).toEqual(new Set([a.id, b.id, c.id]));
    });

    it('round-trips a JSON payload through the data column', async () => {
      const payload = { nested: { a: 1, b: ['x', 'y'] }, flag: true, n: 0 };
      const saved = await store().save({
        type: 'Json',
        notifiableType: 'User',
        notifiableId: 'json',
        data: payload,
      });
      const [row] = await store().getForNotifiable('User', 'json');
      expect(row?.data).toEqual(payload);
      expect(saved.data).toEqual(payload);
    });

    it('getUnread() returns only unread rows', async () => {
      const a = await store().save(make('A', 'User', '7'));
      await ms();
      const b = await store().save(make('B', 'User', '7'));
      await store().markAsRead(a.id);

      const unread = await store().getUnread('User', '7');
      expect(unread.map((r) => r.id)).toEqual([b.id]);
    });

    it('markAsRead() sets readAt on exactly one row and is idempotent', async () => {
      const a = await store().save(make('A', 'User', '7'));
      await store().save(make('B', 'User', '7'));

      await store().markAsRead(a.id);
      let rows = await store().getForNotifiable('User', '7');
      expect(rows.find((r) => r.id === a.id)?.readAt).toBeInstanceOf(Date);
      expect(rows.filter((r) => r.readAt != null)).toHaveLength(1);

      // calling again does not throw and leaves a single read row
      await store().markAsRead(a.id);
      rows = await store().getForNotifiable('User', '7');
      expect(rows.filter((r) => r.readAt != null)).toHaveLength(1);
    });

    it('markAllAsRead() clears every unread row for the notifiable only', async () => {
      await store().save(make('A', 'User', '7'));
      await store().save(make('B', 'User', '7'));
      await store().save(make('Other', 'User', '8'));

      await store().markAllAsRead('User', '7');
      expect(await store().getUnread('User', '7')).toHaveLength(0);
      expect(await store().getUnread('User', '8')).toHaveLength(1);
    });

    it('delete() removes one row', async () => {
      const a = await store().save(make('A', 'User', '7'));
      const b = await store().save(make('B', 'User', '7'));
      await store().delete(a.id);
      const rows = await store().getForNotifiable('User', '7');
      expect(rows.map((r) => r.id)).toEqual([b.id]);
    });

    it('persists captured causer/trace columns round-trip; null when omitted', async () => {
      const withCtx = await store().save({
        type: 'WithContext',
        notifiableType: 'User',
        notifiableId: 'ctx',
        data: { n: 1 },
        causerType: 'Admin',
        causerId: '7',
        traceId: 'tx-9',
      });
      expect(withCtx.causerType).toBe('Admin');
      expect(withCtx.causerId).toBe('7');
      expect(withCtx.traceId).toBe('tx-9');

      const [row] = await store().getForNotifiable('User', 'ctx');
      expect(row?.causerType).toBe('Admin');
      expect(row?.causerId).toBe('7');
      expect(row?.traceId).toBe('tx-9');

      const plain = await store().save(make('Plain', 'User', 'plain'));
      expect(plain.causerType).toBeNull();
      expect(plain.causerId).toBeNull();
      expect(plain.traceId).toBeNull();
    });

    describe('tenant scoping', () => {
      it('scopes reads/markAllAsRead by tenantId; undefined matches all tenants', async () => {
        const t1 = await store().save(makeTenant('T1', 'tenant-1'));
        await store().save(makeTenant('T2', 'tenant-2'));
        expect(t1.tenantId).toBe('tenant-1');

        expect(
          (await store().getForNotifiable('User', 'tu', 'tenant-1')).map((r) => r.type),
        ).toEqual(['T1']);
        expect(await store().getForNotifiable('User', 'tu', 'nope')).toHaveLength(0);

        const unscoped = await store().getForNotifiable('User', 'tu');
        expect(unscoped.map((r) => r.type).sort()).toEqual(['T1', 'T2']);

        expect((await store().getUnread('User', 'tu', 'tenant-1')).map((r) => r.type)).toEqual([
          'T1',
        ]);
        await store().markAllAsRead('User', 'tu', 'tenant-1');
        expect(await store().getUnread('User', 'tu', 'tenant-1')).toHaveLength(0);
        expect(await store().getUnread('User', 'tu', 'tenant-2')).toHaveLength(1);
      });
    });

    describe('types filter', () => {
      it('getForNotifiable()/getUnread() restrict to the listed types; absent/empty = no filter', async () => {
        const a = await store().save(make('A', 'User', 'ty'));
        await ms();
        const b = await store().save(make('B', 'User', 'ty'));
        await ms();
        await store().save(make('C', 'User', 'ty'));
        await store().markAsRead(a.id);

        expect(
          (await store().getForNotifiable('User', 'ty', undefined, ['B'])).map((r) => r.type),
        ).toEqual(['B']);
        expect(
          (await store().getForNotifiable('User', 'ty', undefined, ['A', 'C'])).map((r) => r.type),
        ).toEqual(['C', 'A']);
        expect(
          (await store().getForNotifiable('User', 'ty', undefined, ['nope'])).map((r) => r.type),
        ).toEqual([]);

        // absent filter returns all
        expect((await store().getForNotifiable('User', 'ty')).map((r) => r.type).sort()).toEqual([
          'A',
          'B',
          'C',
        ]);
        // empty array behaves like absent — no filter
        expect(
          (await store().getForNotifiable('User', 'ty', undefined, [])).map((r) => r.type).sort(),
        ).toEqual(['A', 'B', 'C']);

        expect(
          (await store().getUnread('User', 'ty', undefined, ['B'])).map((r) => r.type),
        ).toEqual(['B']);
        expect(
          (await store().getUnread('User', 'ty', undefined, [])).map((r) => r.type).sort(),
        ).toEqual(['B', 'C']);
      });
    });

    describe('paginateForNotifiable()', () => {
      it('pushes limit/offset down and returns the total, newest-first', async () => {
        for (let i = 0; i < 5; i++) {
          await store().save(make(`P${i}`, 'User', 'paged'));
          await ms();
        }

        const page1 = await store().paginateForNotifiable?.('User', 'paged', {
          limit: 2,
          offset: 0,
        });
        expect(page1?.total).toBe(5);
        expect(page1?.items.map((r) => r.type)).toEqual(['P4', 'P3']);

        const page2 = await store().paginateForNotifiable?.('User', 'paged', {
          limit: 2,
          offset: 2,
        });
        expect(page2?.total).toBe(5);
        expect(page2?.items.map((r) => r.type)).toEqual(['P2', 'P1']);

        const last = await store().paginateForNotifiable?.('User', 'paged', {
          limit: 2,
          offset: 4,
        });
        expect(last?.total).toBe(5);
        expect(last?.items.map((r) => r.type)).toEqual(['P0']);

        // offset past the end yields an empty page but the real total
        const beyond = await store().paginateForNotifiable?.('User', 'paged', {
          limit: 2,
          offset: 10,
        });
        expect(beyond?.total).toBe(5);
        expect(beyond?.items).toHaveLength(0);
      });

      it('scopes the paginated total + items by tenantId', async () => {
        await store().save(makeTenant('A', 'tenant-1'));
        await store().save(makeTenant('B', 'tenant-1'));
        await store().save(makeTenant('C', 'tenant-2'));

        const page = await store().paginateForNotifiable?.('User', 'tu', {
          limit: 10,
          offset: 0,
          tenantId: 'tenant-1',
        });
        expect(page?.total).toBe(2);
        expect(page?.items.map((r) => r.type).sort()).toEqual(['A', 'B']);
      });

      it('scopes the paginated total + items by types; empty array is no filter', async () => {
        await store().save(make('P1', 'User', 'paged-types'));
        await store().save(make('P2', 'User', 'paged-types'));
        await store().save(make('P3', 'User', 'paged-types'));

        const filtered = await store().paginateForNotifiable?.('User', 'paged-types', {
          limit: 10,
          offset: 0,
          types: ['P1', 'P3'],
        });
        expect(filtered?.total).toBe(2);
        expect(filtered?.items.map((r) => r.type).sort()).toEqual(['P1', 'P3']);

        const unfiltered = await store().paginateForNotifiable?.('User', 'paged-types', {
          limit: 10,
          offset: 0,
          types: [],
        });
        expect(unfiltered?.total).toBe(3);
        expect(unfiltered?.items.map((r) => r.type).sort()).toEqual(['P1', 'P2', 'P3']);
      });
    });

    describe('upsert()', () => {
      it('inserts when absent, updates in place when present, preserving createdAt and resetting readAt', async () => {
        const created = await store().upsert?.({
          id: 'live:1',
          type: 'Progress',
          notifiableType: 'User',
          notifiableId: 'u',
          data: { pct: 0 },
        });
        expect(created?.id).toBe('live:1');
        expect(created?.data).toEqual({ pct: 0 });
        await store().markAsRead('live:1');

        await ms();
        const updated = await store().upsert?.({
          id: 'live:1',
          type: 'Progress',
          notifiableType: 'User',
          notifiableId: 'u',
          data: { pct: 100 },
        });
        expect(updated?.data).toEqual({ pct: 100 });
        // update is a fresh, unread event
        expect(updated?.readAt).toBeNull();
        // createdAt preserved across the update
        expect(updated?.createdAt.getTime()).toBe(created?.createdAt.getTime());
        // still a single row
        const rows = await store().getForNotifiable('User', 'u');
        expect(rows).toHaveLength(1);
        expect(rows[0]?.data).toEqual({ pct: 100 });
      });
    });

    describe('prune()', () => {
      it('deletes rows at/before the cutoff and returns the count', async () => {
        const old = await store().save(make('Old', 'User', 'p'));
        await ms();
        const recent = await store().save(make('Recent', 'User', 'p'));

        const cutoff = new Date(old.createdAt.getTime() + 1);
        const deleted = await store().prune?.({ before: cutoff });
        expect(deleted).toBe(1);
        const rows = await store().getForNotifiable('User', 'p');
        expect(rows.map((r) => r.id)).toEqual([recent.id]);
      });

      it('with onlyRead, deletes only read rows older than the cutoff', async () => {
        const a = await store().save(make('A', 'User', 'p'));
        await ms();
        const b = await store().save(make('B', 'User', 'p'));
        await store().markAsRead(a.id);

        // cutoff after both — but onlyRead should keep the unread one
        const cutoff = new Date(b.createdAt.getTime() + 1000);
        const deleted = await store().prune?.({ before: cutoff, onlyRead: true });
        expect(deleted).toBe(1);
        const rows = await store().getForNotifiable('User', 'p');
        expect(rows.map((r) => r.id)).toEqual([b.id]);
      });
    });
  });
}

function make(type: string, notifiableType: string, notifiableId: string) {
  return { type, notifiableType, notifiableId, data: { type } };
}

function makeTenant(type: string, tenantId: string) {
  return { type, notifiableType: 'User', notifiableId: 'tu', tenantId, data: { type } };
}
