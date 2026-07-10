import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { ChannelRegistry } from './channel-registry';
import type { ChannelDriver, Notifiable, Notification } from './interfaces';
import { NotificationService } from './notification.service';
import { NotificationsModule } from './notifications.module';

class TestUser implements Notifiable {
  routeNotificationFor(): unknown {
    return 'addr';
  }
}

class RecordingChannel implements ChannelDriver {
  readonly channel = 'mail';
  readonly sent: Notifiable[] = [];
  async send(notifiable: Notifiable): Promise<void> {
    this.sent.push(notifiable);
  }
}

class WelcomeNotification implements Notification {
  via(): string[] {
    return ['mail'];
  }
}

describe('NotificationsModule.forRoot({ emitter: true })', () => {
  it('resolves EventEmitter2 and dispatches lifecycle events with NO manual EventEmitterModule.forRoot()', async () => {
    const channel = new RecordingChannel();
    const moduleRef = await Test.createTestingModule({
      // Deliberately no EventEmitterModule.forRoot() here — `emitter: true` must supply it.
      imports: [NotificationsModule.forRoot({ global: false, emitter: true })],
    }).compile();
    moduleRef.get(ChannelRegistry).register(channel);
    await moduleRef.init();

    // EventEmitter2 resolves at all, proving EventEmitterModule.forRoot() was registered.
    const emitter = moduleRef.get(EventEmitter2);
    expect(emitter).toBeInstanceOf(EventEmitter2);

    const sentEvents: unknown[] = [];
    emitter.on('notification.sent', (event) => sentEvents.push(event));

    const service = moduleRef.get(NotificationService);
    await service.send(new TestUser(), new WelcomeNotification());

    expect(channel.sent).toHaveLength(1);
    expect(sentEvents).toHaveLength(1);
  });
});
