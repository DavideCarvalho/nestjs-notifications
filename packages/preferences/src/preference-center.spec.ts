import { Notifiable, NotifiableId, type Notification } from '@dudousxd/nestjs-notifications-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { CategoryRegistry, DEFAULT_CATEGORY, getCategory } from './category-registry';
import { InMemoryPreferenceCenterStore } from './in-memory.preference-center.store';
import { PreferenceCenterGate } from './preference-center.gate';
import type { CategoryDefinition } from './preference-center.interfaces';
import { PreferenceCenterService } from './preference-center.service';

@Notifiable()
class User {
  @NotifiableId() id: string;
  constructor(id: string) {
    this.id = id;
  }
}

const categories: CategoryDefinition[] = [
  { key: 'billing', label: 'Billing', defaultChannels: ['mail', 'database'] },
  { key: 'social', label: 'Social', defaultChannels: ['mail'] },
  { key: 'security', label: 'Security', defaultChannels: ['mail'], mandatory: true },
  { key: 'general', label: 'General', defaultChannels: ['mail'] },
];

class BillingNotification implements Notification {
  readonly category = 'billing';
  via = () => ['mail'];
}

class SecurityNotification implements Notification {
  readonly category = 'security';
  via = () => ['mail'];
}

const plainNotification: Notification = { via: () => ['mail'] };

describe('preference center', () => {
  let store: InMemoryPreferenceCenterStore;
  let registry: CategoryRegistry;
  let service: PreferenceCenterService;
  let gate: PreferenceCenterGate;

  beforeEach(() => {
    store = new InMemoryPreferenceCenterStore();
    registry = new CategoryRegistry(categories);
    service = new PreferenceCenterService(store, registry);
    gate = new PreferenceCenterGate(service, registry);
  });

  describe('category resolution', () => {
    it('reads an explicit category property from a notification', () => {
      expect(getCategory(new BillingNotification())).toBe('billing');
      expect(registry.resolve(new SecurityNotification())).toBe('security');
    });

    it('falls back to the default category when none declared', () => {
      expect(getCategory(plainNotification)).toBe(DEFAULT_CATEGORY);
    });
  });

  describe('matrix get/set', () => {
    it('returns every registered category merged with defaults', async () => {
      const ref = { type: 'User', id: '1' };
      const matrix = await service.getMatrix(ref);

      expect(Object.keys(matrix.categories).sort()).toEqual([
        'billing',
        'general',
        'security',
        'social',
      ]);
      expect(matrix.categories.billing.channels).toEqual({ mail: true, database: true });
      expect(matrix.categories.billing.digest).toBe('instant');
    });

    it('persists a channel toggle and reflects it in the matrix', async () => {
      const ref = { type: 'User', id: '1' };
      await service.setChannel(ref, 'billing', 'mail', false);

      const matrix = await service.getMatrix(ref);
      expect(matrix.categories.billing.channels.mail).toBe(false);
      expect(matrix.categories.billing.channels.database).toBe(true);
    });

    it('persists a digest change', async () => {
      const ref = { type: 'User', id: '1' };
      await service.setDigest(ref, 'social', 'weekly');

      const matrix = await service.getMatrix(ref);
      expect(matrix.categories.social.digest).toBe('weekly');
    });

    it('resetCategory reverts to defaults', async () => {
      const ref = { type: 'User', id: '1' };
      await service.setChannel(ref, 'billing', 'mail', false);
      await service.resetCategory(ref, 'billing');

      const matrix = await service.getMatrix(ref);
      expect(matrix.categories.billing.channels.mail).toBe(true);
    });

    it('scopes the matrix per tenant', async () => {
      const ref = { type: 'User', id: '1' };
      await service.setChannel(ref, 'billing', 'mail', false, 'acme');

      const acme = await service.getMatrix(ref, 'acme');
      const other = await service.getMatrix(ref, 'other');
      expect(acme.categories.billing.channels.mail).toBe(false);
      expect(other.categories.billing.channels.mail).toBe(true);
    });
  });

  describe('resolve + gate', () => {
    it('allows an enabled instant channel', async () => {
      const ref = { type: 'User', id: '1' };
      expect(await service.resolve(ref, 'billing', 'mail')).toEqual({
        allowed: true,
        digest: 'instant',
      });
      expect(
        await gate.isAllowed({
          notifiable: new User('1'),
          notification: new BillingNotification(),
          channel: 'mail',
        }),
      ).toBe(true);
    });

    it('blocks a disabled channel', async () => {
      const ref = { type: 'User', id: '1' };
      await service.setChannel(ref, 'billing', 'mail', false);

      expect((await service.resolve(ref, 'billing', 'mail')).allowed).toBe(false);
      expect(
        await gate.isAllowed({
          notifiable: new User('1'),
          notification: new BillingNotification(),
          channel: 'mail',
        }),
      ).toBe(false);
    });

    it('mandatory category is always allowed regardless of stored prefs', async () => {
      const ref = { type: 'User', id: '1' };
      await service.setChannel(ref, 'security', 'mail', false);
      await service.setDigest(ref, 'security', 'off');

      expect(await service.resolve(ref, 'security', 'mail')).toEqual({
        allowed: true,
        digest: 'instant',
      });
      expect(
        await gate.isAllowed({
          notifiable: new User('1'),
          notification: new SecurityNotification(),
          channel: 'mail',
        }),
      ).toBe(true);
    });

    it('digest != instant suppresses instant delivery on the channel', async () => {
      const ref = { type: 'User', id: '1' };
      await service.setDigest(ref, 'billing', 'daily');

      const resolution = await service.resolve(ref, 'billing', 'mail');
      expect(resolution).toEqual({ allowed: false, digest: 'daily' });
      // Channel is still enabled — it's the digest cadence that suppresses instant delivery.
      const matrix = await service.getMatrix(ref);
      expect(matrix.categories.billing.channels.mail).toBe(true);

      expect(
        await gate.isAllowed({
          notifiable: new User('1'),
          notification: new BillingNotification(),
          channel: 'mail',
        }),
      ).toBe(false);
    });

    it('digest off blocks the channel', async () => {
      const ref = { type: 'User', id: '1' };
      await service.setDigest(ref, 'social', 'off');
      expect((await service.resolve(ref, 'social', 'mail')).allowed).toBe(false);
    });

    it('allows delivery when the notifiable has no derivable reference', async () => {
      const anon = { routeNotificationFor: () => 'x@y.z' };
      expect(
        await gate.isAllowed({
          notifiable: anon,
          notification: new BillingNotification(),
          channel: 'mail',
        }),
      ).toBe(true);
    });
  });
});
