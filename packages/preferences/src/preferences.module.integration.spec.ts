import {
  type ChannelDriver,
  ChannelRegistry,
  Notifiable,
  NotifiableId,
  type Notification,
  NotificationService,
  NotificationsModule,
} from '@dudousxd/nestjs-notifications-core';
import type { DynamicModule } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { PendingDigestStore } from './digest.interfaces';
import { NotificationPreferences } from './notification-preferences';
import { PreferenceCenterService } from './preference-center.service';
import { PreferencesModule } from './preferences.module';
import { PENDING_DIGEST_STORE } from './tokens';

@Notifiable()
class User {
  @NotifiableId() id: string;
  constructor(id: string) {
    this.id = id;
  }
}

class Billing implements Notification {
  readonly category = 'billing';
  via = () => ['mail', 'sms'];
}

class Recorder implements ChannelDriver {
  readonly sent: string[] = [];
  constructor(readonly channel: string) {}
  async send(notifiable: Notifiable): Promise<void> {
    this.sent.push((notifiable as unknown as User).id);
  }
}

const categories = [{ key: 'billing', label: 'Billing', defaultChannels: ['mail', 'sms'] }];

/** The app wiring the docs describe: NotificationsModule plus PreferencesModule, nothing else. */
async function bootstrap(...preferences: DynamicModule[]) {
  const moduleRef = await Test.createTestingModule({
    imports: [EventEmitterModule.forRoot(), NotificationsModule.forRoot(), ...preferences],
  }).compile();
  const mail = new Recorder('mail');
  const sms = new Recorder('sms');
  moduleRef.get(ChannelRegistry).register(mail);
  moduleRef.get(ChannelRegistry).register(sms);
  await moduleRef.init();
  return { moduleRef, notifications: moduleRef.get(NotificationService), mail, sms };
}

describe('PreferencesModule wired into NotificationsModule', () => {
  it('forCenter(): a channel the user turned off is not delivered', async () => {
    const { moduleRef, notifications, mail, sms } = await bootstrap(
      PreferencesModule.forCenter({ categories }),
    );
    await moduleRef
      .get(PreferenceCenterService)
      .setChannel({ type: 'User', id: '1' }, 'billing', 'sms', false);

    const [result] = await notifications.sendNow([new User('1'), new User('2')], new Billing());

    expect(result?.results.find((r) => r.channel === 'sms')?.status).toBe('skipped');
    expect(sms.sent).toEqual(['2']);
    expect(mail.sent).toEqual(['1', '2']);
  });

  it('forRoot(): a channel the user muted is not delivered', async () => {
    const { moduleRef, notifications, mail, sms } = await bootstrap(PreferencesModule.forRoot());
    await moduleRef.get(NotificationPreferences).mute({ type: 'User', id: '1' }, 'sms');

    await notifications.sendNow(new User('1'), new Billing());

    expect(sms.sent).toEqual([]);
    expect(mail.sent).toEqual(['1']);
  });

  it('forDigest(): a daily-digest category is collected instead of delivered', async () => {
    const { moduleRef, notifications, mail } = await bootstrap(
      PreferencesModule.forCenter({ categories }),
      PreferencesModule.forDigest(),
    );
    await moduleRef
      .get(PreferenceCenterService)
      .setDigest({ type: 'User', id: '1' }, 'billing', 'daily');

    await notifications.sendNow(new User('1'), new Billing());

    expect(mail.sent).toEqual([]);
    const groups = await moduleRef
      .get<PendingDigestStore>(PENDING_DIGEST_STORE)
      .listGroups('daily');
    expect(groups.map((g) => g.notifiable.id)).toEqual(['1']);
  });

  for (const order of ['forRoot() first', 'forCenter() first'] as const) {
    it(`forRoot() + forCenter(), ${order}: the preference center decides`, async () => {
      const root = PreferencesModule.forRoot();
      const center = PreferencesModule.forCenter({ categories });
      const { moduleRef, notifications, mail, sms } = await bootstrap(
        ...(order === 'forRoot() first' ? [root, center] : [center, root]),
      );
      await moduleRef
        .get(PreferenceCenterService)
        .setChannel({ type: 'User', id: '1' }, 'billing', 'sms', false);
      // The opt-out gate is replaced, so its mute no longer applies.
      await moduleRef.get(NotificationPreferences).mute({ type: 'User', id: '1' }, 'mail');

      await notifications.sendNow(new User('1'), new Billing());

      expect(sms.sent).toEqual([]);
      expect(mail.sent).toEqual(['1']);
    });
  }
});
