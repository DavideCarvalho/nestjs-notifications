import { EventEmitterModule } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelRegistry } from './channel-registry';
import type { ChannelDriver, Notifiable, Notification } from './interfaces';
import { NotificationService } from './notification.service';
import { NotificationsModule } from './notifications.module';

class TestUser implements Notifiable {
  constructor(
    public id: number,
    public email: string,
  ) {}
  routeNotificationFor(channel: string): unknown {
    if (channel === 'mail') return this.email;
    return undefined;
  }
  toNotifiableRef() {
    return { type: 'TestUser', id: this.id };
  }
}

class RecordingChannel implements ChannelDriver {
  readonly channel = 'mail';
  readonly sent: Array<{ to: unknown; notification: Notification }> = [];
  async send(notifiable: Notifiable, notification: Notification): Promise<void> {
    this.sent.push({ to: notifiable.routeNotificationFor('mail', notification), notification });
  }
}

class WelcomeNotification implements Notification {
  via(): string[] {
    return ['mail'];
  }
  toMail() {
    return { subject: 'Welcome' };
  }
}

async function bootstrap(channel: ChannelDriver) {
  const moduleRef = await Test.createTestingModule({
    imports: [EventEmitterModule.forRoot(), NotificationsModule.forRoot({ global: false })],
    providers: [{ provide: 'CHANNEL', useValue: channel }],
  }).compile();
  // register the channel manually (DiscoveryService won't see ad-hoc useValue tokens by class)
  moduleRef.get(ChannelRegistry).register(channel);
  await moduleRef.init();
  return moduleRef;
}

describe('NotificationService (sync)', () => {
  let channel: RecordingChannel;

  beforeEach(() => {
    channel = new RecordingChannel();
  });

  it('delivers a notification to the routed address', async () => {
    const moduleRef = await bootstrap(channel);
    const service = moduleRef.get(NotificationService);

    await service.send(new TestUser(1, 'a@b.com'), new WelcomeNotification());

    expect(channel.sent).toHaveLength(1);
    expect(channel.sent[0]?.to).toBe('a@b.com');
  });

  it('fans out to multiple notifiables', async () => {
    const moduleRef = await bootstrap(channel);
    const service = moduleRef.get(NotificationService);

    await service.send(
      [new TestUser(1, 'a@b.com'), new TestUser(2, 'c@d.com')],
      new WelcomeNotification(),
    );

    expect(channel.sent.map((s) => s.to)).toEqual(['a@b.com', 'c@d.com']);
  });

  it('supports on-demand routing without a Notifiable entity', async () => {
    const moduleRef = await bootstrap(channel);
    const service = moduleRef.get(NotificationService);

    await service.route('mail', 'ondemand@x.com').notify(new WelcomeNotification());

    expect(channel.sent[0]?.to).toBe('ondemand@x.com');
  });

  it('skips delivery when via() returns no channels', async () => {
    const moduleRef = await bootstrap(channel);
    const service = moduleRef.get(NotificationService);
    class Silent implements Notification {
      via(): string[] {
        return [];
      }
    }

    await service.send(new TestUser(1, 'a@b.com'), new Silent());
    expect(channel.sent).toHaveLength(0);
  });

  it('isolates channel failures under continueOnError', async () => {
    const failing: ChannelDriver = {
      channel: 'mail',
      send: vi.fn().mockRejectedValue(new Error('smtp down')),
    };
    const moduleRef = await bootstrap(failing);
    const service = moduleRef.get(NotificationService);

    await expect(
      service.send(new TestUser(1, 'a@b.com'), new WelcomeNotification()),
    ).resolves.toBeUndefined();
    expect(failing.send).toHaveBeenCalledOnce();
  });
});
