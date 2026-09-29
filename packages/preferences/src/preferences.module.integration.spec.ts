import 'reflect-metadata';
import {
  BaseChannel,
  Notifiable,
  NotifiableId,
  NotificationService,
  NotificationsModule,
} from '@dudousxd/nestjs-notifications-core';
import { Injectable, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { PendingDigestStore } from './digest.interfaces';
import { NotificationPreferences } from './notification-preferences';
import { PreferenceCenterService } from './preference-center.service';
import { PreferencesModule } from './preferences.module';
import { PENDING_DIGEST_STORE } from './tokens';

const delivered: string[] = [];

@Injectable()
class MailTestChannel extends BaseChannel {
  readonly channel = 'mail';
  async send(): Promise<void> {
    delivered.push('mail');
  }
}

@Injectable()
class SmsTestChannel extends BaseChannel {
  readonly channel = 'sms';
  async send(): Promise<void> {
    delivered.push('sms');
  }
}

@Module({ providers: [MailTestChannel, SmsTestChannel] })
class TestChannelsModule {}

@Notifiable('User')
class User {
  @NotifiableId() id: string;
  constructor(id: string) {
    this.id = id;
  }
  routeNotificationFor(): string {
    return 'route';
  }
}

class InvoicePaid {
  readonly category = 'billing';
  via(): string[] {
    return ['mail', 'sms'];
  }
  toMail() {
    return {};
  }
  toSms() {
    return 'paid';
  }
}

/**
 * Boots the REAL Nest wiring (not hand-constructed classes): NotificationsModule's ChannelRunner
 * lives in another module than the gate / digest sink that PreferencesModule binds, so the tokens
 * must be exported from the (global) preferences module for the runner's @Optional() injection to
 * see them — otherwise preferences silently never apply.
 */
async function boot(...imports: any[]) {
  delivered.length = 0;
  const moduleRef = await Test.createTestingModule({
    imports: [
      EventEmitterModule.forRoot(),
      NotificationsModule.forRoot(),
      TestChannelsModule,
      ...imports,
    ],
  }).compile();
  await moduleRef.init();
  return moduleRef;
}

describe('PreferencesModule wiring into the core ChannelRunner', () => {
  it('forRoot(): a muted channel is skipped', async () => {
    const moduleRef = await boot(PreferencesModule.forRoot());
    const user = new User('1');
    await moduleRef.get(NotificationPreferences).mute(user, 'mail');

    const [result] = await moduleRef.get(NotificationService).sendNow(user, new InvoicePaid());

    expect(result?.results).toEqual([
      { channel: 'mail', status: 'skipped' },
      { channel: 'sms', status: 'sent', response: undefined },
    ]);
    expect(delivered).toEqual(['sms']);
    await moduleRef.close();
  });

  it('forCenter(): a disabled (category × channel) toggle is skipped', async () => {
    const moduleRef = await boot(
      PreferencesModule.forCenter({
        categories: [{ key: 'billing', label: 'Billing', defaultChannels: ['mail', 'sms'] }],
      }),
    );
    await moduleRef
      .get(PreferenceCenterService)
      .setChannel({ type: 'User', id: '2' }, 'billing', 'sms', false);

    const [result] = await moduleRef
      .get(NotificationService)
      .sendNow(new User('2'), new InvoicePaid());

    expect(result?.results.map((r) => [r.channel, r.status])).toEqual([
      ['mail', 'sent'],
      ['sms', 'skipped'],
    ]);
    expect(delivered).toEqual(['mail']);
    await moduleRef.close();
  });

  it('forCenter() + forDigest(): a daily-digest category is collected into the pending store', async () => {
    const moduleRef = await boot(
      PreferencesModule.forCenter({
        categories: [{ key: 'billing', label: 'Billing', defaultChannels: ['mail', 'sms'] }],
      }),
      PreferencesModule.forDigest(),
    );
    await moduleRef
      .get(PreferenceCenterService)
      .setDigest({ type: 'User', id: '3' }, 'billing', 'daily');

    const [result] = await moduleRef
      .get(NotificationService)
      .sendNow(new User('3'), new InvoicePaid());

    expect(result?.results.every((r) => r.status === 'skipped')).toBe(true);
    expect(delivered).toEqual([]);
    const store = moduleRef.get<PendingDigestStore>(PENDING_DIGEST_STORE);
    const groups = await store.listGroups('daily', { notifiable: { type: 'User', id: '3' } });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.category).toBe('billing');
    expect(groups[0]?.entries.length).toBeGreaterThan(0);
    await moduleRef.close();
  });
});
