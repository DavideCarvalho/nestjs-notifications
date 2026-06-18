import {
  Notifiable,
  NotifiableId,
  type Notification,
  type NotificationClass,
  NotificationSerializer,
  type NotificationService,
  type SerializedNotification,
} from '@dudousxd/nestjs-notifications-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoryRegistry } from './category-registry';
import { DigestCollector } from './digest-collector';
import { DefaultDigestNotification, type DigestContext } from './digest-notification';
import { DigestSinkAdapter } from './digest-sink.adapter';
import { InMemoryPendingDigestStore } from './in-memory.pending-digest.store';
import { InMemoryPreferenceCenterStore } from './in-memory.preference-center.store';
import type { CategoryDefinition } from './preference-center.interfaces';
import { PreferenceCenterService } from './preference-center.service';

@Notifiable()
class User {
  @NotifiableId() id: string;
  constructor(id: string) {
    this.id = id;
  }
}

class BillingNotification implements Notification {
  readonly category = 'billing';
  constructor(public readonly invoice: string) {}
  via = () => ['mail'];
}

const categories: CategoryDefinition[] = [
  { key: 'billing', label: 'Billing', defaultChannels: ['mail', 'database'] },
  { key: 'social', label: 'Social', defaultChannels: ['mail'] },
];

/** A serializer whose options register BillingNotification + resolve a User by ref. */
function makeSerializer(): NotificationSerializer {
  return new NotificationSerializer({
    notifications: [BillingNotification as unknown as NotificationClass],
    resolveNotifiable: (ref) => new User(String(ref.id)),
  });
}

/** A NotificationService stub recording sendNow calls; supports tenant/channel scoping chains. */
function makeNotifications() {
  const sent: Array<{
    notifiable: unknown;
    notification: Notification;
    tenant?: string;
    only?: string[];
  }> = [];
  const make = (scope: { tenant?: string; only?: string[] }): any => ({
    forTenant: (tenant: string) => make({ ...scope, tenant }),
    only: (channels: string[]) => make({ ...scope, only: channels }),
    except: () => make(scope),
    sendNow: async (notifiable: unknown, notification: Notification) => {
      sent.push({ notifiable, notification, tenant: scope.tenant, only: scope.only });
      return [];
    },
  });
  const root = make({});
  return { service: root as unknown as NotificationService, sent };
}

describe('digest', () => {
  let store: InMemoryPendingDigestStore;
  let serializer: NotificationSerializer;

  beforeEach(() => {
    store = new InMemoryPendingDigestStore();
    serializer = makeSerializer();
  });

  describe('pending-digest store', () => {
    it('enqueues and groups by (tenant, notifiable, category, cadence)', async () => {
      const ref = { type: 'User', id: '1' };
      const notification: SerializedNotification = {
        name: 'BillingNotification',
        data: { invoice: 'a' },
      };
      await store.enqueue({ notifiable: ref, category: 'billing', cadence: 'daily', notification });
      await store.enqueue({
        notifiable: ref,
        category: 'billing',
        cadence: 'daily',
        notification: { name: 'BillingNotification', data: { invoice: 'b' } },
      });
      // Different cadence → different bucket.
      await store.enqueue({
        notifiable: ref,
        category: 'billing',
        cadence: 'weekly',
        notification,
      });

      const daily = await store.listGroups('daily');
      expect(daily).toHaveLength(1);
      expect(daily[0]?.entries).toHaveLength(2);
      expect(daily[0]?.entries.map((e) => e.notification.data.invoice)).toEqual(['a', 'b']);

      const weekly = await store.listGroups('weekly');
      expect(weekly).toHaveLength(1);
      expect(weekly[0]?.entries).toHaveLength(1);
    });

    it('clear removes flushed entries by id', async () => {
      const ref = { type: 'User', id: '1' };
      await store.enqueue({
        notifiable: ref,
        category: 'billing',
        cadence: 'daily',
        notification: { name: 'BillingNotification', data: {} },
      });
      const [group] = await store.listGroups('daily');
      await store.clear(group?.entries.map((e) => e.id) ?? []);
      expect(await store.listGroups('daily')).toHaveLength(0);
    });

    it('tryLockWindow returns true once per window then false', async () => {
      expect(await store.tryLockWindow('daily', '2026-06-17')).toBe(true);
      expect(await store.tryLockWindow('daily', '2026-06-17')).toBe(false);
      expect(await store.tryLockWindow('daily', '2026-06-18')).toBe(true);
      expect(await store.tryLockWindow('weekly', '2026-06-17')).toBe(true);
    });
  });

  describe('DigestSinkAdapter (gate → store)', () => {
    it('serializes and enqueues a suppressed notification', async () => {
      const sink = new DigestSinkAdapter(store, serializer);
      await sink.collect({
        notifiable: new User('7'),
        notification: new BillingNotification('inv-1'),
        channel: 'mail',
        cadence: 'daily',
        category: 'billing',
        tenant: 'acme',
      });
      const [group] = await store.listGroups('daily');
      expect(group?.notifiable).toEqual({ type: 'User', id: '7' });
      expect(group?.tenantId).toBe('acme');
      expect(group?.entries[0]?.notification.name).toBe('BillingNotification');
      expect(group?.entries[0]?.notification.data).toMatchObject({
        invoice: 'inv-1',
        category: 'billing',
      });
    });
  });

  describe('DigestCollector.flushDigests', () => {
    it('groups pending entries, dispatches one digest per group, then clears them', async () => {
      const { service, sent } = makeNotifications();
      const collector = new DigestCollector(store, service, serializer);

      const sink = new DigestSinkAdapter(store, serializer);
      await sink.collect({
        notifiable: new User('1'),
        notification: new BillingNotification('a'),
        channel: 'mail',
        cadence: 'daily',
        category: 'billing',
      });
      await sink.collect({
        notifiable: new User('1'),
        notification: new BillingNotification('b'),
        channel: 'mail',
        cadence: 'daily',
        category: 'billing',
      });

      const result = await collector.flushDigests('daily', new Date('2026-06-17T09:00:00Z'));

      expect(result.sent).toBe(1);
      expect(result.cleared).toBe(2);
      expect(sent).toHaveLength(1);
      const digest = sent[0]?.notification as DefaultDigestNotification;
      expect(digest).toBeInstanceOf(DefaultDigestNotification);
      const payload = digest.toArray(new User('1'));
      expect(payload.count).toBe(2);
      expect((payload.items as unknown[]).length).toBe(2);
      // Entries are cleared after flush.
      expect(await store.listGroups('daily')).toHaveLength(0);
    });

    it('is idempotent per window — a second flush for the same window is a no-op', async () => {
      const { service, sent } = makeNotifications();
      const collector = new DigestCollector(store, service, serializer);
      const sink = new DigestSinkAdapter(store, serializer);
      await sink.collect({
        notifiable: new User('1'),
        notification: new BillingNotification('a'),
        channel: 'mail',
        cadence: 'daily',
        category: 'billing',
      });

      const now = new Date('2026-06-17T09:00:00Z');
      const first = await collector.flushDigests('daily', now);
      const second = await collector.flushDigests('daily', now);

      expect(first.sent).toBe(1);
      expect(second.alreadyRun).toBe(true);
      expect(second.sent).toBe(0);
      expect(sent).toHaveLength(1);
    });

    it('scopes the digest dispatch to the group tenant and configured channels', async () => {
      const { service, sent } = makeNotifications();
      const collector = new DigestCollector(store, service, serializer, undefined, {
        channels: ['mail'],
      });
      const sink = new DigestSinkAdapter(store, serializer);
      await sink.collect({
        notifiable: new User('1'),
        notification: new BillingNotification('a'),
        channel: 'mail',
        cadence: 'weekly',
        category: 'billing',
        tenant: 'acme',
      });

      await collector.flushDigests('weekly', new Date('2026-06-17T09:00:00Z'));
      expect(sent[0]?.tenant).toBe('acme');
      expect(sent[0]?.only).toEqual(['mail']);
    });

    it('uses a custom buildDigest factory when provided', async () => {
      const { service, sent } = makeNotifications();
      const buildDigest = vi.fn(
        (ctx: DigestContext): Notification =>
          ({
            category: ctx.category,
            via: () => ['mail'],
          }) as Notification,
      );
      const collector = new DigestCollector(store, service, serializer, undefined, { buildDigest });
      const sink = new DigestSinkAdapter(store, serializer);
      await sink.collect({
        notifiable: new User('1'),
        notification: new BillingNotification('a'),
        channel: 'mail',
        cadence: 'daily',
        category: 'billing',
      });

      await collector.flushDigests('daily', new Date('2026-06-17T09:00:00Z'));
      expect(buildDigest).toHaveBeenCalledTimes(1);
      expect(buildDigest.mock.calls[0]?.[0].items).toHaveLength(1);
      expect(sent[0]?.notification).not.toBeInstanceOf(DefaultDigestNotification);
    });

    it('holds a group inside quiet hours, keeping it pending for the next run', async () => {
      const prefStore = new InMemoryPreferenceCenterStore();
      const registry = new CategoryRegistry(categories);
      const prefs = new PreferenceCenterService(prefStore, registry);
      const ref = { type: 'User', id: '1' };
      await prefs.setQuietHours(ref, {
        enabled: true,
        start: '00:00',
        end: '23:59',
        timezone: 'UTC',
      });

      const { service, sent } = makeNotifications();
      const collector = new DigestCollector(store, service, serializer, prefs);
      const sink = new DigestSinkAdapter(store, serializer);
      await sink.collect({
        notifiable: new User('1'),
        notification: new BillingNotification('a'),
        channel: 'mail',
        cadence: 'daily',
        category: 'billing',
      });

      const result = await collector.flushDigests('daily', new Date('2026-06-17T12:00:00Z'));
      expect(result.sent).toBe(0);
      expect(result.deferred).toBe(1);
      expect(sent).toHaveLength(0);
      // Still pending for a later flush.
      expect(await store.listGroups('daily')).toHaveLength(1);
    });

    it('rebuilds the original notification instance for custom renderers', async () => {
      const { service } = makeNotifications();
      let captured: DigestContext | undefined;
      const collector = new DigestCollector(store, service, serializer, undefined, {
        buildDigest: (ctx) => {
          captured = ctx;
          return new DefaultDigestNotification(ctx);
        },
      });
      const sink = new DigestSinkAdapter(store, serializer);
      await sink.collect({
        notifiable: new User('1'),
        notification: new BillingNotification('inv-99'),
        channel: 'mail',
        cadence: 'daily',
        category: 'billing',
      });

      await collector.flushDigests('daily', new Date('2026-06-17T09:00:00Z'));
      const rebuilt = captured?.items[0]?.notification as BillingNotification;
      expect(rebuilt).toBeInstanceOf(BillingNotification);
      expect(rebuilt.invoice).toBe('inv-99');
    });
  });
});
