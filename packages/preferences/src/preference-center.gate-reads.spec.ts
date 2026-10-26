import {
  type ChannelDriver,
  ChannelRegistry,
  Notifiable,
  NotifiableId,
  type Notification,
  NotificationService,
  NotificationsModule,
} from '@dudousxd/nestjs-notifications-core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryPreferenceCenterStore } from './in-memory.preference-center.store';
import { PreferenceCenterService } from './preference-center.service';
import { PreferencesModule } from './preferences.module';

const CHANNELS = ['mail', 'sms', 'push', 'database'];

@Notifiable()
class User {
  @NotifiableId() id: string;
  constructor(id: string) {
    this.id = id;
  }
}

class Billing implements Notification {
  readonly category = 'billing';
  via = () => CHANNELS;
}

class Recorder implements ChannelDriver {
  readonly sent: string[] = [];
  constructor(readonly channel: string) {}
  async send(notifiable: Notifiable): Promise<void> {
    this.sent.push(`${this.channel}:${(notifiable as unknown as User).id}`);
  }
}

async function bootstrap() {
  const moduleRef = await Test.createTestingModule({
    imports: [
      EventEmitterModule.forRoot(),
      NotificationsModule.forRoot(),
      PreferencesModule.forCenter({
        categories: [{ key: 'billing', label: 'Billing', defaultChannels: CHANNELS }],
      }),
    ],
  }).compile();
  const recorders = CHANNELS.map((channel) => new Recorder(channel));
  for (const recorder of recorders) moduleRef.get(ChannelRegistry).register(recorder);
  await moduleRef.init();
  return {
    notifications: moduleRef.get(NotificationService),
    preferences: moduleRef.get(PreferenceCenterService),
    recorders,
  };
}

describe('PreferenceCenterGate store reads', () => {
  it('reads each recipient preferences once per delivery, not once per channel', async () => {
    const { notifications, recorders } = await bootstrap();
    const getMatrix = vi.spyOn(InMemoryPreferenceCenterStore.prototype, 'getMatrix');
    const users = Array.from({ length: 25 }, (_, i) => new User(String(i)));

    await notifications.sendNow(users, new Billing());

    expect(getMatrix).toHaveBeenCalledTimes(users.length);
    expect(recorders.map((r) => r.sent.length)).toEqual([25, 25, 25, 25]);
    getMatrix.mockRestore();
  });

  it('still sees a preference change made between two deliveries', async () => {
    const { notifications, preferences, recorders } = await bootstrap();
    const user = new User('7');
    const notification = new Billing();

    await notifications.sendNow(user, notification);
    await preferences.setChannel({ type: 'User', id: '7' }, 'billing', 'sms', false);
    const [result] = await notifications.sendNow(user, notification);

    expect(result?.results.find((r) => r.channel === 'sms')?.status).toBe('skipped');
    expect(recorders.find((r) => r.channel === 'sms')?.sent).toEqual(['sms:7']);
    expect(recorders.find((r) => r.channel === 'mail')?.sent).toEqual(['mail:7', 'mail:7']);
  });
});
