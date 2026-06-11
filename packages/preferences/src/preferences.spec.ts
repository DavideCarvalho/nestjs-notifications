import { Notifiable, NotifiableId, type Notification } from '@dudousxd/nestjs-notifications-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryPreferenceStore } from './in-memory.store';
import { NotificationPreferences } from './notification-preferences';
import { PreferenceGateAdapter } from './preference-gate.adapter';

@Notifiable()
class User {
  @NotifiableId() id: string;
  constructor(id: string) {
    this.id = id;
  }
}

const notification: Notification = { via: () => ['mail'] };

describe('preferences', () => {
  let store: InMemoryPreferenceStore;
  let prefs: NotificationPreferences;
  let gate: PreferenceGateAdapter;

  beforeEach(() => {
    store = new InMemoryPreferenceStore();
    prefs = new NotificationPreferences(store);
    gate = new PreferenceGateAdapter(store);
  });

  it('mutes a channel and the gate skips only that channel', async () => {
    const user = new User('1');
    await prefs.mute(user, 'mail');

    expect(await prefs.isMuted(user, 'mail')).toBe(true);
    expect(
      await store.isMuted({ notifiableType: 'User', notifiableId: '1', channel: 'mail' }),
    ).toBe(true);

    expect(await gate.isAllowed({ notifiable: user, notification, channel: 'mail' })).toBe(false);
    expect(await gate.isAllowed({ notifiable: user, notification, channel: 'sms' })).toBe(true);
  });

  it('lists muted channels for a notifiable', async () => {
    const user = new User('1');
    await prefs.mute(user, 'mail');
    await prefs.mute(user, 'sms');

    expect((await prefs.muted(user)).sort()).toEqual(['mail', 'sms']);
  });

  it('unmute re-allows the channel', async () => {
    const user = new User('1');
    await prefs.mute(user, 'mail');
    expect(await gate.isAllowed({ notifiable: user, notification, channel: 'mail' })).toBe(false);

    await prefs.unmute(user, 'mail');
    expect(await prefs.isMuted(user, 'mail')).toBe(false);
    expect(await gate.isAllowed({ notifiable: user, notification, channel: 'mail' })).toBe(true);
  });

  it('scopes mutes per tenant', async () => {
    const user = new User('1');
    await prefs.forTenant('a').mute(user, 'mail');

    // Muted in tenant A only.
    expect(await prefs.forTenant('a').isMuted(user, 'mail')).toBe(true);
    expect(await prefs.forTenant('b').isMuted(user, 'mail')).toBe(false);
    expect(await prefs.isMuted(user, 'mail')).toBe(false);

    expect(
      await gate.isAllowed({ notifiable: user, notification, channel: 'mail', tenant: 'a' }),
    ).toBe(false);
    expect(
      await gate.isAllowed({ notifiable: user, notification, channel: 'mail', tenant: 'b' }),
    ).toBe(true);
    expect(await gate.isAllowed({ notifiable: user, notification, channel: 'mail' })).toBe(true);
  });

  it('accepts a raw NotifiableRef as the target', async () => {
    const ref = { type: 'User', id: '42' };
    await prefs.mute(ref, 'mail');

    expect(await prefs.isMuted(ref, 'mail')).toBe(true);
    expect(
      await gate.isAllowed({ notifiable: new User('42'), notification, channel: 'mail' }),
    ).toBe(false);
  });

  it('allows delivery when the notifiable has no derivable reference', async () => {
    const anon = { routeNotificationFor: () => 'x@y.z' };
    expect(await gate.isAllowed({ notifiable: anon, notification, channel: 'mail' })).toBe(true);
  });
});
